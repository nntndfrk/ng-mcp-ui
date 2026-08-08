---
title: injectSendFollowUpMessage
description: Sends a follow-up turn into the conversation as if the user typed it.
group: API
groupOrder: 5
order: 25
---

```ts
injectSendFollowUpMessage(): SendFollowUpMessageFn
```

```ts
type SendFollowUpMessageFn = (
  prompt: string,
  options?: SendFollowUpMessageOptions,
) => Promise<void>;
```

```ts
import { injectSendFollowUpMessage } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly sendFollowUp = injectSendFollowUpMessage();

  explain(option: string) {
    this.sendFollowUp(`Why did most people choose ${option}?`);
  }
}
```

The message enters the conversation as a user turn. The model answers it.

## Options

| Option | Type | Effect |
| --- | --- | --- |
| `scrollToBottom` | boolean, optional | Asks the host to scroll to the new turn. |

## When to use it

Use it to move work back to the model.

- Correct: a button that asks the model to explain the result on screen.
- Correct: a control that asks for a different analysis of the same data.
- Not correct: a data operation of your own. Call a tool with
  [`injectCallTool`](/docs/api/inject-call-tool) instead, because it keeps the result in the view.

A follow-up message costs a model turn. A tool call does not.

## Write the prompt for the model

The model reads the string, not your intent. Name the subject.

```ts
this.sendFollowUp("Why did most people choose the second option?");   // clear
this.sendFollowUp("Explain this.");                                    // unclear
```

To give the model the state on screen without a message, use the
[`[dataLlm]` directive](/docs/api/data-llm) instead.

## Host support

| Host | Behavior |
| --- | --- |
| Apps SDK | Supported. `scrollToBottom` is honored. |
| MCP Apps | Supported. `scrollToBottom` is ignored. |

## Related

- [`injectCallTool`](/docs/api/inject-call-tool)
- [`DataLlmDirective`](/docs/api/data-llm)
