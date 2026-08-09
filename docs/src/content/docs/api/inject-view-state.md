---
title: injectViewState
description: Reads and writes one piece of view state that the host keeps across renders.
group: API
groupOrder: 5
order: 19
---

```ts
injectViewState<T extends ViewState>(
  defaultState?: T | (() => T | null) | null,
): InjectViewStateResult<T>
```

The host keeps this state, therefore it survives a re-render of the view. The model can also read
it, so it knows what the user is looking at. A view that carries a
[sealed state](/docs/guides/sealed-state) token keeps the freshest token here, so a remount can
still call the server.

```ts
import { injectViewState } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly view = injectViewState<{ tab: string }>({ tab: "vote" });

  readonly tab = computed(() => this.view.value()?.tab ?? "vote");

  select(tab: string) {
    this.view.set({ tab });
  }
}
```

## Returns

| Member | Type |
| --- | --- |
| `value` | `Signal<T \| null>` |
| `set` | `(updater: T \| null \| ((prev: T \| null) => T \| null)) => void` |

`value()` is `null` until the host reports state, and after a `set(null)`.

## set

Pass a value, or a function of the previous value.

```ts
this.view.set({ tab: "results" });
this.view.set((prev) => ({ ...prev, tab: "results" }));
```

`set(null)` clears the local signal. It does **not** clear the state on the host, because the host
API has no clear operation.

## The default state

The first argument seeds the state when the host has none.

```ts
injectViewState({ tab: "vote" });          // a value
injectViewState(() => ({ tab: "vote" }));  // a factory
```

The default does not overwrite state that the host already holds.

## When to use the store instead

`injectViewState` handles one value and one setter. Use
[`injectViewStore`](/docs/api/inject-view-store) when you need several fields, memoized selectors,
a partial merge, or control over the write timing.

## Host support

Supported on the two host runtimes. The storage differs. An Apps SDK host keeps the state in its
widget state. An MCP Apps host sends it to the host and also writes a copy to `localStorage`.

## Related

- [View state](/docs/guides/view-state)
- [Sealed state](/docs/guides/sealed-state) for a server token that the view carries between calls
- [`injectViewStore`](/docs/api/inject-view-store)
