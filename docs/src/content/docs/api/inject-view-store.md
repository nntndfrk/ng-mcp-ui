---
title: injectViewStore
description: A store-style API over the same host view state, with selectors, a partial merge and debounced writes.
group: API
groupOrder: 5
order: 20
---

```ts
injectViewStore<State extends ViewState>(
  initialState?: ViewStoreCreator<State>,
  defaultState?: State | (() => State | null) | null,
  options?: InjectViewStoreOptions,
): InjectViewStore<State>
```

The store writes to the same host state as
[`injectViewState`](/docs/api/inject-view-state). Use the store when one value and one setter are
no longer enough.

```ts
import { injectViewStore } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly store = injectViewStore<{ tab: string; votes: number }>(
    () => ({ tab: "vote", votes: 0 }),
  );

  readonly tab = this.store.select((s) => s?.tab ?? "vote");

  vote() {
    this.store.update((prev) => ({ ...prev, votes: (prev?.votes ?? 0) + 1 }));
  }
}
```

## Returns

| Member | Signature | Purpose |
| --- | --- | --- |
| `state` | `Signal<State \| null>` | The current state. |
| `set` | `(updater) => void` | Replaces the state. |
| `update` | `(producer) => void` | Merges a partial into the state. |
| `patch` | Same as `update` | An alias of `update`. |
| `select` | `<T>(selector: (state) => T) => Signal<T>` | A memoized derived signal. |
| `flush` | `() => void` | Writes the pending value to the host now. |

## set, update and patch

`set` replaces the whole state. `update` shallow-merges a partial.

```ts
this.store.set({ tab: "results", votes: 3 });      // replaces
this.store.update({ tab: "results" });             // merges, votes stays
this.store.update((prev) => ({ votes: prev.votes + 1 }));
```

`patch` and `update` are the same function under two names.

Like `injectViewState`, `set(null)` clears the local signal and does not clear the host state.

## select

`select` gives a memoized signal. The signal only changes when the selected value changes,
therefore a template that reads one field does not re-render when another field changes.

```ts
readonly tab = this.store.select((s) => s?.tab ?? "vote");
```

## Writes are debounced

Local writes are immediate. The write to the host is debounced, so a burst of updates becomes one
host call.

| Option | Type | Default |
| --- | --- | --- |
| `debounceMs` | number | `0`, which means the next macro task. |

The debounce is trailing-edge: the last value in the window is the one that reaches the host.

Call `flush()` to write immediately. Do this before an action that ends the view, for example a
close.

```ts
this.store.flush();
await this.close();
```

## The write and echo loop

The host echoes the state back after a write. The store compares the incoming value with the value
it holds, and it ignores an echo that matches. Therefore a write does not cause a second write.

## Host support

Supported on the two host runtimes, with the same storage difference as
[`injectViewState`](/docs/api/inject-view-state).

## Related

- [View state](/docs/guides/view-state)
- [`injectViewState`](/docs/api/inject-view-state)
