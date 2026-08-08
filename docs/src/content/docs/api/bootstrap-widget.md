---
title: bootstrapWidget
description: Boots a standalone component into the root element of the shell document.
group: API
groupOrder: 5
order: 15
---

```ts
bootstrapWidget(
  component: Type<unknown>,
  providers?: (Provider | EnvironmentProviders)[],
): Promise<ApplicationRef>
```

Call it from the widget entry file. It applies [`provideMcpUi()`](/docs/api/provide-mcp-ui) and
boots the component into the `#root` element of the shell.

```ts
import { bootstrapWidget } from "ng-mcp-ui/web";
import PollWidget from "./poll.widget";

bootstrapWidget(PollWidget);
```

## Extra providers

The second argument adds your own providers. `provideMcpUi()` still applies.

```ts
bootstrapWidget(PollWidget, [provideHttpClient(), provideMyStore()]);
```

Pass `provideMcpUi()` in the list to control its position next to your providers:

```ts
bootstrapWidget(PollWidget, [provideMcpUi(), provideMyThing()]);
```

## The generated entry

The `ng-add` schematic writes `src/widgets/main.ts`. That file reads the view name from the shell
and boots the matching component from the registry. Usually you do not call `bootstrapWidget`
directly, because the generated entry does it.

Each entry of `src/widgets/registry.ts` is a lazy `import()`. The build turns each one into its own
chunk, therefore a host loads one view and not the whole application.

## Return value

The promise resolves with the `ApplicationRef`. Use it to destroy the application in a test, or to
read the injector.

## Related

- [`provideMcpUi`](/docs/api/provide-mcp-ui)
- [generate view](/docs/schematics/generate-view)
- [How it works](/docs/getting-started/how-it-works)
