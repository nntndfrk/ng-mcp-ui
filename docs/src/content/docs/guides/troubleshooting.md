---
title: Troubleshooting
description: The errors that the library and the MCP SDK raise, what causes each one, and how to correct it.
group: Guides
groupOrder: 2
order: 11
---

Each message below comes from the library or from the MCP SDK it runs on. Find your message, then
apply the correction.

## Server errors

### The host cannot connect at all

```
HTTP 400, JSON-RPC -32022 "Unsupported protocol version"
data.supported: ["2026-07-28"]
```

1.x speaks MCP 2026-07-28 only. The endpoint rejects a 2025-era client on the wire
(`legacy: "reject"`), therefore no tool ever runs. In the host this looks like a connector that
does not add, or one that lists no tools.

This is expected today. As of August 2026, claude.ai still connects with the 2025-11-25 revision.
Keep a production connector on the 0.2.x line until the hosts you target roll out 2026-07-28. See
[migrate from 0.2.x](/docs/getting-started/migrate-from-0-2).

### Sealed state is invalid or expired

```
ng-mcp-ui: sealed state is invalid or expired
```

`ctx.state.open()` refused a token. The signature does not match, the lifetime ran out, the `bind`
context differs, or the token was minted for the other carrier. The SDK converts the throw into an
`isError` tool result, therefore the widget sees a failed call and not an exception.

The message names no reason on purpose. The usual causes are:

- The server restarted with no `state.key`, thus with an ephemeral key.
- `ttlSeconds` is shorter than the time the widget stays on screen. Raise it, or re-seal on each
  response, because a re-seal restarts the lifetime.
- An elicitation `requestState` token was given to `open()`. The two carriers are not
  interchangeable.

In the widget, treat this result as "start over". See [sealed state](/docs/guides/sealed-state).

### Invalid or expired requestState

```
JSON-RPC -32602 "Invalid or expired requestState"
```

Round two of an elicitation arrived with an echo that failed verification: tampered, expired, or
minted for another purpose or another tool. The check runs before your handler, therefore the
handler never sees the call.

Mint the echo with `ctx.state.sealRequestState(...)` in round one, and let the host send it back
unchanged. Do not build or edit the token yourself. See [elicitation](/docs/guides/elicitation).

### The client capabilities do not declare the required capability

```
JSON-RPC -32021 "Cannot request input 'confirm' (elicitation/create): the request's client
capabilities do not declare the required capability"
```

Your handler returned an `inputRequired(...)` with a form elicitation, but the request envelope
declared no `elicitation.form` capability. The error data lists the missing capabilities in
`requiredCapabilities`.

A host that supports elicitation declares the capability on each request. Therefore this error
means one of two things: the host cannot elicit, or a test request omitted the capability from the
`_meta` envelope. Give the tool a path that completes without the question.

### state.key is required in production

```
ng-mcp-ui: `state.key` is required in production. Provide a stable secret of at least 32 bytes …
```

You constructed the server with a `state` option and no `key`, and `NODE_ENV` is `production`.
Construction throws, thus the process does not start.

Read the key from the environment, for example `state: { key: process.env["NG_MCP_STATE_KEY"] }`.
Each instance that can receive a token needs the same key.

In development the same case only writes a warning:

```
ng-mcp-ui: no `state.key` configured; using an ephemeral per-process key. …
```

The library then mints a key for the process. Each token dies on restart. That is correct for a dev
loop, and it is the usual cause of "sealed state is invalid or expired" after a reload.

### A tool renders a view but returned no content

```
ng-mcp-ui: tool "create_poll" renders a view but returned no `content`.
```

The handler returned `structuredContent` only. The view renders on an MCP Apps host and on an Apps
SDK host. Every other client, and the model's own reading of the result, sees nothing.

Return a short text summary next to `structuredContent`. The library writes this warning in
development only, and one time for each tool.

### A view is already used by another tool

```
ng-mcp-ui: view "poll" is already used by tool "create_poll".
Tool "cast_vote" cannot also reference it — each view backs exactly one tool.
```

Each view belongs to one tool. This rule keeps the tool result and the rendered view together.

Give the second tool its own view, or let the second tool return a text result. A tool that only
changes state does not need a view. The first tool re-renders with the new state.

### Could not resolve the widget entry bundle

```
ng-mcp-ui: could not resolve the widget entry bundle from index.html.
```

`IndexHtmlViewManifest` read the `index.html` file of the widgets build, but it found no entry
script tag.

Run the widgets build first:

```bash
npm run build:widgets
```

Then confirm that `dist/widgets/browser/index.html` has a `<script type="module">` tag.

### Failed to read widgets index.html

```
ng-mcp-ui: failed to read widgets index.html at "…".
```

The path is wrong, or the build did not run. Run `npm run build:widgets`. If the path is wrong,
give the correct `dist/widgets/browser/index.html` path to `IndexHtmlViewManifest`.

### The dev-server proxy accepts http only

```
ng-mcp-ui: the widgets dev-server proxy only supports http:// upstreams
```

You gave a `devServerUrl` value that is not an `http://` URL. The proxy connects to your local
`ng serve` process, thus the upstream is always plain HTTP.

Set `devServerUrl` to the `ng serve` origin, for example `http://localhost:4200`.

## View errors

### An inject function throws outside an injection context

Angular throws this error when you call an `inject*` function from the wrong place. Each `inject*`
function reads the `MCP_ADAPTOR` token, therefore Angular DI must be active.

Call the function in a field initializer, in a constructor, or in `runInInjectionContext`. Do not
call it in a lifecycle hook, in an event handler, or in a `setTimeout` callback.

```ts
export class PollWidget {
  private readonly state = injectViewState();   // correct

  onClick() {
    const state = injectViewState();            // wrong
  }
}
```

### File upload, download or selection is not supported in MCP App

```
File upload is not supported in MCP App.
```

An MCP Apps host has no file functions. Only an Apps SDK host has them.

Put the call in a `try`/`catch` block and give a fallback path. See
[files and downloads](/docs/guides/files) and the
[host support matrix](/docs/reference/host-support).

### setOpenInAppUrl is not implemented in MCP App

```
setOpenInAppUrl is not implemented in MCP App.
```

Only an Apps SDK host has this function. Call it in a `try`/`catch` block.

### selectFiles is not supported by the current host version

```
selectFiles is not supported by the current host version.
```

The Apps SDK host is too old, and it does not show a file picker. Give the user another way to
supply the file, for example a URL field.

### The href parameter is required

```
The href parameter is required.
```

You called `setOpenInAppUrl` with an empty string, or with spaces only. Give a real URL, or do not
call the function.

## Behavior that is correct but looks wrong

### A call does nothing and writes a warning

Two functions do nothing on an Apps SDK host. They write a warning to the console.

- `injectRequestSize`. An Apps SDK host controls the size of the iframe.
- `injectRegisterViewTool`. An Apps SDK host does not support view tools. The function returns an
  empty disposer, thus your cleanup code stays correct.

These are not errors. See the [host support matrix](/docs/reference/host-support).

### download resolves with isError: true

`injectDownload().download` never throws. It resolves to `{ isError: true }` when the host has no
download function. Test the result:

```ts
const result = await download({ contents });
if (result.isError) {
  // Show a link instead.
}
```

### An image or font does not load in the view

Two different causes give the same symptom.

1. **The URL points to the wrong origin.** In the iframe, a relative path points to the host, not
   to your server. Use the `mcpAsset` pipe.
2. **The CSP does not permit the origin.** Add the origin to `resourceDomains` in the `csp` object
   of the view config.

You often need both corrections. See [Content Security Policy](/docs/guides/csp).
