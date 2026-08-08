---
title: injectToolInfo
description: A signal that holds the input, output and metadata of the tool call that rendered this view.
group: API
groupOrder: 5
order: 17
---

```ts
injectToolInfo<TS extends Partial<ToolSignature> = ToolSignature>():
  Signal<ToolState<…>>
```

The view exists because the model called a tool. `injectToolInfo()` gives you that call as one
signal.

```ts
import { injectToolInfo } from "ng-mcp-ui/web";

export class PollWidget {
  readonly tool = injectToolInfo();
}
```

```html
@if (tool().isSuccess) {
  <h1>{{ tool().output?.question }}</h1>
}
```

## The state

The signal holds one of three states. Each state has a `status` field and three boolean fields, so
you can branch in a template without a comparison.

| `status` | `isIdle` | `isPending` | `isSuccess` | `input` | `output` | `responseMetadata` |
| --- | --- | --- | --- | --- | --- | --- |
| `"idle"` | `true` | `false` | `false` | `null` | `null` | `null` |
| `"pending"` | `false` | `true` | `false` | The args | `null` | `null` |
| `"success"` | `false` | `false` | `true` | The args | The result, or `null` | The `_meta`, or `null` |

`input` arrives before `output`. Therefore you can render a skeleton from the arguments while the
result is still on the way.

## Types

Without a type argument, `output` is a loose object. Two ways give you a typed result.

**Inline.** Pass the shape:

```ts
readonly tool = injectToolInfo<{ output: { question: string; total: number } }>();
```

**From the server.** [`injectAppHelpers`](/docs/api/inject-app-helpers) infers the shape from your
server type, which is the form to prefer:

```ts
const { injectToolInfo } = injectAppHelpers<AppServer>();
readonly tool = injectToolInfo<"create_poll">();
```

## Host support

Supported on the two host runtimes.

## Related

- [`injectCallTool`](/docs/api/inject-call-tool) to call another tool from the view
- [Typed tool data](/docs/guides/typed-tool-data)
