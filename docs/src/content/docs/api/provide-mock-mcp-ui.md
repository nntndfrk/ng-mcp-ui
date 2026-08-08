---
title: provideMockMcpUi
description: The provider override that mirrors provideMcpUi with a MockAdaptor behind it.
group: API
groupOrder: 5
order: 38
---

```ts
provideMockMcpUi(args?: MockMcpUiArgs): ProvideMockMcpUiResult
```

`provideMockMcpUi()` gives you the providers that a widget needs, and the
[`MockAdaptor`](/docs/api/mock-adaptor) behind them.

```ts
import { provideMockMcpUi } from "ng-mcp-ui/testing";

const { providers, adaptor } = provideMockMcpUi({
  hostContext: { theme: "dark" },
  toolResponses: { cast_vote: { total: 4 } },
});
```

## Returns

| Member | Type | Purpose |
| --- | --- | --- |
| `providers` | `EnvironmentProviders` | Pass to your test injector. |
| `adaptor` | `MockAdaptor` | Drive the host and read the call log. |

The arguments are the same as the arguments of `MockAdaptor`.

## In a test

The providers work in a bare Angular injector. You need no `TestBed`, and no Zone.js.

```ts
const { providers, adaptor } = provideMockMcpUi({ hostContext: { theme: "dark" } });
const injector = createEnvironmentInjector([providers], parentInjector);

const layout = runInInjectionContext(injector, () => injectLayout());
expect(layout().theme).toBe("dark");

adaptor.pushHostContext("theme", "light");
expect(layout().theme).toBe("light");
```

Each `inject*` function needs an injection context, therefore wrap the call in
`runInInjectionContext`.

## Why it works

Every `inject*` function reads the `MCP_ADAPTOR` token, and none of them reads a global. Therefore
one provider override replaces the host for the whole widget.

`provideMockMcpUi()` is a pure function. It touches no `window`, so it also runs under SSR and in a
plain Node test.

## Related

- [`MockAdaptor`](/docs/api/mock-adaptor)
- [Testing widgets](/docs/guides/testing-widgets)
- [`provideMcpUi`](/docs/api/provide-mcp-ui)
