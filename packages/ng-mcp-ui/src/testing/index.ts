// ng-mcp-ui/testing — MockAdaptor + provideMockMcpUi test harness.
// A full in-memory `Adaptor` mock (store-backed host context / `toolResponses` /
// log-and-resolve) plus `provideMockMcpUi`, the pure provider override mirroring
// `provideMcpUi()` that unit tests and Storybook (M8) swap in via the
// `MCP_ADAPTOR` seam (THE RULE — nothing here calls `getAdaptor()`).

export { NG_MCP_UI_VERSION } from "../version.js";
export {
  MockAdaptor,
  type MockAdaptorCall,
  type MockMcpUiArgs,
  type MockToolResponse,
} from "./mock-adaptor.js";
export {
  type ProvideMockMcpUiResult,
  provideMockMcpUi,
} from "./provide-mock-mcp-ui.js";
