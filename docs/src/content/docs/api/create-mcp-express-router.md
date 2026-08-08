---
title: createMcpExpressRouter
description: Builds the mountable Express router that serves the MCP JSON-RPC endpoint.
group: API
groupOrder: 5
order: 4
---

```ts
createMcpExpressRouter(server: McpServer, options?: CreateMcpExpressRouterOptions): Router
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

## Options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `cors` | boolean | `true` | Applies a permissive CORS layer. A host fetches this endpoint from another origin, therefore the default is `true`. Set `false` if your app already controls CORS for this path. |
| `errorMiddleware` | `ErrorRequestHandler[]` | `[]` | Express error handlers for this router. They run before the built-in JSON-RPC error handler. |

## Errors

The router has a built-in error handler. It answers with a JSON-RPC 500 response.

Put your own handlers in `errorMiddleware` to log an error, or to change it. The handlers run in
sequence, before the built-in handler.

```ts
app.use(
  "/mcp",
  createMcpExpressRouter(server, {
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
- A handler that calls `next(err)` passes the error to the built-in handler.

## No app-level middleware

The server has no `use()` method and no `useOnError()` method. It gives you a router, and it does
not own an Express app.

Put HTTP middleware on your own app, around the router:

```ts
app.use("/mcp", rateLimit, createMcpExpressRouter(server));
```

For MCP-level concerns that must run on each transport, use
[`mcpMiddleware`](/docs/api/mcp-middleware) instead.

## Related

- [`createViewAssetRouter`](/docs/api/create-view-asset-router)
- [`requireBearerAuth`](/docs/api/require-bearer-auth)
- [`mcpMiddleware`](/docs/api/mcp-middleware)
