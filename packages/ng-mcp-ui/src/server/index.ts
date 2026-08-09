// Public entry point for `ng-mcp-ui/server` — the MCP server library (1.x,
// MCP spec 2026-07-28 / TypeScript SDK v2).
// Pure-TS foundation: content helpers, the FileRef schema, the tool/type
// inference machinery (the `typeof server` -> typed-view chain), the
// `McpServer` blueprint, the mountable express router + fetch handler + auth
// helpers, the sealed-state + MRTR surface (`state.ts`), and the Angular
// shell renderer + `index.html` manifest parser + asset router.
//
// Gone in 1.x (see the migration guide): the protocol middleware API
// (`McpExtra*` / `McpMiddleware*` types and `mcpMiddleware()`) and the
// `InvalidTokenError` re-export.

export { NG_MCP_UI_VERSION } from "../version.js";
export {
  type CreateViewAssetRouterOptions,
  createViewAssetRouter,
} from "./asset-router.js";
export {
  type AuthInfo,
  type AuthMetadataOptions,
  type BearerAuthMiddlewareOptions,
  mcpAuthMetadataRouter,
  optionalBearerAuth,
  requireBearerAuth,
} from "./auth.js";
export {
  audio,
  embeddedResource,
  image,
  resourceLink,
  text,
} from "./content-helpers.js";
export {
  type CreateMcpExpressRouterOptions,
  type CreateMcpFetchHandlerOptions,
  createMcpExpressRouter,
  createMcpFetchHandler,
} from "./express.js";
export { FileRef } from "./file-ref.js";
export {
  IndexHtmlViewManifest,
  ViewManifestError,
} from "./index-html-manifest.js";
export type {
  AnyToolRegistry,
  InferTools,
  ToolInput,
  ToolNames,
  ToolOutput,
  ToolResponseMetadata,
} from "./inferUtilityTypes.js";
export { normalizeContent } from "./normalize-content.js";
export { McpServer, type McpServerExtraOptions } from "./server.js";
export type { ShellRenderer, ShellRenderInput } from "./shell-renderer.js";
export { AngularShellRenderer, type ShellMode } from "./shell-templates.js";
export {
  acceptedContent,
  createRequestStateCodec,
  type InputRequest,
  type InputRequests,
  type InputRequiredResult,
  type InputResponses,
  type InputResponseView,
  inputRequired,
  inputResponse,
  type RequestStateCodec,
  SEALED_STATE_INVALID_MESSAGE,
  type SealedState,
  STATE_META_KEY,
  type StateOptions,
} from "./state.js";
export type {
  ClientHintsMeta,
  McpToolContext,
  ToolConfig,
  ToolHandler,
  ToolHandlerResult,
  ToolInputSchema,
} from "./tool-types.js";
export type {
  HandlerContent,
  KnownToolMeta,
  McpServerTypes,
  SecurityScheme,
  ToolDef,
  ToolMeta,
  ViewConfig,
  ViewCsp,
  ViewHostType,
  ViewName,
  ViewNameRegistry,
} from "./types.js";
export { InMemoryViewManifest, type ViewManifest } from "./view-manifest.js";
