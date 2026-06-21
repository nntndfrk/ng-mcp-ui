import { InjectionToken } from "@angular/core";
import type { Adaptor } from "./bridges/types.js";

/**
 * DI tokens for the MCP-UI runtime, kept in their own leaf module so they carry
 * no module-graph dependencies beyond `@angular/core` and the bridge types.
 *
 * Why a dedicated module: downstream files (`provideMcpUi` and the modal service
 * it wires) both need {@link MCP_ADAPTOR}. Parking the token on a common leaf
 * avoids an import cycle between them (which would trip Vitest's module
 * transformer); `provideMcpUi` re-exports it so the public import path stays
 * stable. `MCP_SERVER_URL` joins this module when `provideMcpUi` / `mcpAsset`
 * land.
 */

/**
 * DI token carrying the resolved host {@link Adaptor} (apps-sdk vs mcp-app).
 *
 * THE RULE: every downstream `inject*` wrapper resolves the adaptor through this
 * token — nothing outside the `provideMcpUi` factory calls `getAdaptor()`. That
 * single indirection is what lets a testing/Storybook provider swap the host
 * with a pure provider override.
 */
export const MCP_ADAPTOR = new InjectionToken<Adaptor>("MCP_ADAPTOR");
