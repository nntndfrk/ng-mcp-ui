---
title: McpAssetPipe
description: The mcpAsset pipe rewrites a relative asset path onto the origin of the MCP server.
group: API
groupOrder: 5
order: 35
---

Your view runs in an iframe that the host serves. Therefore a relative path resolves against the
origin of the **host**, not against your server, and the asset does not load.

The `mcpAsset` pipe corrects the path.

```ts
import { McpAssetPipe } from "ng-mcp-ui/web";

@Component({
  imports: [McpAssetPipe],
  template: `<img [src]="'logo.svg' | mcpAsset" alt="Logo" />`,
})
```

The pipe builds `${serverUrl}/assets/widgets/${path}`.

## Where the origin comes from

The pipe injects `MCP_SERVER_URL`. [`provideMcpUi()`](/docs/api/provide-mcp-ui) sets that token
from the shell document.

If the token is an empty string, the pipe returns the path unchanged. This is the development case,
where the dev server already serves the asset.

## What it does not do

The pipe does not change a CSP. If the asset sits on a different origin, add that origin to
`resourceDomains` of the view CSP as well:

```ts
view: {
  component: "poll",
  csp: { resourceDomains: ["https://cdn.example.com"] },
}
```

Usually you need both. The pipe points at the right origin, and the CSP permits it.

## Styles need a different fix

The pipe works in a template. It cannot reach a `url()` inside a component style sheet, because
Angular processes those at build time.

For a background image, bind the style in the template:

```html
<div [style.background-image]="'url(' + ('hero.png' | mcpAsset) + ')'"></div>
```

## Host support

Supported on the two host runtimes. The pipe reads a token, and it does not call the host.

## Related

- [Content Security Policy](/docs/guides/csp)
- [Typed tool data](/docs/guides/typed-tool-data)
