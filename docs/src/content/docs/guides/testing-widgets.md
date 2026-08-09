---
title: Testing widgets
description: How to unit-test a widget against an in-memory MockAdaptor, with no real host and no window globals.
group: Guides
groupOrder: 2
order: 10
---

`ng-mcp-ui/testing` gives a unit test and Storybook a pure provider override. The override mirrors
[`provideMcpUi()`](/docs/api/provide-mcp-ui). There is no `window.mcpUi`, no postMessage, and no
real host.

## provideMockMcpUi

[`provideMockMcpUi()`](/docs/api/provide-mock-mcp-ui) binds `MCP_ADAPTOR` to an in-memory
[`MockAdaptor`](/docs/api/mock-adaptor). It gives you the providers and the adaptor. Therefore the
test can drive the host and read what the widget sent.

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

In production the tool data arrives after the boot. The mock reproduces that, therefore you push
the data yourself.

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

Each host-context key works the same way: `theme`, `displayMode`, `viewState`, `toolInput`,
`toolOutput` and the others. Thus a test can move a widget through the same sequence that a real
host produces.

## Asserting outgoing calls

The mock records each call that the widget made to the host, in `adaptor.calls`. Therefore you can
assert a tool call, a size request or a follow-up message.

Each entry has this shape:

```ts
{ method: "callTool", args: ["cast_vote", { pollId: "p1", option: "Ramen" }] }
```

`method` is a bridge method name, or `"registerViewTool:dispose"` for a teardown. `args` is the
argument list of that call, in order.

```ts
fixture.nativeElement.querySelector("button").click();
await fixture.whenStable();

expect(adaptor.calls).toContainEqual({
  method: "callTool",
  args: ["cast_vote", { pollId: "p1", option: "Ramen" }],
});
```

Call `adaptor.clearCalls()` between assertions in a long test.

## Storybook

The same override works in Storybook. Give the `providers` to `applicationConfig`, and the widget
renders with no host:

```ts
import { applicationConfig } from "@storybook/angular";
import { provideMockMcpUi } from "ng-mcp-ui/testing";

export const DarkTheme: Story = {
  decorators: [
    applicationConfig({
      providers: [provideMockMcpUi({ hostContext: { theme: "dark" } }).providers],
    }),
  ],
};
```

Make a new `MockAdaptor` for each story. The adaptor holds mutable host state and a call log, so a
shared instance leaks the writes of one story into the next.

Set `experimentalZoneless: true` on the Storybook builder. `provideMockMcpUi()` supplies
`provideZonelessChangeDetection()`, and without that flag Storybook loads `zone.js` instead.

A runnable example is in the repository at
[`examples/storybook`](https://github.com/nntndfrk/ng-mcp-ui/tree/main/examples/storybook). CI
builds it, so the stories stay correct. That widget uses Ionic in Cupertino mode for its look. The
library has no opinion about your component library, and the override above is the same with any
of them.

## Notes

- The widget resolves everything through `MCP_ADAPTOR`, therefore you stub nothing on `window`.
- `provideMockMcpUi()` mirrors `provideMcpUi()`, and that includes zoneless change detection. After
  an async interaction, prefer `await fixture.whenStable()` over `detectChanges()`.
- The providers also work in a bare Angular injector. You need no `TestBed`. Wrap each `inject*`
  call in `runInInjectionContext`.
