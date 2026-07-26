---
title: Host bridge and adaptors
description: One Adaptor interface behind two host runtimes, and how provideMcpUi wires it into Angular DI.
group: Guides
groupOrder: 2
order: 1
---

Two host runtimes exist in the wild:

- the **OpenAI Apps SDK** — a `window.openai` global, used by ChatGPT;
- the open **MCP-Apps** postMessage spec — `@modelcontextprotocol/ext-apps`, used by Claude and
  other MCP-Apps hosts.

`ng-mcp-ui/web` puts a single `Adaptor` interface in front of both. Your widget never branches on
the host.

## provideMcpUi

`provideMcpUi()` is the one provider a widget needs. It sets up zoneless change detection, derives
the two host tokens from the shell-injected `window.mcpUi`, and registers the mcp-app modal service:

```ts
import { bootstrapWidget, provideMcpUi } from "ng-mcp-ui/web";
import PollWidget from "./poll.widget";

// bootstrapWidget applies provideMcpUi() for you:
bootstrapWidget(PollWidget);

// …or provide it yourself, e.g. alongside app-specific providers:
bootstrapWidget(PollWidget, [provideMcpUi(), provideMyThing()]);
```

`bootstrapWidget` boots a standalone component into the shell's `#root` element and returns the
`ApplicationRef`.

## The two DI tokens

| Token | Value |
| --- | --- |
| `MCP_ADAPTOR` | The resolved host bridge. Every `inject*` function reads it — none of them touch a global. |
| `MCP_SERVER_URL` | Origin of the MCP server that served this view, used by the `mcpAsset` pipe. |

Both are exported from `ng-mcp-ui/web`, so you can provide `MCP_ADAPTOR` yourself to run a widget
against a custom or mock adaptor — that is exactly what
[`provideMockMcpUi()`](/docs/guides/testing-widgets) does.

Because the tokens are DI-resolved, every `inject*` function must be called from an Angular
**injection context** — a field initializer, a constructor, or inside `runInInjectionContext`.

## Reading raw host context

`injectHostContext()` is the low-level escape hatch: a readonly signal per raw host-context key,
built over the adaptor's `HostContextStore`. The typed wrappers — `injectToolInfo`,
`injectLayout`, `injectUser`, `injectViewState` — are all derived from it, and are what you should
normally reach for.

```ts
import { injectHostContext } from "ng-mcp-ui/web";

const host = injectHostContext();
// host.theme(), host.displayMode(), host.toolOutput(), …
```

`createHostContextSignals` is the non-DI form, for code that already has an adaptor in hand.

## Driving the host

Beyond reading state, the bridge exposes callable forwarders for everything a view may ask the host
to do — open an external URL, send a follow-up message into the conversation, request a modal,
resize the iframe, close the view, trigger a download, set the "open in app" deep link, or register
a view-scoped tool. They are listed in full in the [ng-mcp-ui/web reference](/docs/reference/web).

## The dev tunnel

Hosts need to reach your server over HTTPS. `ng add` writes a `tunnel` npm script as a documented
placeholder rather than hard-wiring a provider CLI:

```bash
npm run tunnel
# → Expose http://localhost:4200 with your tunnel of choice, e.g.
#   cloudflared tunnel --url http://localhost:4200
```

Replace the script body with your chosen command. `ng-mcp-ui/tunnel` is the reserved slot for a
managed `cloudflared` surface; it is a skeleton today.
