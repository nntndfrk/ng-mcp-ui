---
title: injectUser
description: A signal with the locale of the user and the input capabilities of the device.
group: API
groupOrder: 5
order: 22
---

```ts
injectUser(): Signal<UserState>
```

```ts
import { injectUser } from "ng-mcp-ui/web";

export class PollWidget {
  readonly user = injectUser();

  readonly formatted = computed(() =>
    new Intl.NumberFormat(this.user().locale).format(this.total()),
  );
}
```

## UserState

| Field | Type | Contents |
| --- | --- | --- |
| `locale` | string | A BCP-47 locale, for example `"en-US"`. |
| `userAgent` | `UserAgent` | The device class and the input capabilities. |

### UserAgent

| Field | Type | Contents |
| --- | --- | --- |
| `device.type` | `"mobile" \| "tablet" \| "desktop" \| "unknown"` | The device class. |
| `capabilities.hover` | boolean | The device has a hover input. |
| `capabilities.touch` | boolean | The device has a touch input. |

## Use the capabilities, not the device class

Branch on `capabilities`, not on `device.type`. A tablet with a keyboard and a laptop with a touch
screen both exist, therefore the device class alone does not tell you which controls to show.

```ts
readonly showHoverActions = computed(() => this.user().userAgent.capabilities.hover);
```

## Locale

Use the locale for formats: numbers, dates and currency. It is a hint about presentation.

For a locale that an Apps SDK host reports on the **server** side, read
[`openai/locale`](/docs/guides/client-hints) from `extra._meta` instead.

## Host support

Supported on the two host runtimes. A host that reports no locale gets `"en-US"`. A host that
reports no capabilities gets `true` for hover and touch.

## Related

- [`injectLayout`](/docs/api/inject-layout)
- [Client hints](/docs/guides/client-hints)
