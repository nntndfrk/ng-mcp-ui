// The `McpServer` core, 1.x edition — a declarative BLUEPRINT + per-request
// factory for MCP spec 2026-07-28 (TypeScript SDK v2).
//
// v2's `createMcpHandler(factory)` constructs a fresh SDK server per HTTP
// request, and the factory receives the request context (`McpRequestContext`,
// including the original web `Request`). That inverts the v1 design: instead
// of one long-lived SDK server whose handler maps we instrumented to inject
// per-request view `_meta` (the `connectStatelessTransport` / `getHandlerMaps`
// hack), this class records registrations declaratively and replays them onto
// a fresh `@modelcontextprotocol/server` `McpServer` per request — resolving
// the request-dependent view context (public server URL, CSP domains, Claude
// content domain) at instance-build time. Registration-time data IS
// request-time data, so:
//   * view-resource `_meta` goes straight into `registerResource`'s config and
//     surfaces on `resources/list` with zero interception;
//   * there is no protocol middleware layer (dropped in 1.x — SDK v2 has no
//     server-side middleware seam, and this design no longer needs one);
//   * the SDK's private handler maps are never touched.
//
// Wire policy (1.x): modern-only. The express router / fetch handler built on
// `factory()` uses `legacy: 'reject'` — 2025-era clients are rejected; 0.2.x
// remains the supported line for the old protocol.

import crypto from "node:crypto";
import type { McpUiToolMeta } from "@modelcontextprotocol/ext-apps";
import {
  type CacheHint,
  type Implementation,
  isInputRequiredResult,
  type McpRequestContext,
  type McpServerFactory,
  McpServer as SdkMcpServer,
  type ServerContext,
  type ServerOptions,
} from "@modelcontextprotocol/server";
import { normalizeContent } from "./normalize-content.js";
import {
  type RequestHeaders,
  readHeader,
  resolveConnectDomains,
  resolveServerUrl,
} from "./request-context.js";
import type { ShellRenderer } from "./shell-renderer.js";
import { AngularShellRenderer } from "./shell-templates.js";
import {
  createSealedState,
  type RequestStateCodec,
  resolveStateCodec,
  type StateOptions,
} from "./state.js";
import type {
  ExtendToolRegistry,
  ExtractMeta,
  ExtractStructuredContent,
  McpToolContext,
  ToolConfig,
  ToolHandler,
  ToolHandlerResult,
  ToolInputSchema,
} from "./tool-types.js";
import type {
  McpServerTypes,
  SecurityScheme,
  ToolDef,
  ViewConfig,
  ViewHostType,
} from "./types.js";
import {
  computeClaudeContentDomain,
  computeViewVersionParam,
} from "./view-hashing.js";
import { InMemoryViewManifest, type ViewManifest } from "./view-manifest.js";
import {
  buildAppsSdkContentMeta,
  buildExtAppsContentMeta,
  type McpAppsResourceMeta,
  type OpenaiResourceMeta,
  type ResourceMeta,
} from "./view-meta.js";

type OpenaiToolMeta = {
  "openai/outputTemplate": string;
  "openai/widgetAccessible"?: boolean;
  "openai/toolInvocation/invoking"?: string;
  "openai/toolInvocation/invoked"?: string;
  "openai/fileParams"?: string[];
};

/** @see https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx#resource-discovery */
type McpAppsToolMeta = {
  ui: McpUiToolMeta;
};

type SecuritySchemesToolMeta = {
  securitySchemes: SecurityScheme[];
};

/**
 * @internal
 * The mutable tool-`_meta` accumulator the server builds while registering a
 * tool — the public `ToolMeta` plus the server-injected `outputTemplate` /
 * `ui.resourceUri` / `securitySchemes` mirrors. Distinct from the view-resource
 * `_meta` (see {@link ResourceMeta}).
 */
type InternalToolMeta = Partial<
  OpenaiToolMeta & McpAppsToolMeta & SecuritySchemesToolMeta
>;

/**
 * @internal
 * One host's view resource: its URI, MIME type, and the `_meta` builder
 * (server defaults + per-request overrides → the host's resource `_meta`).
 */
type ViewResourceConfig<T extends ResourceMeta = ResourceMeta> = {
  hostType: ViewHostType;
  uri: string;
  mimeType: string;
  buildContentMeta: (
    defaults: {
      resourceDomains: string[];
      connectDomains: string[];
      domain: string;
      baseUriDomains: string[];
    },
    overrides: { domain?: string },
  ) => T;
};

/**
 * @internal
 * The request-resolved view context shared by every registration on one
 * per-request server instance.
 */
type ViewRequestContext = {
  serverUrl: string;
  connectDomains: string[];
  contentMetaOverrides: { domain?: string };
  isProduction: boolean;
};

/** @internal One recorded `registerTool` call, replayed per request. */
type ToolEntry = {
  // biome-ignore lint/suspicious/noExplicitAny: type information is carried by the TTools registry; runtime storage is erased
  config: ToolConfig<any>;
  // biome-ignore lint/suspicious/noExplicitAny: see above
  handler: ToolHandler<any, any>;
};

/**
 * @internal
 * The return type of {@link McpServer.registerTool}: the same blueprint with
 * the new tool folded into its `TTools` registry.
 */
type AddTool<
  TTools,
  TName extends string,
  TInput extends ToolInputSchema | undefined,
  TOutput,
  TResponseMetadata = unknown,
> = McpServer<
  ExtendToolRegistry<TTools, TName, TInput, TOutput, TResponseMetadata>
>;

/** Options accepted by {@link McpServer} beyond the SDK's `ServerOptions`. */
export interface McpServerExtraOptions {
  /**
   * Resolves production widget asset filenames for the resource shell.
   * Defaults to an empty {@link InMemoryViewManifest} (so dev mode works with
   * no config); the real `index.html` parser is `IndexHtmlViewManifest`.
   */
  viewManifest?: ViewManifest;
  /**
   * Renders the resource HTML shell. Defaults to an {@link AngularShellRenderer}
   * seeded from `NODE_ENV` and the resolved `viewManifest`.
   */
  shellRenderer?: ShellRenderer;
  /**
   * Sealed-state configuration (see `.claude/REQUEST-STATE-DESIGN.md`). One
   * HMAC codec upgrades both verified state carriers: MRTR `requestState`
   * echoes are verified before handlers run (and decoded via
   * `ctx.mcpReq.requestState<T>()`), and handlers gain `ctx.state.seal()` /
   * `ctx.state.open()` for widget-carried state. Pass options (`key`,
   * `ttlSeconds`, `bind`) or a ready-made {@link RequestStateCodec}. An
   * explicit SDK `requestState` option on this config wins over the codec's
   * `verify` wiring.
   */
  state?: StateOptions | RequestStateCodec;
}

/**
 * The MCP server blueprint. Declares tools and view resources with a typed
 * tool registry; the HTTP layer (`createMcpExpressRouter` /
 * `createMcpFetchHandler`) turns it into a per-request SDK-v2 server factory.
 * Construct it with the same `Implementation` info you would pass to the SDK,
 * chain {@link McpServer.registerTool} calls to declare tools, then mount it.
 *
 * The `TTools` generic accumulates each registered tool's input/output/meta
 * shape, so `typeof server` carries enough information for view-side helpers
 * to produce fully-typed hooks.
 *
 * @typeParam TTools - Accumulated tool registry. Filled in by `registerTool`
 * chaining; you almost never set this manually.
 */
export class McpServer<
  TTools extends Record<string, ToolDef> = Record<never, ToolDef>,
> {
  declare readonly $types: McpServerTypes<TTools>;

  private readonly toolEntries: ToolEntry[] = [];
  private readonly claimedViews = new Map<string, string>();
  private readonly serverInfo: Implementation;
  private readonly sdkOptions?: ServerOptions;
  private readonly viewManifest: ViewManifest;
  private readonly shellRenderer: ShellRenderer;
  private readonly stateCodec?: RequestStateCodec;

  constructor(
    serverInfo: Implementation,
    options?: ServerOptions & McpServerExtraOptions,
  ) {
    const { viewManifest, shellRenderer, state, ...sdkOptions } = options ?? {};
    this.serverInfo = serverInfo;
    const codec = resolveStateCodec(state);
    this.stateCodec = codec;
    // Wire the codec's `verify` into the SDK's MRTR integrity hook so echoed
    // `requestState` is checked before handlers run and the decoded payload
    // reaches `ctx.mcpReq.requestState<T>()`. A user-supplied `requestState`
    // option wins.
    this.sdkOptions =
      codec !== undefined && sdkOptions.requestState === undefined
        ? {
            ...sdkOptions,
            requestState: {
              verify: (echoed, ctx) => codec.verify(echoed, ctx),
            },
          }
        : sdkOptions;
    this.viewManifest = viewManifest ?? new InMemoryViewManifest("main.js");
    // Default to the real Angular shells. `render()` honors the per-request
    // `isProduction` flag, so the constructed `mode` here is only a fallback;
    // we seed it from `NODE_ENV` at construction for correctness when the flag
    // is absent. The renderer reads filenames from `this.viewManifest`.
    this.shellRenderer =
      shellRenderer ??
      new AngularShellRenderer(
        process.env.NODE_ENV === "production" ? "production" : "development",
        this.viewManifest,
      );
  }

  /**
   * Register a tool. Pass a `config` describing the tool (name, schemas,
   * optional {@link ViewConfig}, optional `ToolMeta`) and a handler that
   * returns the tool's result.
   *
   * Chain calls to build up a server: each call returns a new `McpServer`
   * type that captures the tool's input/output/`_meta` shape so the
   * resulting `typeof server` can drive typed view helpers.
   *
   * `inputSchema` takes a Standard Schema with JSON Schema support — in
   * practice a zod v4 `z.object({...})`. The 1.x line does not accept v1
   * raw shapes.
   */
  registerTool<
    TName extends string,
    TInput extends ToolInputSchema,
    TReturn extends ToolHandlerResult,
  >(
    config: ToolConfig<TInput> & { name: TName },
    cb: ToolHandler<TInput, TReturn>,
  ): AddTool<
    TTools,
    TName,
    TInput,
    ExtractStructuredContent<TReturn>,
    ExtractMeta<TReturn>
  >;
  registerTool<TName extends string, TReturn extends ToolHandlerResult>(
    config: ToolConfig<undefined> & { name: TName; inputSchema?: undefined },
    cb: ToolHandler<undefined, TReturn>,
  ): AddTool<
    TTools,
    TName,
    undefined,
    ExtractStructuredContent<TReturn>,
    ExtractMeta<TReturn>
  >;
  registerTool(
    // biome-ignore lint/suspicious/noExplicitAny: overloads narrow at call sites; storage is erased
    config: ToolConfig<any>,
    // biome-ignore lint/suspicious/noExplicitAny: see above
    cb: ToolHandler<any, any>,
  ): unknown {
    if (config.view) {
      this.enforceOneToolPerView(config.view.component, config.name);
    }
    this.toolEntries.push({ config, handler: cb });
    return this;
  }

  /**
   * The SDK-v2 `McpServerFactory` for this blueprint: builds a fresh
   * `@modelcontextprotocol/server` `McpServer` per request, with all
   * request-dependent view metadata resolved from the factory context's
   * `requestInfo`. Pass it to `createMcpHandler` directly for custom hosting;
   * `createMcpExpressRouter` / `createMcpFetchHandler` do this for you (with
   * the 1.x `legacy: 'reject'` wire policy).
   */
  factory(): McpServerFactory {
    return (ctx) => this.buildInstance(ctx);
  }

  /** @internal Build one per-request SDK server from the recorded entries. */
  buildInstance(ctx: McpRequestContext): SdkMcpServer {
    const view = this.resolveViewRequestContext(ctx.requestInfo);
    const server = new SdkMcpServer(this.serverInfo, this.sdkOptions);
    for (const entry of this.toolEntries) {
      this.applyToolEntry(server, entry, view);
    }
    return server;
  }

  private enforceOneToolPerView(component: string, toolName: string): void {
    const existingTool = this.claimedViews.get(component);
    if (existingTool) {
      throw new Error(
        `ng-mcp-ui: view "${component}" is already used by tool "${existingTool}". Tool "${toolName}" cannot also reference it — each view backs exactly one tool.`,
      );
    }
    this.claimedViews.set(component, toolName);
  }

  /**
   * Resolve the per-request view context: the public `serverUrl`, the CSP
   * `connect-src` domains, and — for Claude requests — the content-domain
   * override. In v2 the factory receives the original web `Request`, so this
   * runs once per instance build rather than per handler invocation.
   */
  private resolveViewRequestContext(
    request: Request | undefined,
  ): ViewRequestContext {
    const isProduction = process.env.NODE_ENV === "production";
    const headers: RequestHeaders = request
      ? Object.fromEntries(request.headers.entries())
      : {};
    const serverUrl = resolveServerUrl(headers);
    const connectDomains = resolveConnectDomains(serverUrl, { isProduction });

    let contentMetaOverrides: { domain?: string } = {};
    if (readHeader(headers, "user-agent") === "Claude-User") {
      const pathname = request ? new URL(request.url).pathname : "";
      contentMetaOverrides = {
        domain: computeClaudeContentDomain(`${serverUrl}${pathname}`),
      };
    }

    return { serverUrl, connectDomains, contentMetaOverrides, isProduction };
  }

  private applyToolEntry(
    server: SdkMcpServer,
    entry: ToolEntry,
    viewCtx: ViewRequestContext,
  ): void {
    const {
      name,
      view,
      securitySchemes,
      _meta: userToolMeta,
      inputSchema,
      outputSchema,
      title,
      description,
      annotations,
      icons,
    } = entry.config;

    const toolMeta: InternalToolMeta = { ...userToolMeta };

    if (securitySchemes) {
      // SEP-1488 puts `securitySchemes` at the top level of the tool
      // descriptor, but the SDK's `registerTool` drops unknown top-level
      // fields, so the canonical spot isn't reachable. Use the `_meta`
      // back-compat mirror documented in the Apps SDK reference until
      // SEP-1488 lands in the spec.
      toolMeta.securitySchemes = securitySchemes;
    }

    if (view) {
      this.registerViewResources(server, name, view, toolMeta, viewCtx);
    }

    const wrapped = this.wrapHandler(entry.handler, {
      attachViewUUID: Boolean(view),
    });

    const sdkConfig = {
      title,
      description,
      annotations,
      icons,
      outputSchema,
      _meta: toolMeta as Record<string, unknown>,
    };

    if (inputSchema === undefined) {
      // Zero-input tool: register WITHOUT `inputSchema`. Schema-less tools use
      // the SDK's ONE-argument calling convention — `cb(ctx)`, not
      // `cb(args, ctx)` — so bridge it to keep the public `ToolHandler`
      // signature truthful: `args` is `{}`.
      server.registerTool(name, sdkConfig, (ctx: ServerContext) =>
        wrapped({}, ctx as McpToolContext),
      );
    } else {
      server.registerTool(
        name,
        { ...sdkConfig, inputSchema },
        (args: unknown, ctx: ServerContext) =>
          wrapped(args as Record<string, unknown>, ctx as McpToolContext),
      );
    }
  }

  private wrapHandler(
    // biome-ignore lint/suspicious/noExplicitAny: erased-type boundary with the SDK callback
    cb: ToolHandler<any, any>,
    { attachViewUUID }: { attachViewUUID: boolean },
  ) {
    return async (args: Record<string, unknown>, ctx: McpToolContext) => {
      if (this.stateCodec) {
        // Attach the per-request sealed-state surface. Mutating the SDK's ctx
        // (rather than spreading it) preserves its prototype and any
        // `this`-bound internals.
        ctx.state = createSealedState(this.stateCodec, ctx);
      }
      const result = await cb(args, ctx);
      if (isInputRequiredResult(result)) {
        // An MRTR round-one return has no `content` to normalize and must not
        // carry a viewUUID (nothing renders until the flow completes).
        return result;
      }
      return {
        ...result,
        content: normalizeContent(result.content),
        ...(attachViewUUID && {
          _meta: {
            ...(result as { _meta?: Record<string, unknown> })._meta,
            viewUUID: crypto.randomUUID(),
          },
        }),
      };
    };
  }

  private registerViewResources(
    server: SdkMcpServer,
    toolName: string,
    view: ViewConfig,
    toolMeta: InternalToolMeta,
    viewCtx: ViewRequestContext,
  ): void {
    const hosts = view.hosts ?? (["apps-sdk", "mcp-app"] as const);

    // Append a content-derived version param so hosts (e.g. ChatGPT) bust
    // their cache when the bundle changes, but keep the URI stable across
    // `tools/list` calls when the bundle hasn't changed.
    const versionParam = this.viewVersionParam(viewCtx.isProduction);

    if (hosts.includes("apps-sdk")) {
      const viewResource: ViewResourceConfig<OpenaiResourceMeta> = {
        hostType: "apps-sdk",
        uri: `ui://views/apps-sdk/${view.component}.html${versionParam}`,
        mimeType: "text/html+skybridge",
        buildContentMeta: (defaults, overrides) =>
          buildAppsSdkContentMeta(view, defaults, overrides),
      };
      this.registerViewResource(server, {
        name: toolName,
        viewResource,
        view,
        viewCtx,
        immutableUri: versionParam !== "",
      });
      toolMeta["openai/outputTemplate"] = viewResource.uri;
    }

    if (hosts.includes("mcp-app")) {
      const viewResource: ViewResourceConfig<McpAppsResourceMeta> = {
        hostType: "mcp-app",
        uri: `ui://views/ext-apps/${view.component}.html${versionParam}`,
        mimeType: "text/html;profile=mcp-app",
        buildContentMeta: (defaults, overrides) =>
          buildExtAppsContentMeta(view, defaults, overrides),
      };
      this.registerViewResource(server, {
        name: toolName,
        viewResource,
        view,
        viewCtx,
        immutableUri: versionParam !== "",
      });
      // @ts-expect-error - For backwards compatibility with Claude current implementation of the specs
      toolMeta["ui/resourceUri"] = viewResource.uri;

      toolMeta.ui = { ...toolMeta.ui, resourceUri: viewResource.uri };
    }
  }

  private registerViewResource(
    server: SdkMcpServer,
    {
      name,
      viewResource,
      view,
      viewCtx,
      immutableUri,
    }: {
      name: string;
      viewResource: ViewResourceConfig;
      view: ViewConfig;
      viewCtx: ViewRequestContext;
      immutableUri: boolean;
    },
  ): void {
    const { hostType, uri: viewUri, mimeType, buildContentMeta } = viewResource;
    const { serverUrl, connectDomains, contentMetaOverrides, isProduction } =
      viewCtx;

    const contentMeta = buildContentMeta(
      {
        resourceDomains: [serverUrl],
        connectDomains,
        domain: serverUrl,
        baseUriDomains: [serverUrl],
      },
      contentMetaOverrides,
    );

    // 2026-07-28 cache hints (SEP-2549). A content-hashed (`?v=`) production
    // URI is immutable — its HTML shell and `_meta` only change when the URI
    // itself changes — so it can be cached for a long horizon. `private`
    // because the `_meta` embeds request-derived origins (forwarded host).
    // The dev shell recompiles freely: ttl 0. Per-view overrides land with the
    // first-class cache-hint API (Phase 2).
    const cacheHint: CacheHint = immutableUri
      ? { ttlMs: 3_600_000, cacheScope: "private" }
      : { ttlMs: 0, cacheScope: "private" };

    server.registerResource(
      name,
      viewUri,
      {
        description: view.description,
        mimeType,
        // Request-resolved view `_meta` surfaces directly on `resources/list`
        // (per ext-apps spec: hosts/checkers read CSP & domain at list time
        // before fetching content). No interception needed: this instance
        // serves exactly one request.
        _meta: contentMeta as Record<string, unknown>,
        cacheHint,
      },
      async (uri) => {
        // The injected `shellRenderer` (default {@link AngularShellRenderer})
        // renders the production or development shell per `isProduction`.
        const html = this.shellRenderer.render({
          hostType,
          serverUrl,
          viewName: view.component,
          isProduction,
          manifest: this.viewManifest,
        });

        return {
          contents: [
            {
              uri: uri.href,
              mimeType,
              text: html,
              // The SDK types `_meta` as an open object; our precise per-host
              // builder output is a structural subset of it.
              _meta: contentMeta as Record<string, unknown>,
            },
          ],
        };
      },
    );
  }

  /**
   * The content-derived `?v=` version param for view URIs. Resolves the
   * manifest's main/style filenames (tolerating the dev/test case where they
   * can't resolve) and delegates the hashing to {@link computeViewVersionParam}
   * (view-hashing): `""` outside production or when the manifest can't resolve.
   */
  private viewVersionParam(isProduction: boolean): string {
    // Resolve the two reads independently: `computeViewVersionParam` only
    // requires `mainFile` (a missing `styleFile` hashes as ""), so a throwing
    // `styleFile()` must not discard a good `mainFile()` and disable cache-busting.
    let mainFile: string | undefined;
    let styleFile: string | undefined;
    try {
      mainFile = this.viewManifest.mainFile();
    } catch {
      mainFile = undefined;
    }
    try {
      styleFile = this.viewManifest.styleFile();
    } catch {
      styleFile = undefined;
    }
    return computeViewVersionParam({ mainFile, styleFile }, { isProduction });
  }
}
