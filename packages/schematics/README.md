# ng-mcp-ui-schematics

The `ng-mcp-ui` schematics: an `ng-add` retrofit plus `view` / `tool` /
`example` generators that wire an Angular app up with
[ng-mcp-ui](../ng-mcp-ui), and the `ng-mcp-ui:build-widgets` Angular builder
the retrofitted `build-widgets` target runs. This is an internal, `private`
package compiled to CommonJS; at pack time its `dist/` is embedded into
`ng-mcp-ui` under `dist/schematics/`, so users run a single `ng add ng-mcp-ui`
to retrofit an app, then `ng generate ng-mcp-ui:<schematic>` for the individual
generators.

> `ng add ng-mcp-ui@next` installs the package and runs the `ng-add` retrofit in
> one step (`@next` selects the 1.x line; `latest` is 0.2.x). If `ng-mcp-ui` is
> already installed, run the same schematic directly with
> `ng generate ng-mcp-ui:ng-add`.

## Generators

### `ng-add` (alias `init`) — retrofit an app

Ensures SSR, mounts the MCP server before the SSR catch-all, adds a widgets
build target, and (by default) scaffolds the runnable Quick Poll demo.

```bash
ng generate ng-mcp-ui:ng-add
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `--project` | string | current project | Target project name. |
| `--ssr` | boolean | `true` | Ensure Angular SSR is set up (adds it if absent). |
| `--bundling` | `lazy` \| `targets` \| `esbuild` | `lazy` | Reserved. Only the default `lazy` (code-split) path is implemented; other values are currently ignored. |
| `--tunnelProvider` | `cloudflare` \| `localtunnel` \| `untun` | `cloudflare` | Reserved. Currently inert — the scaffolded `tunnel` npm script prints guidance instead of hard-wiring a provider CLI. |
| `--example` | `demo` \| `minimal` \| `none` | `demo` | Which example app to scaffold. |
| `--skipInstall` | boolean | `false` | Skip installing dependencies. |
| `--migrateBuildScript` | boolean | `true` | On a legacy install, delete the scaffolded `tools/build-widgets.mjs` + repoint `build:widgets`. `false` keeps a customized copy. |

### `view` — generate a widget view

Generates a standalone widget component and wires it into the widget registry +
`ViewNameRegistry`.

```bash
ng generate ng-mcp-ui:view poll
ng generate ng-mcp-ui:view poll --withTool   # also scaffold a paired tool
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | string | — | View name (first positional arg). **Required.** |
| `--project` | string | current project | Target project name. |
| `--withTool` | boolean | `false` | Also scaffold a paired MCP tool (delegates to `tool`). |

### `tool` — generate an MCP tool

Generates a `registerTool` call with zod schemas, optionally linked to an
existing view, and wires it into the app's `createMcpServer()`.

```bash
ng generate ng-mcp-ui:tool cast_vote
ng generate ng-mcp-ui:tool create_poll --view=poll   # link to an existing view
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | string | — | Tool name (first positional arg). **Required.** |
| `--project` | string | current project | Target project name. |
| `--view` | string | — | Name of an existing view to link this tool to. |

### `example` — scaffold a runnable example

Scaffolds the Quick Poll demo (poll tool + interactive view) into the app, wired
into `createMcpServer()` + the widget registry.

```bash
ng generate ng-mcp-ui:example            # variant=demo
ng generate ng-mcp-ui:example --variant=minimal
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `--variant` | `demo` \| `minimal` \| `none` | `demo` | Which example app to scaffold. |
| `--project` | string | current project | Target project name. |

## Builder

### `build-widgets` — bundle + validate the widget views

`ng add` wires a `build-widgets` target onto this builder (run it via
`npm run build:widgets` / `ng run <project>:build-widgets`). It delegates the
actual build to `@angular/build:application` with the passthrough options, then
post-validates the emitted bundle graph: every view registered in the widget
registry must have code-split into an emitted chunk on disk — a registry entry
whose widget module is broken (bad import path, not reachable from
`src/widgets/main.ts`) fails the build here instead of at runtime when a host
first requests the view. On success it can derive an additive
`views.manifest.json` (`{ entry, styles, views }`).

Builder-owned options (everything else is passed through verbatim to
`@angular/build:application`):

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `registry` | string | `src/widgets/registry.ts` | Workspace-root-relative path to the widget registry source. |
| `manifestOut` | string | _(unset)_ | Where to write the derived manifest JSON; omit to skip emission. |
| `failOnMissingView` | boolean | `true` | Fail the build on a registered view with no emitted chunk (`false` → warn). |

Before this builder existed, `ng add` copied the same validation into each app
as `tools/build-widgets.mjs`. Re-running `ng generate ng-mcp-ui:ng-add` on such
an app migrates it: the target is rewritten onto the builder, the scaffolded
script (identified by its header marker) is deleted, and the `build:widgets`
npm script is repointed. Pass `--migrate-build-script=false` to keep a
customized copy of the script — the target is still rewritten, which the legacy
script tolerates (it `ng run`s the target and re-validates the same output).
