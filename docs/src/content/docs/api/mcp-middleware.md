---
title: mcpMiddleware
description: Registers protocol-level middleware that runs around each MCP request and notification.
group: API
groupOrder: 5
order: 3
---

`mcpMiddleware` puts your code around the MCP handlers of the server. It operates on the protocol
layer, not the HTTP layer. Therefore it runs on each transport.

For the concepts and the patterns, read [protocol middleware](/docs/guides/mcp-middleware). This
page gives the signatures.

## Signatures

```ts
mcpMiddleware(handler: McpMiddlewareFn): this
mcpMiddleware(filter: "request", handler): this
mcpMiddleware(filter: "notification", handler): this
mcpMiddleware<M extends McpMethodString>(filter: M, handler: McpTypedMiddlewareFn<M>): this
mcpMiddleware<W extends McpWildcard>(filter: W, handler): this
mcpMiddleware(filter: McpMiddlewareFilter, handler: McpMiddlewareFn): this
```

Each form returns the server, therefore you can chain the calls.

## Handler

```ts
type McpMiddlewareFn = (
  request: { method: string; params: Record<string, unknown> },
  extra: McpExtra | undefined,
  next: () => Promise<unknown>,
) => Promise<unknown> | unknown;
```

| Argument | Contents |
| --- | --- |
| `request` | The method name and the parameters. Change `params` before `next()` to change what the handler gets. |
| `extra` | The request context of the SDK. It is `undefined` for a notification. |
| `next` | Runs the next middleware, or the handler. Call it one time only. |

## Filters

| Filter | Selects |
| --- | --- |
| `"tools/call"` | One method. |
| `"tools/*"` | Each method with this prefix. |
| `"request"` | Each request. |
| `"notification"` | Each notification. |
| `string[]` | Each method that one or more patterns select. |
| Omitted | Each request and each notification. |

## Types

An exact method filter narrows the handler through `McpTypedMiddlewareFn<M>`. TypeScript then
knows the type of `request.params`, the type of `extra`, and the value that `next()` resolves to.

| Type | Purpose |
| --- | --- |
| `McpMiddlewareFn` | The untyped handler. |
| `McpTypedMiddlewareFn<M>` | The handler for one exact method. |
| `McpMiddlewareFilter` | One pattern, or an array of patterns. |
| `McpMethodString` | Each MCP method that the server handles. |
| `McpWildcard` | Each `"prefix/*"` form. |
| `McpExtra` | The request context of the SDK. |
| `McpExtraFor<M>` | The `extra` type for one method. `undefined` for a notification. |
| `McpResultFor<M>` | The result type for one method. |

## Errors

| Message | Cause |
| --- | --- |
| `Cannot register MCP middleware after connect() / connectStatelessTransport() has been called` | You registered after the connect. |
| `next() called multiple times in middleware for "…"` | One handler called `next()` two times. |
| `mcpMiddleware requires a handler function when a filter is provided` | You gave a filter and no handler. |

## Related

- [Protocol middleware](/docs/guides/mcp-middleware)
- [`createMcpExpressRouter`](/docs/api/create-mcp-express-router) for Express-level errors
