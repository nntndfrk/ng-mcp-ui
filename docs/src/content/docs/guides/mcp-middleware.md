---
title: Protocol middleware
description: How to run code around every MCP request and notification with mcpMiddleware, on all transports.
group: Guides
groupOrder: 2
order: 8
---

`mcpMiddleware()` puts your code around the MCP request handlers of the server. Use it for
functions that apply to many tools: log messages, authorization tests, metrics, and changes to a
result.

This middleware is not Express middleware. It operates on the MCP protocol layer, not the HTTP
layer. Therefore it runs on each transport: stateless HTTP, stdio, and in-memory.

## The onion model

Each middleware gets three arguments: the `request`, the `extra` context, and a `next` function.
Call `next()` to run the next middleware, or to run the handler.

```ts
import { McpServer } from "ng-mcp-ui/server";

const server = new McpServer({ name: "my-app", version: "1.0.0" });

server.mcpMiddleware(async (request, extra, next) => {
  const start = performance.now();
  const result = await next();
  console.log(`${request.method} took ${performance.now() - start}ms`);
  return result;
});
```

The first middleware that you register is the outer layer. The server calls the middleware in
registration sequence. Each call to `next()` moves one layer in. The method returns `this`, thus
you can chain the calls.

## Filters

The first argument can be a filter. The filter selects the methods that the middleware applies to.

```ts
server
  .mcpMiddleware("tools/call", auditToolCall)      // one method
  .mcpMiddleware("tools/*", rateLimit)             // a wildcard
  .mcpMiddleware("request", addRequestId)           // all requests
  .mcpMiddleware("notification", countNotifications) // all notifications
  .mcpMiddleware(["tools/call", "resources/read"], logAccess); // an array
```

| Filter | Selects |
| --- | --- |
| `"tools/call"` | One method. |
| `"tools/*"` | Each method with this prefix. |
| `"request"` | Each request. |
| `"notification"` | Each notification. |
| An array of the above | Each method that one or more patterns select. |
| No filter | Each request and each notification. |

## Types

An exact method filter narrows the types for you. TypeScript then knows `request.params`, the type
of `extra`, and the value that `next()` resolves to.

```ts
server.mcpMiddleware("tools/call", async (request, extra, next) => {
  request.params.name;    // typed as the tool name
  extra.authInfo;         // typed, because this method is a request
  const result = await next();
  result.content;         // typed as CallToolResult
  return result;
});
```

For a notification method, `extra` is `undefined`, and `next()` resolves to `undefined`. The MCP
SDK does not give a context object to a notification handler.

You can change `request.params` before you call `next()`. The server sends your changed values to
the handler.

## Two rules

**Register each middleware before you connect.** The server instruments its handler maps when you
call `connect()` or `connectStatelessTransport()`. After that point, the set of middleware is
fixed. A later registration throws this error:

```
Cannot register MCP middleware after connect() / connectStatelessTransport() has been called
```

Therefore register your middleware in the same function that builds the server.

**Call `next()` one time only.** A second call in the same middleware throws this error:

```
next() called multiple times in middleware for "tools/call"
```

To stop the chain, do not call `next()`. Return a result instead.

```ts
server.mcpMiddleware("tools/call", async (request, extra, next) => {
  if (!extra.authInfo) {
    return { content: [{ type: "text", text: "Sign in first." }], isError: true };
  }
  return next();
});
```

## The internal middleware

The library registers one middleware of its own. This middleware adds the view `_meta` data to the
`resources/list` result. It is always the outer layer. Your middleware runs inside it. Thus you
cannot remove the view data, but you can read it and change it after `next()` returns.

## Express middleware

The server does not have `use()` or `useOnError()` methods. It gives you a mountable router, and it
does not own an Express app. For HTTP concerns, put your middleware on your own app around the
router:

```ts
app.use("/mcp", myHttpMiddleware, createMcpExpressRouter(server));
```

For errors from this router only, use the `errorMiddleware` option of
[`createMcpExpressRouter`](/docs/reference/server).
