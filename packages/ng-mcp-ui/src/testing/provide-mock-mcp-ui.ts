import {
  type EnvironmentProviders,
  makeEnvironmentProviders,
  provideZonelessChangeDetection,
} from "@angular/core";
// Import the tokens from their leaf module (`tokens.js`) rather than
// `provide-mcp-ui.js`. Both re-export the same token objects, but `tokens.js`
// has no module-graph dependency on `bootstrapWidget`'s dynamic
// `import("@angular/platform-browser")`; pulling that bundle into a test entry
// trips Vitest's dep pre-bundler ("Invalid or unexpected token"). Token
// identities are unchanged, so DI resolution is identical to `provideMcpUi()`.
import { MCP_ADAPTOR, MCP_SERVER_URL } from "../web/tokens.js";
import { MockAdaptor, type MockMcpUiArgs } from "./mock-adaptor.js";

/**
 * Result of {@link provideMockMcpUi}: the {@link EnvironmentProviders} to drop
 * into a `TestBed` / `bootstrapApplication` / Storybook `applicationConfig`,
 * plus a handle to the underlying {@link MockAdaptor} so the test can drive it
 * (push host context, inspect the call log) without re-resolving it from DI.
 */
export type ProvideMockMcpUiResult = {
  providers: EnvironmentProviders;
  adaptor: MockAdaptor;
};

/**
 * Test/Storybook counterpart to `provideMcpUi()` (PLAN Appendix A.3). A pure
 * provider override: it binds {@link MCP_ADAPTOR} to a {@link MockAdaptor} and
 * {@link MCP_SERVER_URL} to the supplied (or empty) value, alongside
 * `provideZonelessChangeDetection()` — exactly the shape `provideMcpUi()`
 * returns, minus the `window.mcpUi` / `getAdaptor()` reads. That symmetry is
 * what lets Storybook (M8) swap one for the other via `applicationConfig`
 * without any other change to a widget.
 *
 * Because the seam is just the {@link MCP_ADAPTOR} token, every `inject*` wrapper
 * (`injectToolInfo`, `injectCallTool`, `injectLayout`, …) resolves the mock
 * automatically — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 *
 * @param args Optional seed for initial host context (theme/displayMode/locale/
 *   layout/user/viewState/tool fields) and a `toolResponses` map keyed by tool
 *   name. See {@link MockMcpUiArgs}.
 * @returns `{ providers, adaptor }` — spread `providers` into the test/story DI;
 *   keep `adaptor` to drive pushes and read the call log.
 *
 * @example
 * ```ts
 * const { providers, adaptor } = provideMockMcpUi({
 *   hostContext: { theme: "dark" },
 *   toolResponses: { search: { results: [] } },
 * });
 * TestBed.configureTestingModule({ providers: [providers] });
 * adaptor.pushHostContext("toolInput", { query: "hi" });
 * ```
 */
export function provideMockMcpUi(
  args: MockMcpUiArgs = {},
): ProvideMockMcpUiResult {
  const adaptor = new MockAdaptor(args);
  const providers = makeEnvironmentProviders([
    provideZonelessChangeDetection(),
    { provide: MCP_SERVER_URL, useValue: args.serverUrl ?? "" },
    { provide: MCP_ADAPTOR, useValue: adaptor },
  ]);
  return { providers, adaptor };
}
