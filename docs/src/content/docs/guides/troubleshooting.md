---
title: Troubleshooting
description: The errors that the library throws, what causes each one, and how to correct it.
group: Guides
groupOrder: 2
order: 10
---

Each message below comes from the library. Find your message, then apply the correction.

## Server errors

### Cannot register MCP middleware after connect()

```
Cannot register MCP middleware after connect() / connectStatelessTransport() has been called
```

The server instruments its handler maps one time, at the first connect. After that point you cannot
add middleware.

Move each `mcpMiddleware()` call into the function that builds the server. Register the middleware
before you return the server. See [protocol middleware](/docs/guides/mcp-middleware).

### next() called multiple times

```
next() called multiple times in middleware for "tools/call"
```

One middleware called `next()` two times. Each middleware must call `next()` one time only.

Look for a conditional branch that calls `next()`, and then calls it again on a later line. To stop
the chain, do not call `next()`. Return a result instead.

### mcpMiddleware requires a handler function

```
mcpMiddleware requires a handler function when a filter is provided
```

You gave a filter as the first argument, but you did not give a handler as the second argument.
Add the handler, or remove the filter.

### Incompatible MCP SDK version

```
Incompatible MCP SDK version: expected _requestHandlers and _notificationHandlers on Server
```

The middleware layer reads two internal maps of the MCP SDK. Your installed SDK does not have them.

Install an SDK version that agrees with the peer dependency range of the package. Look at
`peerDependencies` in `package.json`.

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
