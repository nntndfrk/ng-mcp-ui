---
title: How it works
description: Why SSR gives you the server rather than the render, and what actually happens inside the host's sandboxed iframe.
group: Getting started
groupOrder: 1
order: 3
---

A view is **not** server-rendered HTML with data baked in. The MCP host renders a thin HTML shell in
a **sandboxed iframe**, the Angular widget bundle boots, and the tool data arrives afterward —
pushed through a host bridge, not the initial HTML. `ng-mcp-ui` is built around that reality.

## server.ts is one Express app

The MCP JSON-RPC endpoint (`/mcp`) and the widget asset routes mount **before** Angular's SSR
catch-all:

```ts
import { createMcpExpressRouter, createViewAssetRouter } from "ng-mcp-ui/server";
import { createMcpServer } from "./mcp/server";

// before Angular's SSR catch-all:
app.use("/mcp", createMcpExpressRouter(createMcpServer()));
app.use("/assets/widgets", createViewAssetRouter({ /* … */ }));
```

SSR is used for what it is genuinely good for here — giving you that Express server — not for
rendering view content.

## Views are client-bootstrapped widgets

Each registered view is code-split into its own lazy chunk by the standard Angular builder and
served over HTTP. `src/widgets/main.ts` is the single browser entry: it reads the `viewName` the
shell injected on `window.mcpUi`, lazy-imports the matching registry entry, and boots it.

```ts
import { bootstrapWidget } from "ng-mcp-ui/web";
import { registry, type ViewName } from "./registry";

const injected = window.mcpUi as { viewName?: string } | undefined;
const name = (injected?.viewName ?? "echo") as ViewName;

registry[name]().then((m) => bootstrapWidget(m.default));
```

Because each registry value is a dynamic `import()`, esbuild splits every view into a name-stable
hashed chunk. Only the requested view's code is fetched.

## The view manifest

`resources/read` has to return a shell that points at the *hashed* filenames the widgets build
emitted. `src/mcp/views.manifest.ts` resolves that defensively:

- if `dist/widgets/browser/index.html` exists, it is parsed by `IndexHtmlViewManifest`, so the shell
  references the real hashed `main-*.js` and `styles-*.css`;
- otherwise an `InMemoryViewManifest("main.js")` still produces a well-formed shell — enough to boot
  before the widgets bundle has ever been built.

## One bridge, two hosts

A single `Adaptor` interface abstracts the OpenAI Apps SDK (`window.openai`, ChatGPT) and the open
MCP-Apps postMessage spec (`@modelcontextprotocol/ext-apps`, Claude and others) behind one API. Your
widget code is identical across hosts — see [Host bridge and adaptors](/docs/guides/host-bridge).

## Signals, not hooks

The view API is Angular-native: `injectToolInfo()`, `injectCallTool()`, `injectViewState()`,
`injectLayout()`, a `[dataLlm]` directive, an `mcpAsset` pipe — all signal-based and
zoneless-friendly. Every `inject*` function resolves the host adaptor from the `MCP_ADAPTOR` DI
token provided by `provideMcpUi()`, so nothing reaches for a global.

## A schematic does the wiring

`ng add` retrofits SSR, the MCP server, and a widgets build target; the `view` and `tool` generators
scaffold new views and tools and keep the registry and `ViewNameRegistry` in sync. See
[Schematics](/docs/schematics/ng-add).

## Build tooling

The library is built with the Angular compiler **`ngc` in partial compilation mode** — one
`tsconfig.json` over all four entry directories — not ng-packagr:

- the Node-only entries (`server`, `tunnel`) emit as plain TypeScript;
- the Angular entries (`web`, `testing`) emit Ivy **partial** declarations, so a consuming app's
  Angular linker finalizes them at AOT build time — the published-Angular-library contract;
- `package.json#exports` maps each subpath to its `dist` types and default.

ng-packagr is a poor fit because this is a **hybrid** package whose `server` and `tunnel` entries
import `express`, `node:http`, and the MCP SDK.
