---
title: Host bridge and adaptors
description: One Adaptor interface behind two host runtimes, and how provideMcpUi wires it into Angular DI.
group: Guides
groupOrder: 2
order: 1
---

Two host runtimes exist today.

- The **OpenAI Apps SDK**. It gives a `window.openai` global. ChatGPT uses it.
- The open **MCP-Apps** postMessage specification, `@modelcontextprotocol/ext-apps`. Claude and
  other MCP-Apps hosts use it.

`ng-mcp-ui/web` puts one `Adaptor` interface in front of the two runtimes. Your widget never
branches on the host.

## provideMcpUi

[`provideMcpUi()`](/docs/api/provide-mcp-ui) is the one provider that a widget needs. It sets up
zoneless change detection, it derives the two host tokens from the `window.mcpUi` object that the
shell injected, and it registers the modal service.

```ts
import { bootstrapWidget, provideMcpUi } from "ng-mcp-ui/web";
import PollWidget from "./poll.widget";

// bootstrapWidget applies provideMcpUi() for you:
bootstrapWidget(PollWidget);

// …or provide it yourself, e.g. alongside app-specific providers:
bootstrapWidget(PollWidget, [provideMcpUi(), provideMyThing()]);
```

[`bootstrapWidget`](/docs/api/bootstrap-widget) boots a standalone component into the `#root`
element of the shell, and it returns the `ApplicationRef`.

## The two DI tokens

| Token | Value |
| --- | --- |
| `MCP_ADAPTOR` | The resolved host bridge. Each `inject*` function reads it. None of them reads a global. |
| `MCP_SERVER_URL` | The origin of the MCP server that served this view. The [`mcpAsset`](/docs/api/mcp-asset-pipe) pipe uses it. |

`ng-mcp-ui/web` exports both tokens. Therefore you can provide `MCP_ADAPTOR` yourself, and run a
widget against your own adaptor or a mock. This is what
[`provideMockMcpUi()`](/docs/guides/testing-widgets) does.

Because DI resolves the tokens, you must call each `inject*` function from an Angular **injection
context**: a field initializer, a constructor, or `runInInjectionContext`.

## Reading the raw host context

[`injectHostContext()`](/docs/api/inject-host-context) is the low-level escape hatch. It gives one
readonly signal for each raw host-context key.

```ts
import { injectHostContext } from "ng-mcp-ui/web";

const host = injectHostContext();
// host.theme(), host.displayMode(), host.toolOutput(), …
```

The typed wrappers are derived from it: [`injectToolInfo`](/docs/api/inject-tool-info),
[`injectLayout`](/docs/api/inject-layout), [`injectUser`](/docs/api/inject-user) and
[`injectViewState`](/docs/api/inject-view-state). Use those first.

`createHostContextSignals` is the non-DI form, for code that already holds an adaptor.

## Driving the host

The bridge also gives callable forwarders for each action that a view can ask of the host: open an
external URL, send a follow-up message, request a modal, resize the iframe, close the view, start a
download, set the open-in-app link, and register a view tool. The
[ng-mcp-ui/web reference](/docs/reference/web) lists each one.

Some actions work on one runtime only. Read
[host support](/docs/reference/host-support) before you depend on one.

## getAdaptor

`getAdaptor()` reads the adaptor from the environment directly, with no DI.

Prefer the `MCP_ADAPTOR` token. Nothing in the library calls `getAdaptor()`, and that is what makes
one provider override replace the host for a whole widget. A call to `getAdaptor()` bypasses that
seam, therefore a test cannot replace it.

## The dev tunnel

A host must reach your server over HTTPS. `ng add` writes a `tunnel` npm script as a documented
placeholder. It does not hard-wire a provider CLI.

```bash
npm run tunnel
# → Expose http://localhost:4200 with your tunnel of choice, e.g.
#   cloudflared tunnel --url http://localhost:4200
```

Replace the body of the script with the command you choose. `ng-mcp-ui/tunnel` is the reserved slot
for a managed `cloudflared` surface, and it is a skeleton today.
