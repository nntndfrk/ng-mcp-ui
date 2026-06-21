import { AppsSdkAdaptor } from "./apps-sdk/adaptor.js";
import { McpAppAdaptor } from "./mcp-app/adaptor.js";
import type { Adaptor } from "./types.js";

/**
 * @internal
 * Resolve the host-specific {@link Adaptor} based on `window.mcpUi.hostType`.
 * Prefer the framework wrappers (`injectCallTool`, `injectViewState`, etc.) over
 * calling this directly — it's the escape hatch used by the wrappers themselves
 * and by advanced integrations.
 *
 * `hostType` is host-injected, so it's validated here rather than trusted to the
 * static {@link import("./types.js").ViewHostType} union: an unknown/missing
 * value throws a clear error instead of silently falling through to one adaptor
 * and failing deeper in that bridge.
 */
export const getAdaptor = (): Adaptor => {
  const { hostType } = window.mcpUi;
  if (hostType === "apps-sdk") {
    return AppsSdkAdaptor.getInstance();
  }
  if (hostType === "mcp-app") {
    return McpAppAdaptor.getInstance();
  }
  throw new Error(
    `[ng-mcp-ui] Unknown host type ${JSON.stringify(hostType)}; expected "apps-sdk" or "mcp-app" on window.mcpUi.hostType.`,
  );
};
