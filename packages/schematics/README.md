# ng-mcp-ui-schematics

The `ng-mcp-ui` schematics: an `ng-add` retrofit plus `view` / `tool` /
`example` generators that wire an Angular app up with
[ng-mcp-ui](../ng-mcp-ui). This is an internal, `private` package compiled to
CommonJS; at pack time its `dist/` is embedded into `ng-mcp-ui` under
`dist/schematics/`, so users run a single `ng add ng-mcp-ui` (or, today,
`ng generate ng-mcp-ui:<schematic>`).

> Until `ng-mcp-ui` is published to npm, install the packed tarball into your app
> first (`npm i ../path/to/ng-mcp-ui-*.tgz`), then invoke the schematics with
> `ng generate ng-mcp-ui:<name>`.

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
| `--bundling` | `lazy` \| `targets` \| `esbuild` | `lazy` | How widget views are bundled. |
| `--tunnelProvider` | `cloudflare` \| `localtunnel` \| `untun` | `cloudflare` | Zero-auth dev tunnel provider. |
| `--example` | `demo` \| `minimal` \| `none` | `demo` | Which example app to scaffold. |
| `--skipInstall` | boolean | `false` | Skip installing dependencies. |

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
</content>
