---
title: Migrate from 0.2.x
description: Move an application from ng-mcp-ui 0.2.x on the 2025-era MCP protocol to 1.x on MCP 2026-07-28 and TypeScript SDK v2.
group: Getting started
groupOrder: 1
order: 4
---

ng-mcp-ui 1.x is a clean break. It builds on the MCP TypeScript SDK v2 and speaks the
**MCP 2026-07-28** protocol revision only. There is no automated `ng update` migration. This page
tells you when to move, and it maps every 0.2.x surface to its 1.x replacement.

## Decide when to move

The 1.x endpoint rejects 2025-era clients (`legacy: "reject"` on the wire). A host that has not
rolled out the 2026-07-28 revision cannot connect to it.

> As of August 2026, claude.ai still connects with the 2025-11-25 protocol. Keep production
> connectors on 0.2.x until the hosts you target speak 2026-07-28. The 0.2.x line receives
> security patches until August 2027.

Move to 1.x now if you target the new protocol, build against SDK v2, or want the new
capabilities: [sealed state](/docs/guides/sealed-state), [elicitation](/docs/guides/elicitation),
cache hints, and change notifications. 1.x ships as `1.0.0-beta.x` on the npm `next` dist-tag
until a real host demonstrably renders widgets over 2026-07-28.

Your widget components do not change. The host bridges are protocol-era independent, so the whole
`ng-mcp-ui/web` surface is the same in 1.x.

## What changed

| Area | 0.2.x | 1.x |
| --- | --- | --- |
| Protocol | 2025 era, SDK v1 | 2026-07-28 only, SDK v2 |
| SDK packages | `@modelcontextprotocol/sdk` | `@modelcontextprotocol/server`, `/express`, `/node` |
| Zod | v3 or v4 | v4.2 or later |
| Tool schemas | raw shape or `z.object` | Standard Schema only (`z.object`, ArkType, Valibot) |
| Serving | `connectStatelessTransport()` inside the router | SDK v2 per-request factory inside the router |
| Handler context | `(args, extra)` | `(args, ctx)` |
| Protocol middleware | `server.mcpMiddleware(...)` | removed |
| Edge runtimes | not supported | [`createMcpFetchHandler`](/docs/api/create-mcp-express-router) |
| Server state | none | [sealed state](/docs/guides/sealed-state) (`state` option) |
| Multi-round tools | none | [elicitation](/docs/guides/elicitation) (`inputRequired`) |
| Cache control | none | `cacheHints` option, `view.cacheHint` |
| Change notifications | none | `router.mcp.notify.*` over `subscriptions/listen` |

## 1. Update the dependencies

1.x peers on the scoped SDK v2 packages and drops zod v3:

```bash
npm install ng-mcp-ui@next zod@^4.2.0
npm install @modelcontextprotocol/server@^2.0.0 @modelcontextprotocol/express@^2.0.0 @modelcontextprotocol/node@^2.0.0
```

Node 22 or later and Express 5 are required, the same as 0.2.x. The
`@modelcontextprotocol/ext-apps` and `@modelcontextprotocol/sdk` peers remain for the widget-side
host bridge.

## 2. Re-scaffold, then port

The recommended path is a fresh scaffold on a branch, not an in-place edit. The 1.x blueprint
files differ from 0.2.x (the server gets a `state` option, the example tools use sealed state),
and the schematic writes them all correctly in one step:

```bash
ng add ng-mcp-ui@next --example=demo
```

Then port your 0.2.x tools and widgets into the new files with the mappings below. Widgets move
unchanged.

## 3. Wrap tool schemas in z.object

1.x accepts any [Standard Schema](https://standardschema.dev) that can produce JSON Schema. The
0.2.x raw-shape form is gone: wrap the fields.

```ts
// 0.2.x
inputSchema: { question: z.string(), options: z.array(z.string()) },

// 1.x
inputSchema: z.object({ question: z.string(), options: z.array(z.string()) }),
```

Type inference through to the widget (`ToolInput`, `ToolOutput`, `injectToolInfo`) works exactly
as before.

## 4. Update handler signatures

Handlers now receive the SDK v2 tool context instead of the v1 `extra` object:

| 0.2.x | 1.x |
| --- | --- |
| `(args, extra)` | `(args, ctx)` |
| `extra.requestInfo.headers["x-foo"]` | `ctx.http?.req?.headers.get("x-foo")` |
| `extra.authInfo` | `ctx.http?.authInfo` |
| `extra._meta` (client hints) | `ctx.mcpReq._meta` |
| n/a | `ctx.state` ([sealed state](/docs/guides/sealed-state)) |
| n/a | `ctx.mcpReq.inputResponses`, `ctx.mcpReq.requestState<T>()` ([elicitation](/docs/guides/elicitation)) |

Return shapes are unchanged: `content` (string or array), `structuredContent`, `_meta`. Handlers
may now also return an `inputRequired(...)` result to request more input.

## 5. Replace mcpMiddleware

The protocol middleware API is removed. SDK v2 builds a fresh server per request and has no
middleware chain, so there is no hook to expose. Replace each use:

| 0.2.x middleware use | 1.x replacement |
| --- | --- |
| Logging, metrics, tracing | Express middleware around the router (`app.use` before the mount) |
| Auth checks | `requireBearerAuth` / `optionalBearerAuth` before the router, `ctx.http?.authInfo` in handlers |
| Per-request context for handlers | Read `ctx` directly in the handler |
| Rewriting results | Do it in the handler, or wrap the handler function in your own helper |

The view `_meta` injection that ng-mcp-ui itself performed through middleware now happens at
registration time. You get it automatically and cannot break it by middleware ordering.

## 6. Replace the transport plumbing

`connect()`, `connectStatelessTransport()`, and `getHandlerMaps()` are gone. The 1.x `McpServer`
is a plain blueprint: it declares tools and views, and the HTTP layer turns it into a fresh SDK
server per request.

- Express hosting is unchanged from the outside: `app.use("/mcp", createMcpExpressRouter(mcp))`.
- The returned router now exposes the underlying SDK handler as `router.mcp`, so application code
  can publish change notifications (`router.mcp.notify.toolsChanged()`) or share its
  subscription bus.
- Fetch-native runtimes (Vercel, workerd) use `createMcpFetchHandler(mcp)` directly.
- If you embedded the SDK server yourself, use `mcp.factory()` with the SDK v2
  `createMcpHandler`.

## 7. Auth helpers

`requireBearerAuth`, `optionalBearerAuth`, `mcpAuthMetadataRouter`, and their option types are
still exported and work as before, now backed by `@modelcontextprotocol/express`. The
`InvalidTokenError` re-export is gone: SDK v2 reports bearer failures through its own OAuth error
responses, and there is no error-class surface to re-export.

## 8. Testing

The `ng-mcp-ui/testing` harness is unchanged. One new rule: `provideMockMcpUi` rejects canned
tool responses with `resultType: "input_required"`. Hosts do not surface multi-round trips to
widgets, so tools called from views must complete in one round. Keep elicitation flows on
chat-path tools.

## New capabilities worth adopting

- [Sealed state](/docs/guides/sealed-state) removes in-memory session maps: the server seals
  state into an HMAC token the widget carries. The scaffolded example tools use it.
- [Elicitation](/docs/guides/elicitation) lets a chat-path tool ask the user for structured
  input before it completes.
- Cache hints tell the host how long to cache `tools/list` and view resources. Hashed widget
  assets get aggressive defaults automatically. See [`McpServer`](/docs/api/mcp-server) and
  [`registerTool`](/docs/api/register-tool).
- Change notifications: publish `router.mcp.notify.toolsChanged()` and hosts subscribed through
  `subscriptions/listen` refresh without polling. See
  [`createMcpExpressRouter`](/docs/api/create-mcp-express-router).
