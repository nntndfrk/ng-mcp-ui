---
title: DataLlmDirective
description: The [dataLlm] directive tells the model what is on screen, without a tool call.
group: API
groupOrder: 5
order: 34
---

The model cannot see your rendered view. `[dataLlm]` describes the view in words and puts that
description where the model reads it.

```html
<div dataLlm="Active filters">
  <span dataLlm="Sort: name"></span>
  <span dataLlm="Page: 2"></span>
</div>
```

The model then knows the filters without a tool call, and it can answer a question about them.

```ts
import { DataLlmDirective } from "ng-mcp-ui/web";

@Component({
  imports: [DataLlmDirective],
  // …
})
```

## Input

| Input | Type | Purpose |
| --- | --- | --- |
| `dataLlm` | `string \| null \| undefined` | The text for the model. |

Bind it like any input, so the text follows your state:

```html
<span [dataLlm]="'Votes: ' + total()"></span>
```

## The tree

Each directive registers a node. A directive finds its parent through Angular DI: it injects the
nearest enclosing `DataLlmDirective`. Therefore the DOM nesting becomes the nesting of the
description.

The flattened tree is serialized as an indented bullet list, and it is written to the host view
state. The host gives it to the model on the next turn.

An empty or `null` value registers a **structural parent**. That node emits no line of its own, and
it still keeps its children nested.

```html
<div [dataLlm]="null">
  <span dataLlm="Only this line appears"></span>
</div>
```

## The attribute

The directive also writes the resolved text to the host element as a `data-llm` attribute. This
makes the value visible when you inspect the DOM.

## getLLMDescriptionString

```ts
getLLMDescriptionString(): string
```

Returns the serialized tree as it stands. Use it in a test, or to log what the model will read.

## Write for a reader

The value is prose for a model, not a label for a person. Name the thing and its value.

```html
<span dataLlm="Sort: name ascending"></span>   <!-- clear -->
<span dataLlm="name"></span>                    <!-- unclear -->
```

## Host support

Supported on the two host runtimes. It writes through the same view-state channel as
[`injectViewState`](/docs/api/inject-view-state), under a reserved key.

## Related

- [`injectSendFollowUpMessage`](/docs/api/inject-send-follow-up-message)
- [View state](/docs/guides/view-state)
