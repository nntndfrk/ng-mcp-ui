---
title: Utility types
description: The inference types that pull tool names, inputs, outputs and metadata out of your server type.
group: API
groupOrder: 5
order: 13
---

`registerTool` accumulates the shape of each tool into the type of the server. These utility types
read that registry.

Most code does not need them. [`injectAppHelpers`](/docs/api/inject-app-helpers) uses them for you.
Reach for them when you write a helper of your own, or when you need one tool type in isolation.

## Setup

Export the type of your server first.

```ts
export function createMcpServer() {
  return new McpServer(/* … */).registerTool(/* … */);
}
export type AppServer = ReturnType<typeof createMcpServer>;
```

## The types

| Type | Gives you |
| --- | --- |
| `ToolNames<App>` | A union of the registered tool names. |
| `ToolInput<App, Name>` | The parsed input type of one tool. |
| `ToolOutput<App, Name>` | The `structuredContent` type of one tool. |
| `ToolResponseMetadata<App, Name>` | The `_meta` type of one tool response. |
| `InferTools<App>` | The whole registry. |
| `AnyToolRegistry` | A constraint for a generic that accepts any server. |
| `McpServerTypes` | The container that `$types` holds. |

```ts
import type { ToolInput, ToolNames, ToolOutput } from "ng-mcp-ui/server";

type Names = ToolNames<AppServer>;                    // "create_poll" | "cast_vote"
type PollArgs = ToolInput<AppServer, "create_poll">;  // { question: string }
type PollData = ToolOutput<AppServer, "create_poll">; // { pollId: string; total: number }
```

## Config types

These describe the config objects rather than the registry.

| Type | Describes |
| --- | --- |
| `ToolConfig` | The config argument of [`registerTool`](/docs/api/register-tool). |
| `ToolHandler` | The handler argument. |
| `ToolInputSchema` | The `inputSchema` field: a Standard Schema that also gives JSON Schema. |
| `ToolHandlerResult` | The values that a handler can return. |
| `McpToolContext` | The `ctx` argument of a handler. |
| `ToolDef` | One entry in the registry. |
| `ToolMeta`, `KnownToolMeta` | The `_meta` of a tool. |
| `ViewConfig` | The `view` field. See [CSP](/docs/guides/csp). |
| `ViewCsp` | The `csp` field of a view. |
| `ViewHostType` | `"apps-sdk"` or `"mcp-app"`. |
| `ViewName`, `ViewNameRegistry` | The permitted values of `view.component`. |
| `CacheHint`, `CacheScope` | The `view.cacheHint` field, and the `cacheHints` server option. |
| `SecurityScheme` | An entry of `securitySchemes`. |
| `HandlerContent` | The values that a handler can put in `content`. |
| `ClientHintsMeta` | The hints on `ctx.mcpReq._meta`. See [client hints](/docs/guides/client-hints). |

## ViewNameRegistry

`ViewName` starts as `string`. The `view` generator writes a declaration that adds one key for each
view:

```ts
declare module "ng-mcp-ui/server" {
  interface ViewNameRegistry {
    poll: true;
  }
}
```

After the first view exists, `ViewName` narrows to the union of the registered names. Therefore a
typing mistake in `view.component` becomes a compile error.

## Related

- [`injectAppHelpers`](/docs/api/inject-app-helpers)
- [Typed tool data](/docs/guides/typed-tool-data)
