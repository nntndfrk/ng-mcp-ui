---
title: Content Security Policy
description: How to declare the origins that a view can load, contact, frame and redirect to, and how the server merges these values.
group: Guides
groupOrder: 2
order: 6
---

Your view operates in a sandboxed iframe. The host controls that iframe. The host builds the CSP of
the iframe from the `_meta` data of the view resource. The server calculates this `_meta` data from
its defaults and from the `view` config of the tool.

By default, a view can load assets from the MCP server, and it can connect to the MCP server. It
cannot use other origins. You must declare each other origin. Examples are a web font, an analytics
endpoint, and an image CDN.

## How to declare origins

Put a `csp` object in the `view` config of `registerTool`.

```ts
server.registerTool(
  {
    name: "create_poll",
    inputSchema: { question: z.string() },
    view: {
      component: "poll",
      csp: {
        resourceDomains: ["https://fonts.gstatic.com"],
        connectDomains: ["https://api.example.com"],
      },
    },
  },
  handler,
);
```

| Field | Function |
| --- | --- |
| `resourceDomains` | The origins of static assets: images, fonts, scripts and styles. |
| `connectDomains` | The origins that the view can contact with `fetch` or XHR. |
| `frameDomains` | The origins that the view can put in a nested iframe. This field starts a more strict app review. |
| `redirectDomains` | The origins that receive `openExternal` redirects. The host does not show its safe-link dialog for these origins. |
| `baseUriDomains` | The origins that are permitted in a `<base href>` tag. MCP Apps hosts only. |

If you do not set a field, the host uses its own default for that directive.

## The server defaults

The server calculates defaults for each request. It applies your values after these defaults.

| Default | Value |
| --- | --- |
| `resourceDomains` | The server origin. |
| `connectDomains` | The server origin. In development, also the `ws://` or `wss://` form of that origin. |
| `domain` | The server origin. |
| `baseUriDomains` | The server origin. MCP Apps hosts only. |

The server calculates its origin from the headers of each request. Thus the same build operates
correctly behind a tunnel, behind a proxy, and on a local dev server. You do not change the
configuration. The development-only WebSocket origin lets a live-reload socket connect while you
make changes.

## How the server merges your values

The merge is not a simple replacement. The server applies four layers in this sequence.

1. The server defaults.
2. Your `csp`, `domain`, `description` and `prefersBorder` values from the `view` config. The server
   joins array fields to the defaults. It does not replace them. Therefore
   `resourceDomains: ["https://cdn.example.com"]` gives you the CDN origin and the server origin. A
   field that you leave as `undefined` does not remove a default.
3. A per-request override. At present this override is the content domain for a Claude host.
4. The `view._meta` object, if you set one. The server does a shallow spread of this object over the
   result. These values win. Use `view._meta` for keys that the typed config does not contain. Note
   that `view._meta` can replace the values from the layers above it.

## The shape for each host

The two runtimes use different names. The server emits both shapes from one `ViewCsp` object.

| `ViewCsp` field | Apps SDK `_meta` | MCP Apps `_meta` |
| --- | --- | --- |
| `resourceDomains` | `openai/widgetCSP.resource_domains` | `ui.csp.resourceDomains` |
| `connectDomains` | `openai/widgetCSP.connect_domains` | `ui.csp.connectDomains` |
| `frameDomains` | `openai/widgetCSP.frame_domains` | `ui.csp.frameDomains` |
| `redirectDomains` | `openai/widgetCSP.redirect_domains` | `ui.csp.redirectDomains` |
| `baseUriDomains` | Not sent | `ui.csp.baseUriDomains` |

`baseUriDomains` is the only directive with no Apps SDK equivalent. You can set it on a tool that
targets the two hosts. The server does not put it in the Apps SDK data.

## The related view options

Three more fields of `ViewConfig` control how the host shows the view.

| Option | Function |
| --- | --- |
| `hosts` | Selects the runtimes that get a view resource. The default is the two runtimes. |
| `prefersBorder` | Asks the host for a border around the widget. Apps SDK hosts only. |
| `domain` | Replaces the served domain of the iframe. Apps SDK hosts only. For advanced use. |

## Assets need more than a CSP

A CSP tells the host which origins are permitted. It does not change URLs. In the iframe, a
relative asset path points to the origin of the host. It does not point to your server. The
[`mcpAsset` pipe](/docs/guides/typed-tool-data) corrects this path.

Usually you need the two mechanisms together. The pipe sets the correct origin. `resourceDomains`
permits that origin, if the origin is not the server.
