---
title: injectRegisterViewTool
description: Exposes a tool that runs inside the view, so the model can drive the view directly.
group: API
groupOrder: 5
order: 32
---

```ts
injectRegisterViewTool<TInput extends ZodRawShapeCompat>(
  config: ViewToolConfig<TInput>,
  handler: ViewToolHandler<TInput>,
): RegisterViewToolHandle
```

A server tool runs on your server. A **view tool** runs in the view, in the browser, with your
component state in scope. Use it when the model must act on what is already on screen.

```ts
import { injectRegisterViewTool } from "ng-mcp-ui/web";
import { z } from "zod";

export class ChessWidget {
  private readonly board = signal(initialBoard());

  private readonly handle = injectRegisterViewTool(
    {
      name: "chess_make_move",
      description: "Move a piece on the board that is on screen.",
      inputSchema: { from: z.string(), to: z.string() },
    },
    ({ from, to }) => {
      this.board.update((b) => applyMove(b, from, to));
      return { content: [{ type: "text", text: `Moved ${from} to ${to}.` }] };
    },
  );
}
```

## Config

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | string | The identifier of the tool. |
| `title` | string, optional | A label for people. |
| `description` | string, optional | Tells the model when to call it. |
| `inputSchema` | Zod shape, optional | The arguments. The handler gets them typed. |
| `annotations` | `ToolAnnotations`, optional | The standard MCP annotations. |

Give the name a namespace, for example `chess_make_move`. A view tool and a server tool share one
name space, therefore a plain name can collide.

## Handler

The handler receives typed, validated arguments. It returns a `CallToolResult`: `content` blocks,
with optional `structuredContent`, `isError` and `_meta`.

The handler runs in the browser. Therefore it can read and write your signals directly, and the
change appears immediately.

## Returns

`RegisterViewToolHandle` has one member.

| Member | Purpose |
| --- | --- |
| `unregister()` | Removes the tool. |

The registration is also removed when the injection context is destroyed. Call `unregister()`
yourself only to remove the tool while the view stays up.

## Host support

| Host | Behavior |
| --- | --- |
| Apps SDK | **No operation.** The call writes a warning and returns an empty disposer. |
| MCP Apps | Supported. |

The empty disposer means your cleanup code stays correct on the two hosts. A view that needs this
feature must still work on an Apps SDK host, therefore keep an equivalent server tool, or a control
that the user can operate.

## Related

- [`injectCallTool`](/docs/api/inject-call-tool)
- [Host support](/docs/reference/host-support)
