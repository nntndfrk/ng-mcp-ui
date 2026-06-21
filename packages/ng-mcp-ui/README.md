# ng-mcp-ui

Angular library that retrofits Angular apps with **MCP interactive UI views** —
MCP servers whose tools render interactive Angular widgets inside Claude,
ChatGPT, and other MCP-Apps hosts (Angular **v20–v22**).

> ### 🚧 Status: early development
> Under active construction. `ng-mcp-ui/server` now ships its pure-TS foundation
> (content helpers, the `FileRef` schema, and the tool/type inference machinery);
> the remaining server, web, testing, and tunnel surface lands incrementally. Not
> yet published to npm — the API may change.

## Subpath exports

| Import | Purpose |
| --- | --- |
| `ng-mcp-ui/server` | Framework-neutral MCP server: `McpServer`, Express router, view resources |
| `ng-mcp-ui/web` | Angular bridge: `provideMcpUi`, `bootstrapWidget`, the `inject*` API, declarables |
| `ng-mcp-ui/testing` | `MockAdaptor` + `provideMockMcpUi` test harness |
| `ng-mcp-ui/tunnel` | `cloudflared` dev-tunnel manager |

Each entry currently re-exports a single `NG_MCP_UI_VERSION` symbol so the
package is importable and pack-verifiable end to end:

```ts
import { NG_MCP_UI_VERSION } from "ng-mcp-ui/server";
```

## Build tooling

Built with the Angular compiler **`ngc` in *partial* compilation mode** — one
`tsconfig.json` over all four entry dirs — **not** ng-packagr.

- The Node-only entries (`server`, `tunnel`) emit as plain TypeScript.
- The Angular entries (`web`, `testing`) emit Ivy **partial** declarations
  (`ɵɵngDeclare*`) once they ship directives/pipes, so a consuming app's Angular
  linker (built into `@angular/build`) finalizes them at AOT build time — the
  published-Angular-library contract.
- `package.json#exports` maps each subpath to its `dist` `types` + `default`.

ng-packagr is a poor fit here: this is a **hybrid** package whose `server`/
`tunnel` entries import `express`, `node:http`, and the MCP SDK. `ngc` partial
fits the hand-mapped `exports` layout and keeps the Node entries as plain TS.

### Scripts

```bash
npm run build        # ngc -p tsconfig.json — compile all four entries into dist/
npm run verify:pack  # pack into a scratch project and assert the subpaths resolve
```

## License

[MIT](../../LICENSE)
