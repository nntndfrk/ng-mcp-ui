---
title: View state
description: Persisting per-view UI state on the host with injectViewState and injectViewStore.
group: Guides
groupOrder: 2
order: 3
---

A view can be unmounted and remounted by the host — a conversation is scrolled away and back, a
widget is reopened later. Any UI state you keep in a plain component field is gone by then. The host
offers a small persisted store per view; `ng-mcp-ui` exposes it two ways.

## injectViewState — a value and a setter

For one piece of state, `injectViewState` is enough. It returns `{ value, set }`, where `value` is a
signal and `set` accepts either the next value or an updater:

```ts
import { injectViewState } from "ng-mcp-ui/web";

const viewState = injectViewState<{ myVote: string | null }>({ myVote: null });

viewState.value();                                  // Signal<{ myVote: string | null } | undefined>
viewState.set({ myVote: "Ramen" });                 // replace
viewState.set((prev) => ({ count: (prev?.count ?? 0) + 1 })); // update
```

The sync is bidirectional: a host-side change flows back into the signal.

## injectViewStore — when one value is not enough

`injectViewStore` is the store-style API over the same host sync, for views that have outgrown a
single value pair:

```ts
import { injectViewStore } from "ng-mcp-ui/web";

const store = injectViewStore({ filter: "", expanded: [] as string[] });

store.state();                       // the whole state as a signal
store.set({ filter: "", expanded: [] });
store.update((prev) => ({ ...prev, filter: "ramen" }));
store.patch({ filter: "ramen" });    // shallow merge
const filter = store.select((s) => s.filter); // memoized selector signal
await store.flush();                 // force the pending debounced write
```

It adds three things over the simple form: **debounced** host writes so a fast-typing user does not
spam the bridge, a `deepEqual` **conflict guard** against the write/echo loop, and view-context
filtering with re-attach.

## View context

Both APIs write under a reserved key on the host's `viewState`, alongside the `[dataLlm]` channel.
The helpers are exported for advanced callers:

- `VIEW_CONTEXT_KEY` — the reserved key.
- `injectViewContext()` — the raw context signal.
- `filterViewContext(...)` — strips the context envelope from a raw host payload.

Most widgets never need these; reach for them only when you are reading or writing the host's view
state directly.
