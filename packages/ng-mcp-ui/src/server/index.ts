// Public entry point for `ng-mcp-ui/server` — the MCP server library.
// Pure-TS foundation: content helpers, the FileRef schema, and the tool/type
// inference machinery (the `typeof server` -> typed-view chain), plus the
// `McpServer` core (S04). The mountable express router, Angular shell + manifest
// parser, and asset router land in the later server-track steps.
export {
  audio,
  embeddedResource,
  image,
  resourceLink,
  text,
} from "./content-helpers.js";
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
