// ng-mcp-ui/web — Angular host bridge + signal wrappers.
// The framework-free bridge core landed first (S08: the `Adaptor` interface +
// shared host/tool types; S09: the two host adaptors + `getAdaptor`), surfaced
// here via the `bridges` barrel. The Angular DI wrappers (provideMcpUi,
// bootstrapWidget, the inject* API), DataLlmDirective, and McpAssetPipe land in
// the following M2 web-track steps.
export * from "./bridges/index.js";
export { NG_MCP_UI_VERSION } from "../version.js";
