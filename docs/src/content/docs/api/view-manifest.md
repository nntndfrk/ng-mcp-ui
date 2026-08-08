---
title: View manifests
description: How the server resolves the hashed file names of the widget build for the shell document.
group: API
groupOrder: 5
order: 11
---

The shell document must name the correct script file and style file. In a production build those
names carry a content hash. A `ViewManifest` resolves them.

Pass one to the [`McpServer`](/docs/api/mcp-server) constructor:

```ts
new McpServer(info, { viewManifest: resolveViewManifest() });
```

The `ng-add` schematic writes a `src/mcp/views.manifest.ts` file that builds the correct manifest
for you. Usually you do not construct one by hand.

## The symbols

| Symbol | Purpose |
| --- | --- |
| `ViewManifest` | The interface. |
| `IndexHtmlViewManifest` | Reads the `index.html` of the widget build. |
| `InMemoryViewManifest` | A fixed set of names. |
| `ViewManifestError` | Thrown when a manifest cannot resolve. |

The interface has two methods.

```ts
interface ViewManifest {
  mainFile(): string;
  styleFile(): string | undefined;
}
```

`styleFile()` gives `undefined` when the build emitted no global style sheet.

## IndexHtmlViewManifest

The constructor takes an object with one key: a file path, or inline HTML.

```ts
new IndexHtmlViewManifest({ path: "dist/widgets/browser/index.html" });
new IndexHtmlViewManifest({ html: "<!doctype html>…" });
```

| Form | Behavior |
| --- | --- |
| `{ html }` | Parsed immediately. |
| `{ path }` | Read on first access, then cached. |

Call `reload()` to clear the cache. The next access re-reads the file. This is useful when the
build runs again while the server stays up.

The parser looks for a `<script type="module">` tag with a `main-*.js` name, or a `main.js` name.

## InMemoryViewManifest

Construct it with the file names directly.

```ts
new InMemoryViewManifest("main.js");
```

This is the default when you give no manifest. The default makes development work with no
configuration, because the dev server serves unhashed names.

## Errors

| Message | Cause |
| --- | --- |
| `could not resolve the widget entry bundle from index.html` | The file has no entry script tag. Run the widget build. |
| `failed to read widgets index.html at "…"` | The path is wrong, or the build did not run. |

Both are a `ViewManifestError`. Catch that type to tell a manifest problem from another error.

## Related

- [`McpServer`](/docs/api/mcp-server)
- [`createViewAssetRouter`](/docs/api/create-view-asset-router)
- [build-widgets](/docs/schematics/build-widgets)
