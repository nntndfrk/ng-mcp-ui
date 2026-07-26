---
title: generate view
description: Scaffold a widget component and wire it into the widget registry and the ViewNameRegistry.
group: Schematics
groupOrder: 3
order: 2
---

```bash
ng generate ng-mcp-ui:view poll
ng generate ng-mcp-ui:view poll --withTool   # also scaffold a paired tool
```

Generates a standalone widget component under `src/widgets/<name>/` and wires it into two places:

- `src/widgets/registry.ts` — a lazy `import()` entry, so the builder code-splits the view into its
  own chunk;
- the `ViewNameRegistry` module augmentation, so `view: { component: "<name>" }` type-checks on the
  server.

## Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | string | — | View name (first positional argument). **Required.** |
| `--project` | string | current project | Target project name. |
| `--withTool` | boolean | `false` | Also scaffold a paired MCP tool (delegates to the `tool` generator). |

## What it generates

The component is standalone, `OnPush`, and already reads live host state — a starting point you edit
rather than a blank file:

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

Edit the `injectToolInfo` generic to match the paired tool's `inputSchema` and `outputSchema` — or
drop the generic entirely and use
[`injectAppHelpers`](/docs/guides/typed-tool-data) for inference straight from the server type.

The component is a **default export**, because `src/widgets/main.ts` boots
`registry[name]().then((m) => bootstrapWidget(m.default))`.

## After generating

Run the widgets build so the new chunk exists before a host asks for the view:

```bash
npm run build:widgets
```

The build fails loudly if a registered view did not emit a chunk — see
[build-widgets](/docs/schematics/build-widgets).
