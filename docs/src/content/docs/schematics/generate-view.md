---
title: generate view
description: Scaffolds a widget component and wires it into the widget registry and the ViewNameRegistry.
group: Schematics
groupOrder: 3
order: 2
---

```bash
ng generate ng-mcp-ui:view poll
ng generate ng-mcp-ui:view poll --withTool   # also scaffold a paired tool
```

The generator writes a standalone widget component under `src/widgets/<name>/`. It also wires the
component into two places.

- `src/widgets/registry.ts` gets a lazy `import()` entry. Therefore the builder puts the view in its
  own chunk.
- The `ViewNameRegistry` interface gets one more key. Therefore `view: { component: "<name>" }`
  type-checks on the server.

## Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | string | *(none)* | The name of the view. It is the first positional argument. **Required.** |
| `--project` | string | current project | The target project. |
| `--withTool` | boolean | `false` | Also scaffolds a paired MCP tool. The generator delegates to the `tool` generator. |

## What it writes

The component is standalone, it uses `OnPush`, and it already reads live host state. Edit it. It is
not a blank file.

```ts
@Component({
  selector: "poll-widget",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataLlmDirective],
  template: `
    <div id="poll">
      <h1>Poll</h1>
      <p [dataLlm]="message()">{{ message() }}</p>
      <button type="button" (click)="bump()">Interacted {{ count() }} time(s)</button>
    </div>
  `,
})
export default class PollWidget {
  private readonly tool = injectToolInfo<{
    input: { message: string };
    output: { message: string };
  }>();

  // persisted, host-backed UI state — survives remounts of this tool call
  private readonly state = injectViewState<{ count: number }>({ count: 0 });

  protected readonly count = computed(() => this.state.value()?.count ?? 0);

  protected readonly message = computed(() => {
    const state = this.tool();
    if (state.isSuccess) {
      return state.output.message;
    }
    if (state.isPending) {
      return state.input.message;
    }
    return "(waiting for tool output)";
  });

  protected bump(): void {
    this.state.set((prev) => ({ count: (prev?.count ?? 0) + 1 }));
  }
}
```

Change the generic of [`injectToolInfo`](/docs/api/inject-tool-info) to match the `inputSchema` and
the `outputSchema` of the paired tool. Or remove the generic, and use
[`injectAppHelpers`](/docs/api/inject-app-helpers) to infer both from the server type.

The component is a **default export**, because `src/widgets/main.ts` boots it with
`registry[name]().then((m) => bootstrapWidget(m.default))`.

## After you generate

Build the widgets, so the new chunk exists before a host asks for the view.

```bash
npm run build:widgets
```

The build fails with a clear message when a registered view emitted no chunk. See
[build-widgets](/docs/schematics/build-widgets).

To skip this step while you write widget code, put the asset router in development mode. See
[`createViewAssetRouter`](/docs/api/create-view-asset-router).
