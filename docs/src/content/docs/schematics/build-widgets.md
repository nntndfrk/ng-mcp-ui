---
title: build-widgets
description: The Angular builder that bundles the widget views, proves every registered view emitted a chunk, and derives views.manifest.json.
group: Schematics
groupOrder: 3
order: 4
---

`ng add` wires a `build-widgets` target onto the `ng-mcp-ui:build-widgets` builder. Run it through
the npm script or the target directly:

```bash
npm run build:widgets
ng run my-app:build-widgets
```

## What it does

The builder delegates the actual build to `@angular/build:application` with the passthrough options,
then post-validates the emitted bundle graph:

1. **Bundle.** Each entry in `src/widgets/registry.ts` is a dynamic `import()`, so esbuild
   code-splits every view into its own name-stable hashed chunk.
2. **Validate.** Every view registered in the widget registry must have code-split into an emitted
   chunk on disk. A registry entry whose widget module is broken — bad import path, not reachable
   from `src/widgets/main.ts` — fails the build here, rather than at runtime when a host first
   requests the view.
3. **Derive.** On success it can write an additive `views.manifest.json` of the shape
   `{ entry, styles, views }`.

That second step is the point of the builder. Without it a broken registry entry is invisible until
a real host asks for the view and gets a blank iframe.

## Options

Everything not listed here is passed through verbatim to `@angular/build:application`.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `registry` | string | `src/widgets/registry.ts` | Workspace-root-relative path to the widget registry source. |
| `manifestOut` | string | *(unset)* | Where to write the derived manifest JSON; omit to skip emission. |
| `failOnMissingView` | boolean | `true` | Fail the build on a registered view with no emitted chunk (`false` warns instead). |

## Output and the view shell

The build emits into `dist/widgets/browser/`, including an `index.html` carrying the hashed
`main-*.js` and `styles-*.css` names. `src/mcp/views.manifest.ts` parses that file with
`IndexHtmlViewManifest` so `resources/read` returns a shell pointing at the real filenames — and
falls back to an `InMemoryViewManifest("main.js")` when the build has not run yet, which still
produces a bootable shell.

## Migrating from the scaffolded script

Before this builder existed, `ng add` copied the same validation into each app as
`tools/build-widgets.mjs`. Re-running `ng generate ng-mcp-ui:ng-add` migrates the app: the target is
rewritten onto the builder, the scaffolded script is deleted, and the `build:widgets` npm script is
repointed. Pass `--migrate-build-script=false` to keep a customized copy of the script — the target
is still rewritten, which the legacy script tolerates.
