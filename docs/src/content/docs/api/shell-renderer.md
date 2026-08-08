---
title: Shell renderer
description: The HTML document that the host renders in the iframe, and how to replace it.
group: API
groupOrder: 5
order: 12
---

A `resources/read` call returns a thin HTML document. The host renders that document in a sandboxed
iframe. The document loads your widget bundle, which then boots the view.

The default renderer covers each supported host. Replace it only for an advanced case.

## The interface

```ts
interface ShellRenderer {
  render(input: ShellRenderInput): string;
}
```

| Symbol | Purpose |
| --- | --- |
| `ShellRenderer` | The interface. |
| `ShellRenderInput` | The argument of `render`. |
| `AngularShellRenderer` | The default implementation. |
| `ShellMode` | `"production"` or `"development"`. |

## ShellRenderInput

| Field | Type | Purpose |
| --- | --- | --- |
| `hostType` | `"apps-sdk"` or `"mcp-app"` | The runtime that renders the view. |
| `serverUrl` | string | The origin of the MCP server. The widget loads its assets from here. |
| `viewName` | string | The view that the widget entry must boot. |
| `isProduction` | boolean, optional | Selects the hashed-asset document. |
| `manifest` | `ViewManifest`, optional | Resolves the hashed file names. |

`isProduction` and `manifest` are optional. A renderer that holds state falls back to the values it
was constructed with. `AngularShellRenderer` does this.

## AngularShellRenderer

```ts
new AngularShellRenderer(mode: ShellMode, manifest: ViewManifest);
```

This is the default. [`McpServer`](/docs/api/mcp-server) constructs it from `NODE_ENV` and the
resolved [`viewManifest`](/docs/api/view-manifest).

The renderer honors the `isProduction` field of each request, therefore the constructor `mode` is
only a fallback.

## Replacing the renderer

Pass your own implementation to the server:

```ts
new McpServer(info, { shellRenderer: new MyShellRenderer() });
```

Your `render` must put `serverUrl` and `viewName` in the document. Without them the widget cannot
find its assets, and it does not know which view to boot.

Replace the renderer only when you must change the document itself, for example to add a meta tag
that a host needs. To change which origins the document may use, set a
[CSP](/docs/guides/csp) on the view instead.

## Related

- [`McpServer`](/docs/api/mcp-server)
- [`ViewManifest`](/docs/api/view-manifest)
- [How it works](/docs/getting-started/how-it-works)
