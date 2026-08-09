# ng-mcp-ui

> **Angular schematic + library that retrofits Angular apps with MCP interactive UI views** —
> MCP servers whose tools render **interactive Angular widgets** inside Claude,
> ChatGPT, and other [MCP-Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
> hosts.

[![npm](https://img.shields.io/npm/v/ng-mcp-ui)](https://www.npmjs.com/package/ng-mcp-ui)
[![CI matrix](https://github.com/nntndfrk/ng-mcp-ui/actions/workflows/ci-matrix.yml/badge.svg)](https://github.com/nntndfrk/ng-mcp-ui/actions/workflows/ci-matrix.yml)
[![Angular](https://img.shields.io/badge/Angular-v20%20%7C%20v21%20%7C%20v22-dd0031)](https://github.com/nntndfrk/ng-mcp-ui/actions/workflows/ci-matrix.yml)
[![license](https://img.shields.io/npm/l/ng-mcp-ui)](./LICENSE)

**📖 [Documentation](https://nntndfrk.github.io/ng-mcp-ui/next/)** ·
[Quickstart](https://nntndfrk.github.io/ng-mcp-ui/next/docs/getting-started/quickstart) ·
[Schematics](https://nntndfrk.github.io/ng-mcp-ui/next/docs/schematics/ng-add) ·
[API reference](https://nntndfrk.github.io/ng-mcp-ui/next/docs/reference/web)

Install with **`npm i ng-mcp-ui`**, or retrofit an existing app with
**`ng add ng-mcp-ui`** (see below). See the
[package README](./packages/ng-mcp-ui/README.md) for the API reference and the
[schematics README](./packages/schematics/README.md) for the generators.

### Two lines: 0.2.x and 1.x

| Line | Install | MCP protocol | Status |
| --- | --- | --- | --- |
| **0.2.x** | `npm i ng-mcp-ui` | 2025 era | Current hosts. Security patches until August 2027 |
| **1.x** | `npm i ng-mcp-ui@next` | 2026-07-28 only | Beta, on SDK v2. Adds sealed state, elicitation, cache hints |

1.x speaks 2026-07-28 exclusively and rejects 2025-era clients. Claude still
connects with 2025-11-25 as of August 2026, so **a connector you want working
today needs 0.2.x**. 1.x goes stable once a real host renders widgets over the
new protocol. The widget API is identical in both lines; the changes are on the
server. See the
[migration guide](https://nntndfrk.github.io/ng-mcp-ui/next/docs/getting-started/migrate-from-0-2).

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
  and **ChatGPT**
- Typed tool ⇄ view data flow (Zod schemas, inferred end to end via
  `typeof server` → `injectAppHelpers`)
- View → server tool calls (`injectCallTool`), persisted view state
  (`injectViewState` / `injectViewStore`), LLM-visible context (`[dataLlm]`)
- Theme / display-mode / safe-area adaptation (`injectLayout` /
  `injectDisplayMode`)
- Zero-auth dev tunnel (`cloudflared`) for live iteration against real hosts
- A testing harness (`MockAdaptor` / `provideMockMcpUi`) for unit-testing widgets

1.x adds, on the 2026-07-28 protocol: sealed server state a widget carries
between calls (no sessions), elicitation round trips on chat-path tools, per-view
cache hints, and `subscriptions/listen` change notifications.

## Packages

Shipped as a single package with subpath exports:

| Import | Purpose |
| --- | --- |
| `ng-mcp-ui/server` | Framework-neutral MCP server: `McpServer`, Express router, view resources |
| `ng-mcp-ui/web` | Angular bridge: `provideMcpUi`, `bootstrapWidget`, the `inject*` API, declarables |
| `ng-mcp-ui/testing` | `MockAdaptor` + `provideMockMcpUi` test harness |

Plus the Angular schematics (`ng-add`, `view`, `tool`, `example`) and the
`ng-mcp-ui:build-widgets` builder (bundles the widgets, validates every
registered view emitted a code-split chunk, derives `views.manifest.json`)
shipped in the same package.

A fourth subpath, `ng-mcp-ui/tunnel`, is reserved for the `cloudflared`
dev-tunnel manager but is **not implemented yet** — the live walk runs via
`npm run live-host`.

## Development

This is an npm-workspaces monorepo.

```bash
npm install
npm run lint        # Biome
npm run typecheck   # tsc
npm test            # Vitest
npm run build       # build all workspace packages
npm run test:types  # Vitest type tests
npm run ci:fixture -- --ng-version 22   # real e2e: ng new + ng add + build + /mcp probe
```

To exercise the real schematic output against a live host, run
`npm run live-host` — it packs the library, generates a fresh SSR app at Angular
22, retrofits it with `--example=demo`, builds, serves, and opens a `cloudflared`
tunnel, printing a public `…/mcp` URL. Add that URL as a custom connector
(Claude: Settings → Connectors; ChatGPT: developer-mode connectors) and drive the
demo from the chat.

> Requires `cloudflared` on `PATH`. TryCloudflare tunnels are **zero-auth and
> unauthenticated** — anyone with the URL can reach your local server while it is
> up, so keep the walk short and Ctrl-C when done.

Requires the Node version in [`.nvmrc`](./.nvmrc).

### How the library is built

Built with the Angular compiler **`ngc` in *partial* compilation mode** — one
`tsconfig.json` over all four entry dirs — **not** ng-packagr.

- The Node-only entries (`server`, `tunnel`) emit as plain TypeScript.
- The Angular entries (`web`, `testing`) emit Ivy **partial** declarations
  (`ɵɵngDeclare*`) for the directive/pipe, so a consuming app's Angular linker
  (built into `@angular/build`) finalizes them at AOT build time — the
  published-Angular-library contract.
- `package.json#exports` maps each subpath to its `dist` `types` + `default`.

ng-packagr is a poor fit here: this is a **hybrid** package whose `server` /
`tunnel` entries import `express`, `node:http`, and the MCP SDK. `ngc` partial
fits the hand-mapped `exports` layout and keeps the Node entries as plain TS.

```bash
npm run build --workspace ng-mcp-ui        # ngc -p tsconfig.json — compile all four entries
npm run build:pack --workspace ng-mcp-ui   # build + embed the schematics under dist/schematics/
npm run verify:pack --workspace ng-mcp-ui  # pack into a scratch project and assert the subpaths resolve
```

## License

[MIT](./LICENSE) © 2026 nntndfrk
