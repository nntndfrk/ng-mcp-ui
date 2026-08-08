---
title: createViewAssetRouter
description: Builds the Express router that serves the widget build output, in production or through a dev-server proxy.
group: API
groupOrder: 5
order: 5
---

```ts
createViewAssetRouter(options: CreateViewAssetRouterOptions): Router
```

Mount the router on the asset prefix that the shell document uses.

```ts
app.use("/assets/widgets", createViewAssetRouter({ dir: "dist/widgets/browser" }));
```

Mount it before the SSR catch-all route of Angular.

The options are a union of two shapes. The `mode` field selects the shape.

## Production

The router serves files from a directory.

```ts
createViewAssetRouter({ dir: "dist/widgets/browser" });
```

| Option | Type | Purpose |
| --- | --- | --- |
| `dir` | string | The path of the widget build output. It holds the hashed chunks and `index.html`. An absolute path, or a path relative to the working directory. |
| `mode` | `"production"`, optional | The default mode. |

The router adds a CORS header, the correct content type, and an immutable cache header for each
hashed file name.

The CORS header is always on, and its value is `*`. A module script and a `crossorigin` style sheet
need it to load from another origin. These are public, read-only assets, therefore `*` is safe.

## Development

The router sends each request to your running `ng serve` process.

```ts
createViewAssetRouter({
  mode: "development",
  devServerUrl: "http://localhost:4200",
});
```

| Option | Type | Purpose |
| --- | --- | --- |
| `devServerUrl` | string | The origin of the widget dev server. It must be an `http://` URL. |
| `mode` | `"development"` | Selects this shape. |

In this mode you do not run a widget build. The dev server keeps `main.js` and `styles.css` in
memory. Your changes appear after a reload of the view.

A `devServerUrl` that is not `http://` throws this error:

```
ng-mcp-ui: the widgets dev-server proxy only supports http:// upstreams
```

## Which mode to use

| You are | Use |
| --- | --- |
| Deployed, or testing a real build | Production, with `dir` |
| Editing widget code | Development, with `devServerUrl` |

The server picks the matching shell document from `NODE_ENV`, therefore set `NODE_ENV=production`
for a production deployment.

## Related

- [`createMcpExpressRouter`](/docs/api/create-mcp-express-router)
- [`ViewManifest`](/docs/api/view-manifest)
- [build-widgets](/docs/schematics/build-widgets)
