import {
  type EnvironmentProviders,
  type Provider,
  type Type,
  makeEnvironmentProviders,
  provideZonelessChangeDetection,
} from "@angular/core";
import { getAdaptor } from "./bridges/get-adaptor.js";
import type { Adaptor } from "./bridges/types.js";
import { provideMcpModal } from "./mcp-modal.js";
// The DI tokens live in their own leaf module to avoid a provide-mcp-ui ↔
// mcp-modal import cycle (see tokens.ts). Re-exported here so this is the single
// public export site for both tokens and the public barrel stays unchanged.
export { MCP_ADAPTOR, MCP_SERVER_URL } from "./tokens.js";
import { MCP_ADAPTOR, MCP_SERVER_URL } from "./tokens.js";

/**
 * Environment providers for an MCP-UI widget: zoneless change detection plus the
 * two host-derived tokens ({@link MCP_SERVER_URL}, {@link MCP_ADAPTOR}), and the
 * mcp-app modal service.
 *
 * Window access is centralized here (PLAN §5.3): the `window.mcpUi` global is
 * read **only** inside these factories — never at module load and never in any
 * downstream wrapper. Widgets never run under SSR, but keeping the reads in
 * factories makes the mock seam and unit tests trivial (no global stubbing of
 * import side effects).
 *
 * If the shell never set `window.mcpUi`, the {@link MCP_ADAPTOR} factory throws a
 * clear error naming the shell contract: a widget can only boot inside a
 * host-provided shell that injects `window.mcpUi`. Tests/Storybook avoid the
 * throw by overriding {@link MCP_ADAPTOR} (see `provideMockMcpUi`, S16).
 */
export function provideMcpUi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideZonelessChangeDetection(),
    {
      provide: MCP_SERVER_URL,
      // Only window reader for serverUrl. Guarded + optional-chained so a missing
      // window/shell global yields "" rather than throwing — an empty serverUrl
      // is a benign default (mcpAsset falls back to relative URLs).
      useFactory: (): string =>
        typeof window === "undefined" ? "" : (window.mcpUi?.serverUrl ?? ""),
    },
    {
      provide: MCP_ADAPTOR,
      // Only call site of getAdaptor() in the whole library (THE RULE, §5.3).
      // getAdaptor() reads window.mcpUi.hostType; if the shell never set
      // window.mcpUi it would throw an opaque TypeError, so we guard and
      // rethrow with the shell contract spelled out.
      // lint-greppable: getAdaptor() usage — provideMcpUi factory ONLY.
      useFactory: (): Adaptor => {
        if (typeof window === "undefined" || window.mcpUi === undefined) {
          throw new Error(
            "[ng-mcp-ui] provideMcpUi(): window.mcpUi is not set. A widget " +
              "must be bootstrapped inside a host-provided shell that injects " +
              "`window.mcpUi = { hostType, serverUrl }`. If you are testing " +
              "or running in Storybook, provide MCP_ADAPTOR directly (see " +
              "provideMockMcpUi).",
          );
        }
        return getAdaptor();
      },
    },
    // The Angular modal service. Wired only for `hostType === 'mcp-app'` — the
    // Apps SDK host renders modals itself. The gating lives behind the
    // MCP_MODAL_ENABLED token inside provideMcpModal(), whose factory is the
    // single window.mcpUi.hostType read for this feature (keeping the window
    // read in a factory, per the note above). It resolves to false under SSR /
    // no-window / non-mcp-app, so the service no-ops there rather than throwing.
    provideMcpModal(),
  ]);
}

/**
 * Bootstrap a standalone widget component with {@link provideMcpUi} applied
 * first, then any caller-supplied providers. Built on `createApplication` +
 * `ApplicationRef.bootstrap(component, "#root")` (PLAN §5.3 / Appendix A.6) so
 * the Storybook/mock seam stays a pure provider swap.
 *
 * Why not `bootstrapApplication(component)`? That helper keys off the
 * component's **own** selector (e.g. `poll-widget`) and looks for a matching
 * element in the DOM. The host shell mounts the widget at a generic
 * `<div id="root">` — which never matches a `*-widget` selector — so
 * `bootstrapApplication` throws `NG05104` ("selector did not match any
 * elements") and the iframe renders blank (no element ⇒ no app ⇒ the MCP-Apps
 * host keeps the frame hidden). Bootstrapping into `#root` explicitly decouples
 * the mount node from the component selector, so any widget selector works.
 *
 * `@angular/platform-browser` is imported lazily so that merely importing the
 * `ng-mcp-ui/web` barrel (e.g. from a Node unit test, or a token-only consumer)
 * does not eagerly evaluate `PlatformLocation` — whose static initializer
 * requires the JIT compiler and is absent in a plain Node test env. The module
 * loads only when a widget actually boots in a browser, where it is always
 * present.
 *
 * `providers` accepts both plain {@link Provider}s and
 * {@link EnvironmentProviders}, matching `createApplication`'s contract.
 * Resolves to the booted `ApplicationRef`.
 */
export function bootstrapWidget(
  component: Type<unknown>,
  providers: Array<Provider | EnvironmentProviders> = [],
): Promise<unknown> {
  return import("@angular/platform-browser").then(({ createApplication }) =>
    createApplication({
      providers: [provideMcpUi(), ...providers],
    }).then((appRef) => {
      appRef.bootstrap(component, "#root");
      return appRef;
    }),
  );
}
