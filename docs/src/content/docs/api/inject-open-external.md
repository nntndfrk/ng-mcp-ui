---
title: injectOpenExternal
description: Opens a URL outside the view iframe.
group: API
groupOrder: 5
order: 24
---

```ts
injectOpenExternal(): OpenExternalFn
```

```ts
type OpenExternalFn = (href: string, options?: OpenExternalOptions) => void;
```

```ts
import { injectOpenExternal } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly openExternal = injectOpenExternal();

  openDocs() {
    this.openExternal("https://example.com/docs");
  }
}
```

The view runs in a sandboxed iframe, therefore a plain `<a target="_blank">` does not work
reliably. Use this function.

The call returns nothing, and it does not throw. A failure reaches the console.

## Options

| Option | Type | Effect |
| --- | --- | --- |
| `redirectUrl` | `false`, optional | Tells the host not to add its own `?redirectUrl=…` tracking parameter. |

```ts
this.openExternal("https://example.com", { redirectUrl: false });
```

## The safe-link dialog

A host usually shows a confirmation dialog before it opens a link. To skip that dialog for origins
you control, list them in `redirectDomains` of the view CSP:

```ts
view: {
  component: "poll",
  csp: { redirectDomains: ["https://example.com"] },
}
```

## Host support

| Host | Behavior |
| --- | --- |
| Apps SDK | Supported. `redirectUrl: false` is honored. |
| MCP Apps | Supported. `redirectUrl: false` is ignored, and the adaptor writes a warning. |

The open-link protocol of MCP Apps has no equivalent for that option.

## Related

- [Content Security Policy](/docs/guides/csp)
- [`injectSetOpenInAppUrl`](/docs/api/inject-set-open-in-app-url)
- [Host support](/docs/reference/host-support)
