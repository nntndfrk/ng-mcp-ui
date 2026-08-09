---
title: Typed tool data
description: How a Zod schema on the server becomes a typed signal in the widget, and what injectAppHelpers adds.
group: Guides
groupOrder: 2
order: 2
---

## The tool state signal

[`injectToolInfo()`](/docs/api/inject-tool-info) gives you a `Signal<ToolState>` for the tool call
that rendered this view. The state is a union of three shapes: idle, pending and success. Therefore
you must narrow the state before you read a field.

```ts
import { computed } from "@angular/core";
import { injectToolInfo } from "ng-mcp-ui/web";

const tool = injectToolInfo<{
  input: { question?: string; options?: string[] };
  output: PollSnapshot;
}>();

const poll = computed(() => {
  const state = tool();
  if (state.isSuccess) {
    return state.output;
  }
  if (state.isPending) {
    return state.input; // optimistic render while the tool is still running
  }
  return null;
});
```

The `input` field arrives before the `output` field. Thus you can render from the arguments while
the tool still runs.

`ToolIdleState`, `ToolPendingState` and `ToolSuccessState` are exported. Use one of them to type a
helper against one arm of the union.

## Calling a tool from the view

[`injectCallTool(name)`](/docs/api/inject-call-tool) gives you an object, and not one function.
Therefore you can observe the state of the call.

```ts
const castVote = injectCallTool<{ pollId: string; option: string }, { structuredContent: PollSnapshot }>(
  "cast_vote",
);

// callTool: start the call and track it, with optional side effects
castVote.callTool({ pollId, option }, { onSuccess: (result) => { /* … */ } });

// callToolAsync: await the result directly
const result = await castVote.callToolAsync({ pollId, option });

// signals for the template
castVote.status(); // idle | pending | success | error
castVote.data();
castVote.error();
```

`callTool` returns nothing. Read the outcome from the signals. `callToolAsync` rejects when the tool
errors, therefore put it in a `try`/`catch` block.

## Inference with injectAppHelpers

`registerTool` adds the input, output and `_meta` shape of each tool to the type of the server.
Therefore `typeof server` carries the whole registry.

`inputSchema` takes one Standard Schema that can also produce JSON Schema. A zod v4
`z.object({ … })` is the usual choice, and ArkType or Valibot also work. The raw shape form of
0.2.x (`{ question: z.string() }`) is not accepted. See
[migrate from 0.2.x](/docs/getting-started/migrate-from-0-2).

[`injectAppHelpers<typeof server>()`](/docs/api/inject-app-helpers) turns that registry into
tool-name-narrowed helpers. You then write no generics in the widget.

```ts
// src/mcp/server.ts
import { z } from "zod";

export function createMcpServer() {
  return new McpServer({ name: "poll", version: "1.0.0" })
    .registerTool(
      { name: "create_poll", inputSchema: z.object({ question: z.string() }) },
      createPoll,
    )
    .registerTool(
      {
        name: "cast_vote",
        inputSchema: z.object({ pollId: z.string(), option: z.string() }),
      },
      castVote,
    );
}
export type AppServer = ReturnType<typeof createMcpServer>;
```

```ts
// in the widget
import { injectAppHelpers } from "ng-mcp-ui/web";
import type { AppServer } from "../mcp/server";

const { injectCallTool, injectToolInfo } = injectAppHelpers<AppServer>();

// "cast_vote" is checked against the registry; args and result are inferred
const castVote = injectCallTool("cast_vote");
const tool = injectToolInfo();
```

Keep the `registerTool` calls in one chained expression. A version that registers each tool in a
separate statement loses the accumulated types.

The returned functions still delegate to the real wrappers. Therefore you must call them from an
injection context.

## Showing view content to the model

The model cannot see into the iframe. The [`[dataLlm]`](/docs/api/data-llm) directive registers a
piece of in-view content in a shared tree. The library serializes that tree as an indented bullet
list, and it writes the list to the `viewState` of the host. Thus the model reads what the user
looks at, and it makes no extra tool call.

```html
<p [dataLlm]="voteSummary()"></p>
```

A nested directive finds its parent through Angular DI. Therefore your component tree becomes a
nested outline. `getLLMDescriptionString` is exported for an advanced caller and for a test.

## Assets in the iframe

The widget runs on the origin of the host, and not on your origin. Therefore a relative asset path
points to the wrong place. The [`mcpAsset`](/docs/api/mcp-asset-pipe) pipe corrects the path.

```html
<img [src]="'logo.svg' | mcpAsset" alt="" />
```

In development, `MCP_SERVER_URL` is empty, and the pipe returns the path unchanged.

An asset on a third origin also needs that origin in `resourceDomains`. See
[Content Security Policy](/docs/guides/csp).
