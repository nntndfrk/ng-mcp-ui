---
title: ng-mcp-ui/testing
description: MockAdaptor and provideMockMcpUi, a pure provider override that mirrors provideMcpUi with no real host.
group: Reference
groupOrder: 4
order: 3
---

`ng-mcp-ui/testing` gives a unit test and Storybook a provider override that mirrors
`provideMcpUi()`. There is no `window.mcpUi`, no postMessage, and no real host. The widget resolves
its adaptor through the same `MCP_ADAPTOR` token that it always uses.

Full pages: [`provideMockMcpUi`](/docs/api/provide-mock-mcp-ui) and
[`MockAdaptor`](/docs/api/mock-adaptor).

## provideMockMcpUi

```ts
import { provideMockMcpUi } from "ng-mcp-ui/testing";

const { providers, adaptor } = provideMockMcpUi({
  hostContext: { theme: "dark" },
  toolResponses: { cast_vote: { structuredContent: { /* … */ } } },
});

TestBed.configureTestingModule({ providers: [providers] });
```

| Field | Purpose |
| --- | --- |
| `providers` | Pass to `TestBed.configureTestingModule`, or to a Storybook decorator. |
| `adaptor` | The `MockAdaptor` instance. Use it to drive the host and to read what the widget sent. |

| Option | Purpose |
| --- | --- |
| `hostContext` | Seed values for any subset of the host-context keys: theme, display mode, tool input and output, view state, and the others. |
| `toolResponses` | A canned result for each tool name. `injectCallTool` receives it. |
| `serverUrl` | The value bound to `MCP_SERVER_URL`. The default is an empty string. |

A `callTool` for a name that `toolResponses` does not list resolves with an empty success response.
Therefore a wrapper still reaches the success state, and you list only the tools that a test asserts
on.

## MockAdaptor

```ts
// push host state after boot, exactly as a real host does
adaptor.pushHostContext("toolOutput", { question: "Lunch?", options: ["Ramen", "Tacos"] });

// assert what the widget sent
expect(adaptor.calls).toContainEqual({
  method: "callTool",
  args: ["cast_vote", { pollId: "p1", option: "Ramen" }],
});
```

`pushHostContext(key, value)` drives any host-context key. It fires the subscribers of that key,
therefore every matching signal in the widget changes.

`calls` is the log of each call that the widget made to the host: a tool call, a size request, a
follow-up message, and the others. Thus you assert an interaction with no spy.

Each entry has the shape `{ method, args }`. `method` is a bridge method name, or
`"registerViewTool:dispose"` for a teardown. `args` is the argument list of that call, in order.

`clearCalls()` empties the log between assertions.

## Notes

- The mock mirrors `provideMcpUi()`, and that includes zoneless change detection. After an async
  interaction, prefer `await fixture.whenStable()` over `detectChanges()`.
- Everything goes through `MCP_ADAPTOR`, therefore you stub nothing on `window`, and the same
  override works in Storybook with no change.
- The providers also work in a bare Angular injector, with no `TestBed`.

See [testing widgets](/docs/guides/testing-widgets) for a full example.
