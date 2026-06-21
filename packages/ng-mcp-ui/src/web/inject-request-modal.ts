import {
  type Signal,
  assertInInjectionContext,
  computed,
  inject,
} from "@angular/core";
import type { Adaptor, RequestModalOptions } from "./bridges/types.js";
import { createHostContextSignals } from "./host-context.js";
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Result of {@link injectRequestModal}: the modal-open state as readonly
 * {@link Signal}s plus an `open` requester.
 *
 * Exposes `isOpen` and `params` as readonly signals (derived from the `display`
 * host-context signal) and keeps `open` as a plain function.
 */
export type InjectRequestModalResult = {
  isOpen: Signal<boolean>;
  params: Signal<Record<string, unknown> | undefined>;
  open: (opts: RequestModalOptions) => void;
};

/**
 * Signal-based request-modal wrapper.
 *
 * Open the current view in a modal overlay (`displayMode === "modal"`).
 * `open(opts)` triggers the host to render the view in a modal, optionally
 * passing `params` surfaced back via the `params` signal. `isOpen` is `true`
 * while the host reports `display.mode === "modal"`. Use {@link injectDisplayMode}
 * for non-modal display modes.
 *
 * `isOpen` / `params` derive from the `display` host-context signal, so they
 * update whenever the host pushes a new display state — matching the source,
 * which recomputed `display.mode === "modal"` / `display.params` on every render.
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectRequestModal(): InjectRequestModalResult {
  assertInInjectionContext(injectRequestModal);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  const ctx = createHostContextSignals(adaptor);

  const isOpen = computed(() => ctx.display().mode === "modal");
  const params = computed(() => ctx.display().params);
  const open = (opts: RequestModalOptions): void => adaptor.openModal(opts);

  return { isOpen, params, open };
}
