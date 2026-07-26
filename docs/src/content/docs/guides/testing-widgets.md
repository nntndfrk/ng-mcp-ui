---
title: Testing widgets
description: Unit-testing a widget against an in-memory MockAdaptor, with no real host and no window globals.
group: Guides
groupOrder: 2
order: 5
---

`ng-mcp-ui/testing` gives unit tests and Storybook a pure provider override that mirrors
`provideMcpUi()` — no `window.mcpUi`, no postMessage, no real host.

## provideMockMcpUi

`provideMockMcpUi()` binds `MCP_ADAPTOR` to an in-memory `MockAdaptor` and returns both the
providers and the adaptor, so the test can drive host pushes and inspect what the widget sent:

```ts
import { TestBed } from "@angular/core/testing";
import { provideMockMcpUi } from "ng-mcp-ui/testing";

import PollWidget from "./poll.widget";

const { providers, adaptor } = provideMockMcpUi({
  hostContext: { theme: "dark" },
  toolResponses: {
    cast_vote: { structuredContent: { pollId: "p1", tally: [], total: 1 } },
  },
});

TestBed.configureTestingModule({ providers: [providers] });

const fixture = TestBed.createComponent(PollWidget);
fixture.detectChanges();
```

## Driving the host

Tool data arrives after boot in production, and the mock reproduces that: push it explicitly.

```ts
adaptor.pushHostContext("toolOutput", {
  pollId: "p1",
  question: "Lunch?",
  options: ["Ramen", "Tacos"],
  tally: [],
  total: 0,
});
fixture.detectChanges();

expect(fixture.nativeElement.querySelector("h1").textContent).toContain("Lunch?");
```

Any host-context key works the same way — `theme`, `displayMode`, `viewState`, `toolInput`,
`toolOutput` — so a test can walk a widget through the same sequence a real host produces.

## Asserting outgoing calls

The mock records everything the widget sent to the host on `adaptor.calls`, so tool calls, size
requests and follow-up messages are all assertable:

```ts
fixture.nativeElement.querySelector("button").click();
await fixture.whenStable();

expect(adaptor.calls).toContainEqual(
  expect.objectContaining({ name: "cast_vote", args: { pollId: "p1", option: "Ramen" } }),
);
```

## Notes

- Because the widget resolves everything through `MCP_ADAPTOR`, nothing has to be stubbed on
  `window`. The same override works in Storybook.
- `provideMockMcpUi()` mirrors `provideMcpUi()`, including zoneless change detection — prefer
  `await fixture.whenStable()` over `detectChanges()` after an async interaction.
