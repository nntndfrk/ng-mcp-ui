import {
  type Signal,
  assertInInjectionContext,
  computed,
  inject,
} from "@angular/core";
import type { Adaptor, SafeArea, Theme } from "./bridges/types.js";
import { createHostContextSignals } from "./host-context.js";
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Layout and visual-environment snapshot.
 */
export type LayoutState = {
  theme: Theme;
  maxHeight: number | undefined;
  safeArea: SafeArea;
};

/**
 * Signal-based layout wrapper.
 *
 * Read layout / visual-environment info — `theme`, `maxHeight`, `safeArea` —
 * which the host may change on resize or theme toggle. Returns a single readonly
 * {@link Signal} of {@link LayoutState} derived from the `theme`, `maxHeight`,
 * and `safeArea` host-context signals (recomputes when any of them changes).
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectLayout(): Signal<LayoutState> {
  assertInInjectionContext(injectLayout);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  const ctx = createHostContextSignals(adaptor);

  return computed(() => ({
    theme: ctx.theme(),
    maxHeight: ctx.maxHeight(),
    safeArea: ctx.safeArea(),
  }));
}
