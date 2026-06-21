import { AppsSdkAdaptor } from "./apps-sdk/adaptor.js";
import { McpAppAdaptor } from "./mcp-app/adaptor.js";
import type { Adaptor } from "./types.js";

/**
 * @internal
 * Resolve the host-specific {@link Adaptor} based on `window.mcpUi.hostType`.
 * Prefer the framework wrappers (`injectCallTool`, `injectViewState`, etc.) over
 * calling this directly — it's the escape hatch used by the wrappers themselves
 * and by advanced integrations.
 */
export const getAdaptor = (): Adaptor => {
  return window.mcpUi.hostType === "apps-sdk"
    ? AppsSdkAdaptor.getInstance()
    : McpAppAdaptor.getInstance();
};
