---
title: View state
description: How to keep per-view UI state on the host with injectViewState and injectViewStore.
group: Guides
groupOrder: 2
order: 3
---

The host can remove a view and then render it again. The user scrolls the conversation away and
back, or opens a widget later. UI state in a plain component field does not survive this.

The host keeps a small store for each view. `ng-mcp-ui` gives you two ways to use it.

## injectViewState for one value

For one piece of state, [`injectViewState`](/docs/api/inject-view-state) is enough. It gives you
`{ value, set }`. The `value` member is a signal. The `set` member accepts the next value, or a
function of the previous value.

```ts
import { injectViewState } from "ng-mcp-ui/web";

const viewState = injectViewState<{ myVote: string | null }>({ myVote: null });

viewState.value();                                   // Signal<{ myVote: string | null } | null>
viewState.set({ myVote: "Ramen" });                  // replace
viewState.set((prev) => ({ myVote: prev?.myVote ?? null })); // update
```

`value()` is `null` until the host reports state.

The sync goes in two directions. A change on the host flows back into the signal.

## injectViewStore for more than one value

[`injectViewStore`](/docs/api/inject-view-store) is the store-style API over the same host sync. Use
it for a view that has outgrown one value and one setter.

```ts
import { injectViewStore } from "ng-mcp-ui/web";

const store = injectViewStore({ filter: "", expanded: [] as string[] });

store.state();                       // the whole state as a signal
store.set({ filter: "", expanded: [] });
store.update((prev) => ({ ...prev, filter: "ramen" }));
store.patch({ filter: "ramen" });    // shallow merge
const filter = store.select((s) => s?.filter ?? ""); // memoized selector signal
store.flush();                       // write the pending value now
```

The store adds three things to the simple form.

- **Debounced host writes.** A user who types quickly does not send one message for each keystroke.
- **A conflict guard.** The store compares an incoming value with the value it holds, therefore the
  echo of your own write does not cause a second write.
- **View-context filtering**, with a re-attach.

`flush()` returns nothing, and it writes immediately. Call it before an action that ends the view,
because a debounced write can otherwise be lost.

```ts
store.flush();
await requestClose();
```

## View context

Both APIs write under a reserved key of the host `viewState`, next to the
[`[dataLlm]`](/docs/api/data-llm) channel. The helpers are exported for an advanced caller.

| Symbol | Purpose |
| --- | --- |
| `VIEW_CONTEXT_KEY` | The reserved key. |
| `injectViewContext()` | The raw context signal. |
| `filterViewContext(...)` | Removes the context envelope from a raw host value. |

Most widgets never need these. Use them only when you read or write the host view state directly.

## Host support

Both APIs work on the two host runtimes. The storage differs. An Apps SDK host keeps the state in
its widget state. An MCP Apps host sends the state to the host, and it also writes a copy to
`localStorage`. Therefore an MCP Apps view can show its last state immediately after a reload.
