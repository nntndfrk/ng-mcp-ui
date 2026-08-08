---
title: provideMcpUi
description: The one provider a widget needs. It sets up zoneless change detection and the two host tokens.
group: API
groupOrder: 5
order: 14
---

```ts
provideMcpUi(): EnvironmentProviders
```

`provideMcpUi()` wires the host bridge into Angular DI. Each `inject*` function needs it.

```ts
import { bootstrapWidget, provideMcpUi } from "ng-mcp-ui/web";

bootstrapWidget(PollWidget, [provideMcpUi(), provideMyThing()]);
```

[`bootstrapWidget`](/docs/api/bootstrap-widget) applies `provideMcpUi()` for you. Pass it yourself
only when you add your own providers next to it.

## What it provides

| Provided | Value |
| --- | --- |
| Zoneless change detection | The widgets are signal-based. They do not need Zone.js. |
| `MCP_ADAPTOR` | The resolved host bridge, from `window.mcpUi.hostType`. |
| `MCP_SERVER_URL` | The origin of the MCP server, from `window.mcpUi.serverUrl`. |
| [`provideMcpModal()`](/docs/api/mcp-modal) | The modal service. It activates on an MCP Apps host only. |

The shell document sets `window.mcpUi`. If it is absent, the tokens fall back to safe values, and
`MCP_SERVER_URL` becomes an empty string.

## The two tokens

Both tokens are exported, therefore you can provide either one yourself.

```ts
import { MCP_ADAPTOR, MCP_SERVER_URL } from "ng-mcp-ui/web";
```

Provide `MCP_ADAPTOR` to run a widget against a different adaptor. This is the seam that
[`provideMockMcpUi()`](/docs/api/provide-mock-mcp-ui) uses in a test.

Every `inject*` function reads `MCP_ADAPTOR`. None of them reads a global. Therefore an override of
this token changes the behavior of the whole widget.

## Injection context

Because the tokens come from DI, you must call each `inject*` function from an Angular injection
context: a field initializer, a constructor, or `runInInjectionContext`.

```ts
export class PollWidget {
  private readonly tool = injectToolInfo();   // correct

  vote() {
    const tool = injectToolInfo();            // throws
  }
}
```

## Related

- [`bootstrapWidget`](/docs/api/bootstrap-widget)
- [Host bridge and adaptors](/docs/guides/host-bridge)
- [`provideMockMcpUi`](/docs/api/provide-mock-mcp-ui)
