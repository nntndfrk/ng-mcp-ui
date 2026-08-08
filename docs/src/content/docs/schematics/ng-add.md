---
title: ng add
description: The retrofit schematic. It adds SSR, mounts the MCP server, adds the widget build target, and scaffolds a demo.
group: Schematics
groupOrder: 3
order: 1
---

`ng add ng-mcp-ui` installs the package and runs the retrofit in one step. If the package is already
installed, run the schematic directly.

```bash
ng generate ng-mcp-ui:ng-add
```

The schematic is also named `init`. It is idempotent: a second run on a retrofitted app corrects the
wiring, and it does not duplicate it.

## Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `--project` | string | current project | The target project. |
| `--ssr` | boolean | `true` | Makes sure that Angular SSR is set up. Adds it if it is absent. |
| `--bundling` | `lazy`, `targets`, `esbuild` | `lazy` | Reserved. Only the default `lazy` path is implemented. The other values do nothing today. |
| `--tunnelProvider` | `cloudflare`, `localtunnel`, `untun` | `cloudflare` | Reserved. It does nothing today. The scaffolded `tunnel` script prints guidance instead of a provider CLI. |
| `--example` | `demo`, `minimal`, `none` | `demo` | The example app to scaffold. |
| `--skipInstall` | boolean | `false` | Skips the dependency install. |
| `--migrateBuildScript` | boolean | `true` | On a legacy install, deletes the scaffolded `tools/build-widgets.mjs` file and repoints `build:widgets`. Set `false` to keep your own copy. |

## What it writes

| Path | Purpose |
| --- | --- |
| `src/mcp/server.ts` | `createMcpServer()` with a sample `echo` tool and its paired view |
| `src/mcp/views.manifest.ts` | Resolves the widget build output for the view shell |
| `src/widgets/registry.ts` | Maps each view name to a lazy `import()`. Each entry becomes its own chunk |
| `src/widgets/main.ts` | The widget entry. It reads `viewName` from the shell |
| `src/widgets/index.html` | The shell document for the widget browser build |
| `src/widgets/echo/echo.widget.ts` | The sample widget |
| `tsconfig.widgets.json` | The TypeScript project for the widget build |

The schematic also changes `src/server.ts`. It mounts `/mcp` and `/assets/widgets` **before** the
SSR catch-all route of Angular. The order matters, because a catch-all route that runs first answers
`/mcp` with your application shell.

It then adds a `build-widgets` target on the
[`ng-mcp-ui:build-widgets`](/docs/schematics/build-widgets) builder.

## npm scripts

The schematic adds three scripts. It never overwrites a script that already has the same name.

| Script | Body | What it does |
| --- | --- | --- |
| `build:widgets` | `ng run <project>:build-widgets` | Bundles the widgets, proves that each registered view emitted a chunk, and derives `views.manifest.json` |
| `dev:mcp` | `ng serve` | Serves the SSR app. `/mcp` and `/assets/widgets` are then reachable |
| `tunnel` | an `echo` guidance line | Documents the manual step. Replace the body with your command, for example `cloudflared tunnel --url http://localhost:4200` |

## The example generator

`--example=demo` is the default. It runs the `example` schematic, which scaffolds the Quick Poll
demo: a poll tool and an interactive view. The schematic wires both into the new
`createMcpServer()` function and into the widget registry.

`--example=minimal` and `--example=none` leave the echo-only baseline unchanged.

You can run the generator later on its own.

```bash
ng generate ng-mcp-ui:example              # variant=demo
ng generate ng-mcp-ui:example --variant=minimal
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `--variant` | `demo`, `minimal`, `none` | `demo` | The example app to scaffold. |
| `--project` | string | current project | The target project. |

## Migrating a legacy install

Before the builder existed, `ng add` copied its validation into each app as
`tools/build-widgets.mjs`.

Run `ng generate ng-mcp-ui:ng-add` again to migrate such an app. The schematic rewrites the target
onto the builder, deletes the scaffolded script by its header marker, and repoints the
`build:widgets` npm script.

Pass `--migrate-build-script=false` to keep your own copy of the script. The schematic still
rewrites the target. The old script tolerates that, because it runs the target and then checks the
same output.
