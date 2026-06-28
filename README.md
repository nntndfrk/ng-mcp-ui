# ng-mcp-ui

> **Angular schematic + library that retrofits Angular apps with MCP interactive UI views** —
> MCP servers whose tools render **interactive Angular widgets** inside Claude,
> ChatGPT, and other [MCP-Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
> hosts.

> ### Status: v0.1.0 — published on npm
> The full public surface (`server` / `web` / `testing` / `tunnel` + the
> schematics) **ships and is CI-green across Angular v20, v21, and v22** (a
> cross-major fixture matrix builds a real retrofit app, AOT-builds the widget
> bundle + SSR host, and probes `/mcp` on every push). Real-host validation is
> **signed off**: render is machine-verified on Claude (poll widget renders in
> the host iframe, typed tool data arrives, display-mode works) and the
> interactive vote/tally rows plus ChatGPT parity are human-confirmed — see
> [`LIVE-HOST-VALIDATION.md`](./LIVE-HOST-VALIDATION.md).
> Install with **`npm i ng-mcp-ui`**, or retrofit an existing app with
> **`ng add ng-mcp-ui`** (see below).
>
> See the [package README](./packages/ng-mcp-ui/README.md) for the full API
> reference, and the [schematics README](./packages/schematics/README.md) for the
> generators.

---

## What it does

You have an Angular app. You want its features to show up as **interactive
widgets inside an AI chat** — a poll the user can vote on, a chart, a form —
served from your own app and driven by your own tools.

`ng-mcp-ui` makes that essentially a single schematic — install and retrofit:

```bash
ng add ng-mcp-ui --example=demo
```

It mounts an [MCP](https://modelcontextprotocol.io) server into your app's
existing Angular SSR `server.ts`, scaffolds an example tool + widget, and wires
a dev tunnel so you can connect a real host (Claude / ChatGPT) and iterate live.

## How it works

A view is **not** server-rendered HTML with data baked in. The MCP host renders
a thin HTML shell in a **sandboxed iframe**, the Angular widget bundle boots, and
the tool data arrives afterward — pushed through a **host bridge**, not the
initial HTML. `ng-mcp-ui` is built around that reality:

- **`server.ts` is one Express app.** The MCP JSON-RPC endpoint (`/mcp`) and the
  widget asset routes mount **before** Angular's SSR catch-all. SSR is used for
  what it's genuinely good for here — giving you that Express server — not for
  rendering view content.
- **Views are client-bootstrapped Angular widgets**, code-split into per-view
  lazy chunks by the standard Angular builder and served over HTTP. They hydrate
  from host-pushed tool data.
- **One runtime-agnostic bridge, two hosts.** A single `Adaptor` interface
  abstracts the OpenAI Apps SDK (`window.openai`, ChatGPT) and the open MCP-Apps
  postMessage spec (`@modelcontextprotocol/ext-apps`, Claude & others) behind one
  API — your widget code is identical across hosts.
- **Signals, not hooks.** The view API is Angular-native: `injectToolInfo()`,
  `injectCallTool()`, `injectViewState()`, `injectLayout()`, a `[dataLlm]`
  directive, an `mcpAsset` pipe — all signal-based, zoneless-friendly.
- **A schematic does the wiring.** `ng add` retrofits SSR + the MCP server + a
  widgets build target; generators scaffold new views and tools.

## Capabilities

- `ng-add` retrofit for existing Angular apps (**Angular v20–v22**, CI-green)
- One `Adaptor` interface, two host runtimes: the same widget targets **Claude**
  and **ChatGPT** (live-host validation signed off on both)
- Typed tool ⇄ view data flow (Zod schemas, inferred end to end via
  `typeof server` → `injectAppHelpers`)
- View → server tool calls (`injectCallTool`), persisted view state
  (`injectViewState` / `injectViewStore`), LLM-visible context (`[dataLlm]`)
- Theme / display-mode / safe-area adaptation (`injectLayout` /
  `injectDisplayMode`)
- Zero-auth dev tunnel (`cloudflared`) for live iteration against real hosts
- A testing harness (`MockAdaptor` / `provideMockMcpUi`) for unit-testing widgets

## Packages

Shipped as a single package with subpath exports:

| Import | Purpose |
| --- | --- |
| `ng-mcp-ui/server` | Framework-neutral MCP server: `McpServer`, Express router, view resources |
| `ng-mcp-ui/web` | Angular bridge: `provideMcpUi`, `bootstrapWidget`, the `inject*` API, declarables |
| `ng-mcp-ui/testing` | `MockAdaptor` + `provideMockMcpUi` test harness |
| `ng-mcp-ui/tunnel` | Slot for the `cloudflared` dev-tunnel manager (skeleton today; the live walk runs via `npm run live-host`) |

Plus the Angular schematics (`ng-add`, `view`, `tool`, `example`) shipped in the
same package.

## Development

This is an npm-workspaces monorepo.

```bash
npm install
npm run lint        # Biome
npm run typecheck   # tsc
npm test            # Vitest
npm run build       # build all workspace packages
npm run test:types  # Vitest type tests
```

To exercise the real schematic output against a live host over a zero-auth
`cloudflared` tunnel, run `npm run live-host` and follow
[`LIVE-HOST-VALIDATION.md`](./LIVE-HOST-VALIDATION.md).

Requires the Node version in [`.nvmrc`](./.nvmrc).

## Acknowledgements

The design is informed by OpenAI's Skybridge reference implementation;
`ng-mcp-ui` is an independent, original Angular implementation.

## License

[MIT](./LICENSE) © 2026 nntndfrk
