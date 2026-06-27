import type { Adaptor } from "./bridges/types.js";
import { VIEW_CONTEXT_KEY } from "./helpers/state.js";

/**
 * Framework-free core of the `data-llm` channel: the module-global `nodes`
 * registry, `setNode`/`removeNode`/`onChange`, and the tree serializer
 * `getLLMDescriptionString`.
 *
 * It lives in its own (decorator-free) module so it can be unit-tested under the
 * root Vitest/esbuild transform, which cannot compile Angular decorators (the
 * same constraint that keeps `mcp-modal.ts` function-based). {@link DataLlmDirective}
 * (in `data-llm.ts`) is the thin decorated Angular shell over this core.
 *
 * Every function here takes the resolved {@link Adaptor} explicitly — the
 * directive injects `MCP_ADAPTOR` and passes it down (THE RULE, PLAN §5.3;
 * nothing here calls `getAdaptor()`).
 */

/** Text content surfaced to the model by a `[dataLlm]` directive. */
export type DataLlmContent = string;

/**
 * A node in the data-llm tree. Nested `[dataLlm]` directives form a hierarchy
 * serialized as an indented bullet list for the model.
 */
export interface DataLlmNode {
  id: string;
  parentId: string | null;
  content: string | null;
}

/**
 * Shared singleton registry of every mounted node, keyed by id. Module-global so
 * that sibling/cousin directives across the whole view contribute to one
 * flattened tree.
 * {@link resetNodesForTest} clears it between tests.
 */
const nodes = new Map<string, DataLlmNode>();

/**
 * Test-only: clear the module-global {@link nodes} registry. The registry is
 * process-global singleton state, so suites that exercise
 * the core must reset it in `afterEach` to stay isolated. The `ForTest` suffix
 * flags its non-production intent at the call site.
 */
export function resetNodesForTest(): void {
  nodes.clear();
}

/** Register/replace a node, then re-serialize and persist via the adaptor. */
export function setNode(adaptor: Adaptor, node: DataLlmNode): void {
  nodes.set(node.id, node);
  onChange(adaptor);
}

/** Remove a node, then re-serialize and persist via the adaptor. */
export function removeNode(adaptor: Adaptor, id: string): void {
  nodes.delete(id);
  onChange(adaptor);
}

/**
 * Persist the freshly serialized tree onto the host's `viewState` under
 * {@link VIEW_CONTEXT_KEY}. The adaptor is passed in, not fetched via
 * `getAdaptor()`.
 */
function onChange(adaptor: Adaptor): void {
  const description = getLLMDescriptionString();
  adaptor.setViewState((prevState) => ({
    ...prevState,
    [VIEW_CONTEXT_KEY]: description,
  }));
}

/**
 * Serialize the flattened {@link nodes} registry into an indented bullet list,
 * ordered by id within each parent. Nodes with empty/whitespace `content` emit
 * no line but still nest their children (structural parents).
 */
export function getLLMDescriptionString(): string {
  const byParent = new Map<string | null, DataLlmNode[]>();
  for (const node of Array.from(nodes.values())) {
    const key = node.parentId ?? null;
    if (!byParent.has(key)) {
      byParent.set(key, []);
    }
    byParent.get(key)?.push(node);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => a.id.localeCompare(b.id));
  }

  const lines: string[] = [];

  function traverseTree(parentId: string | null, depth: number): void {
    const children = byParent.get(parentId);
    if (!children) {
      return;
    }

    for (const child of children) {
      if (child.content?.trim()) {
        const indent = "  ".repeat(depth);
        lines.push(`${indent}- ${child.content.trim()}`);
      }
      traverseTree(child.id, depth + 1);
    }
  }

  traverseTree(null, 0);

  return lines.join("\n");
}

/** Monotonic counter backing {@link nextId} — the Angular analog of React's `useId`. */
let idCounter = 0;

/** Generate a process-unique node id. Replaces React's `useId()`. */
export function nextId(): string {
  idCounter += 1;
  return `data-llm-${idCounter}`;
}
