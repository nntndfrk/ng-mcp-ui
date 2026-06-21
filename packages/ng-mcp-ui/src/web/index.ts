// ng-mcp-ui/web — Angular host bridge + signal wrappers.
// The framework-free bridge core lands first (S08: the `Adaptor` interface +
// shared host/tool types). The host adaptors, `getAdaptor`, the Angular DI
// wrappers (provideMcpUi, bootstrapWidget, the inject* API), DataLlmDirective,
// and McpAssetPipe land in the following M2 web-track steps.
export type * from "./bridges/types.js";
export { NG_MCP_UI_VERSION } from "../version.js";
