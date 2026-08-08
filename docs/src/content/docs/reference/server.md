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
      inputSchema: {
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2),
      },
      outputSchema: {
        pollId: z.string(),
        question: z.string(),
        options: z.array(z.string()),
        tally: z.array(z.object({ option: z.string(), count: z.number() })),
        total: z.number(),
      },
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

`registerTool` adds the input, output and `_meta` shape of each tool to the type of the server.
Therefore `typeof server` carries enough information for
[`injectAppHelpers<typeof server>()`](/docs/api/inject-app-helpers) to give the view typed,
tool-name-narrowed helpers.

Each view belongs to one tool. A second tool that names the same view throws an error at
registration time.

### Constructor options

The second argument accepts the options of the SDK, and these two more options.

| Option | Type | Default |
| --- | --- | --- |
| `viewManifest` | [`ViewManifest`](/docs/api/view-manifest) | An empty `InMemoryViewManifest`, thus development works with no configuration. |
| `shellRenderer` | [`ShellRenderer`](/docs/api/shell-renderer) | An `AngularShellRenderer`. It reads `NODE_ENV` and the resolved `viewManifest`. |

### Members

| Member | Purpose |
| --- | --- |
| [`registerTool(config, handler)`](/docs/api/register-tool) | Registers a tool and its optional view. Returns the server, thus you can chain calls. |
| [`mcpMiddleware(filter?, handler)`](/docs/api/mcp-middleware) | Runs your code around each MCP request and notification. Register before you connect. |
| `connect(transport)` | Connects a transport. Locks the set of middleware. |
| `connectStatelessTransport(transport)` | Connects one transport for one request. Use it for stateless HTTP. |
| `$types` | A type-only property that holds the tool registry. `injectAppHelpers<typeof server>()` reads it. Do not read it at runtime. |

`connectStatelessTransport` exists because the SDK permits one transport for each server instance.
The method builds a new underlying server for each request, and it shares the handler maps of the
main server. `createMcpExpressRouter` calls this method for you.

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

| Router | Purpose |
| --- | --- |
| [`createMcpExpressRouter(server, options?)`](/docs/api/create-mcp-express-router) | The mountable JSON-RPC router. Options: `cors` and `errorMiddleware`. |
| [`createViewAssetRouter(options)`](/docs/api/create-view-asset-router) | Serves the widget build output. Takes a production `dir`, or a development `devServerUrl` proxy. |

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

## Content helpers

[`text`, `image`, `audio`, `resourceLink` and `embeddedResource`](/docs/api/content-helpers) build
correct MCP content blocks for a tool result. `normalizeContent` turns a loose handler return into
that shape. The [`FileRef`](/docs/api/file-ref) schema types a file reference. See
[files and downloads](/docs/guides/files).

## Tool handlers

A handler gets two arguments: the parsed `args`, and an `extra` context object.

| Symbol | Purpose |
| --- | --- |
| `ToolConfig` | The config object of [`registerTool`](/docs/api/register-tool): name, schemas, `view`, `securitySchemes` and `_meta`. |
| `ToolHandler` | The handler signature. |
| [`ClientHintsMeta`](/docs/guides/client-hints) | The locale, location and session hints on `extra._meta`. An Apps SDK host sends them. |
| `HandlerContent` | The content shapes that a handler can return. |

## Auth and middleware

| Symbol | Purpose |
| --- | --- |
| [`requireBearerAuth`](/docs/api/require-bearer-auth), [`optionalBearerAuth`](/docs/api/optional-bearer-auth) | Bearer-token middleware for the mounted router. |
| [`mcpAuthMetadataRouter`](/docs/api/mcp-auth-metadata-router) | Serves the auth-metadata endpoints. |
| `InvalidTokenError`, `AuthInfo`, `AuthMetadataOptions`, `BearerAuthMiddlewareOptions` | Supporting types. |
| `McpMiddlewareFn`, `McpTypedMiddlewareFn`, `McpMiddlewareFilter`, `McpExtra`, `McpMethodString`, `McpWildcard`, `McpExtraFor`, `McpResultFor` | The types of [protocol middleware](/docs/api/mcp-middleware). |

## Inference types

`AnyToolRegistry`, `InferTools`, `ToolInput`, `ToolOutput`, `ToolNames`, `ToolResponseMetadata`,
`McpServerTypes`, `ToolDef`, `ToolMeta`, `KnownToolMeta`, `ViewConfig`,
[`ViewCsp`](/docs/guides/csp), `ViewHostType`, `ViewName` and `SecurityScheme` are exported for
library authors building on top of the registry. See
[utility types](/docs/api/utility-types).
