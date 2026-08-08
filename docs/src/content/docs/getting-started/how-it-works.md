---
title: How it works
description: Why SSR gives you the server and not the render, and what happens in the sandboxed iframe of the host.
group: Getting started
groupOrder: 1
order: 3
---

A view is **not** server-rendered HTML with the data already in it. The MCP host renders a thin HTML
shell in a **sandboxed iframe**. The Angular widget bundle then boots, and the tool data arrives
after that. A host bridge pushes the data. The first HTML does not carry it.

`ng-mcp-ui` is built around this sequence.

## server.ts is one Express app

The MCP JSON-RPC endpoint (`/mcp`) and the widget asset routes mount **before** the SSR catch-all
route of Angular.

```ts
import { createMcpExpressRouter, createViewAssetRouter } from "ng-mcp-ui/server";
import { createMcpServer } from "./mcp/server";

// before Angular's SSR catch-all:
app.use("/mcp", createMcpExpressRouter(createMcpServer()));
app.use("/assets/widgets", createViewAssetRouter({ dir: "dist/widgets/browser" }));
```

The order matters. A catch-all route that runs first answers `/mcp` with your application shell.

The package uses SSR for the thing SSR gives you here: an Express server. It does not use SSR to
render the view content.

## A view is a client-bootstrapped widget

The standard Angular builder puts each registered view in its own lazy chunk, and the server sends
that chunk over HTTP.

`src/widgets/main.ts` is the one browser entry. It reads the `viewName` value that the shell put on
`window.mcpUi`, imports the matching registry entry, and boots it.

```ts
import { bootstrapWidget } from "ng-mcp-ui/web";
import { registry, type ViewName } from "./registry";

const injected = window.mcpUi as { viewName?: string } | undefined;
const name = (injected?.viewName ?? "echo") as ViewName;

registry[name]().then((m) => bootstrapWidget(m.default));
```

Each registry value is a dynamic `import()`. Therefore esbuild puts each view in its own hashed
chunk, and the name of that chunk stays stable. The browser fetches the code of one view only.

## The view manifest

A `resources/read` call must return a shell that names the **hashed** file names of the widget
build. `src/mcp/views.manifest.ts` resolves those names, and it tolerates a missing build.

- If `dist/widgets/browser/index.html` exists,
  [`IndexHtmlViewManifest`](/docs/api/view-manifest) parses it. The shell then names the real
  `main-*.js` and `styles-*.css` files.
- If the file does not exist, an `InMemoryViewManifest("main.js")` still gives a correct shell.
  Thus a view boots before you have built the widget bundle one time.

## One bridge, two hosts

One `Adaptor` interface covers the OpenAI Apps SDK (`window.openai`, which ChatGPT uses) and the
open MCP-Apps postMessage specification (`@modelcontextprotocol/ext-apps`, which Claude and others
use). Your widget code is the same for each host. See
[host bridge and adaptors](/docs/guides/host-bridge).

## Signals, not hooks

The view API is Angular-native: [`injectToolInfo()`](/docs/api/inject-tool-info),
[`injectCallTool()`](/docs/api/inject-call-tool),
[`injectViewState()`](/docs/api/inject-view-state), [`injectLayout()`](/docs/api/inject-layout), a
[`[dataLlm]`](/docs/api/data-llm) directive and an [`mcpAsset`](/docs/api/mcp-asset-pipe) pipe. Each
one is signal-based, and none of them needs Zone.js.

Every `inject*` function resolves the host adaptor from the `MCP_ADAPTOR` DI token that
[`provideMcpUi()`](/docs/api/provide-mcp-ui) supplies. None of them reads a global. Therefore one
provider override replaces the host, which is how the
[test harness](/docs/guides/testing-widgets) works.

## A schematic does the wiring

`ng add` retrofits SSR, the MCP server and a widget build target. The `view` generator and the
`tool` generator scaffold new views and tools, and they keep the registry and the `ViewNameRegistry`
interface current. See [schematics](/docs/schematics/ng-add).

## Build tooling

The Angular compiler `ngc` builds the library in **partial compilation** mode. One `tsconfig.json`
file covers the four entry directories. The build does not use ng-packagr.

- The Node-only entries, `server` and `tunnel`, emit as plain TypeScript.
- The Angular entries, `web` and `testing`, emit Ivy **partial** declarations. The Angular linker of
  the application that consumes them completes those declarations at AOT build time. This is the
  contract for a published Angular library.
- The `exports` field of `package.json` maps each subpath to its `dist` types and its default.

ng-packagr does not fit, because this is a **hybrid** package. Its `server` and `tunnel` entries
import `express`, `node:http` and the MCP SDK.
