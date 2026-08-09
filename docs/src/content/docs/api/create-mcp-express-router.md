---
title: createMcpExpressRouter
description: Builds the mountable Express router that serves the MCP JSON-RPC endpoint.
group: API
groupOrder: 5
order: 4
---

```ts
createMcpExpressRouter(server: McpServer, options?: CreateMcpExpressRouterOptions): McpExpressRouter
```

Mount the router on the path that the host connects to.

```ts
import express from "express";
import { createMcpExpressRouter } from "ng-mcp-ui/server";

const app = express();
app.use(express.json());
app.use("/mcp", createMcpExpressRouter(createMcpServer()));
```

`app.use(express.json())` must run before the router. The handler reads `req.body`.

Mount the router before the SSR catch-all route of Angular. A catch-all that runs first answers
`/mcp` with your application shell.

The router builds one SDK handler from the blueprint. That handler then builds a fresh SDK server
for each request. The router forwards every verb to it, restores the full request path that Express
strips at the mount point, and defaults a missing `params.arguments` on `tools/call` to `{}`.

## The wire

The endpoint speaks MCP 2026-07-28 only. The router pins the SDK to `legacy: "reject"`, and you
cannot override that from `handlerOptions`. A 2025-era client gets the
unsupported-protocol-version error, which names the revision that this endpoint supports.

## Options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `cors` | boolean | `true` | Applies a permissive CORS layer. A host fetches this endpoint from another origin, therefore the default is `true`. Set `false` if your app already controls CORS for this path. |
| `errorMiddleware` | `ErrorRequestHandler[]` | `[]` | Express error handlers for this router. They run before the built-in JSON-RPC error handler. |
| `onerror` | `(error: Error) => void` | None | Reports an error inside the SDK handler. It only observes, and it never changes the response. |
| `handlerOptions` | `CreateMcpHandlerOptions` without `legacy` and `onerror` | `{}` | Passed to the SDK handler: `responseMode`, `bus`, `maxSubscriptions`, `keepAliveMs`. |

## The router object

```ts
type McpExpressRouter = express.Router & { mcp: McpHttpHandler };
```

`router.mcp` is the SDK handler behind the router. Your application code reaches it without holding
a second handler instance.

| Member | Purpose |
| --- | --- |
| `fetch` | Serves one web `Request` and resolves with the `Response`. |
| `close` | Aborts the exchanges in flight and closes their per-request servers. |
| `notify` | Publishes a change event to each open `subscriptions/listen` stream. |
| `bus` | The change-event bus of those streams. Share it across processes with your own implementation. |

`notify` has one method for each change event. A call with no open subscription does nothing.

| Method | Publishes |
| --- | --- |
| `notify.toolsChanged()` | `notifications/tools/list_changed` |
| `notify.promptsChanged()` | `notifications/prompts/list_changed` |
| `notify.resourcesChanged()` | `notifications/resources/list_changed` |
| `notify.resourceUpdated(uri)` | `notifications/resources/updated` for one URI |

```ts
const mcpRouter = createMcpExpressRouter(server);
app.use("/mcp", mcpRouter);

// Later, when your data changes:
mcpRouter.mcp.notify.resourcesChanged();
```

A host only receives these events on a `subscriptions/listen` stream, and only for the events it
subscribed to. Declare the matching capability on the server, for example
`capabilities: { resources: { subscribe: true, listChanged: true } }`.

## Errors

The two error seams cover different failures. Pick the one that matches.

| Seam | Sees |
| --- | --- |
| `errorMiddleware` | Failures at the router level: CORS, body handling, and any middleware that you mount inside the router. |
| `onerror` | Failures inside the SDK handler, and rejected requests. |

An error that the SDK handler raises does **not** reach `errorMiddleware`. The Node adapter catches
it, reports it to `onerror`, and writes its own JSON-RPC 500.

```ts
app.use(
  "/mcp",
  createMcpExpressRouter(server, {
    onerror: (err) => logger.error(err),
    errorMiddleware: [
      (err, req, res, next) => {
        logger.error(err);
        next(err);
      },
    ],
  }),
);
```

- A handler that sends a response stops the built-in handler.
- A handler that calls `next(err)` passes the error to the built-in handler, which answers with a
  JSON-RPC 500.

## createMcpFetchHandler

```ts
createMcpFetchHandler(server: McpServer, options?: CreateMcpFetchHandlerOptions): McpHttpHandler
```

The same endpoint as a web-standard handler, for a runtime that has no Express: Vercel, workerd, or
your own hosting.

```ts
import { createMcpFetchHandler } from "ng-mcp-ui/server";

export default createMcpFetchHandler(createMcpServer());
```

`CreateMcpFetchHandlerOptions` is the SDK `CreateMcpHandlerOptions` without `legacy`, which the 1.x
wire policy pins. Therefore `onerror`, `responseMode`, `bus`, `maxSubscriptions` and `keepAliveMs`
are available here directly.

The Express router is a thin wrapper around this handler, and it exposes the same object as
`router.mcp`.

## No app-level middleware

The server has no `use()` method and no `useOnError()` method. It gives you a router, and it does
not own an Express app. 1.x also has no protocol middleware layer: the SDK builds a fresh server
for each request and offers no hook to wrap.

Put HTTP middleware on your own app, around the router:

```ts
app.use("/mcp", rateLimit, createMcpExpressRouter(server));
```

For per-request work that needs the MCP context, read `ctx` in the handler itself. See
[Migrate from 0.2.x](/docs/getting-started/migrate-from-0-2) for the full replacement table.

## Related

- [`createViewAssetRouter`](/docs/api/create-view-asset-router)
- [`requireBearerAuth`](/docs/api/require-bearer-auth)
- [`McpServer`](/docs/api/mcp-server)
