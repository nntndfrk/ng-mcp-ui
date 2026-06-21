import {
  type Signal,
  assertInInjectionContext,
  inject,
} from "@angular/core";
import type {
  Adaptor,
  DisplayMode,
  RequestDisplayMode,
} from "./bridges/types.js";
import { createHostContextSignals } from "./host-context.js";
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Result of {@link injectDisplayMode}: a readonly {@link Signal} of the current
 * display mode plus a `setDisplayMode` requester.
 *
 * Returns `{ displayMode, setDisplayMode }` (an object, matching the project's
 * other inject* wrappers). `displayMode` is the host-context `displayMode`
 * signal; `setDisplayMode` forwards to `adaptor.requestDisplayMode` and resolves
 * with the mode the host actually applied (which may differ from the request).
 */
export type InjectDisplayModeResult = {
  displayMode: Signal<DisplayMode>;
  setDisplayMode: (
    mode: RequestDisplayMode,
  ) => Promise<{ mode: RequestDisplayMode }>;
};

/**
 * Signal-based display-mode wrapper.
 *
 * Read and change the view's display mode (`"inline"`, `"pip"`, `"fullscreen"`).
 * `setDisplayMode` asks the host to switch; the host returns the mode it
 * actually applied. The reported `displayMode` signal also updates when the
 * host changes the mode on its own. `"modal"` is reachable via
 * {@link injectRequestModal}, not this wrapper.
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectDisplayMode(): InjectDisplayModeResult {
  assertInInjectionContext(injectDisplayMode);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  const ctx = createHostContextSignals(adaptor);

  const setDisplayMode = (
    mode: RequestDisplayMode,
  ): Promise<{ mode: RequestDisplayMode }> => adaptor.requestDisplayMode(mode);

  return { displayMode: ctx.displayMode, setDisplayMode };
}
