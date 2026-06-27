import {
  DestroyRef,
  Directive,
  ElementRef,
  type OnChanges,
  Renderer2,
  inject,
  input,
} from "@angular/core";
import {
  type DataLlmContent,
  nextId,
  removeNode,
  setNode,
} from "./data-llm-core.js";
import { MCP_ADAPTOR } from "./tokens.js";

// Re-export the framework-free surface so callers can import everything from the
// directive module (and the barrel) in one place. The decorator-free logic +
// its tests live in `data-llm-core.ts` (the root Vitest/esbuild transform cannot
// compile Angular decorators — see that file's header).
export {
  type DataLlmContent,
  type DataLlmNode,
  getLLMDescriptionString,
} from "./data-llm-core.js";
export { VIEW_CONTEXT_KEY } from "./helpers/state.js";

/**
 * Surface in-view content to the LLM so it can reason about what the user is
 * seeing without an extra tool call. Implemented as a plain Angular attribute
 * directive.
 *
 * Each `[dataLlm]` registers its `content` as a node in a tree (see
 * `data-llm-core.ts`). Parent discovery uses Angular DI: a
 * directive injects the nearest *enclosing* `DataLlmDirective`
 * (`inject(DataLlmDirective, { optional: true, skipSelf: true })`) to discover
 * its `parentId`. The flattened tree is serialized as an indented bullet list
 * and persisted on the host's `viewState` under `VIEW_CONTEXT_KEY`; the host
 * then surfaces it to the model on the next turn.
 *
 * Pass `null`/`undefined`/empty for `content` to register only as a structural
 * parent (useful for grouping nested directives).
 *
 * Registration mirrors the source's `useEffect` keyed on `[id, parentId,
 * content]`: {@link ngOnChanges} re-registers whenever the `content` input
 * changes, and {@link DestroyRef} removes the node on teardown (the effect's
 * cleanup return). The directive also writes the resolved content onto the host
 * element as a `data-llm` attribute (PLAN §5.4).
 *
 * Must be used inside a component wired by `provideMcpUi()` so `MCP_ADAPTOR`
 * resolves — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 *
 * @example
 * ```html
 * <div dataLlm="Active filters">
 *   <span dataLlm="Sort: name"></span>
 *   <span dataLlm="Page: 2"></span>
 * </div>
 * ```
 */
@Directive({
  selector: "[dataLlm]",
})
export class DataLlmDirective implements OnChanges {
  /** Content surfaced to the model; `null`/empty registers a structural parent. */
  readonly content = input<DataLlmContent | null | undefined>(null, {
    alias: "dataLlm",
  });

  private readonly adaptor = inject(MCP_ADAPTOR);
  // React's `useContext(ParentIdContext)`: the nearest enclosing directive (not
  // self) supplies the parent id; `null` at the tree root.
  private readonly parent = inject(DataLlmDirective, {
    optional: true,
    skipSelf: true,
  });
  // Optional so the directive also instantiates in a bare injector (tests, no
  // DOM platform). In a real view both resolve and the `data-llm` attribute is
  // written; absent them the registration still runs (the attribute is cosmetic).
  private readonly host = inject(ElementRef, { optional: true });
  private readonly renderer = inject(Renderer2, { optional: true });

  /** Stable per-instance id (React's `useId`), also exposed to child directives. */
  readonly id = nextId();

  constructor() {
    // Mirror the source effect's cleanup (`return () => removeNode(id)`): drop
    // this node from the shared registry and re-serialize on teardown.
    inject(DestroyRef).onDestroy(() => {
      removeNode(this.adaptor, this.id);
    });
  }

  /** Parent node id for child directives (the React `ParentIdContext` value). */
  get parentId(): string | null {
    return this.parent?.id ?? null;
  }

  /**
   * Re-register on every `content` change — the Angular analog of the source's
   * `useEffect(..., [id, parentId, content])`. The node is always (re)registered
   * via {@link setNode}: non-empty content registers a content node and writes
   * the `data-llm` attribute; empty/null registers a *structural parent* (a node
   * with `null` content — it emits no line of its own but keeps its children
   * nested in the serialized tree) and clears the attribute.
   *
   * This must stay a `setNode` (not a `removeNode`) for the empty case:
   * `removeNode` would drop the parent from the registry, orphaning any child
   * `[dataLlm]` whose `parentId` points at it (the root traversal would never
   * reach them). Removal is teardown-only — see the `DestroyRef` cleanup above.
   */
  ngOnChanges(): void {
    const content = this.content() ?? null;

    setNode(this.adaptor, { id: this.id, parentId: this.parentId, content });

    if (this.renderer && this.host) {
      if (content) {
        this.renderer.setAttribute(this.host.nativeElement, "data-llm", content);
      } else {
        this.renderer.removeAttribute(this.host.nativeElement, "data-llm");
      }
    }
  }
}
