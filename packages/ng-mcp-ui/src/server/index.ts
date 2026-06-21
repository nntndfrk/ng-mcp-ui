// Public entry point for `ng-mcp-ui/server` — the MCP server library.
// Pure-TS foundation: content helpers, the FileRef schema, and the tool/type
// inference machinery (the `typeof server` -> typed-view chain), the `McpServer`
// core (S04), and the mountable express router + auth helpers (S05). The real
// Angular shell + index.html manifest parser and asset router land in S06.
export {
  type AuthInfo,
  type AuthMetadataOptions,
  type BearerAuthMiddlewareOptions,
  InvalidTokenError,
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
  createMcpExpressRouter,
  type CreateMcpExpressRouterOptions,
} from "./express.js";
export { FileRef } from "./file-ref.js";
export type {
  McpExtra,
  McpExtraFor,
  McpMethodString,
  McpMiddlewareFilter,
  McpMiddlewareFn,
  McpResultFor,
  McpTypedMiddlewareFn,
  McpWildcard,
} from "./middleware.js";
export { normalizeContent } from "./normalize-content.js";
export { McpServer, type McpServerExtraOptions } from "./server.js";
export type { ShellRenderer, ShellRenderInput } from "./shell-renderer.js";
export { AngularShellRenderer, type ShellMode } from "./shell-templates.js";
export type {
  ClientHintsMeta,
  ToolConfig,
  ToolHandler,
} from "./tool-types.js";
export { InMemoryViewManifest, type ViewManifest } from "./view-manifest.js";
export type {
  AnyToolRegistry,
  InferTools,
  ToolInput,
  ToolNames,
  ToolOutput,
  ToolResponseMetadata,
} from "./inferUtilityTypes.js";
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
export { NG_MCP_UI_VERSION } from "../version.js";
