# dev-app — `ng-mcp-ui` Angular SSR example (M1 server-track exit)

A minimal Angular SSR host that mounts the MCP server library in a hand-written
`src/server.ts` exactly as PLAN §3 prescribes: the MCP JSON-RPC router
(`/mcp`) and the widget asset router (`/assets/widgets`) are mounted **before**
the Angular SSR catch-all, so host requests never fall through to Angular.

It registers a single `echo` tool backed by an `echo` view — the smallest
end-to-end exercise of `ng-mcp-ui/server` from a real consumer.

## Layout

- `src/server.ts` — the Express + Angular SSR wiring (the reference a real app's
  `server.ts` mirrors).
- `src/mcp/` — `createMcpServer()` (`server.ts`), the `echo` tool
  (`tools/echo.ts`), and the defensive `ViewManifest` resolution
  (`views.manifest.ts`).
- `tools/verify-inspector.mjs` — the **M1 server-track gate**: boots the built
  SSR server and probes `/mcp` over the MCP SDK StreamableHTTP client.

## Run the M1 gate locally

The library must be built first so `ng-mcp-ui/server` resolves from the
workspace:

```bash
# from the repo root
npm run build --workspace ng-mcp-ui

# then, in this folder
cd examples/dev-app
npm run verify          # = build:app (ng build) + verify:inspector
```

`verify:inspector` asserts: `tools/list` exposes `echo` with view `_meta`;
`tools/call echo {message:"hi"}` round-trips; and `resources/read` returns a
well-formed shell (serverUrl + viewName + `#root`) for **both** host variants.

## Notes

- **The widgets *browser* build is intentionally out of scope here.** The M1
  gate is server-track: `views.manifest.ts` falls back to an in-memory manifest
  when `dist/widgets/browser/index.html` is absent, and the shell is still
  well-formed. The real widget bundle + its build is a later step.
- **Decoupled from the root build.** This package has no `build` script, so the
  root `npm run build --workspaces` does not trigger its (heavy) `ng build`. The
  M1 gate is run on demand; wiring it into CI is the S07b follow-up.
