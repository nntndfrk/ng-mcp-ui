import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { DestroyRef, assertInInjectionContext, inject } from "@angular/core";
import type {
  Adaptor,
  AnyViewToolHandler,
  ViewToolConfig,
  ViewToolHandler,
} from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * Result of {@link injectRegisterViewTool}: a manual `unregister` to remove the
 * tool before the injection context is destroyed (e.g. a view tool whose
 * lifetime is shorter than the component's).
 */
export type RegisterViewToolHandle = {
  unregister: () => void;
};

/**
 * Signal-DI register-view-tool wrapper.
 *
 * Register a tool the view exposes to the host and model — the MCP Apps
 * "app-provided tools" feature. The host discovers it via `tools/list` and
 * invokes it via `tools/call`; the handler runs inside the view against its live
 * state. The inverse of {@link injectCallTool} (which calls a *server* tool).
 * MCP-Apps-only — a no-op under the Apps SDK (handled by the adaptor).
 *
 * Registration model:
 * - Registers **once** at injection time. A widget rarely changes a registered
 *   tool's name; if you need that, call `unregister()` and re-invoke
 *   `injectRegisterViewTool` with the new config.
 * - There is no render loop, so the `config`/`handler` values captured at call
 *   time are used directly (the closure holds the latest values).
 * - Cleanup: the bridge's teardown is wired to the ambient {@link DestroyRef}
 *   and also returned as `unregister()` for manual control.
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectRegisterViewTool<
  TInput extends ZodRawShapeCompat = ZodRawShapeCompat,
>(
  config: ViewToolConfig<TInput>,
  handler: ViewToolHandler<TInput>,
): RegisterViewToolHandle {
  assertInInjectionContext(injectRegisterViewTool);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);

  // The bridge stores the type-erased AnyViewToolHandler; the typed args are
  // guaranteed by the registered schema.
  const wrappedHandler: AnyViewToolHandler = (args) =>
    handler(args as Parameters<ViewToolHandler<TInput>>[0]);

  const teardown = adaptor.registerViewTool(config, wrappedHandler);

  let unregistered = false;
  const unregister = (): void => {
    if (unregistered) {
      return;
    }
    unregistered = true;
    teardown();
  };

  inject(DestroyRef).onDestroy(unregister);

  return { unregister };
}
