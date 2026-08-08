---
title: ng-mcp-ui/server
description: The framework-neutral MCP server — McpServer, the Express router, view resources, content helpers and auth.
group: Reference
groupOrder: 4
order: 1
---

`ng-mcp-ui/server` is plain TypeScript with no Angular dependency. Construct an `McpServer`, chain
`registerTool(config, handler)` calls, and mount the Express router into your SSR `server.ts`
**before** the Angular catch-all.

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

`registerTool` accumulates each tool's input, output and `_meta` shape into the server type, so
`typeof server` carries enough type information for `injectAppHelpers<typeof server>()` on the web
side to produce fully typed, tool-name-narrowed helpers.

Each view belongs to one tool. A second tool that names the same view throws an error at
registration time.

### Constructor options

The second argument accepts the options of the SDK, and these two more options.

| Option | Type | Default |
| --- | --- | --- |
| `viewManifest` | `ViewManifest` | An empty `InMemoryViewManifest`, thus development works with no configuration. |
| `shellRenderer` | `ShellRenderer` | An `AngularShellRenderer`. It reads `NODE_ENV` and the resolved `viewManifest`. |

### Members

| Member | Purpose |
| --- | --- |
| `registerTool(config, handler)` | Registers a tool and its optional view. Returns the server, thus you can chain calls. |
| [`mcpMiddleware(filter?, handler)`](/docs/guides/mcp-middleware) | Runs your code around each MCP request and notification. Register before you connect. |
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

### createMcpExpressRouter(server, options?)

The mountable JSON-RPC router.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `cors` | boolean | `true` | Applies a permissive CORS layer. A host fetches this endpoint from another origin, therefore the default is `true`. Set `false` if your app already controls CORS for this path. |
| `errorMiddleware` | `ErrorRequestHandler[]` | `[]` | Express error handlers for this router. They run before the built-in JSON-RPC error handler. |

The server has no `use()` or `useOnError()` method. It gives you a router, and it does not own an
Express app. Put HTTP middleware on your own app around the router. Use `errorMiddleware` for
errors from this router only.

An error handler that sends a response stops the built-in handler. An error handler that calls
`next(err)` passes the error to the built-in 500 response.

### createViewAssetRouter(options)

Serves the widgets build output. The options are a union of two shapes. Select one shape with the
`mode` field.

**Production.** The router serves files from a directory.

```ts
createViewAssetRouter({ dir: "dist/widgets/browser" });
```

| Option | Type | Purpose |
| --- | --- | --- |
| `dir` | string | The path of the widgets build output. It contains the hashed chunks and `index.html`. An absolute path, or a path relative to the working directory. |
| `mode` | `"production"`, optional | The default mode. |

The router adds CORS headers, correct content types, and immutable cache headers for hashed file
names.

**Development.** The router sends each request to your running `ng serve` process.

```ts
createViewAssetRouter({
  mode: "development",
  devServerUrl: "http://localhost:4200",
});
```

| Option | Type | Purpose |
| --- | --- | --- |
| `devServerUrl` | string | The origin of the widgets dev server. It must be an `http://` URL. |
| `mode` | `"development"` | Selects this shape. |

In this mode you do not run a widgets build. The dev server keeps `main.js` and `styles.css` in
memory, thus your changes appear after a reload.

## View naming and manifests

A `view.component` value is checked against the `ViewNameRegistry` interface, which each app
augments — the `view` generator keeps this in sync:

```ts
declare module "ng-mcp-ui/server" {
  interface ViewNameRegistry {
    poll: true;
  }
}
```

| Symbol | Purpose |
| --- | --- |
| `IndexHtmlViewManifest` | Parses the widgets build's `index.html` for hashed asset names. |
| `InMemoryViewManifest` | Fallback manifest for before the widgets build has run. |
| `ViewManifest` | The interface both implement. |
| `ViewManifestError` | Thrown on an unparseable or missing manifest. |
| `AngularShellRenderer`, `ShellRenderer`, `ShellRenderInput`, `ShellMode` | The shell document rendered into the host iframe. |

## Content helpers

`text`, `image`, `audio`, `resourceLink` and `embeddedResource` build well-formed MCP content blocks
for tool results; `normalizeContent` coerces a loose handler return into that shape, and the
`FileRef` schema types file references. See [files and downloads](/docs/guides/files).

## Tool handlers

A handler gets two arguments: the parsed `args`, and an `extra` context object.

| Symbol | Purpose |
| --- | --- |
| `ToolConfig` | The config object of `registerTool`: name, schemas, `view`, `securitySchemes` and `_meta`. |
| `ToolHandler` | The handler signature. |
| [`ClientHintsMeta`](/docs/guides/client-hints) | The locale, location and session hints on `extra._meta`. An Apps SDK host sends them. |
| `HandlerContent` | The content shapes that a handler can return. |

## Auth and middleware

| Symbol | Purpose |
| --- | --- |
| `requireBearerAuth`, `optionalBearerAuth` | Bearer-token middleware for the mounted router. |
| `mcpAuthMetadataRouter` | Serves the auth-metadata endpoints. |
| `InvalidTokenError`, `AuthInfo`, `AuthMetadataOptions`, `BearerAuthMiddlewareOptions` | Supporting types. |
| `McpMiddlewareFn`, `McpTypedMiddlewareFn`, `McpMiddlewareFilter`, `McpExtra`, `McpMethodString`, `McpWildcard`, `McpExtraFor`, `McpResultFor` | The types of [protocol middleware](/docs/guides/mcp-middleware). |

## Inference types

`AnyToolRegistry`, `InferTools`, `ToolInput`, `ToolOutput`, `ToolNames`, `ToolResponseMetadata`,
`McpServerTypes`, `ToolDef`, `ToolMeta`, `KnownToolMeta`, `ViewConfig`,
[`ViewCsp`](/docs/guides/csp), `ViewHostType`, `ViewName` and `SecurityScheme` are exported for
library authors building on top of the registry.
