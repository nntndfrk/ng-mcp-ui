import { afterEach, describe, expect, it } from "vitest";
import type { Adaptor } from "./bridges/types.js";
import {
  nextId,
  removeNode,
  resetNodesForTest,
  setNode,
} from "./data-llm-core.js";
import { VIEW_CONTEXT_KEY } from "./helpers/state.js";
import { createFakeAdaptor, spy } from "./test-fakes.js";

/**
 * The directive shell (`data-llm.ts`) is a thin wrapper over these functions but
 * carries an Angular `@Directive` decorator, which the root Vitest/esbuild
 * transform cannot compile (the project keeps all tested code decorator-free —
 * see `data-llm-core.ts`). These tests therefore exercise the framework-free
 * core directly: `setNode`/`removeNode` register/unregister, and the resulting
 * `adaptor.setViewState` payload carries the serialized tree under
 * `VIEW_CONTEXT_KEY` — the behavior the directive delegates to verbatim.
 */
function makeAdaptor(): {
  adaptor: Adaptor;
  setViewState: ReturnType<typeof spy>;
  lastContext: () => string | undefined;
} {
  const setViewState = spy(() => Promise.resolve());
  const adaptor = createFakeAdaptor({
    methods: {
      setViewState: setViewState as unknown as Adaptor["setViewState"],
    },
  });
  // The core always passes the updater form; resolve it against `null` prev to
  // read the serialized view-context string the host would persist.
  const lastContext = (): string | undefined => {
    const calls = setViewState.calls;
    if (calls.length === 0) {
      return undefined;
    }
    const updater = calls[calls.length - 1]?.[0] as (
      prev: unknown,
    ) => Record<string, unknown>;
    return updater(null)[VIEW_CONTEXT_KEY] as string;
  };
  return { adaptor, setViewState, lastContext };
}

afterEach(() => {
  // The `nodes` registry is module-global singleton state: clear it so each
  // test sees an empty tree.
  resetNodesForTest();
});

describe("data-llm core", () => {
  it("registers a node and persists the serialized tree via setViewState", () => {
    const { adaptor, setViewState, lastContext } = makeAdaptor();
    setNode(adaptor, { id: "a", parentId: null, content: "Test content" });

    expect(setViewState.callCount()).toBe(1);
    expect(lastContext()).toBe("- Test content");
  });

  it("serializes a nested tree as an indented bullet list", () => {
    const { adaptor, lastContext } = makeAdaptor();
    setNode(adaptor, { id: "1", parentId: null, content: "Level 1" });
    setNode(adaptor, { id: "2", parentId: "1", content: "Level 2A" });
    setNode(adaptor, { id: "3", parentId: "1", content: "Level 2B" });
    setNode(adaptor, { id: "4", parentId: "3", content: "Level 3" });

    const ctx = lastContext() ?? "";
    expect(ctx).toContain("- Level 1");
    expect(ctx).toContain("  - Level 2A");
    expect(ctx).toContain("  - Level 2B");
    expect(ctx).toContain("    - Level 3");
  });

  it("treats null content as a structural parent (no own line, children nest)", () => {
    const { adaptor, lastContext } = makeAdaptor();
    setNode(adaptor, { id: "g", parentId: null, content: null });
    setNode(adaptor, { id: "a", parentId: "g", content: "Child A" });
    setNode(adaptor, { id: "b", parentId: "g", content: "Child B" });

    const ctx = lastContext() ?? "";
    // The structural parent emits no bullet of its own...
    expect(ctx).not.toMatch(/^\s*- $/m);
    // ...and its children render one level in (depth 1 under the empty root).
    expect(ctx).toBe("  - Child A\n  - Child B");
  });

  it("re-registering a parent with null content keeps children reachable (not orphaned)", () => {
    // Locks the DataLlmDirective contract: when `[dataLlm]` content goes empty
    // the directive must `setNode` a structural parent (null content), NOT
    // `removeNode`. Removing the parent drops it from the registry, so the root
    // traversal can never reach children keyed to its id — they silently vanish
    // from the serialized tree. This asserts the *correct* path; the next test
    // documents the orphaning that `removeNode` would cause.
    const { adaptor, lastContext } = makeAdaptor();
    setNode(adaptor, { id: "p", parentId: null, content: "Parent" });
    setNode(adaptor, { id: "c", parentId: "p", content: "Child" });
    expect(lastContext()).toBe("- Parent\n  - Child");

    // Parent content cleared → re-register as a structural parent (the path the
    // directive's ngOnChanges now takes), children still nest.
    setNode(adaptor, { id: "p", parentId: null, content: null });
    expect(lastContext()).toBe("  - Child");
  });

  it("removeNode on a parent orphans its children (why empty content must not removeNode)", () => {
    const { adaptor, lastContext } = makeAdaptor();
    setNode(adaptor, { id: "p", parentId: null, content: "Parent" });
    setNode(adaptor, { id: "c", parentId: "p", content: "Child" });
    expect(lastContext()).toBe("- Parent\n  - Child");

    // Removing the parent (teardown semantics) drops it from the registry; the
    // child's parentId now points at a missing node, so it is unreachable from
    // the root traversal and disappears from the output. The directive reserves
    // removeNode for DestroyRef teardown precisely because of this.
    removeNode(adaptor, "p");
    expect(lastContext()).toBe("");
  });

  it("orders siblings by id within a parent", () => {
    const { adaptor, lastContext } = makeAdaptor();
    setNode(adaptor, { id: "z", parentId: null, content: "Zeta" });
    setNode(adaptor, { id: "a", parentId: null, content: "Alpha" });

    expect(lastContext()).toBe("- Alpha\n- Zeta");
  });

  it("re-registers (replaces) when the same id reports new content", () => {
    const { adaptor, lastContext } = makeAdaptor();
    setNode(adaptor, { id: "x", parentId: null, content: "Initial" });
    expect(lastContext()).toBe("- Initial");

    setNode(adaptor, { id: "x", parentId: null, content: "Updated" });
    expect(lastContext()).toBe("- Updated");
  });

  it("removeNode drops the node and re-serializes (effect cleanup)", () => {
    const { adaptor, lastContext } = makeAdaptor();
    setNode(adaptor, { id: "x", parentId: null, content: "Content to remove" });
    expect(lastContext()).toBe("- Content to remove");

    removeNode(adaptor, "x");
    expect(lastContext()).toBe("");
  });

  it("shares one registry across multiple nodes", () => {
    const { adaptor, lastContext } = makeAdaptor();
    setNode(adaptor, { id: "1", parentId: null, content: "First" });
    setNode(adaptor, { id: "2", parentId: null, content: "Second" });

    const ctx = lastContext() ?? "";
    expect(ctx).toContain("- First");
    expect(ctx).toContain("- Second");
  });

  it("nextId returns process-unique ids", () => {
    expect(nextId()).not.toBe(nextId());
  });
});
