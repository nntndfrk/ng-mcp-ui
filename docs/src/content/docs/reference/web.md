---
title: ng-mcp-ui/web
description: The Angular host bridge — provideMcpUi, bootstrapWidget, the full inject* signal API, and the declarables.
group: Reference
groupOrder: 4
order: 2
---

Every `inject*` function must be called from an Angular **injection context**, and each resolves the
host adaptor from the `MCP_ADAPTOR` DI token provided by `provideMcpUi()` — so widget code is
identical across Claude, ChatGPT and other MCP-Apps hosts.

## Setup

| Symbol | Signature | Purpose |
| --- | --- | --- |
| `provideMcpUi` | `(): EnvironmentProviders` | Zoneless change detection, the two host-derived tokens, and the mcp-app modal service. |
| `bootstrapWidget` | `(component: Type<unknown>, providers?: Array<Provider \| EnvironmentProviders>): Promise<ApplicationRef>` | Boots a standalone widget into the host shell's `#root`, with `provideMcpUi()` applied first. |
| `MCP_ADAPTOR` / `MCP_SERVER_URL` | `InjectionToken<…>` | The host bridge and server-origin tokens. Provide `MCP_ADAPTOR` yourself to use a custom or mock adaptor. |

## Reading host and tool state

All signal-returning.

| Symbol | Signature | Purpose |
| --- | --- | --- |
| `injectToolInfo` | `<…>(): Signal<ToolState<…>>` | The rendering tool's input, output and metadata as an idle/pending/success state signal. |
| `injectLayout` | `(): Signal<LayoutState>` | Host theme, display mode, safe-area insets, max height. |
| `injectUser` | `(): Signal<UserState>` | Host-provided user info, when available. |
| `injectViewState` | `<T>(default?): InjectViewStateResult<T>` | `{ value, set }` over the host's persisted, bidirectionally synced view state. |
| `injectViewStore` | `<…>(options?): InjectViewStore<…>` | Store-style view state: `state` signal plus `set`/`update`/`patch`/`select`/`flush`, with debounced host writes and a conflict guard. |
| `injectDisplayMode` | `(): InjectDisplayModeResult` | `{ displayMode, setDisplayMode }` — read and request `inline`, `fullscreen` or `pip`. |
| `injectFiles` | `(): InjectFilesResult` | Host-shared files as a signal. |
| `injectHostContext` | `(): HostContextSignals` | Low-level: a readonly signal per raw host-context key. |

## Calling the server and driving the host

All callable.

| Symbol | Signature | Purpose |
| --- | --- | --- |
| `injectCallTool` | `<Args, Resp>(name: string): InjectCallToolResult<…>` | `{ callTool, callToolAsync, status, data, error }` to invoke a server tool and track its lifecycle. |
| `injectSendFollowUpMessage` | `(): SendFollowUpMessageFn` | Send a follow-up prompt into the conversation. |
| `injectOpenExternal` | `(): OpenExternalFn` | Ask the host to open an external URL. |
| `injectRequestModal` | `(): InjectRequestModalResult` | Request a host modal (mcp-app). |
| `injectRequestSize` | `(): RequestSizeFn` | Request a new iframe size. |
| `injectRequestClose` | `(): RequestCloseFn` | Ask the host to close the view. |
| `injectDownload` | `(): DownloadFn` | Trigger a host-mediated download. |
| `injectSetOpenInAppUrl` | `(): SetOpenInAppUrlFn` | Set the "open in app" deep link. |
| `injectRegisterViewTool` | `(): RegisterViewToolHandle` | Register a view-scoped tool with the host. |
| `injectAppHelpers` | `<AppType = never>()` — call as `injectAppHelpers<typeof server>()` | Typed sugar: tool-name-narrowed `injectCallTool` and `injectToolInfo`, inferred from the server's registry. |

## Declarables

| Symbol | Use | Purpose |
| --- | --- | --- |
| `DataLlmDirective` | `[dataLlm]="content"` | Surfaces in-view content to the model, persisted on the host's `viewState`, with no extra tool call. |
| `McpAssetPipe` | `path \| mcpAsset` | Rewrites a relative asset path to an absolute URL on the MCP server origin, fixing the cross-origin asset hazard inside the host iframe. |

## Advanced surface

Also exported for callers who need them:

- **Modal** — `provideMcpModal`, `createMcpModal`, `MCP_MODAL`, `MCP_MODAL_ENABLED`, `McpModal`.
- **Host context** — `createHostContextSignals` (the non-DI form of `injectHostContext`),
  `HostContextSignals`.
- **View context** — `VIEW_CONTEXT_KEY`, `injectViewContext`, `filterViewContext`.
- **data-llm internals** — `getLLMDescriptionString`, `DataLlmContent`, `DataLlmNode`.
- **Version** — `NG_MCP_UI_VERSION`.

## Example widget

```ts
import { ChangeDetectionStrategy, Component, computed } from "@angular/core";
import { DataLlmDirective, injectCallTool, injectToolInfo, injectViewState } from "ng-mcp-ui/web";

@Component({
  selector: "poll-widget",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataLlmDirective],
  template: `
    @let p = poll();
    @if (p) {
      <h1>{{ p.question }}</h1>
      @for (o of p.options; track o) {
        <button (click)="vote(p.pollId, o)" [class.voted]="myVote() === o">{{ o }}</button>
      }
      <p [dataLlm]="voteSummary()"></p>
    }
  `,
})
export default class PollWidget {
  private readonly tool = injectToolInfo<{ output: PollSnapshot }>();
  private readonly castVote = injectCallTool<VoteArgs, VoteResult>("cast_vote");
  private readonly viewState = injectViewState<{ myVote: string | null }>({ myVote: null });

  protected readonly poll = computed(() => {
    const s = this.tool();
    return s.isSuccess ? s.output : null;
  });
  protected readonly myVote = computed(() => this.viewState.value()?.myVote ?? null);
  protected readonly voteSummary = computed(() =>
    this.myVote() ? `User voted: ${this.myVote()}` : "User has not voted yet.",
  );

  protected vote(pollId: string, option: string): void {
    this.castVote.callTool(
      { pollId, option },
      { onSuccess: () => this.viewState.set({ myVote: option }) },
    );
  }
}
```

The shell boots it with `bootstrapWidget(PollWidget)`.
