import { describe, expect, it } from "vitest";
import type { Adaptor, HostContextStore } from "../bridges/types.js";
import {
  VIEW_CONTEXT_KEY,
  filterViewContext,
  injectViewContext,
} from "./state.js";

/**
 * Build a fake {@link Adaptor} whose `viewState` store returns `snapshot`.
 * Only `getHostContextStore("viewState")` is exercised by injectViewContext.
 */
function adaptorWithViewState(
  snapshot: Record<string, unknown> | null,
): Adaptor {
  const store: HostContextStore<"viewState"> = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  };
  return {
    getHostContextStore: ((key: string) => {
      if (key === "viewState") {
        return store;
      }
      throw new Error(`unexpected key ${key}`);
    }) as Adaptor["getHostContextStore"],
  } as Adaptor;
}

describe("state helpers", () => {
  describe("filterViewContext", () => {
    it("returns null when state is null", () => {
      expect(filterViewContext(null)).toBe(null);
    });

    it("returns null when state is undefined", () => {
      expect(filterViewContext(undefined)).toBe(null);
    });

    it("strips VIEW_CONTEXT_KEY and preserves other properties", () => {
      const stateWithContext = {
        a: 1,
        b: "two",
        c: { nested: true },
        [VIEW_CONTEXT_KEY]: "context",
      };
      expect(filterViewContext(stateWithContext)).toEqual({
        a: 1,
        b: "two",
        c: { nested: true },
      });

      const stateNoContext = { count: 5, name: "test" };
      expect(filterViewContext(stateNoContext)).toEqual(stateNoContext);
    });
  });

  describe("injectViewContext", () => {
    it("returns null when newState is null", () => {
      expect(injectViewContext(adaptorWithViewState(null), null)).toBe(null);
    });

    it("returns newState unchanged when host viewState has no context key", () => {
      const adaptor = adaptorWithViewState({ existing: true });
      const next = { page: 2 };
      expect(injectViewContext(adaptor, next)).toEqual({ page: 2 });
    });

    it("returns newState unchanged when host viewState is null", () => {
      const adaptor = adaptorWithViewState(null);
      const next = { page: 2 };
      expect(injectViewContext(adaptor, next)).toEqual({ page: 2 });
    });

    it("re-attaches the host's VIEW_CONTEXT_KEY onto newState", () => {
      const adaptor = adaptorWithViewState({
        old: true,
        [VIEW_CONTEXT_KEY]: { llm: "payload" },
      });
      const next = { page: 3 };
      expect(injectViewContext(adaptor, next)).toEqual({
        page: 3,
        [VIEW_CONTEXT_KEY]: { llm: "payload" },
      });
    });
  });
});
