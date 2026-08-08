---
title: injectSetOpenInAppUrl
description: Sets the deep link that the open-in-app control of the host uses.
group: API
groupOrder: 5
order: 31
---

```ts
injectSetOpenInAppUrl(): SetOpenInAppUrlFn
```

```ts
type SetOpenInAppUrlFn = (href: string) => Promise<void>;
```

```ts
import { injectSetOpenInAppUrl } from "ng-mcp-ui/web";

export class PollWidget {
  private readonly setOpenInAppUrl = injectSetOpenInAppUrl();

  constructor() {
    effect(() => {
      const id = this.pollId();
      if (id) {
        this.setOpenInAppUrl(`https://example.com/polls/${id}`).catch(() => {});
      }
    });
  }
}
```

A host may show an open-in-app control next to a fullscreen view. This function sets the target of
that control, so the user lands on the matching page of your application.

## Keep it current

The correct URL depends on what the view shows. Set it again when the state changes, as the example
does with an `effect`.

## Errors

An empty `href`, or an `href` of spaces only, throws:

```
The href parameter is required.
```

## Host support

| Host | Behavior |
| --- | --- |
| Apps SDK | Supported. |
| MCP Apps | **Throws.** |

The message is:

```
setOpenInAppUrl is not implemented in MCP App.
```

Catch the error, or the rejected promise. The example above uses `.catch(() => {})`, because the
deep link is an enhancement and its absence is not a failure of the view.

## Related

- [`injectOpenExternal`](/docs/api/inject-open-external)
- [Host support](/docs/reference/host-support)
