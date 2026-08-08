---
title: injectAppHelpers
description: Returns injectCallTool and injectToolInfo narrowed to the tools of your server.
group: API
groupOrder: 5
order: 33
---

```ts
injectAppHelpers<AppType>(): {
  injectCallTool: <ToolName>(name: ToolName) => …;
  injectToolInfo: <ToolName>() => …;
}
```

The plain wrappers accept any tool name and any shape. `injectAppHelpers` reads the type of your
server and narrows both.

```ts
import { injectAppHelpers } from "ng-mcp-ui/web";
import type { AppServer } from "../mcp/server";

const { injectCallTool, injectToolInfo } = injectAppHelpers<AppServer>();

export class PollWidget {
  readonly tool = injectToolInfo<"create_poll">();
  private readonly vote = injectCallTool("cast_vote");
}
```

You then get:

- completion for the tool names, and a compile error for a name that does not exist;
- typed `args` on `callTool`, from the `inputSchema` of that tool;
- typed `data` and `output`, from the `outputSchema` of that tool.

## Setup

Export the type of your server from the module that builds it.

```ts
export function createMcpServer() {
  return new McpServer(/* … */).registerTool(/* … */);
}
export type AppServer = ReturnType<typeof createMcpServer>;
```

The chained `registerTool` calls accumulate each shape into that type. Therefore the chain must
stay one expression. A version that registers tools in separate statements loses the types.

```ts
// keeps the types
return new McpServer(info).registerTool(a, ha).registerTool(b, hb);

// loses the types
const server = new McpServer(info);
server.registerTool(a, ha);
return server;
```

## Where to call it

Call `injectAppHelpers()` at module level, as the example does. It is plain TypeScript sugar and it
touches no DI.

The functions it returns are the real wrappers, therefore you must call **those** from an injection
context.

## It only imports a type

`import type { AppServer }` is removed at compile time. Thus the server code does not reach the
browser bundle. Keep the import in a `import type` statement, so a bundler cannot pull the server
in.

## Host support

Supported on the two host runtimes, because it delegates to
[`injectCallTool`](/docs/api/inject-call-tool) and
[`injectToolInfo`](/docs/api/inject-tool-info).

## Related

- [Typed tool data](/docs/guides/typed-tool-data)
- [Utility types](/docs/api/utility-types)
