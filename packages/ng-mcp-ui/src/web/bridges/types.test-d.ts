import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type {
  Adaptor,
  AnyViewToolHandler,
  HostContext,
  HostContextStore,
  InferViewToolArgs,
  ViewToolConfig,
  ViewToolHandler,
} from "./types.js";

const shape = {
  required: z.string(),
  optional: z.number().optional(),
};
type Shape = typeof shape;
type Args = InferViewToolArgs<Shape>;

// `OptionalKeys<T>` is the set of keys that may be omitted from `T`. The empty
// probe uses `Record<never, never>` (an empty object type) rather than `{}` —
// Biome bans the latter.
type OptionalKeys<T> = {
  [K in keyof T]-?: Record<never, never> extends Pick<T, K> ? K : never;
}[keyof T];

declare const adaptor: Adaptor;
declare const viewToolConfig: ViewToolConfig;
declare const viewToolHandler: AnyViewToolHandler;

describe("InferViewToolArgs", () => {
  it("maps each schema to its output type (optional schema → `| undefined`)", () => {
    expectTypeOf<Args["required"]>().toEqualTypeOf<string>();
    expectTypeOf<Args["optional"]>().toEqualTypeOf<number | undefined>();
  });

  it("keeps required schema keys required and makes optional keys optional", () => {
    // `optional` may be omitted; `required` may not.
    expectTypeOf<OptionalKeys<Args>>().toEqualTypeOf<"optional">();
  });

  it("infers a ViewToolHandler's args from its inputSchema shape", () => {
    type HandlerArgs = Parameters<ViewToolHandler<{ id: z.ZodString }>>[0];
    expectTypeOf<HandlerArgs["id"]>().toEqualTypeOf<string>();
  });
});

describe("Adaptor surface", () => {
  it("exposes the host-bridge methods used by the inject* wrappers", () => {
    expectTypeOf<Adaptor["callTool"]>().toBeFunction();
    expectTypeOf<Adaptor["getHostContextStore"]>().toBeFunction();
    expectTypeOf<Adaptor["registerViewTool"]>().toBeFunction();
  });

  it("registerViewTool returns an unsubscribe thunk", () => {
    expectTypeOf(
      adaptor.registerViewTool(viewToolConfig, viewToolHandler),
    ).toEqualTypeOf<() => void>();
  });

  it("getHostContextStore is keyed by HostContext and returns a typed store", () => {
    expectTypeOf(adaptor.getHostContextStore("theme")).toEqualTypeOf<
      HostContextStore<"theme">
    >();
    // The snapshot type tracks the requested HostContext key.
    expectTypeOf(
      adaptor.getHostContextStore("theme").getSnapshot(),
    ).toEqualTypeOf<HostContext["theme"]>();
  });
});
