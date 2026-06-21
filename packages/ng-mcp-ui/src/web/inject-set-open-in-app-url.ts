import { assertInInjectionContext, inject } from "@angular/core";
import type { Adaptor } from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";

/** Function that overrides the host's "Open in <App>" target URL. Returned by {@link injectSetOpenInAppUrl}. */
export type SetOpenInAppUrlFn = (href: string) => Promise<void>;

/**
 * Signal-DI set-open-in-app-URL wrapper.
 *
 * Returns a function that overrides the target URL the host opens from its
 * fullscreen "Open in <App>" affordance. Call once your view has enough context
 * to construct the canonical URL (e.g. a permalink to the entity in view).
 * Apps-SDK-only — the adaptor throws under MCP Apps and validates the href
 * (the "The href parameter is required." guard lives in the adaptor).
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectSetOpenInAppUrl(): SetOpenInAppUrlFn {
  assertInInjectionContext(injectSetOpenInAppUrl);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  return (href) => adaptor.setOpenInAppUrl(href);
}
