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
// The DI token is public now so consumers can provide the adaptor explicitly
// (and `injectHostContext()` is usable) ahead of `provideMcpUi`, which will be
// the ergonomic way to provide it. `MCP_SERVER_URL` is added alongside then.
export { MCP_ADAPTOR } from "./tokens.js";
export { NG_MCP_UI_VERSION } from "../version.js";
