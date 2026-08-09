---
title: Elicitation
description: Let a chat-path tool pause and ask the user for structured input before it completes, with server-verified state across the round trip.
group: Guides
groupOrder: 2
order: 5
---

MCP 2026-07-28 lets a tool answer "I need more input" instead of a result. The host renders the
question to the user, then calls the same tool again with the answers attached. The protocol
calls this a multi-round trip (MRTR). Use it for confirmations, missing parameters, or choices
the model should not guess.

> Elicitation is for **chat-path tools only**: tools the model calls in conversation. Hosts do
> not surface multi-round trips to widgets, so a tool that a view calls through
> [`injectCallTool`](/docs/api/inject-call-tool) must complete in one round. The
> [testing harness](/docs/guides/testing-widgets) enforces this: `provideMockMcpUi` rejects
> canned `input_required` responses.

## The shape of a round trip

1. Round one: the handler returns `inputRequired({ inputRequests, requestState })` instead of a
   result. `inputRequests` names each question; `requestState` carries the handler's mid-flight
   context as an opaque token.
2. The host collects the user's answers.
3. Round two: the host calls the tool again with the same arguments plus `inputResponses` and the
   echoed `requestState`. The handler reads the answers and completes.

The SDK enforces a bound on rounds per logical call (default 8, the `inputRequired` server
option).

## A worked example

```ts
import { acceptedContent, inputRequired } from "ng-mcp-ui/server";
import { z } from "zod";

const confirmSchema = z.object({ ok: z.boolean() });

server.registerTool(
  {
    name: "delete_report",
    description: "Delete a report after the user confirms.",
    inputSchema: z.object({ target: z.string() }),
  },
  async ({ target }, ctx) => {
    const confirmed = acceptedContent(
      ctx.mcpReq.inputResponses,
      "confirm",
      confirmSchema,
    );
    if (confirmed === undefined) {
      // Round one: ask, and seal the context we need on round two.
      return inputRequired({
        inputRequests: {
          confirm: inputRequired.elicit({
            message: `Delete ${target}? This cannot be undone.`,
            requestedSchema: confirmSchema,
          }),
        },
        requestState: await ctx.state?.sealRequestState({ target }),
      });
    }
    if (!confirmed.ok) {
      return { content: "Cancelled. Nothing was deleted." };
    }
    // Round two: the echo was verified and decoded before the handler ran.
    const sealed = ctx.state?.requestState<{ target: string }>();
    await deleteReport(sealed?.target ?? target);
    return { content: `Deleted ${sealed?.target ?? target}.` };
  },
);
```

The pieces:

- `acceptedContent(responses, key, schema)` reads one accepted answer, validated against the
  schema. It returns `undefined` when there is no answer yet, which doubles as the round-one
  test. A declined or cancelled request also comes back as `undefined`, so a round-two handler
  that gets `undefined` for a request it asked should treat it as "the user said no".
- `inputRequired.elicit({...})` builds a form question. `inputRequired.elicitUrl`,
  `inputRequired.createMessage`, and `inputRequired.listRoots` build the other request kinds
  (browser hand-off, model sampling, roots listing).
- `requestState` is minted with `ctx.state.sealRequestState(...)`, which uses the same codec as
  [sealed state](/docs/guides/sealed-state). Configure the server's `state` option to use it.

## Verified requestState

With the `state` option configured, ng-mcp-ui wires the codec into the SDK's `requestState`
verification hook. On round two:

- A valid echo is decoded before your handler runs. Read it with
  `ctx.state.requestState<T>()`.
- A tampered or expired echo never reaches your handler. The SDK answers the frozen protocol
  error `-32602` with the message `Invalid or expired requestState`, and by design it does not
  say which check failed.

You never verify the echo yourself, and the handler cannot forget to.

Two bindings are sealed into every token, so a valid signature is not enough on its own:

| Binding | Effect |
| --- | --- |
| Purpose | A widget token from `ctx.state.seal()` cannot be echoed as `requestState`, and an MRTR token cannot be opened with `ctx.state.open()`. |
| Operation | An echo minted by one tool is refused by another, so a confirmation cannot be moved to a different tool. |

Add `bind` to the server's `state` option to also tie tokens to the principal, and keep
`ttlSeconds` short. Read `ctx.state.requestState<T>()` rather than the SDK's
`ctx.mcpReq.requestState<T>()`: with a `state` option configured, the SDK accessor returns the
raw signed envelope, and `ctx.state.requestState()` unwraps it and checks the bindings.

## Host capability requirement

A server may only embed a form elicitation when the request envelope declares the client
capability for it:

```json
{ "elicitation": { "form": {} } }
```

When the capability is missing, the SDK rejects the call with error `-32021` and lists the
required capabilities in the error data. Hosts that support elicitation declare it on every
request. In tests, put the capability into the request `_meta` envelope; the library's own test
suite shows the shape.

## When not to use it

- From a view: never. Keep view-callable tools single-round (see the note at the top).
- For state the widget should carry across calls: use [sealed state](/docs/guides/sealed-state)
  in `_meta` instead.
- For free-form follow-up: if the model can simply ask in conversation, let it. Elicitation is
  for structured answers the tool needs to proceed.
