---
title: injectHostContext
description: One readonly signal for each raw host-context key. The low-level escape hatch.
group: API
groupOrder: 5
order: 16
---

```ts
injectHostContext(): HostContextSignals
createHostContextSignals(adaptor: Adaptor): HostContextSignals
```

`injectHostContext()` gives you one readonly signal for each key that the host exposes. The typed
wrappers are all derived from it.

```ts
import { injectHostContext } from "ng-mcp-ui/web";

const host = injectHostContext();
host.theme();        // "light" | "dark"
host.toolOutput();   // Record<string, unknown> | null
```

Prefer the typed wrappers. Read this directly only when a key has no wrapper, or when you want
several keys at once without several calls.

## The keys

| Key | Type | Wrapper |
| --- | --- | --- |
| `theme` | `Theme` | [`injectLayout`](/docs/api/inject-layout) |
| `maxHeight` | `number \| undefined` | [`injectLayout`](/docs/api/inject-layout) |
| `safeArea` | `SafeArea` | [`injectLayout`](/docs/api/inject-layout) |
| `locale` | string | [`injectUser`](/docs/api/inject-user) |
| `userAgent` | `UserAgent` | [`injectUser`](/docs/api/inject-user) |
| `displayMode` | `DisplayMode` | [`injectDisplayMode`](/docs/api/inject-display-mode) |
| `display` | `{ mode, params? }` | [`injectRequestModal`](/docs/api/inject-request-modal) |
| `toolInput` | `Record<string, unknown> \| null` | [`injectToolInfo`](/docs/api/inject-tool-info) |
| `toolOutput` | `Record<string, unknown> \| null` | [`injectToolInfo`](/docs/api/inject-tool-info) |
| `toolResponseMetadata` | `Record<string, unknown> \| null` | [`injectToolInfo`](/docs/api/inject-tool-info) |
| `viewState` | `Record<string, unknown> \| null` | [`injectViewState`](/docs/api/inject-view-state) |

## destroy

The returned object also has a `destroy()` method. It removes each host subscription.

Inside an injection context the cleanup runs for you through `DestroyRef`. Call `destroy()`
yourself only when you used `createHostContextSignals`.

## createHostContextSignals

The non-DI form. Pass an adaptor directly.

```ts
const signals = createHostContextSignals(adaptor);
// …
signals.destroy();
```

Use it in code that already holds an adaptor, for example a plain unit test with a
[`MockAdaptor`](/docs/api/mock-adaptor).

## Host support

Each key works on the two host runtimes. The values differ, because each adaptor maps them from a
different host API.

## Related

- [Host bridge and adaptors](/docs/guides/host-bridge)
- [Host support](/docs/reference/host-support)
