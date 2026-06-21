import { assertInInjectionContext, inject } from "@angular/core";
import type { Adaptor, OpenExternalOptions } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";

/** Function that opens a URL outside the view's iframe. */
export type OpenExternalFn = (
  href: string,
  options?: OpenExternalOptions,
) => void;

/**
 * Signal-DI open-external wrapper.
 *
 * Returns a function that opens an external URL through the host (e.g. in the
 * user's browser). Use instead of `window.open` / `target="_blank"`, which are
 * unreliable inside a sandboxed iframe. Hosts may transform the URL (ChatGPT
 * appends `?redirectUrl=…` for allowlisted targets — pass `redirectUrl: false`
 * to suppress it).
 *
 * Where the React hook memoized the function with `useCallback`, the DI port
 * returns a plain closure bound to the injected adaptor — stable for the
 * lifetime of the injection context, which is the same guarantee `useCallback`
 * gave per component instance.
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectOpenExternal(): OpenExternalFn {
  assertInInjectionContext(injectOpenExternal);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  return (href, options) => adaptor.openExternal(href, options);
}
