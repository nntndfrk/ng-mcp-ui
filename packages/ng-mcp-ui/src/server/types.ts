import type { McpUiToolMeta } from "@modelcontextprotocol/ext-apps";
import type { ContentBlock } from "@modelcontextprotocol/sdk/types.js";

/**
 * Type marker for a registered tool — carries its input, output, and response
 * metadata shapes so views can infer types from `typeof server`.
 *
 * You normally never construct this by hand; it is produced by `registerTool`
 * and consumed by helpers like {@link InferTools} and `generateHelpers`.
 */
export type ToolDef<
  TInput = unknown,
  TOutput = unknown,
  TResponseMetadata = unknown,
> = {
  input: TInput;
  output: TOutput;
  responseMetadata: TResponseMetadata;
};

/** Which host runtime a view targets — `"apps-sdk"` (ChatGPT) or `"mcp-app"` (MCP Apps spec). */
export type ViewHostType = "apps-sdk" | "mcp-app";

/**
 * Content Security Policy origins attached to a view's resource. Each list is
 * passed through to the host's CSP for the view iframe; omit a field to inherit
 * the host's default for that directive.
 */
export interface ViewCsp {
  /** Origins for static assets (images, fonts, scripts, styles). */
  resourceDomains?: string[];
  /** Origins the view may contact via fetch/XHR. */
  connectDomains?: string[];
  /** Origins allowed for iframe embeds (opts into stricter app review). */
  frameDomains?: string[];
  /** Origins that can receive openExternal redirects without the safe-link modal. */
  redirectDomains?: string[];
  /** Origins allowed in `<base href>` tags (mcp-apps only). */
  baseUriDomains?: string[];
}

/**
 * Registry of view component names. The schematic's view generator augments
 * this interface (in a generated `.d.ts`) with one key per view file, which
 * narrows {@link ViewName} from `string` to the concrete union.
 */
// Must be exported: TS module augmentation only merges with exported
// declarations. Without `export`, a generated `views.d.ts` augmentation would
// create a separate interface and `ViewName` would stay `string`.
// biome-ignore lint/suspicious/noEmptyInterface: register pattern — augmented by a generated `views.d.ts` to narrow ViewName
export interface ViewNameRegistry {}

/**
 * Valid view component names. **Defaults to `string`** so {@link ViewConfig} is
 * usable out of the box (before any view typings are generated); a generated
 * `views.d.ts` augmenting {@link ViewNameRegistry} then narrows it to the
 * concrete union of registered views. The `[keyof …] extends [never]` guard is
 * what distinguishes "no augmentations yet" (→ `string`) from an actual union —
 * a bare `keyof ViewNameRegistry & string` would resolve to `never` while the
 * registry is empty, making `component` impossible to set in fresh projects.
 */
export type ViewName = [keyof ViewNameRegistry] extends [never]
  ? string
  : keyof ViewNameRegistry & string;

/**
 * Pass under `view` in a tool's `registerTool` config to render the tool's
 * result through a view instead of a plain text response.
 */
export interface ViewConfig {
  /** Filename of the view module (without extension) — matches a registered view. */
  component: ViewName;
  /** Human-readable label the host may show alongside the view. */
  description?: string;
  /** Restrict where the view is rendered. Defaults to all known hosts. */
  hosts?: ViewHostType[];
  /** Apps SDK only: request a visible border around the widget. */
  prefersBorder?: boolean;
  /** Apps SDK only: override the iframe's served domain (advanced). */
  domain?: string;
  /** Per-view CSP overrides — see {@link ViewCsp}. */
  csp?: ViewCsp;
  /** Free-form metadata forwarded on the view resource's `_meta`. */
  _meta?: Record<string, unknown>;
}

export type SecurityScheme =
  | { type: "noauth" }
  | { type: "oauth2"; scopes?: string[] };

/**
 * Well-known keys recognized by host runtimes when set on a tool's `_meta`.
 * Use {@link ToolMeta} to also pass arbitrary custom metadata alongside these.
 *
 * @see https://developers.openai.com/apps-sdk/reference#tool-descriptor-parameters
 */
export interface KnownToolMeta {
  /** Apps SDK: allow the rendered view to call this tool from inside its iframe. */
  "openai/widgetAccessible"?: boolean;
  /** Apps SDK: status text shown while the tool is running (e.g. `"Searching trips"`). */
  "openai/toolInvocation/invoking"?: string;
  /** Apps SDK: status text shown once the tool returns (e.g. `"Found 3 trips"`). */
  "openai/toolInvocation/invoked"?: string;
  /** Apps SDK: input parameters that hold file references — the host attaches uploaded files to them. */
  "openai/fileParams"?: string[];
  /** MCP Apps: control whether the tool is exposed to the model, the app, or both. */
  ui?: Pick<McpUiToolMeta, "visibility">;
  securitySchemes?: SecurityScheme[];
}

/** {@link KnownToolMeta} merged with arbitrary string-keyed metadata for custom flags. */
export type ToolMeta = KnownToolMeta & Record<string, unknown>;

/**
 * Convenient return type for tool handlers — a plain string, a single
 * {@link ContentBlock}, or an array. The server normalizes it to the MCP
 * `content: ContentBlock[]` shape before responding.
 */
export type HandlerContent = string | ContentBlock | ContentBlock[];

/**
 * Type-level marker interface for cross-package type inference.
 *
 * Consumers infer tool types via the structural `$types` property rather than
 * the `McpServer` class generic, because class-generic inference breaks when
 * `McpServer` comes from different package installations (e.g. a consumer
 * with its own dep vs. the in-tree workspace version).
 *
 * Inspired by tRPC's `_def` pattern and Hono's type markers.
 */
export interface McpServerTypes<TTools extends Record<string, ToolDef>> {
  readonly tools: TTools;
}
