---
title: ng add
description: The retrofit schematic. It adds SSR, mounts the MCP server, adds the widget build target, and scaffolds a demo.
group: Schematics
groupOrder: 3
order: 1
---

`ng add ng-mcp-ui@next` installs the package and runs the retrofit in one step. The `@next` tag is
needed while 1.x is beta. If the package is already installed, run the schematic directly.

```bash
ng generate ng-mcp-ui:ng-add
```

The schematic is also named `init`. It is idempotent: a second run on a retrofitted app corrects the
wiring, and it does not duplicate it.

It first reads `@angular/core` from your `package.json` file. A major version outside **20 to 22**
stops the run with a message that names the found version.

## Dependencies

The schematic adds one dependency, `ng-mcp-ui`, and it schedules one install task. It delegates to
the `ng-add` schematic of `@angular/ssr` when the project has no SSR.

Everything else is a peer dependency of `ng-mcp-ui`, and npm installs it with the package:
`@modelcontextprotocol/server`, `@modelcontextprotocol/express` and `@modelcontextprotocol/node` at
`^2.0.0`, `@modelcontextprotocol/ext-apps` `^1.7.0` and `@modelcontextprotocol/sdk` `>=1.29.0` for
the widget-side bridge, `zod` `^4.2.0`, and `express` `^5`. Install them by hand if your package
manager does not install peers. The package needs Node 22 or later.

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
| `src/mcp/server.ts` | `createMcpServer()` with the `state` option and a sample `echo` tool with its paired view |
| `src/mcp/views.manifest.ts` | Resolves the widget build output for the view shell |
| `src/widgets/registry.ts` | Maps each view name to a lazy `import()`. Each entry becomes its own chunk |
| `src/widgets/main.ts` | The widget entry. It reads `viewName` from the shell |
| `src/widgets/index.html` | The shell document for the widget browser build |
| `src/widgets/echo/echo.widget.ts` | The sample widget |
| `tsconfig.widgets.json` | The TypeScript project for the widget build |

The scaffolded `createMcpServer()` carries the sealed-state option:

```ts
const server = new McpServer(
  { name: "my-app", version: "0.0.0" },
  {
    viewManifest: resolveViewManifest(),
    state: { key: process.env["NG_MCP_STATE_KEY"] },
  },
);
```

That option gives each tool handler a `ctx.state`. In development an absent `NG_MCP_STATE_KEY`
falls back to an ephemeral per-process key, and the server logs a warning. In production a missing
key throws. Delete the option if no tool of yours uses `ctx.state` or `requestState`. See
[sealed state](/docs/guides/sealed-state).

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
demo: `src/mcp/tools/poll.ts` with three tools (`create_poll`, `cast_vote` and `tally_votes`), and
the `src/widgets/poll/` view with its stylesheet. The schematic wires them into the new
`createMcpServer()` function, into the widget registry, and into `src/widgets/views.d.ts`, which
declares the view names.

The demo keeps no poll in server memory. `create_poll` seals the whole poll into a token, and it
returns that token under `_meta["ng-mcp-ui/state"]`. The widget keeps the token in view state, and
it passes the token back as the `state` argument of `cast_vote` and `tally_votes`. Each of those
tools opens the token, updates the poll, and seals it again. Therefore the demo runs on serverless
hosting and on several instances. See [sealed state](/docs/guides/sealed-state).

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
