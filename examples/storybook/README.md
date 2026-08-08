# Storybook example

An `ng-mcp-ui` widget in Storybook, with no MCP host, no `window.mcpUi` and no
iframe.

```bash
npm run build --workspace ng-mcp-ui        # the stories import the built library
npm run storybook --workspace storybook-example
```

Storybook then opens on <http://localhost:6006>.

## The integration is one decorator

`provideMockMcpUi()` returns the same shape that `provideMcpUi()` returns. A
story gives its `providers` to `applicationConfig`, and the widget renders:

```ts
import { applicationConfig } from "@storybook/angular";
import { provideMockMcpUi } from "ng-mcp-ui/testing";

export const Default: Story = {
  decorators: [
    applicationConfig({
      providers: [provideMockMcpUi({ hostContext: { theme: "dark" } }).providers],
    }),
  ],
};
```

There is no Storybook plugin, no webpack rule and no wrapper component. Each
`inject*` function reads the host through the `MCP_ADAPTOR` token, so one
provider swap moves the whole widget onto the mock.

Make a new `MockAdaptor` for each story. The adaptor holds mutable host state
and a call log, so a shared instance leaks the writes of one story into the
next. `src/widgets/task-list/task-list.stories.ts` has a `mockMcpUi()` helper
that does this correctly.

## What the stories show

| Story | Shows |
| --- | --- |
| Default | `injectToolInfo` reads the tool result |
| Dark theme | `injectLayout` reads the host theme |
| Pending | the tool runs, and no output is available yet |
| Empty list | a success result with no rows |
| Filter restored from host | `injectViewState` reads state the host kept |
| With safe area | `injectLayout` gives the safe-area inset |
| With canned tool response | `injectCallTool` calls a tool. Tick a row to see it |

## Seed both tool keys, not only the output

`injectToolInfo` reports success only when `toolInput` is present as well as
`toolOutput`. A story that seeds the output alone still reads as idle, and the
widget draws its waiting branch. This is the most common mistake here.

```ts
hostContext: {
  toolInput: { listId: "release-42" },   // both keys, or the state is idle
  toolOutput: SNAPSHOT,
}
```

## Assert against the call log

`MockAdaptor` records each call. Keep the `adaptor` handle to read it. This
works the same in a unit test and in a story `play` function:

```ts
const { providers, adaptor } = provideMockMcpUi();
// … the user ticks a row …
expect(adaptor.calls).toContainEqual({
  method: "callTool",
  args: ["toggle_task", { id: "t3", done: true }],
});
```

## Zoneless

The library is zoneless, and it provides `provideZonelessChangeDetection()`
through `provideMockMcpUi()`. Set `experimentalZoneless: true` on the Storybook
builder in `angular.json` to match. Without it Storybook loads `zone.js`, and
the two models disagree.

## Why the builder, and not `storybook build`

Storybook 10 does not support a direct `storybook dev` or `storybook build` for
Angular. The targets in `angular.json` use `@storybook/angular:start-storybook`
and `@storybook/angular:build-storybook`, and the npm scripts call `ng run`.

`@storybook/angular` needs `@angular-devkit/build-angular`, which is the older
webpack builder. The rest of this repository uses `@angular/build`. Angular
reports the webpack packages as deprecated at install time, which is expected
here.
