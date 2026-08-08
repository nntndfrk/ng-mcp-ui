---
title: McpServer
description: The MCP server class. Register tools on it, then connect a transport.
group: API
groupOrder: 5
order: 1
---

`McpServer` extends the server class of the MCP SDK. It adds a typed tool registry and view
resources.

```ts
import { McpServer } from "ng-mcp-ui/server";

const server = new McpServer(
  { name: "my-app", version: "1.0.0" },
  { viewManifest: resolveViewManifest() },
);
```

## Constructor

```ts
new McpServer(serverInfo: Implementation, options?: ServerOptions & McpServerExtraOptions)
```

`serverInfo` is the `Implementation` object of the SDK: a `name` and a `version`.

`options` accepts each option of the SDK, and these two more options.

| Option | Type | Default |
| --- | --- | --- |
| `viewManifest` | [`ViewManifest`](/docs/api/view-manifest) | An empty `InMemoryViewManifest`. Development works with no configuration. |
| `shellRenderer` | [`ShellRenderer`](/docs/api/shell-renderer) | An `AngularShellRenderer`. It reads `NODE_ENV` and the resolved `viewManifest`. |

## Members

| Member | Signature |
| --- | --- |
| [`registerTool`](/docs/api/register-tool) | `(config, handler) => this` |
| [`mcpMiddleware`](/docs/api/mcp-middleware) | `(filter?, handler) => this` |
| `connect` | `(transport) => Promise<void>` |
| `connectStatelessTransport` | `(transport) => Promise<void>` |
| `$types` | A type-only property. Do not read it at runtime. |

`registerTool` and `mcpMiddleware` return the server. Therefore you can chain the calls.

### connect

Connects a transport. The call also locks the set of middleware. After this call you cannot
register more middleware.

### connectStatelessTransport

Connects one transport for one request. The SDK permits one transport for each server instance.
Therefore this method builds a new underlying server for each request, and it shares the handler
maps of the main server.

[`createMcpExpressRouter`](/docs/api/create-mcp-express-router) calls this method for you. Call it
yourself only when you write your own transport layer.

### $types

A type-only property. It holds the accumulated tool registry.
[`injectAppHelpers`](/docs/api/inject-app-helpers) reads it through `typeof server`.

The property has no runtime value. Read it in a type position only.

## One view for each tool

A view belongs to one tool. If a second tool names the same view, the registration throws an error:

```
ng-mcp-ui: view "poll" is already used by tool "create_poll".
```

A tool that only changes state does not need its own view. The first tool re-renders with the new
state.

## Related

- [`registerTool`](/docs/api/register-tool)
- [`createMcpExpressRouter`](/docs/api/create-mcp-express-router)
- [Protocol middleware](/docs/guides/mcp-middleware)
