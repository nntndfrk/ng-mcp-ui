export { McpAppAdaptor } from "./adaptor.js";
export { McpAppBridge } from "./bridge.js";
export type { McpAppContext, McpAppContextKey, McpToolState } from "./types.js";
// NOTE(S08): `useMcpAppContext` is React-specific and is re-implemented as a
// signal store in a later web-track step. It is intentionally not exported here.
