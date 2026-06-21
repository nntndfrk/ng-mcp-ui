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
// `provideMcpUi()` once it lands; `createMcpModal` is the non-DI form. Wired for
// mcp-app only (gated by `MCP_MODAL_ENABLED`); a no-op elsewhere.
export {
  createMcpModal,
  MCP_MODAL,
  MCP_MODAL_ENABLED,
  type McpModal,
  provideMcpModal,
} from "./mcp-modal.js";
export { NG_MCP_UI_VERSION } from "../version.js";
