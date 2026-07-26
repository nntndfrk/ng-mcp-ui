---
title: ng add
description: The retrofit schematic — ensures SSR, mounts the MCP server, adds the widgets build target, and scaffolds a runnable demo.
group: Schematics
groupOrder: 3
order: 1
---

`ng add ng-mcp-ui` installs the package and runs the `ng-add` retrofit in one step. If `ng-mcp-ui`
is already installed, run the same schematic directly:

```bash
ng generate ng-mcp-ui:ng-add
```

The schematic is aliased as `init`, and is idempotent — re-running it on an already-retrofitted app
reconciles the wiring instead of duplicating it.

## Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `--project` | string | current project | Target project name. |
| `--ssr` | boolean | `true` | Ensure Angular SSR is set up (adds it if absent). |
| `--bundling` | `lazy`, `targets`, `esbuild` | `lazy` | Reserved. Only the default `lazy` (code-split) path is implemented; other values are currently ignored. |
| `--tunnelProvider` | `cloudflare`, `localtunnel`, `untun` | `cloudflare` | Reserved. Currently inert — the scaffolded `tunnel` npm script prints guidance instead of hard-wiring a provider CLI. |
| `--example` | `demo`, `minimal`, `none` | `demo` | Which example app to scaffold. |
| `--skipInstall` | boolean | `false` | Skip installing dependencies. |
| `--migrateBuildScript` | boolean | `true` | On a legacy install, delete the scaffolded `tools/build-widgets.mjs` and repoint `build:widgets`. `false` keeps a customized copy. |

## What it writes

| Path | Purpose |
| --- | --- |
| `src/mcp/server.ts` | `createMcpServer()` with a sample `echo` tool and its paired view |
| `src/mcp/views.manifest.ts` | Resolves the widgets build output for the view shell |
| `src/widgets/registry.ts` | View name → lazy `import()`; each entry becomes a code-split chunk |
| `src/widgets/main.ts` | Widget bootstrap entry, reads `viewName` from the shell |
| `src/widgets/index.html` | Shell document for the widgets browser build |
| `src/widgets/echo/echo.widget.ts` | The sample widget |
| `tsconfig.widgets.json` | TypeScript project for the widgets build |

It also patches `src/server.ts` to mount `/mcp` and `/assets/widgets` **before** Angular's SSR
catch-all, and adds a `build-widgets` target on the
[`ng-mcp-ui:build-widgets` builder](/docs/schematics/build-widgets).

## npm scripts

Three scripts are added, and an existing script of the same name is never overwritten:

| Script | Body | What it does |
| --- | --- | --- |
| `build:widgets` | `ng run <project>:build-widgets` | Bundles the widgets, validates every registered view emitted a chunk, derives `views.manifest.json` |
| `dev:mcp` | `ng serve` | Serves the SSR app; `/mcp` and `/assets/widgets` are reachable |
| `tunnel` | an `echo` guidance line | Documents the manual step — replace the body with e.g. `cloudflared tunnel --url http://localhost:4200` |

## The example generator

`--example=demo` (the default) chains the `example` schematic, which scaffolds the runnable Quick
Poll demo — a poll tool plus an interactive view — and wires it into the freshly patched
`createMcpServer()` and widget registry. `--example=minimal` and `--example=none` leave the
echo-only baseline alone.

You can run it on its own later:

```bash
ng generate ng-mcp-ui:example              # variant=demo
ng generate ng-mcp-ui:example --variant=minimal
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `--variant` | `demo`, `minimal`, `none` | `demo` | Which example app to scaffold. |
| `--project` | string | current project | Target project name. |

## Migrating a legacy install

Before the builder existed, `ng add` copied its validation into each app as
`tools/build-widgets.mjs`. Re-running `ng generate ng-mcp-ui:ng-add` migrates such an app: the
target is rewritten onto the builder, the scaffolded script (identified by its header marker) is
deleted, and the `build:widgets` npm script is repointed.

Pass `--migrate-build-script=false` to keep a customized copy of the script — the target is still
rewritten, which the legacy script tolerates, since it runs the target and re-validates the same
output.
