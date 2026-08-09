---
title: ng-mcp-ui/server
description: The framework-neutral MCP server. McpServer, the Express router, view resources, content helpers and auth.
group: Reference
groupOrder: 4
order: 1
---

`ng-mcp-ui/server` is plain TypeScript, and it has no Angular dependency. Construct an
[`McpServer`](/docs/api/mcp-server), chain [`registerTool`](/docs/api/register-tool) calls, and
mount the Express router in your SSR `server.ts` file **before** the catch-all route of Angular.

The 1.x line builds on the MCP TypeScript SDK v2, and it speaks the **MCP 2026-07-28** protocol
revision only. If you come from 0.2.x, read
[migrate from 0.2.x](/docs/getting-started/migrate-from-0-2) first.

Each symbol below links to its full page.

## McpServer

```ts
import { McpServer } from "ng-mcp-ui/server";
import { z } from "zod";

import { resolveViewManifest } from "./views.manifest";

export function createMcpServer(): McpServer {
  return new McpServer(
    { name: "my-app", version: "1.0.0" },
    { viewManifest: resolveViewManifest() },
  ).registerTool(
    {
      name: "create_poll",
      title: "Create poll",
      description: "Create a poll and render it as an interactive view.",
      inputSchema: z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2),
      }),
      outputSchema: z.object({
        pollId: z.string(),
        question: z.string(),
        options: z.array(z.string()),
        tally: z.array(z.object({ option: z.string(), count: z.number() })),
        total: z.number(),
      }),
      view: {
        component: "poll",
        description: "Interactive poll: vote, tally, and discuss the results.",
      },
    },
    (args) => ({
      content: `Created poll "${args.question}".`,
      structuredContent: { /* … */ },
    }),
  );
}
```

`inputSchema` takes any [Standard Schema](https://standardschema.dev) that can also produce JSON
Schema, in practice a zod v4 `z.object({ … })`. The raw-shape form of 0.2.x is gone.

`registerTool` adds the input, output and `_meta` shape of each tool to the type of the server.
Therefore `typeof server` carries enough information for
[`injectAppHelpers<typeof server>()`](/docs/api/inject-app-helpers) to give the view typed,
tool-name-narrowed helpers.

Each view belongs to one tool. A second tool that names the same view throws an error at
registration time.

### Constructor options

The second argument accepts the `ServerOptions` of the SDK, and the three options of
`McpServerExtraOptions`.

| Option | Type | Default |
| --- | --- | --- |
| `viewManifest` | [`ViewManifest`](/docs/api/view-manifest) | An empty `InMemoryViewManifest`, thus development works with no configuration. |
| `shellRenderer` | [`ShellRenderer`](/docs/api/shell-renderer) | An `AngularShellRenderer`. It reads `NODE_ENV` and the resolved `viewManifest`. |
| `state` | `StateOptions` or `RequestStateCodec` | None. Set it to turn on [sealed state](/docs/guides/sealed-state) and verified `requestState`. |

### Members

| Member | Purpose |
| --- | --- |
| [`registerTool(config, handler)`](/docs/api/register-tool) | Registers a tool and its optional view. Returns the server, thus you can chain calls. |
| `factory()` | The SDK v2 `McpServerFactory` for this blueprint. It builds a fresh SDK server for each request, with the view metadata of that request resolved. |
| `$types` | A type-only property that holds the tool registry. `injectAppHelpers<typeof server>()` reads it. Do not read it at runtime. |

`McpServer` is a blueprint, and it holds no connection. The `connect`,
`connectStatelessTransport` and `getHandlerMaps` methods of 0.2.x are gone. The HTTP layer below
calls `factory()` for you, and it owns the per-request SDK server.

## Mounting

```ts
import { createMcpExpressRouter, createViewAssetRouter } from "ng-mcp-ui/server";
import { createMcpServer } from "./mcp/server";

// before Angular's SSR catch-all:
app.use("/mcp", createMcpExpressRouter(createMcpServer()));
app.use(
  "/assets/widgets",
  createViewAssetRouter({ dir: "dist/widgets/browser" }),
);
```

`app.use(express.json())` must run before the MCP router. The handler reads `req.body`.

| Entry point | Purpose |
| --- | --- |
| [`createMcpExpressRouter(server, options?)`](/docs/api/create-mcp-express-router) | The mountable JSON-RPC router. Options: `cors`, `errorMiddleware`, `onerror` and `handlerOptions`. |
| `createMcpFetchHandler(server, options?)` | The web-standards handler, `fetch(Request) => Promise<Response>`, for an edge runtime or for custom hosting. The Express router wraps it. |
| [`createViewAssetRouter(options)`](/docs/api/create-view-asset-router) | Serves the widget build output. Takes a production `dir`, or a development `devServerUrl` proxy. |

The option types are `CreateMcpExpressRouterOptions`, `CreateMcpFetchHandlerOptions` and
`CreateViewAssetRouterOptions`.

`McpExpressRouter` is the return type of `createMcpExpressRouter`: an `express.Router` that also
carries the SDK handler as `mcp`. Therefore application code can publish change events with
`router.mcp.notify.toolsChanged()`, or share the subscription bus, with no second handler
instance.

Both entry points pin the wire policy to `legacy: "reject"`. A 2025-era client receives the
unsupported-protocol-version error, and you cannot override that option.

The asset router has two modes. Give `dir` to serve a real build, or `mode: "development"` with a
`devServerUrl` to proxy your running `ng serve`. The development mode needs no widget build.

## View naming and manifests

The server checks each `view.component` value against the `ViewNameRegistry` interface. Each app
adds its own keys to that interface, and the `view` generator keeps them current.

```ts
declare module "ng-mcp-ui/server" {
  interface ViewNameRegistry {
    poll: true;
  }
}
```

| Symbol | Purpose |
| --- | --- |
| [`IndexHtmlViewManifest`](/docs/api/view-manifest) | Parses the widgets build's `index.html` for hashed asset names. |
| [`InMemoryViewManifest`](/docs/api/view-manifest) | Fallback manifest for before the widgets build has run. |
| [`ViewManifest`](/docs/api/view-manifest) | The interface both implement. |
| [`ViewManifestError`](/docs/api/view-manifest) | Thrown on an unparseable or missing manifest. |
| [`AngularShellRenderer`, `ShellRenderer`, `ShellRenderInput`, `ShellMode`](/docs/api/shell-renderer) | The shell document rendered into the host iframe. |

A view resource carries a cache hint. A content-hashed production URI defaults to one hour and
`"private"` scope, and a development shell to no caching. Set `view.cacheHint` to override the
default field by field. `CacheHint` and `CacheScope` are re-exported for that field, and
per-operation hints go through the `cacheHints` option of the SDK.

## Content helpers

[`text`, `image`, `audio`, `resourceLink` and `embeddedResource`](/docs/api/content-helpers) build
correct MCP content blocks for a tool result. `normalizeContent` turns a loose handler return into
that shape. The [`FileRef`](/docs/api/file-ref) schema types a file reference. See
[files and downloads](/docs/guides/files).

## Tool handlers

A handler gets two arguments: the parsed `args`, and the `ctx` context object. In 0.2.x the second
argument was the `extra` object of SDK v1.

| Symbol | Purpose |
| --- | --- |
| `ToolConfig` | The config object of [`registerTool`](/docs/api/register-tool): name, schemas, `view`, `securitySchemes` and `_meta`. |
| `ToolInputSchema` | The type of `inputSchema`: a Standard Schema that also produces JSON Schema. |
| `ToolHandler` | The handler signature. |
| `ToolHandlerResult` | What a handler may return: a completing result, or an `inputRequired(…)` round. |
| `McpToolContext` | The type of `ctx`: the SDK v2 `ServerContext`, widened with the client hints on `mcpReq._meta` and with `state`. Read a header with `ctx.http?.req?.headers.get("x-foo")`. |
| [`ClientHintsMeta`](/docs/guides/client-hints) | The locale, location and session hints on `ctx.mcpReq._meta`. An Apps SDK host sends them. |
| `HandlerContent` | The content shapes that a handler can return. |

## Sealed state and multi-round tools

Pass a `state` option to the constructor and every handler gets `ctx.state`. One HMAC codec covers
the two verified carriers of the protocol: `seal` and `open` for state that a widget carries
between calls, and `sealRequestState` and `requestState` for a multi-round trip. The two are
domain-separated, therefore a widget token cannot be replayed as a `requestState`, or the reverse.
A round-trip token also seals the tool that minted it.

Tokens are signed, not encrypted. A client can read the payload. Never seal a secret.

| Symbol | Purpose |
| --- | --- |
| `StateOptions` | The `state` option: `key` (32 bytes or more), `ttlSeconds` (600 by default) and `bind`. A missing key throws in production, and mints a warned, ephemeral per-process key in development. |
| `SealedState` | The type of `ctx.state`, with the four methods above. |
| `STATE_META_KEY` | The result `_meta` key that carries a sealed token to the widget, `"ng-mcp-ui/state"`. It arrives as `toolResponseMetadata`, and it is not model-visible. |
| `SEALED_STATE_INVALID_MESSAGE` | The stable message that `open` throws on a bad, expired or foreign token. The SDK turns the throw into an `isError` result with this text, thus a widget can detect an expired token. |
| `inputRequired(spec)` | Builds the `input_required` return of a handler. The embedded requests come from `inputRequired.elicit`, `.elicitUrl`, `.createMessage` and `.listRoots`. |
| `acceptedContent(responses, key, schema?)` | Reads the accepted content of an elicitation answer on the retry round. Returns `undefined` when the key is missing, declined, cancelled, of another kind, or failing the schema. |
| `inputResponse(responses, key)` | Reads one answer as a discriminated `InputResponseView`: `missing`, `elicit`, `sampling` or `roots`. |
| `createRequestStateCodec(options)`, `RequestStateCodec` | The codec of the SDK, re-exported. Pass a ready-made codec as `state` when you manage the keys yourself. |
| `InputRequest`, `InputRequests`, `InputResponses`, `InputRequiredResult` | The types of the round trip. |

See [sealed state](/docs/guides/sealed-state) for the widget carrier, and
[elicitation](/docs/guides/elicitation) for the round trip.

No host surfaces a round trip to a widget. Therefore a tool that a view calls must complete in one
round, and an elicitation flow belongs on a chat-path tool.

## Auth

| Symbol | Purpose |
| --- | --- |
| [`requireBearerAuth`](/docs/api/require-bearer-auth), [`optionalBearerAuth`](/docs/api/optional-bearer-auth) | Bearer-token middleware for the mounted router. |
| [`mcpAuthMetadataRouter`](/docs/api/mcp-auth-metadata-router) | Serves the auth-metadata endpoints. |
| `AuthInfo`, `AuthMetadataOptions`, `BearerAuthMiddlewareOptions` | Supporting types. |

A handler reads the verified token with `ctx.http?.authInfo`. The `InvalidTokenError` re-export of
0.2.x is gone, because SDK v2 reports a bearer failure through its own OAuth error response. The
protocol middleware API is gone too: there is no `mcpMiddleware`, and no `McpExtra*` or
`McpMiddleware*` type. See
[migrate from 0.2.x](/docs/getting-started/migrate-from-0-2) for the replacements.

## Inference types

`AnyToolRegistry`, `InferTools`, `ToolInput`, `ToolOutput`, `ToolNames`, `ToolResponseMetadata`,
`McpServerTypes`, `ToolDef`, `ToolMeta`, `KnownToolMeta`, `ViewConfig`,
[`ViewCsp`](/docs/guides/csp), `ViewHostType`, `ViewName` and `SecurityScheme` are exported for
library authors building on top of the registry. See
[utility types](/docs/api/utility-types).

`NG_MCP_UI_VERSION` holds the version string of the package.
