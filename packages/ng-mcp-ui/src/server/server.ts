// The `McpServer` core (S04f3) — the class that composes the S04a–f2 modules.
//
// What it provides: the typed `registerTool` overloads + accumulating `TTools`
// generic + `$types` marker, view-resource registration for both host variants
// (`ui://views/apps-sdk/<c>.html` + `ui://views/ext-apps/<c>.html`), the
// per-request view-`_meta` builders, the one-tool-per-view guard, `viewUUID`
// injection, the `resources/list` view-`_meta` middleware, and
// `connectStatelessTransport`.
//
// The pure pieces it used to inline now live in focused modules: the CSP `_meta`
// builders (`view-meta`), Claude domain + version hashing (`view-hashing`),
// request-context resolution (`request-context`), the tool/handler typing
// (`tool-types`), content normalization (`normalize-content`), the protocol
// middleware engine (`middleware`), the manifest (`view-manifest`), and the HTML
// shell renderer (`shell-renderer`/`shell-templates`).
//
// EXPLICIT OUT-OF-SCOPE (each resurfaces in a later step):
//   * `run()` HTTP ownership + express wiring → the mountable
//     `createMcpExpressRouter(server)` + stateless transport wiring is S05.
//   * `metric.ts` telemetry → DROPPED entirely (no posthog/statsd dependency).
//   * The real Angular shells + `index.html` manifest parser → S06.

import crypto from "node:crypto";
import type { McpUiToolMeta } from "@modelcontextprotocol/ext-apps";
import {
  Server as SdkServer,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer as McpServerBase } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type {
  Implementation,
  ServerResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  buildMiddlewareChain,
  getHandlerMaps,
  type McpExtra,
  type McpExtraFor,
  type McpMethodString,
  type McpMiddlewareEntry,
  type McpMiddlewareFilter,
  type McpMiddlewareFn,
  type McpResultFor,
  type McpTypedMiddlewareFn,
  type McpWildcard,
} from "./middleware.js";
import { normalizeContent } from "./normalize-content.js";
import {
  readHeader,
  resolveConnectDomains,
  resolveServerUrl,
} from "./request-context.js";
import type { ShellRenderer } from "./shell-renderer.js";
import { AngularShellRenderer } from "./shell-templates.js";
import type {
  ExtendToolRegistry,
  ExtractMeta,
  ExtractStructuredContent,
  ToolConfig,
  ToolHandler,
} from "./tool-types.js";
import type {
  HandlerContent,
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
 * tool — the public {@link ToolMeta} plus the server-injected `outputTemplate` /
 * `ui.resourceUri` / `securitySchemes` mirrors. Distinct from the view-resource
 * `_meta` (see {@link ResourceMeta}).
 */
type InternalToolMeta = Partial<
  OpenaiToolMeta & McpAppsToolMeta & SecuritySchemesToolMeta
>;

/**
 * @internal
 * One host's view resource: its URI, MIME type, and the per-request
 * `_meta` builder (server defaults + per-request overrides → the host's
 * resource `_meta`). See {@link buildAppsSdkContentMeta} / {@link buildExtAppsContentMeta}.
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
 * The return type of {@link McpServer.registerTool}: the same server with the
 * new tool folded into its `TTools` registry. The class-independent registry
 * accumulation lives in {@link ExtendToolRegistry} (S04e); this just wraps it as
 * a new `McpServer` so `typeof server` carries the tool's shapes.
 */
type AddTool<
  TTools,
  TName extends string,
  TInput extends ZodRawShapeCompat,
  TOutput,
  TResponseMetadata = unknown,
> = McpServer<
  ExtendToolRegistry<TTools, TName, TInput, TOutput, TResponseMetadata>
>;

// We Omit `registerTool` from the base class at the type level so our
// unified 2-arg signature can replace the SDK's 3-arg one without an
// incompatible override.  The runtime prototype chain is unaffected.
interface McpServerBaseOmitted
  extends Omit<McpServerBase, "registerTool" | "connect"> {}
// Strict-TS cast: the base type is re-declared with a narrowed surface; the
// runtime constructor is unchanged.
const McpServerBaseOmitted = McpServerBase as unknown as new (
  ...args: ConstructorParameters<typeof McpServerBase>
) => McpServerBaseOmitted;

/** Options accepted by {@link McpServer} beyond the SDK's `ServerOptions`. */
export interface McpServerExtraOptions {
  /**
   * Resolves production widget asset filenames for the resource shell.
   * Defaults to an empty {@link InMemoryViewManifest} (so dev mode works with
   * no config); the real `index.html` parser is injected in S06.
   */
  viewManifest?: ViewManifest;
  /**
   * Renders the resource HTML shell. Defaults to an {@link AngularShellRenderer}
   * seeded from `NODE_ENV` and the resolved `viewManifest` (S06).
   */
  shellRenderer?: ShellRenderer;
}

/**
 * The MCP server. Extends the MCP SDK's `McpServer` with a typed tool registry
 * and view resources. Construct it with the same `Implementation` info you
 * would pass to the SDK, chain {@link McpServer.registerTool} calls to declare
 * tools, then connect a transport.
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
> extends McpServerBaseOmitted {
  declare readonly $types: McpServerTypes<TTools>;

  private mcpMiddlewareEntries: McpMiddlewareEntry[] = [];
  private mcpMiddlewareApplied = false;
  private claimedViews = new Map<string, string>();
  private viewMetaBuilders = new Map<
    string,
    (extra: McpExtra | undefined) => ResourceMeta
  >();
  private readonly serverInfo: Implementation;
  private readonly serverOptions?: ServerOptions;
  private readonly viewManifest: ViewManifest;
  private readonly shellRenderer: ShellRenderer;

  constructor(
    serverInfo: Implementation,
    options?: ServerOptions & McpServerExtraOptions,
  ) {
    const { viewManifest, shellRenderer, ...sdkOptions } = options ?? {};
    super(serverInfo, sdkOptions);
    this.serverInfo = serverInfo;
    this.serverOptions = sdkOptions;
    this.viewManifest = viewManifest ?? new InMemoryViewManifest("main.js");
    // Default to the real Angular shells (S06). `render()` honors the per-request
    // `isProduction` flag (derived from `NODE_ENV` in `resolveViewRequestContext`),
    // so the constructed `mode` here is only a fallback; we seed it from
    // `NODE_ENV` at construction for correctness when the flag is absent. The
    // renderer reads filenames from `this.viewManifest`.
    this.shellRenderer =
      shellRenderer ??
      new AngularShellRenderer(
        process.env.NODE_ENV === "production" ? "production" : "development",
        this.viewManifest,
      );
  }

  /**
   * Register MCP **protocol-level** middleware (the onion model from
   * {@link buildMiddlewareChain}). Unlike Express middleware this runs for every
   * transport — stateless HTTP, stdio, or in-memory — because it instruments the
   * SDK handler maps, not the HTTP layer. That makes it the right seam for
   * cross-cutting concerns (auth checks against `extra.authInfo`, logging,
   * result rewriting) in our router-based model where the server no longer owns
   * an Express app.
   *
   * Must be registered before {@link McpServer.connect} /
   * {@link McpServer.connectStatelessTransport} — middleware is locked in when
   * the handler maps are instrumented; registering afterwards throws.
   *
   * Express-app-level `use()` / `useOnError()` methods are intentionally NOT
   * provided: PLAN §3 uses a mountable router instead of an owned Express app,
   * so consumers attach Express middleware to their own app around the router
   * (and the router accepts `errorMiddleware` for the path-scoped error case).
   */
  mcpMiddleware(handler: McpMiddlewareFn): this;
  /** Register MCP protocol-level middleware for all requests (`extra` is `McpExtra`). */
  mcpMiddleware(
    filter: "request",
    handler: (
      request: { method: string; params: Record<string, unknown> },
      extra: McpExtra,
      next: () => Promise<ServerResult>,
    ) => Promise<unknown> | unknown,
  ): this;
  /** Register MCP protocol-level middleware for all notifications (`extra` is `undefined`). */
  mcpMiddleware(
    filter: "notification",
    handler: (
      request: { method: string; params: Record<string, unknown> },
      extra: undefined,
      next: () => Promise<undefined>,
    ) => Promise<unknown> | unknown,
  ): this;
  /**
   * Register MCP protocol-level middleware for an exact method.
   * Narrows `params`, `extra`, and `next()` result based on the method string.
   */
  mcpMiddleware<M extends McpMethodString>(
    filter: M,
    handler: McpTypedMiddlewareFn<M>,
  ): this;
  /**
   * Register MCP protocol-level middleware for a wildcard pattern (e.g. `"tools/*"`).
   * `next()` returns the union of result types for matching methods.
   */
  mcpMiddleware<W extends McpWildcard>(
    filter: W,
    handler: (
      request: { method: string; params: Record<string, unknown> },
      extra: McpExtraFor<W>,
      next: () => Promise<McpResultFor<W>>,
    ) => Promise<unknown> | unknown,
  ): this;
  /**
   * Register MCP protocol-level middleware with a method filter.
   * Filter can be an exact method (`"tools/call"`), wildcard (`"tools/*"`),
   * category (`"request"` | `"notification"`), or an array of those.
   */
  mcpMiddleware(filter: McpMiddlewareFilter, handler: McpMiddlewareFn): this;
  mcpMiddleware(
    filterOrHandler: McpMiddlewareFilter | McpMiddlewareFn,
    // biome-ignore lint/suspicious/noExplicitAny: overloads narrow the handler type at call sites; implementation must accept all variants
    maybeHandler?: any,
  ): this {
    if (this.mcpMiddlewareApplied) {
      throw new Error(
        "Cannot register MCP middleware after connect() / connectStatelessTransport() has been called",
      );
    }

    const handler = maybeHandler as McpMiddlewareFn | undefined;

    if (typeof filterOrHandler === "function") {
      this.mcpMiddlewareEntries.push({
        filter: null,
        handler: filterOrHandler,
      });
    } else if (handler) {
      this.mcpMiddlewareEntries.push({
        filter: filterOrHandler,
        handler,
      });
    } else {
      throw new Error(
        "mcpMiddleware requires a handler function when a filter is provided",
      );
    }

    return this;
  }

  private applyMcpMiddleware(): void {
    if (this.mcpMiddlewareApplied) {
      return;
    }
    this.mcpMiddlewareApplied = true;

    // Surface view-resource _meta on `resources/list` (per ext-apps spec:
    // hosts/checkers read CSP & domain at list time before fetching content).
    const viewListMetaEntry: McpMiddlewareEntry = {
      filter: "resources/list",
      handler: async (_req, extra, next) => {
        const result = (await next()) as {
          resources: Array<Record<string, unknown> & { uri: string }>;
        };
        for (const resource of result.resources) {
          const builder = this.viewMetaBuilders.get(resource.uri);
          if (!builder) {
            continue;
          }
          const meta = builder(extra);
          resource._meta = {
            ...((resource._meta as Record<string, unknown>) ?? {}),
            ...meta,
          };
        }
        return result;
      },
    };

    // No telemetry entry is prepended here (no posthog/statsd dep).
    // User-registered `mcpMiddleware` entries (S05) are appended after the
    // view-`_meta` entry.
    const entries = [viewListMetaEntry, ...this.mcpMiddlewareEntries];

    if (entries.length === 0) {
      return;
    }

    const { requestHandlers, notificationHandlers } = getHandlerMaps(
      this.server,
    );

    const instrumentMap = (
      map: Map<string, (...args: unknown[]) => Promise<unknown>>,
      isNotification: boolean,
    ) => {
      for (const [method, handler] of map) {
        map.set(
          method,
          buildMiddlewareChain(method, isNotification, handler, entries),
        );
      }
      const originalSet = map.set.bind(map);
      map.set = (
        method: string,
        handler: (...args: unknown[]) => Promise<unknown>,
      ) =>
        originalSet(
          method,
          buildMiddlewareChain(method, isNotification, handler, entries),
        );
    };

    instrumentMap(requestHandlers, false);
    instrumentMap(notificationHandlers, true);
  }

  /**
   * Connect to an MCP transport (override of the SDK's `connect`). Locks in any
   * registered MCP middleware (the view-`_meta` injection installed here) — once
   * connected, the handler maps are instrumented.
   */
  async connect(
    transport: Parameters<typeof McpServerBase.prototype.connect>[0],
  ): Promise<void> {
    this.applyMcpMiddleware();
    return McpServerBase.prototype.connect.call(this, transport);
  }

  /**
   * Per-request stateless connect. The SDK's `Protocol` only allows one
   * transport per instance, so we can't reuse this `McpServer` across
   * concurrent requests. We build a fresh underlying `Server` per request and
   * share the main server's handler maps by reference. The cast is unavoidable:
   * there's no public API to inject handler maps. `getHandlerMaps` validates the
   * read side and fails fast on SDK field renames.
   */
  async connectStatelessTransport(
    transport: Parameters<typeof McpServerBase.prototype.connect>[0],
  ): Promise<void> {
    this.applyMcpMiddleware();

    const { requestHandlers, notificationHandlers } = getHandlerMaps(
      this.server,
    );
    const fresh = new SdkServer(this.serverInfo, this.serverOptions);
    const target = fresh as unknown as {
      _requestHandlers: unknown;
      _notificationHandlers: unknown;
    };
    target._requestHandlers = requestHandlers;
    target._notificationHandlers = notificationHandlers;

    await fresh.connect(transport);
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
   * override. Composes the pure {@link resolveServerUrl} /
   * {@link resolveConnectDomains} (request-context) and
   * {@link computeClaudeContentDomain} (view-hashing).
   *
   * There is no `x-alpic-forwarded-url` precedence: this library self-hosts /
   * tunnels rather than deploying on Alpic, so the Claude content domain is the
   * hash of the resolved `${serverUrl}${pathname}` directly.
   */
  private resolveViewRequestContext(extra: McpExtra | undefined): {
    serverUrl: string;
    connectDomains: string[];
    contentMetaOverrides: { domain?: string };
  } {
    const isProduction = process.env.NODE_ENV === "production";
    const headers = extra?.requestInfo?.headers ?? {};
    const serverUrl = resolveServerUrl(headers);
    const connectDomains = resolveConnectDomains(serverUrl, { isProduction });

    let contentMetaOverrides: { domain?: string } = {};
    if (readHeader(headers, "user-agent") === "Claude-User") {
      const pathname = extra?.requestInfo?.url
        ? new URL(extra.requestInfo.url, serverUrl).pathname
        : "";
      contentMetaOverrides = {
        domain: computeClaudeContentDomain(`${serverUrl}${pathname}`),
      };
    }

    return { serverUrl, connectDomains, contentMetaOverrides };
  }

  private registerViewResources(
    toolName: string,
    view: ViewConfig,
    toolMeta: InternalToolMeta,
  ): void {
    const hosts = view.hosts ?? (["apps-sdk", "mcp-app"] as const);

    // Append a content-derived version param so hosts (e.g. ChatGPT) bust
    // their cache when the bundle changes, but keep the URI stable across
    // `tools/list` calls when the bundle hasn't changed.
    const versionParam = this.viewVersionParam();

    if (hosts.includes("apps-sdk")) {
      const viewResource: ViewResourceConfig<OpenaiResourceMeta> = {
        hostType: "apps-sdk",
        uri: `ui://views/apps-sdk/${view.component}.html${versionParam}`,
        mimeType: "text/html+skybridge",
        buildContentMeta: (defaults, overrides) =>
          buildAppsSdkContentMeta(view, defaults, overrides),
      };
      this.registerViewResource({ name: toolName, viewResource, view });
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
      this.registerViewResource({ name: toolName, viewResource, view });
      // @ts-expect-error - For backwards compatibility with Claude current implementation of the specs
      toolMeta["ui/resourceUri"] = viewResource.uri;

      toolMeta.ui = { ...toolMeta.ui, resourceUri: viewResource.uri };
    }
  }

  private registerViewResource({
    name,
    viewResource,
    view,
  }: {
    name: string;
    viewResource: ViewResourceConfig;
    view: ViewConfig;
  }): void {
    const { hostType, uri: viewUri, mimeType, buildContentMeta } = viewResource;

    const buildMeta = (extra: McpExtra | undefined): ResourceMeta => {
      const { serverUrl, connectDomains, contentMetaOverrides } =
        this.resolveViewRequestContext(extra);
      return buildContentMeta(
        {
          resourceDomains: [serverUrl],
          connectDomains,
          domain: serverUrl,
          baseUriDomains: [serverUrl],
        },
        contentMetaOverrides,
      );
    };
    this.viewMetaBuilders.set(viewUri, buildMeta);

    this.registerResource(
      name,
      viewUri,
      { description: view.description },
      async (uri, extra) => {
        const isProduction = process.env.NODE_ENV === "production";
        const { serverUrl } = this.resolveViewRequestContext(extra);

        // The injected `shellRenderer` (default {@link AngularShellRenderer},
        // S06) renders the production or development shell per `isProduction`.
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
              // The SDK types `_meta` as an open `Record<string, unknown>`; our
              // precise per-host builder output is a structural subset of it.
              _meta: buildMeta(extra) as Record<string, unknown>,
            },
          ],
        };
      },
    );
  }

  private wrapHandler<InputArgs extends ZodRawShapeCompat>(
    cb: ToolHandler<InputArgs>,
    { attachViewUUID }: { attachViewUUID: boolean },
  ): ToolHandler<InputArgs> {
    return async (args, extra) => {
      const result = await cb(args, extra);
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

  /**
   * The content-derived `?v=` version param for view URIs. Resolves the
   * manifest's main/style filenames (tolerating the dev/test case where they
   * can't resolve) and delegates the hashing to {@link computeViewVersionParam}
   * (view-hashing): `""` outside production or when the manifest can't resolve.
   */
  private viewVersionParam(): string {
    const isProduction = process.env.NODE_ENV === "production";
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

  /**
   * Register a tool. Pass a `config` describing the tool (name, schemas,
   * optional {@link ViewConfig}, optional {@link ToolMeta}) and a handler that
   * returns the tool's result.
   *
   * Chain calls to build up a server: each call returns a new `McpServer`
   * type that captures the tool's input/output/`_meta` shape so the
   * resulting `typeof server` can drive typed view helpers.
   */
  registerTool<
    TName extends string,
    InputArgs extends ZodRawShapeCompat,
    TReturn extends { content?: HandlerContent },
  >(
    config: ToolConfig<InputArgs> & { name: TName },
    cb: ToolHandler<InputArgs, TReturn>,
  ): AddTool<
    TTools,
    TName,
    InputArgs,
    ExtractStructuredContent<TReturn>,
    ExtractMeta<TReturn>
  >;
  registerTool<InputArgs extends ZodRawShapeCompat>(
    config: ToolConfig<InputArgs>,
    cb: ToolHandler<InputArgs>,
  ): this;
  registerTool(...args: unknown[]): unknown {
    const baseFn = McpServerBase.prototype.registerTool as (
      ...args: unknown[]
    ) => unknown;

    if (typeof args[0] === "string") {
      baseFn.call(this, args[0], args[1], args[2]);
      return this;
    }

    const config = args[0] as ToolConfig<ZodRawShapeCompat>;
    const cb = args[1] as ToolHandler<ZodRawShapeCompat>;

    const {
      name,
      view,
      securitySchemes,
      _meta: userToolMeta,
      ...toolFields
    } = config;

    const toolMeta: InternalToolMeta = { ...userToolMeta };

    if (securitySchemes) {
      // SEP-1488 puts `securitySchemes` at the top level of the tool
      // descriptor, but the SDK's `registerTool` drops unknown top-level
      // fields, so the canonical spot isn't reachable without intercepting
      // `tools/list`. Use the `_meta` back-compat mirror documented in the
      // Apps SDK reference until SEP-1488 lands in the spec.
      toolMeta.securitySchemes = securitySchemes;
    }

    if (view) {
      this.enforceOneToolPerView(view.component, name);
      this.registerViewResources(name, view, toolMeta);
    }

    const wrappedCb = this.wrapHandler(cb, { attachViewUUID: Boolean(view) });

    baseFn.call(this, name, { ...toolFields, _meta: toolMeta }, wrappedCb);

    return this;
  }
}
