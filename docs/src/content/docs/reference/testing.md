---
title: ng-mcp-ui/testing
description: MockAdaptor and provideMockMcpUi — a pure provider override that mirrors provideMcpUi with no real host.
group: Reference
groupOrder: 4
order: 3
---

`ng-mcp-ui/testing` gives unit tests and Storybook a provider override that mirrors
`provideMcpUi()`. There is no `window.mcpUi`, no postMessage, and no real host — the widget resolves
its adaptor through the same `MCP_ADAPTOR` token it always does.

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
| `providers` | Drop into `TestBed.configureTestingModule` (or a Storybook decorator). |
| `adaptor` | The `MockAdaptor` instance, for driving the host and inspecting what the widget sent. |

| Option | Purpose |
| --- | --- |
| `hostContext` | Initial host-context values — theme, display mode, tool input/output, view state. |
| `toolResponses` | Canned results keyed by tool name, returned to `injectCallTool`. |

## MockAdaptor

```ts
// push host state after boot, exactly as a real host does
adaptor.pushHostContext("toolOutput", { question: "Lunch?", options: ["Ramen", "Tacos"] });

// assert what the widget sent
expect(adaptor.calls).toContainEqual(
  expect.objectContaining({ name: "cast_vote" }),
);
```

`pushHostContext(key, value)` drives any host-context key. `calls` is the recorded log of everything
the widget sent outward — tool calls, size requests, follow-up messages — so interactions are
assertable without a spy.

## Notes

- The mock mirrors `provideMcpUi()` including zoneless change detection; prefer
  `await fixture.whenStable()` over `detectChanges()` after an async interaction.
- Because everything routes through `MCP_ADAPTOR`, nothing has to be stubbed on `window`, and the
  same override works unchanged in Storybook.

See [Testing widgets](/docs/guides/testing-widgets) for a full worked example.
