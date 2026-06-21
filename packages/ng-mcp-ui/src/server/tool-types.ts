import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  AnySchema,
  SchemaOutput,
  ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type {
  RequestMeta,
  ServerNotification,
  ServerRequest,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  HandlerContent,
  SecurityScheme,
  ToolDef,
  ToolMeta,
  ViewConfig,
} from "./types.js";

/** @internal Flatten an intersection/mapped type into a single object literal for readable hovers. */
export type Simplify<T> = { [K in keyof T]: T[K] };

/**
 * @internal
 * Infer a tool handler's `args` object from its input raw shape.
 *
 * Unlike the SDK's `ShapeOutput` (which maps every key as required), this
 * splits the shape so a field whose schema accepts `undefined` (e.g. a Zod
 * `.optional()`) becomes an **optional** property (`key?:`) — matching how the
 * handler is actually called.
 */
export type ShapeOutput<Shape extends ZodRawShapeCompat> = Simplify<
  {
    [K in keyof Shape as undefined extends SchemaOutput<Shape[K]>
      ? never
      : K]: SchemaOutput<Shape[K]>;
  } & {
    [K in keyof Shape as undefined extends SchemaOutput<Shape[K]>
      ? K
      : never]?: SchemaOutput<Shape[K]>;
  }
>;

/**
 * @internal
 * Pull a handler return's `structuredContent` shape, or `never` if no return
 * member declares it. Distributes over unions and tests key *presence* (rather
 * than `T extends { structuredContent: infer SC }`, which only matches a
 * **required** property), so an optional `structuredContent?:` and conditional
 * (`A | B`) returns are handled — each member that carries the key contributes
 * its shape, with `undefined` stripped.
 */
export type ExtractStructuredContent<T> = T extends unknown
  ? "structuredContent" extends keyof T
    ? Simplify<Exclude<T["structuredContent"], undefined>>
    : never
  : never;

/** @internal Per-union-member `_meta` shape, or `never` for members without it. */
type MetaOf<T> = T extends unknown
  ? "_meta" extends keyof T
    ? Exclude<T["_meta"], undefined>
    : never
  : never;

/**
 * @internal
 * Pull a handler return's `_meta` shape, or `unknown` if no return member
 * declares it. Like {@link ExtractStructuredContent}, it tests key presence so
 * an optional `_meta?:` and union returns are handled.
 */
export type ExtractMeta<T> = [MetaOf<T>] extends [never]
  ? unknown
  : Simplify<MetaOf<T>>;

/**
 * @internal
 * Extend a tool registry with one newly-registered tool. This is the
 * type-level accumulation that lets `typeof server` carry every tool's
 * input/output/meta shape; the `McpServer` class (S04f) wraps it as
 * `AddTool<…> = McpServer<ExtendToolRegistry<…>>`.
 */
export type ExtendToolRegistry<
  TTools,
  TName extends string,
  TInput extends ZodRawShapeCompat,
  TOutput,
  TResponseMetadata = unknown,
> = TTools & {
  [K in TName]: ToolDef<ShapeOutput<TInput>, TOutput, TResponseMetadata>;
};

/**
 * Describes a tool to register: its name, schemas, optional {@link ViewConfig},
 * declared auth schemes, and `_meta`. Passed to `registerTool` alongside the
 * handler.
 */
export interface ToolConfig<TInput extends ZodRawShapeCompat | AnySchema> {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: TInput;
  outputSchema?: ZodRawShapeCompat | AnySchema;
  annotations?: ToolAnnotations;
  view?: ViewConfig;
  /**
   * Declares which auth schemes this tool supports (e.g. `noauth`, `oauth2`).
   * Lets clients label tools that require sign-in before calling, and pass
   * the right scopes through the OAuth flow. Listing both `noauth` and
   * `oauth2` signals that the tool works for anonymous callers and gives
   * enhanced behavior to authenticated ones.
   */
  securitySchemes?: SecurityScheme[];
  _meta?: ToolMeta;
}

/**
 * Optional client-supplied hints attached to `params._meta` on every tool call
 * by the Apps SDK host. Hints only: never use for authorization, and tolerate
 * absence.
 * @see https://developers.openai.com/apps-sdk/reference#_meta-fields-the-client-provides
 */
export interface ClientHintsMeta {
  /** Requested locale (BCP-47, e.g. `"en-US"`). */
  "openai/locale"?: string;
  /** Browser user-agent */
  "openai/userAgent"?: string;
  /** Coarse user location. May be partially populated. */
  "openai/userLocation"?: {
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
    longitude?: number;
    latitude?: number;
  };
  /** Anonymized user id. */
  "openai/subject"?: string;
  /** Anonymized conversation id, stable within a ChatGPT session. */
  "openai/session"?: string;
  /** Anonymized organization id, when the user account is part of an organization. */
  "openai/organization"?: string;
  /** Stable id for the currently mounted widget instance. */
  "openai/widgetSessionId"?: string;
}

/**
 * @internal
 * The `extra` argument passed to a tool handler: the SDK's request extra with
 * `_meta` widened to also carry the Apps SDK {@link ClientHintsMeta}.
 */
export type ToolHandlerExtra = Omit<
  RequestHandlerExtra<ServerRequest, ServerNotification>,
  "_meta"
> & {
  _meta?: RequestMeta & ClientHintsMeta;
};

/**
 * A tool handler: receives the parsed input `args` (per {@link ShapeOutput})
 * and the {@link ToolHandlerExtra}, and returns the tool result (sync or async).
 */
export type ToolHandler<
  TInput extends ZodRawShapeCompat,
  TReturn extends { content?: HandlerContent } = { content?: HandlerContent },
> = (
  args: ShapeOutput<TInput>,
  extra: ToolHandlerExtra,
) => TReturn | Promise<TReturn>;
