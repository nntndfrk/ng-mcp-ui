// ng-mcp-ui/web — Angular host bridge + signal wrappers.
// The framework-free bridge core landed first (S08: the `Adaptor` interface +
// shared host/tool types; S09: the two host adaptors + `getAdaptor`), surfaced
// here via the `bridges` barrel. The Angular DI wrappers (provideMcpUi,
// bootstrapWidget, the inject* API), DataLlmDirective, and McpAssetPipe land in
// the following M2 web-track steps.
export * from "./bridges/index.js";
// Signal-based host-context: a readonly Angular signal per host-context key,
// built over each adaptor's `HostContextStore`. `injectHostContext()` is the DI
// entry point (resolves the adaptor from `MCP_ADAPTOR`); `createHostContextSignals`
// is the non-DI form.
export {
  createHostContextSignals,
  type HostContextSignals,
  injectHostContext,
} from "./host-context.js";
// DI core. `provideMcpUi()` is the ergonomic provider (zoneless + both
// host-derived tokens + the mcp-app modal service); `bootstrapWidget()` boots a
// widget into the shell's `#root`. The two DI tokens (`MCP_ADAPTOR`,
// `MCP_SERVER_URL`) are surfaced here through `provide-mcp-ui` (their single
// public export site — it re-exports them from the leaf `tokens` module) so a
// consumer can still provide the adaptor explicitly (e.g. ahead of `provideMcpUi`
// for a bare `injectHostContext()`).
export {
  MCP_ADAPTOR,
  MCP_SERVER_URL,
  bootstrapWidget,
  provideMcpUi,
} from "./provide-mcp-ui.js";
// Angular modal service for mcp-app hosts. `provideMcpModal()` is appended by
// `provideMcpUi()`; `createMcpModal` is the non-DI form. Wired for mcp-app only
// (gated by `MCP_MODAL_ENABLED`); a no-op elsewhere.
export {
  createMcpModal,
  MCP_MODAL,
  MCP_MODAL_ENABLED,
  type McpModal,
  provideMcpModal,
} from "./mcp-modal.js";
// Signal-based tool wrappers. `injectToolInfo()` returns a `Signal<ToolState>`
// (idle/pending/success) derived from the tool host-context keys; `injectCallTool()`
// returns `{ callTool, callToolAsync, status, data, error }` for invoking a server
// tool and tracking its lifecycle. Both resolve the host via `MCP_ADAPTOR` (THE RULE).
export {
  injectToolInfo,
  type ToolState,
  type ToolIdleState,
  type ToolPendingState,
  type ToolSuccessState,
} from "./inject-tool-info.js";
export {
  injectCallTool,
  type CallToolState,
  type CallToolFn,
  type CallToolAsyncFn,
  type InjectCallToolResult,
  type SideEffects,
} from "./inject-call-tool.js";
// Remaining inject* wrappers over the rest of the host surface. Read-derived
// signals (layout / user / display-mode / view-state) and callable forwarders
// (open-external / send-follow-up / request-modal|size|close / files / download /
// set-open-in-app-url / register-view-tool). Each resolves the host via
// `MCP_ADAPTOR` (THE RULE) — none calls `getAdaptor()`.
export {
  injectViewState,
  type InjectViewStateResult,
  type SetViewStateUpdater,
} from "./inject-view-state.js";
export { injectLayout, type LayoutState } from "./inject-layout.js";
export { injectUser, type UserState } from "./inject-user.js";
export {
  injectDisplayMode,
  type InjectDisplayModeResult,
} from "./inject-display-mode.js";
export {
  injectOpenExternal,
  type OpenExternalFn,
} from "./inject-open-external.js";
export {
  injectSendFollowUpMessage,
  type SendFollowUpMessageFn,
} from "./inject-send-follow-up-message.js";
export {
  injectRequestModal,
  type InjectRequestModalResult,
} from "./inject-request-modal.js";
export {
  injectRequestSize,
  type RequestSizeFn,
} from "./inject-request-size.js";
export {
  injectRequestClose,
  type RequestCloseFn,
} from "./inject-request-close.js";
export { injectFiles, type InjectFilesResult } from "./inject-files.js";
export { injectDownload, type DownloadFn } from "./inject-download.js";
export {
  injectSetOpenInAppUrl,
  type SetOpenInAppUrlFn,
} from "./inject-set-open-in-app-url.js";
export {
  injectRegisterViewTool,
  type RegisterViewToolHandle,
} from "./inject-register-view-tool.js";
// View-state context helpers — used by injectViewState; exported for advanced
// callers (and the forthcoming S14 data-llm channel, which shares VIEW_CONTEXT_KEY).
export {
  filterViewContext,
  injectViewContext,
  VIEW_CONTEXT_KEY,
} from "./helpers/state.js";
export { NG_MCP_UI_VERSION } from "../version.js";
