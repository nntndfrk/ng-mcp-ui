---
title: McpServer
description: The server blueprint. Declare tools and views on it, then mount it with the Express router or the fetch handler.
group: API
groupOrder: 5
order: 1
---

`McpServer` is a blueprint. It records your tool declarations and view resources, and it carries a
typed tool registry. It owns no transport and holds no connection. The HTTP layer builds a fresh
SDK server for each request from this blueprint.

```ts
import { McpServer } from "ng-mcp-ui/server";

const server = new McpServer(
  { name: "my-app", version: "1.0.0" },
  {
    viewManifest: resolveViewManifest(),
    state: { key: process.env["NG_MCP_STATE_KEY"] },
  },
);
```

## Constructor

```ts
new McpServer(serverInfo: Implementation, options?: ServerOptions & McpServerExtraOptions)
```

`serverInfo` is the `Implementation` object of the SDK: a `name` and a `version`.

`options` accepts each option of the SDK v2 `ServerOptions`, and these three more options.

| Option | Type | Default |
| --- | --- | --- |
| `viewManifest` | [`ViewManifest`](/docs/api/view-manifest) | An empty `InMemoryViewManifest`. Development works with no configuration. |
| `shellRenderer` | [`ShellRenderer`](/docs/api/shell-renderer) | An `AngularShellRenderer`. It reads `NODE_ENV` and the resolved `viewManifest`. |
| `state` | `StateOptions` or `RequestStateCodec` | None. Without it, `ctx.state` is `undefined` in each handler. |

### SDK options you often set

| Option | Purpose |
| --- | --- |
| `capabilities` | The capabilities that the server advertises. |
| `instructions` | Text that tells a client how to use the server. |
| `cacheHints` | A cache hint for each cacheable operation: `tools/list`, `prompts/list`, `resources/list`, `resources/templates/list`, `resources/read` and `server/discover`. Without a hint, a result carries `ttlMs: 0` and `cacheScope: "private"`. |
| `inputRequired` | The limits of a multi-round trip. `maxRounds` defaults to 8. See [elicitation](/docs/guides/elicitation). |
| `requestState` | The integrity hook for an echoed `requestState`. The `state` option below fills it for you. |

A hint on one view resource wins over `cacheHints` for that resource. See
[`registerTool`](/docs/api/register-tool).

## state

Set `state` to give each handler a `ctx.state` object. One HMAC key then serves both verified
carriers of the protocol.

```ts
new McpServer(info, { state: { key: process.env["NG_MCP_STATE_KEY"] } });
```

| Field | Type | Default |
| --- | --- | --- |
| `key` | string or `Uint8Array` | None. A missing key throws in production. In development the server mints an ephemeral key and logs a warning. |
| `ttlSeconds` | number | 600. The lifetime of a token. |
| `bind` | `(ctx) => string` | None. Extra verification context. Bind by principal, never by method. |

Pass a ready-made `RequestStateCodec` from `createRequestStateCodec(...)` instead of the options
object when you share one codec across servers.

`ctx.state` has four methods, in two pairs. A token of one pair never verifies as a token of the
other, because the purpose is signed into it.

| Method | Use |
| --- | --- |
| `seal(payload)` | Mint a token that the widget carries between calls. |
| `open<T>(token)` | Verify a widget-carried token and read its payload. |
| `sealRequestState(payload)` | Mint an elicitation `requestState`, bound to the current tool. |
| `requestState<T>()` | Read the verified echo on a retry round. |

Read [sealed state](/docs/guides/sealed-state) for the widget-carried pair, and
[elicitation](/docs/guides/elicitation) for the multi-round pair.

## Members

| Member | Signature |
| --- | --- |
| [`registerTool`](/docs/api/register-tool) | `(config, handler) => this` |
| `factory` | `() => McpServerFactory` |
| `$types` | A type-only property. Do not read it at runtime. |

`registerTool` returns the server, therefore you can chain the calls.

### factory

`factory()` gives the per-request factory of the SDK. It builds one SDK server for each request,
with the view metadata of that request already resolved.

[`createMcpExpressRouter`](/docs/api/create-mcp-express-router) and `createMcpFetchHandler` call it
for you. Call it yourself only when you host the SDK `createMcpHandler` on your own.

### $types

A type-only property. It holds the accumulated tool registry.
[`injectAppHelpers`](/docs/api/inject-app-helpers) reads it through `typeof server`.

The property has no runtime value. Read it in a type position only.

## The wire

A 1.x endpoint speaks MCP 2026-07-28 only. Both HTTP entry points pin the SDK to
`legacy: "reject"`, therefore a 2025-era client gets the unsupported-protocol-version error. Stay
on the 0.2.x line for the old protocol.

The capability probe of this revision is `server/discover`. There is no `initialize` handshake, and
that method answers `-32601`.

## Capability advertisement

A server that serves at least one `mcp-app` view advertises the MCP Apps extension (SEP-2133) in
its capabilities:

```json
{
  "extensions": {
    "io.modelcontextprotocol/ui": { "mimeTypes": ["text/html;profile=mcp-app"] }
  }
}
```

The server adds the entry for you. A blueprint with no view declares no extension. An entry that
you put in `capabilities.extensions` yourself wins, therefore you can pin your own payload.

## One view for each tool

A view belongs to one tool. If a second tool names the same view, the registration throws an error:

```
ng-mcp-ui: view "poll" is already used by tool "create_poll".
```

A tool that only changes state does not need its own view. The first tool re-renders with the new
state.

## Gone in 1.x

| Removed | Use instead |
| --- | --- |
| `mcpMiddleware()` | Express middleware around the router, or the handler itself. |
| `connect()`, `connectStatelessTransport()` | `createMcpExpressRouter` or `createMcpFetchHandler`. |
| `getHandlerMaps()` | Nothing. View `_meta` is set at registration time. |
| `InvalidTokenError` | Nothing. SDK v2 answers a bearer failure with its own OAuth error response. |

## Related

- [`registerTool`](/docs/api/register-tool)
- [`createMcpExpressRouter`](/docs/api/create-mcp-express-router)
- [Sealed state](/docs/guides/sealed-state)
- [Migrate from 0.2.x](/docs/getting-started/migrate-from-0-2)
