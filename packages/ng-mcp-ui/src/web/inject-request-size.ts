import { assertInInjectionContext, inject } from "@angular/core";
import type { Adaptor, RequestSizeOptions } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";

/** Function that asks the host to resize the view. */
export type RequestSizeFn = (size: RequestSizeOptions) => Promise<void>;

/**
 * Signal-DI request-size wrapper.
 *
 * Returns a function that asks the host to resize the view iframe. The applied
 * size is host-driven; {@link injectLayout} still reports the final `maxHeight`
 * the host allows. Pair with a `ResizeObserver` on your root element to react to
 * content-size changes without hard-coded values.
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectRequestSize(): RequestSizeFn {
  assertInInjectionContext(injectRequestSize);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  return (size) => adaptor.requestSize(size);
}
