---
title: Typed tool data
description: How a Zod schema on the server becomes a typed signal in the widget, and what injectAppHelpers adds.
group: Guides
groupOrder: 2
order: 2
---

## The tool state signal

`injectToolInfo()` returns a `Signal<ToolState>` for the tool call that rendered this view. The
state is a discriminated union of three shapes — idle, pending, success — so you narrow before
reading:

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

`ToolIdleState`, `ToolPendingState` and `ToolSuccessState` are exported if you want to type a
helper against one arm of the union.

## Calling a tool from the view

`injectCallTool(name)` returns a small object rather than a bare function, so the call's lifecycle
is observable:

```ts
const castVote = injectCallTool<{ pollId: string; option: string }, { structuredContent: PollSnapshot }>(
  "cast_vote",
);

// callTool: fire-and-track, with optional side effects
castVote.callTool({ pollId, option }, { onSuccess: (result) => { /* … */ } });

// callToolAsync: await the result directly
const result = await castVote.callToolAsync({ pollId, option });

// signals for rendering
castVote.status(); // idle | pending | success | error
castVote.data();
castVote.error();
```

## End-to-end inference with injectAppHelpers

`registerTool` accumulates each tool's input, output and `_meta` shape into the server's type, so
`typeof server` carries the whole registry. `injectAppHelpers<typeof server>()` turns that into
tool-name-narrowed helpers — no hand-written generics in the widget:

```ts
// src/mcp/server.ts
export function createMcpServer() {
  return new McpServer(/* … */).registerTool(/* create_poll */).registerTool(/* cast_vote */);
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

The returned functions still delegate to the real wrappers, so they must also be called from an
injection context.

## Surfacing view content back to the model

The model cannot see inside the iframe. `[dataLlm]` registers a piece of in-view content in a shared
tree, which is serialized as an indented bullet list and persisted on the host's `viewState` — so
the model can read what the user is looking at without an extra tool call:

```html
<p [dataLlm]="voteSummary()"></p>
```

Nested directives discover their parent automatically, so a component tree produces a nested
outline. `getLLMDescriptionString` is exported for advanced callers and tests.

## Assets inside the iframe

The widget runs on the host's origin, not yours, so a relative asset path resolves to the wrong
place. The `mcpAsset` pipe rewrites it onto the MCP server origin:

```html
<img [src]="'logo.svg' | mcpAsset" alt="" />
```

In development, when `MCP_SERVER_URL` is empty, the path passes through unchanged.
