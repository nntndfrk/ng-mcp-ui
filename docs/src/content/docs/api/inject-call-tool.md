---
title: injectCallTool
description: Calls a server tool from the view and tracks the state of the call.
group: API
groupOrder: 5
order: 18
---

```ts
injectCallTool<ToolArgs, ToolResponse>(name: string): InjectCallToolResult
```

Bind the helper to one tool name, then call it from an event handler.

```ts
import { injectCallTool } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly vote = injectCallTool<{ option: string }>("cast_vote");

  readonly status = this.vote.status;

  onVote(option: string) {
    this.vote.callTool({ option });
  }
}
```

## Returns

| Member | Type | Purpose |
| --- | --- | --- |
| `callTool` | function | Starts the call. Returns nothing. |
| `callToolAsync` | function | Starts the call and returns a promise of the response. |
| `status` | `Signal<"idle" \| "pending" \| "success" \| "error">` | The state of the last call. |
| `data` | `Signal<TResponse \| undefined>` | The last successful response. |
| `error` | `Signal<unknown>` | The last error. |

Use `callTool` with the signals for a template. Use `callToolAsync` when you need the value in the
next line of code.

## callTool

```ts
callTool(args);
callTool(args, sideEffects);
callTool();                     // when the tool takes no arguments
callTool(sideEffects);          // when the tool takes no arguments
```

The function returns nothing. Read the outcome from `status`, `data` and `error`.

### Side effects

The second argument runs callbacks for one call.

| Callback | Runs |
| --- | --- |
| `onSuccess(data, args)` | After a successful call. |
| `onError(error, args)` | After a failed call. |
| `onSettled(data, error, args)` | After either outcome. |

```ts
this.vote.callTool(
  { option },
  { onSuccess: () => this.toast("Vote counted.") },
);
```

## callToolAsync

```ts
const response = await this.vote.callToolAsync({ option });
```

The promise **rejects** when the tool errors. Use `try`/`catch`.

The signals still update, therefore you can use the promise and the template state together.

## Types

Pass the argument type and the response type, or infer both from the server with
[`injectAppHelpers`](/docs/api/inject-app-helpers):

```ts
const { injectCallTool } = injectAppHelpers<AppServer>();
private readonly vote = injectCallTool("cast_vote");   // args and data are typed
```

## Host support

Supported on the two host runtimes.

## Related

- [`injectToolInfo`](/docs/api/inject-tool-info)
- [`injectAppHelpers`](/docs/api/inject-app-helpers)
