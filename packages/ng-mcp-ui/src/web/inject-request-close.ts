import { assertInInjectionContext, inject } from "@angular/core";
import type { Adaptor } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";

/** Function that asks the host to close the current view. */
export type RequestCloseFn = () => Promise<void>;

/**
 * Signal-DI request-close wrapper.
 *
 * Returns a function that asks the host to close (dismiss) the current view. The
 * host decides whether to honor the request. Useful from modal views or after a
 * terminal action like "Done".
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectRequestClose(): RequestCloseFn {
  assertInInjectionContext(injectRequestClose);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  return () => adaptor.requestClose();
}
