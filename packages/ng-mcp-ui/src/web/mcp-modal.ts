import {
  DestroyRef,
  type EnvironmentProviders,
  InjectionToken,
  type Signal,
  computed,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  signal,
} from "@angular/core";
import type { Adaptor } from "./bridges/types.js";
import { createHostContextSignals } from "./host-context.js";
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Angular modal service for `mcp-app` hosts.
 *
 * Subscribes to the adaptor's `display` host-context store, treats
 * `mode === "modal"` as open, and dismisses via `adaptor.closeModal()`. It is
 * function-based (the project's house style is signal/DI functions, not
 * decorated `@Injectable` classes) and exposes its behavior signal-shaped:
 *
 * - `isOpen` is a readonly {@link Signal} derived from the `display`
 *   host-context signal (`display().mode === "modal"`).
 * - `close()` is the dismiss action. It calls the concrete `McpAppAdaptor`'s
 *   `closeModal()` — a synchronous, local flip of the `display` store back to
 *   `inline` (the mcp-app modal chrome is rendered in-frame, so it closes
 *   optimistically without a host round-trip). This is deliberately
 *   NOT `requestDisplayMode("inline")` (which messages the host) nor
 *   `requestClose()` (which tears the whole view down).
 */
export type McpModal = {
  /** `true` while the host reports `display.mode === "modal"`. */
  readonly isOpen: Signal<boolean>;
  /**
   * Dismiss the modal via `adaptor.closeModal()`: a synchronous, local flip of
   * the host-context `display` store back to `inline` (the modal is rendered
   * in-frame, so the close is a local optimistic update, not a host round-trip).
   * No-op when the feature is disabled.
   */
  close(): void;
};

/**
 * @internal Whether the modal feature is active: `true` only for the `mcp-app`
 * host. {@link provideMcpModal} provides this token via a window-reading factory
 * (the single `window.mcpUi.hostType` read for this feature, guarded so
 * SSR / no-window / missing-shell yields `false`). Modeled on {@link MCP_ADAPTOR}:
 * no default factory, always provided by `provideMcpModal()`, overridable by a
 * later provider (the test/Storybook seam). The gate also keeps the boot-time
 * initializer from resolving {@link MCP_ADAPTOR} on non-mcp-app hosts.
 */
export const MCP_MODAL_ENABLED = new InjectionToken<boolean>(
  "MCP_MODAL_ENABLED",
);

/**
 * DI token carrying the resolved {@link McpModal}. Provided by
 * {@link provideMcpModal}. When the feature is disabled (non-mcp-app host) it
 * resolves to a no-op modal whose `isOpen` is permanently `false`.
 */
export const MCP_MODAL = new InjectionToken<McpModal>("MCP_MODAL");

/**
 * The concrete `McpAppAdaptor` exposes `closeModal()` — it locally flips the
 * `display` store back to `inline` and notifies subscribers (no host message).
 * It is intentionally NOT on the typed {@link Adaptor} contract; it is reached
 * via the concrete `McpAppAdaptor`. The modal feature
 * activates only for `hostType === "mcp-app"`, where the resolved adaptor is
 * always a `McpAppAdaptor`, so narrowing to this shape in the enabled branch is
 * sound.
 */
type ModalCapableAdaptor = Adaptor & { closeModal(): void };

/**
 * Build an {@link McpModal} from an {@link Adaptor}.
 *
 * When `enabled` is `false` (non-mcp-app host) this returns a no-op modal: it
 * never subscribes to the host-context stores and reports `isOpen` as `false`
 * (the `modal` display mode is host-driven and unreachable there). Otherwise it
 * derives `isOpen` from the `display` host-context signal and `close()` forwards
 * to the adaptor — wiring an optional Escape-to-close listener when a `document`
 * exists (mirrors the React `useEffect`; SSR / no-DOM hosts skip it).
 *
 * The `adaptor` is passed explicitly for non-DI use (plain unit tests). Inside
 * an Angular injection context, prefer {@link MCP_MODAL} / {@link provideMcpModal},
 * which resolve the adaptor from {@link MCP_ADAPTOR} — nothing here calls
 * `getAdaptor()` (THE RULE, PLAN §5.3).
 *
 * When `enabled`, `adaptor` is narrowed to {@link ModalCapableAdaptor} to reach
 * the concrete `closeModal()` (sound: enabled ⟹ mcp-app host ⟹ `McpAppAdaptor`).
 */
export function createMcpModal(adaptor: Adaptor, enabled: boolean): McpModal {
  if (!enabled) {
    // Non-mcp-app host: the `modal` display mode is host-driven and unreachable,
    // so report closed, never subscribe, and make close() a no-op.
    return { isOpen: signal(false).asReadonly(), close: () => {} };
  }

  const ctx = createHostContextSignals(adaptor);
  const isOpen = computed(() => ctx.display().mode === "modal");

  // Mirrors the React source's `adaptor.closeModal()`: a local optimistic flip
  // of the `display` store back to `inline` (no host round-trip). Safe cast —
  // enabled ⟹ mcp-app ⟹ McpAppAdaptor (see ModalCapableAdaptor).
  const close = (): void => {
    (adaptor as ModalCapableAdaptor).closeModal();
  };

  // Optional DOM affordance: Escape closes the modal (mirrors the React
  // useEffect keydown handler). Guarded on `addEventListener` (not just
  // `document`) so SSR / no-DOM / partial-DOM hosts no-op. Cleanup is chained
  // onto the host-context signals' lifecycle (DestroyRef when in DI).
  if (
    typeof document !== "undefined" &&
    typeof document.addEventListener === "function"
  ) {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && isOpen()) {
        close();
      }
    };
    document.addEventListener("keydown", handler);
    // Remove the listener on teardown. `createHostContextSignals` already
    // registered its own `destroy` with this DestroyRef, capturing that exact
    // reference — so reassigning `ctx.destroy` here would be dead code (DestroyRef
    // never re-reads the property). Register a sibling DestroyRef callback
    // instead. `inject()` throws outside an injection context, so probe
    // optionally; a non-DI caller (rare, and skipped in no-DOM envs) owns its
    // own teardown.
    let destroyRef: DestroyRef | null = null;
    try {
      destroyRef = inject(DestroyRef, { optional: true });
    } catch {
      destroyRef = null;
    }
    destroyRef?.onDestroy(() => {
      document.removeEventListener("keydown", handler);
    });
  }

  return { isOpen, close };
}

/**
 * Environment providers wiring the {@link MCP_MODAL} token. Intended to be
 * appended in `provideMcpUi()`; activates only for `hostType === "mcp-app"`
 * (the Apps SDK host owns its own modal chrome), gated by {@link MCP_MODAL_ENABLED}.
 *
 * The environment initializer eagerly resolves {@link MCP_MODAL} at boot — but
 * only when enabled — so the Escape-key wiring attaches up front (matching the
 * React `ModalProvider`, which mounted unconditionally inside the tree). On a
 * non-mcp-app / no-window host the initializer skips resolution entirely, so it
 * never touches {@link MCP_ADAPTOR} (keeping the apps-sdk / SSR / test path a
 * clean no-op rather than a throw).
 */
export function provideMcpModal(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: MCP_MODAL_ENABLED,
      // Only window reader for the modal gate (mirrors provideMcpUi's factories).
      // Guarded so SSR / no-window / missing-shell is `false` rather than a throw.
      useFactory: (): boolean =>
        typeof window !== "undefined" &&
        window.mcpUi?.hostType === "mcp-app",
    },
    {
      provide: MCP_MODAL,
      useFactory: (): McpModal =>
        createMcpModal(inject(MCP_ADAPTOR), inject(MCP_MODAL_ENABLED)),
    },
    provideEnvironmentInitializer(() => {
      if (inject(MCP_MODAL_ENABLED)) {
        inject(MCP_MODAL);
      }
    }),
  ]);
}
