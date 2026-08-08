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

Each row links to the full page for that symbol. For the behavior of each function on each host,
see [host support](/docs/reference/host-support).

## Setup

| Symbol | Signature | Purpose |
| --- | --- | --- |
| [`provideMcpUi`](/docs/api/provide-mcp-ui) | `(): EnvironmentProviders` | Zoneless change detection, the two host-derived tokens, and the mcp-app modal service. |
| [`bootstrapWidget`](/docs/api/bootstrap-widget) | `(component, providers?): Promise<ApplicationRef>` | Boots a standalone widget into the host shell's `#root`, with `provideMcpUi()` applied first. |
| `MCP_ADAPTOR` / `MCP_SERVER_URL` | `InjectionToken<…>` | The host bridge and server-origin tokens. Provide `MCP_ADAPTOR` yourself to use a custom or mock adaptor. |

## Reading host and tool state

All signal-returning.

| Symbol | Signature | Purpose |
| --- | --- | --- |
| [`injectToolInfo`](/docs/api/inject-tool-info) | `<…>(): Signal<ToolState<…>>` | The rendering tool's input, output and metadata as an idle/pending/success state signal. |
| [`injectLayout`](/docs/api/inject-layout) | `(): Signal<LayoutState>` | Host theme, safe-area insets and max height. |
| [`injectUser`](/docs/api/inject-user) | `(): Signal<UserState>` | Locale and device capabilities. |
| [`injectViewState`](/docs/api/inject-view-state) | `<T>(default?): InjectViewStateResult<T>` | `{ value, set }` over the host's persisted, bidirectionally synced view state. |
| [`injectViewStore`](/docs/api/inject-view-store) | `<…>(initial?, default?, options?): InjectViewStore<…>` | Store-style view state: `state` signal plus `set`/`update`/`patch`/`select`/`flush`, with debounced host writes and a conflict guard. |
| [`injectDisplayMode`](/docs/api/inject-display-mode) | `(): InjectDisplayModeResult` | `{ displayMode, setDisplayMode }` — read and request `inline`, `fullscreen` or `pip`. |
| [`injectHostContext`](/docs/api/inject-host-context) | `(): HostContextSignals` | Low-level: a readonly signal per raw host-context key. |

## Calling the server and driving the host

All callable.

| Symbol | Signature | Purpose |
| --- | --- | --- |
| [`injectCallTool`](/docs/api/inject-call-tool) | `<Args, Resp>(name: string): InjectCallToolResult<…>` | `{ callTool, callToolAsync, status, data, error }` to invoke a server tool and track its lifecycle. |
| [`injectSendFollowUpMessage`](/docs/api/inject-send-follow-up-message) | `(): SendFollowUpMessageFn` | Send a follow-up prompt into the conversation. |
| [`injectOpenExternal`](/docs/api/inject-open-external) | `(): OpenExternalFn` | Ask the host to open an external URL. |
| [`injectRequestModal`](/docs/api/inject-request-modal) | `(): InjectRequestModalResult` | `{ isOpen, params, open }` for a host modal. |
| [`injectRequestSize`](/docs/api/inject-request-size) | `(): RequestSizeFn` | Request a new iframe size. |
| [`injectRequestClose`](/docs/api/inject-request-close) | `(): RequestCloseFn` | Ask the host to close the view. |
| [`injectDownload`](/docs/api/inject-download) | `(): { download: DownloadFn }` | Trigger a host-mediated download. |
| [`injectFiles`](/docs/api/inject-files) | `(): InjectFilesResult` | `{ upload, getDownloadUrl, selectFiles }` for host-managed files. |
| [`injectSetOpenInAppUrl`](/docs/api/inject-set-open-in-app-url) | `(): SetOpenInAppUrlFn` | Set the "open in app" deep link. |
| [`injectRegisterViewTool`](/docs/api/inject-register-view-tool) | `(config, handler): RegisterViewToolHandle` | Register a view-scoped tool with the host. |
| [`injectAppHelpers`](/docs/api/inject-app-helpers) | `<AppType = never>()` — call as `injectAppHelpers<typeof server>()` | Typed sugar: tool-name-narrowed `injectCallTool` and `injectToolInfo`, inferred from the server's registry. |

## Declarables

| Symbol | Use | Purpose |
| --- | --- | --- |
| [`DataLlmDirective`](/docs/api/data-llm) | `[dataLlm]="content"` | Surfaces in-view content to the model, persisted on the host's `viewState`, with no extra tool call. |
| [`McpAssetPipe`](/docs/api/mcp-asset-pipe) | `path \| mcpAsset` | Rewrites a relative asset path to an absolute URL on the MCP server origin, fixing the cross-origin asset hazard inside the host iframe. |

## Advanced surface

Also exported for callers who need them:

- **Modal** — [`MCP_MODAL`](/docs/api/mcp-modal), `provideMcpModal`, `createMcpModal`,
  `MCP_MODAL_ENABLED`, `McpModal`.
- **Host context** — `createHostContextSignals` (the non-DI form of
  [`injectHostContext`](/docs/api/inject-host-context)), `HostContextSignals`.
- **View context** — `VIEW_CONTEXT_KEY`, `injectViewContext`, `filterViewContext`.
- **data-llm internals** — `getLLMDescriptionString`, `DataLlmContent`, `DataLlmNode`.
- **Bridge core** — `getAdaptor` (the non-DI adaptor accessor), `Adaptor`, `HostContext` and the
  per-host adaptor types. Prefer the `MCP_ADAPTOR` token over `getAdaptor()`.
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
