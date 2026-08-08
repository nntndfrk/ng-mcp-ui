---
title: MockAdaptor
description: An in-memory host bridge for tests, with a call log and controllable host context.
group: API
groupOrder: 5
order: 37
---

`MockAdaptor` implements the whole host bridge in memory. A test needs no real host, no iframe, and
no window globals.

```ts
import { MockAdaptor } from "ng-mcp-ui/testing";

const adaptor = new MockAdaptor({
  hostContext: { theme: "dark" },
  toolResponses: { cast_vote: { structuredContent: { total: 4 } } },
});
```

Usually you do not construct it directly.
[`provideMockMcpUi()`](/docs/api/provide-mock-mcp-ui) builds one and returns it with the matching
providers.

## Constructor arguments

| Field | Type | Purpose |
| --- | --- | --- |
| `hostContext` | `Partial<HostContext>` | Seed values for any subset of the keys. Unset keys take a default. |
| `toolResponses` | `Record<string, MockToolResponse>` | A canned response for each tool name. |
| `serverUrl` | string | The value bound to `MCP_SERVER_URL`. The default is `""`. |

### toolResponses

A `MockToolResponse` is a full `CallToolResponse`, or just the `structuredContent` object. The
short form is usually enough.

```ts
toolResponses: {
  cast_vote: { total: 4 },                        // short form
  create_poll: { structuredContent: { id: "1" }, isError: false },
}
```

A `callTool` for a name that is not listed resolves with an empty success response. Therefore a
wrapper still moves to the success state, and you can test that path without listing every tool.

## Members

| Member | Purpose |
| --- | --- |
| `calls` | The log of every recorded call. |
| `clearCalls()` | Empties the log. |
| `pushHostContext(key, value)` | Pushes a new value for one key and fires its subscribers. |

### calls

Each entry is `{ method, args }`. `method` is a bridge method name, or
`"registerViewTool:dispose"` for a teardown.

```ts
expect(adaptor.calls).toContainEqual({
  method: "callTool",
  args: ["cast_vote", { option: "a" }],
});
```

Call `clearCalls()` between assertions in a long test.

### pushHostContext

This is the counterpart of a real host push. It flips the matching signal in every wrapper that
subscribes to that key.

```ts
adaptor.pushHostContext("theme", "dark");
// every injectLayout() signal now reports the dark theme
```

Use it to test how a view reacts to a host change, for example a theme switch or a tool result that
arrives late.

## Related

- [`provideMockMcpUi`](/docs/api/provide-mock-mcp-ui)
- [Testing widgets](/docs/guides/testing-widgets)
