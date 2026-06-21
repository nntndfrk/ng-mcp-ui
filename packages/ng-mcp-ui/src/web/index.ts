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
// is the non-DI form. The `MCP_ADAPTOR` token itself is re-exported once
// `provideMcpUi` lands.
export {
  createHostContextSignals,
  type HostContextSignals,
  injectHostContext,
} from "./host-context.js";
export { NG_MCP_UI_VERSION } from "../version.js";
