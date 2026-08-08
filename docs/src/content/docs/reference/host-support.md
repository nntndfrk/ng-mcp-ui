---
title: Host support
description: What each inject function does on an Apps SDK host and on an MCP Apps host, and how an unsupported call fails.
group: Reference
groupOrder: 4
order: 4
---

One `Adaptor` interface covers the two host runtimes. The interface is the same, but the runtimes
are not. Some functions operate on one host only. This page gives the behavior of each function on
each host.

The two runtimes are:

- **Apps SDK**, the `window.openai` global. ChatGPT uses it.
- **MCP Apps**, the open postMessage specification. Claude and other MCP Apps hosts use it.

The behavior below comes from the two adaptor implementations in the package.

## Failure modes

An unsupported call fails in one of three ways. The difference is important, because each way needs
different code from you.

| Mode | What happens | What you write |
| --- | --- | --- |
| **Throws** | The call throws an `Error`. | A `try`/`catch` block. |
| **Returns an error value** | The call writes a log message and resolves to `{ isError: true }`. | A test of the result. |
| **No operation** | The call writes a warning and does nothing. | A different design for that host. |

## Read the host context

Each of these functions operates on the two hosts.

| Function | Apps SDK | MCP Apps |
| --- | --- | --- |
| `injectToolInfo` | Supported | Supported |
| `injectLayout` | Supported | Supported |
| `injectUser` | Supported | Supported |
| `injectDisplayMode` | Supported | Supported |
| `injectHostContext` | Supported | Supported |
| `injectViewContext` | Supported | Supported |

## View state

| Function | Apps SDK | MCP Apps |
| --- | --- | --- |
| `injectViewState` | Supported | Supported |
| `injectViewStore` | Supported | Supported |

The storage is different. An Apps SDK host keeps the state in the widget state of the host. An MCP
Apps host sends the state to the host, and it also writes a copy to `localStorage`. Therefore an
MCP Apps view can show its last state immediately after a reload.

## Drive the host

| Function | Apps SDK | MCP Apps |
| --- | --- | --- |
| `injectCallTool` | Supported | Supported |
| `injectRequestClose` | Supported | Supported |
| `injectRequestModal` | Supported | Supported |
| `injectSendFollowUpMessage` | Supported | Supported. The host ignores `scrollToBottom` |
| `injectOpenExternal` | Supported | Supported. The adaptor warns and ignores `redirectUrl: false` |
| `injectRequestSize` | **No operation.** Writes a warning | Supported |
| `injectRegisterViewTool` | **No operation.** Writes a warning, returns an empty disposer | Supported |
| `injectSetOpenInAppUrl` | Supported. Throws if `href` is empty | **Throws** |

`injectRequestModal` uses a different mechanism on each host. An Apps SDK host opens a host modal.
An MCP Apps host changes the local display state, and the modal service shows the view.

## Files and downloads

| Function | Apps SDK | MCP Apps |
| --- | --- | --- |
| `injectFiles().upload` | Supported | **Throws** |
| `injectFiles().getDownloadUrl` | Supported | **Throws** |
| `injectFiles().selectFiles` | Supported. **Throws** on an old host | **Throws** |
| `injectDownload().download` | **Returns `{ isError: true }`** | Supported, if the host has `downloadFile` |

See the [files guide](/docs/guides/files) for the full details.

## Server data

| Data | Apps SDK | MCP Apps |
| --- | --- | --- |
| [Client hints](/docs/guides/client-hints) on `extra._meta` | Supported | Not sent |
| [`baseUriDomains`](/docs/guides/csp) in the view CSP | Not sent | Supported |
| `prefersBorder` on the view config | Supported | Sent, but the host can ignore it |
| `domain` on the view config | Supported | Sent, but the host can ignore it |

## How to write for the two hosts

Do not test the name of the host. Test for the function instead. A `try`/`catch` block with a
fallback path is correct, and it stays correct when a host adds a function later.

```ts
const files = injectFiles();

async function attach(file: File) {
  try {
    return await files.upload(file);
  } catch {
    // This host has no file functions. Use a URL field instead.
    return null;
  }
}
```

For a test of your own code against the two hosts, use `MockAdaptor`. See
[testing widgets](/docs/guides/testing-widgets).
