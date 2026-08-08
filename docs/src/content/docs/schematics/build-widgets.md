---
title: build-widgets
description: The Angular builder that bundles the widget views, proves that each registered view emitted a chunk, and derives views.manifest.json.
group: Schematics
groupOrder: 3
order: 4
---

`ng add` adds a `build-widgets` target on the `ng-mcp-ui:build-widgets` builder. Run it through the
npm script, or run the target directly.

```bash
npm run build:widgets
ng run my-app:build-widgets
```

## What it does

The builder gives the build itself to `@angular/build:application`, with your options. It then
checks the emitted bundle graph.

1. **Bundle.** Each entry of `src/widgets/registry.ts` is a dynamic `import()`. Therefore esbuild
   puts each view in its own hashed chunk, and the name of that chunk stays stable.
2. **Validate.** Each view in the registry must have a chunk on disk. A registry entry with a broken
   widget module fails the build here. Examples of a broken module are a bad import path, and a
   module that `src/widgets/main.ts` cannot reach.
3. **Derive.** After a successful build, the builder can write a `views.manifest.json` file with
   this shape: `{ entry, styles, views }`.

Step 2 is the reason for the builder. Without it, a broken registry entry stays invisible until a
real host asks for the view and gets an empty iframe.

## Options

The builder passes each option that is not in this table to `@angular/build:application` unchanged.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `registry` | string | `src/widgets/registry.ts` | The path of the widget registry source, relative to the workspace root. |
| `manifestOut` | string | *(unset)* | The path for the derived manifest JSON. Omit it to write no file. |
| `failOnMissingView` | boolean | `true` | Fails the build when a registered view has no chunk. Set `false` to write a warning instead. |

## The output and the view shell

The build writes to `dist/widgets/browser/`. The output holds an `index.html` file with the hashed
`main-*.js` and `styles-*.css` names.

`src/mcp/views.manifest.ts` parses that file with
[`IndexHtmlViewManifest`](/docs/api/view-manifest). Therefore a `resources/read` call returns a
shell that names the real files.

Before the first build, the same code falls back to an `InMemoryViewManifest("main.js")`. That
fallback still gives a shell that boots.

## Migrating from the scaffolded script

Before this builder existed, `ng add` copied the same validation into each app as
`tools/build-widgets.mjs`.

Run `ng generate ng-mcp-ui:ng-add` again to migrate such an app. The schematic rewrites the target
onto the builder, deletes the scaffolded script, and repoints the `build:widgets` npm script.

Pass `--migrate-build-script=false` to keep your own copy of the script. The schematic still
rewrites the target, and the old script tolerates that.
