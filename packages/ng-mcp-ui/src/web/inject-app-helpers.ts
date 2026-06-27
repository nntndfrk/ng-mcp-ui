import type { Signal } from "@angular/core";
import type {
  ToolInput,
  ToolNames,
  ToolOutput,
  ToolResponseMetadata,
} from "../server/index.js";
import type { CallToolResponse } from "./bridges/types.js";
import {
  type CallToolAsyncFn,
  type CallToolFn,
  type CallToolState,
  injectCallTool,
} from "./inject-call-tool.js";
import { type ToolState, injectToolInfo } from "./inject-tool-info.js";

/**
 * Widen `T` to a plain object so it lines up with the web wrappers'
 * `UnknownObject = Record<string, unknown>` constraint. We have no shared
 * `web/types.ts`, so the minimal helpers live here.
 */
type Objectify<T> = T & Record<string, unknown>;

/** Flatten an intersection into a single readable object type. */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * {@link injectCallTool}'s response with `structuredContent` narrowed to
 * `TOutput`. We `Omit` then re-add `structuredContent` rather than intersect:
 * the base `CallToolResponse["structuredContent"]` is a wide index-signature
 * object (it comes from the MCP SDK's `CallToolResult`), so intersecting it
 * with `TOutput` keeps the wide signature and defeats inference. The override
 * replaces it outright with `TOutput`.
 */
type TypedCallToolResponse<TOutput> = Omit<
  CallToolResponse,
  "structuredContent"
> & {
  structuredContent: TOutput;
};

/**
 * Return shape of the typed `injectCallTool`: the call-state signals plus the
 * two callers, all tied to the tool's input/output schemas.
 */
type TypedCallToolReturn<TInput, TOutput> = Prettify<{
  callTool: CallToolFn<TInput, TypedCallToolResponse<TOutput>>;
  callToolAsync: CallToolAsyncFn<TInput, TypedCallToolResponse<TOutput>>;
  // `status` is the same string union for every response shape, so it carries
  // no type parameter (CallToolState defaults to CallToolResponse).
  status: Signal<CallToolState["status"]>;
  data: Signal<TypedCallToolResponse<TOutput> | undefined>;
  error: Signal<unknown>;
}>;

/** Return shape of the typed `injectToolInfo`: {@link ToolState} narrowed to the schemas. */
type TypedToolInfoReturn<TInput, TOutput, TResponseMetadata> = Signal<
  ToolState<
    Objectify<TInput>,
    Objectify<TOutput>,
    Objectify<TResponseMetadata>
  >
>;

/**
 * Creates typed versions of the `inject*` web wrappers with full type inference
 * for tool names, inputs, outputs, and response metadata.
 *
 * This is the recommended way to use the tool wrappers in your views. Set this
 * up once in a dedicated file and export the typed wrappers for use across your
 * app. The returned functions delegate to the real {@link injectCallTool} /
 * {@link injectToolInfo} (so they must still be called from an injection
 * context, e.g. a component constructor, factory, or `runInInjectionContext`) —
 * the only difference is the sharper static types.
 *
 * @typeParam AppType - The type of your `McpServer` instance (use
 *                      `typeof server`). Must be a server built with chained
 *                      `registerTool` calls; TypeScript infers the tool
 *                      registry from its `$types` marker.
 *
 * @example
 * ```ts
 * // src/server.ts
 * const server = new McpServer({ name: "my-app", version: "1.0" }, {})
 *   .registerTool(
 *     {
 *       name: "search-trip",
 *       inputSchema: { destination: z.string() },
 *       outputSchema: { results: z.array(z.string()) },
 *       view: { component: "search-trip" },
 *     },
 *     async ({ destination }) => ({
 *       content: [{ type: "text", text: `Found trips to ${destination}` }],
 *       structuredContent: { results: [] },
 *     }),
 *   );
 *
 * export type AppType = typeof server;
 * ```
 *
 * @example
 * ```ts
 * // src/helpers.ts (one-time setup)
 * import type { AppType } from "./server";
 * import { injectAppHelpers } from "ng-mcp-ui/web";
 *
 * export const { injectCallTool, injectToolInfo } = injectAppHelpers<AppType>();
 * ```
 *
 * @example
 * ```ts
 * // src/views/search.component.ts (usage, inside an injection context)
 * import { injectCallTool, injectToolInfo } from "../helpers";
 *
 * const { callTool, data } = injectCallTool("search-trip");
 * //                                          ^ autocomplete for tool names
 * callTool({ destination: "Spain" });
 * //         ^ autocomplete for input fields
 *
 * const toolInfo = injectToolInfo<"search-trip">();
 * // toolInfo().input is typed from the tool's input schema
 * // toolInfo().output is typed from the tool's output schema
 * ```
 */
export function injectAppHelpers<AppType = never>() {
  return {
    /**
     * Typed version of `injectCallTool` that provides autocomplete for tool
     * names and type inference for inputs and outputs.
     *
     * @param name - The name of the tool to call. Autocompletes based on your
     *               server's tool registry.
     * @returns The `injectCallTool` result with `callTool` / `callToolAsync`
     *          typed to the tool's input and `data().structuredContent` typed
     *          to the tool's output.
     *
     * @example
     * ```ts
     * const { callTool, data } = injectCallTool("search-trip");
     * // callTool expects { destination: string }
     * callTool({ destination: "Spain" });
     *
     * // data()?.structuredContent is typed from the outputSchema
     * const current = data();
     * if (current) {
     *   console.log(current.structuredContent.results);
     * }
     * ```
     */
    injectCallTool: <ToolName extends ToolNames<AppType>>(
      name: ToolName,
    ): TypedCallToolReturn<
      ToolInput<AppType, ToolName>,
      ToolOutput<AppType, ToolName>
    > => {
      return injectCallTool(name) as TypedCallToolReturn<
        ToolInput<AppType, ToolName>,
        ToolOutput<AppType, ToolName>
      >;
    },

    /**
     * Typed version of `injectToolInfo` that provides autocomplete for tool
     * names and type inference for inputs, outputs, and response metadata.
     *
     * @typeParam ToolName - The name of the tool. Autocompletes based on your
     *                       server's tool registry.
     * @returns A `Signal<ToolState>` whose `input` / `output` /
     *          `responseMetadata` are narrowed to the tool's schemas. Use
     *          `isIdle` / `isPending` / `isSuccess` on the read value to narrow.
     *
     * @example
     * ```ts
     * const toolInfo = injectToolInfo<"search-trip">();
     * const state = toolInfo();
     * if (state.isSuccess) {
     *   // `output` / `responseMetadata` are typed here but still nullable:
     *   // success is reached as soon as *either* arrives, so null-guard before
     *   // reading the schema-typed fields.
     *   if (state.output) console.log(state.output.results);
     *   if (state.responseMetadata) console.log(state.responseMetadata);
     * }
     * ```
     */
    injectToolInfo: <
      ToolName extends ToolNames<AppType>,
    >(): TypedToolInfoReturn<
      ToolInput<AppType, ToolName>,
      ToolOutput<AppType, ToolName>,
      ToolResponseMetadata<AppType, ToolName>
    > => {
      return injectToolInfo() as TypedToolInfoReturn<
        ToolInput<AppType, ToolName>,
        ToolOutput<AppType, ToolName>,
        ToolResponseMetadata<AppType, ToolName>
      >;
    },
  };
}
