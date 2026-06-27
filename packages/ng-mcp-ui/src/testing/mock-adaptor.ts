import type {
  Adaptor,
  AnyViewToolHandler,
  CallToolArgs,
  CallToolResponse,
  DownloadParams,
  DownloadResult,
  FileMetadata,
  HostContext,
  HostContextStore,
  OpenExternalOptions,
  RequestDisplayMode,
  RequestModalOptions,
  RequestSizeOptions,
  SendFollowUpMessageOptions,
  SetViewStateAction,
  UploadFileOptions,
  ViewToolConfig,
} from "../web/bridges/types.js";

/**
 * Default host-context snapshot used to seed a {@link MockAdaptor}. Every
 * {@link HostContext} key has a benign value so the signal wrappers
 * (`injectToolInfo`, `injectLayout`, …) always read something sensible before
 * a test pushes its own. Mirrors the defaults in `web/test-fakes.ts` so the
 * mock and the inline fakes stay in sync.
 */
const DEFAULT_HOST_CONTEXT: { [K in keyof HostContext]: HostContext[K] } = {
  theme: "light",
  locale: "en-US",
  displayMode: "inline",
  safeArea: { insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  maxHeight: undefined,
  userAgent: {
    device: { type: "desktop" },
    capabilities: { hover: true, touch: false },
  },
  toolInput: null,
  toolOutput: null,
  toolResponseMetadata: null,
  display: { mode: "inline" },
  viewState: null,
};

/** Keys of {@link HostContext}, enumerated so each gets its own backing store. */
const HOST_CONTEXT_KEYS = [
  "theme",
  "locale",
  "displayMode",
  "safeArea",
  "maxHeight",
  "userAgent",
  "toolInput",
  "toolOutput",
  "toolResponseMetadata",
  "display",
  "viewState",
] as const satisfies readonly (keyof HostContext)[];

/**
 * A record of one entry in a {@link MockAdaptor}'s call log: the method name
 * and the arguments it was invoked with. Tests assert against this to prove a
 * wrapper forwarded to the adaptor.
 */
export type MockAdaptorCall = {
  /** An {@link Adaptor} method name, or `"registerViewTool:dispose"` for a teardown call. */
  method: keyof Adaptor | "registerViewTool:dispose";
  args: readonly unknown[];
};

/**
 * Canned response for a single tool, keyed by tool name in
 * {@link MockMcpUiArgs.toolResponses}. Either a full {@link CallToolResponse}
 * (when the test cares about `content` / `isError` / `meta`) or just the
 * `structuredContent` output object (the common case — the rest is filled with
 * benign defaults).
 */
export type MockToolResponse =
  | CallToolResponse
  | NonNullable<CallToolResponse["structuredContent"]>;

/**
 * Arguments for {@link provideMockMcpUi} / {@link MockAdaptor}. Everything is
 * optional: a bare `provideMockMcpUi()` boots a widget against all-default host
 * context with no canned tool responses. Typed against the real
 * {@link HostContext} and {@link CallToolResponse} so stories/tests get the same
 * inference as production code.
 */
export type MockMcpUiArgs = {
  /**
   * Seed values for any subset of {@link HostContext} keys (theme, displayMode,
   * locale, layout via `safeArea`, user via `userAgent`, `viewState`, the tool
   * fields, …). Unset keys fall back to {@link DEFAULT_HOST_CONTEXT}.
   */
  hostContext?: Partial<HostContext>;
  /**
   * Map of tool name → canned response. A `callTool(name, …)` for a listed name
   * resolves with the mapped response; an unlisted name resolves with an empty
   * success response (so wrappers still observe `success`).
   */
  toolResponses?: Record<string, MockToolResponse>;
  /** Value bound to `MCP_SERVER_URL`. Defaults to `""` (matching `provideMcpUi`'s missing-shell default). */
  serverUrl?: string;
};

/** @internal A controllable per-key store satisfying {@link HostContextStore}, plus a `push` to flip its snapshot. */
type MockStore<K extends keyof HostContext> = {
  store: HostContextStore<K>;
  push: (next: HostContext[K]) => void;
};

function createMockStore<K extends keyof HostContext>(
  initial: HostContext[K],
): MockStore<K> {
  let current = initial;
  const listeners = new Set<() => void>();

  const store: HostContextStore<K> = {
    getSnapshot: () => current,
    subscribe: (onStoreChange: () => void) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
  };

  return {
    store,
    push: (next) => {
      current = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/** Type guard: a {@link MockToolResponse} is already a full {@link CallToolResponse}. */
function isFullCallToolResponse(
  value: MockToolResponse,
): value is CallToolResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "content" in value &&
    "structuredContent" in value &&
    "isError" in value
  );
}

/**
 * In-memory {@link Adaptor} implementation for tests and Storybook (M8).
 *
 * Three behaviours cover the whole surface:
 * - **store-backed** — `getHostContextStore(key)` returns a React-style external
 *   store ({@link HostContextStore}) seeded from {@link MockMcpUiArgs.hostContext};
 *   tests flip a key with {@link MockAdaptor.pushHostContext}, firing the store's
 *   subscribers so the corresponding signal wrapper updates.
 * - **toolResponses** — `callTool(name, args)` resolves from the supplied
 *   `toolResponses` map (empty success when the name is absent).
 * - **log-and-resolve** — every other method records the call in
 *   {@link MockAdaptor.calls} and resolves a sensible default (the request-echo
 *   for `requestDisplayMode`, an in-memory view-state mutation for `setViewState`,
 *   a teardown noop for `registerViewTool`, …).
 *
 * Deliberately does **not** call `getAdaptor()` (THE RULE, PLAN §5.3) — it is a
 * standalone object bound to {@link MCP_ADAPTOR} by {@link provideMockMcpUi}.
 */
export class MockAdaptor implements Adaptor {
  /** Every recorded method invocation, in call order. Reset with {@link MockAdaptor.clearCalls}. */
  public readonly calls: MockAdaptorCall[] = [];

  private readonly stores: {
    [K in keyof HostContext]: MockStore<K>;
  };
  private readonly toolResponses: Record<string, MockToolResponse>;
  private viewState: HostContext["viewState"];

  constructor(args: MockMcpUiArgs = {}) {
    const seed = { ...DEFAULT_HOST_CONTEXT, ...args.hostContext };
    this.toolResponses = args.toolResponses ?? {};
    this.viewState = seed.viewState;

    // Build one mock store per key. An indexed write into the mapped type would
    // distribute `key`'s union and reject the assignment (TS2322); we accumulate
    // into an untyped record and cast once at the end (same pattern as
    // host-context.ts#createHostContextSignals). Each entry is created with its
    // own `K`, so every value type is correct by construction.
    const stores: Record<string, MockStore<keyof HostContext>> = {};
    for (const key of HOST_CONTEXT_KEYS) {
      stores[key] = createMockStore(seed[key]) as MockStore<keyof HostContext>;
    }
    this.stores = stores as { [K in keyof HostContext]: MockStore<K> };
  }

  /** @internal Append to the call log. Private methods are not recorded. */
  private record(method: MockAdaptorCall["method"], ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  /** Drop every recorded call. Handy between assertions in a long story/spec. */
  public clearCalls(): void {
    this.calls.length = 0;
  }

  /**
   * Push a new snapshot for a single host-context key, firing that key's store
   * subscribers. This is the test-driving counterpart to a real host push: it
   * flips the matching signal in any `inject*` wrapper subscribed to the key.
   */
  public pushHostContext<K extends keyof HostContext>(
    key: K,
    value: HostContext[K],
  ): void {
    this.stores[key].push(value);
  }

  // ── store-backed ──────────────────────────────────────────────────────────

  public getHostContextStore<K extends keyof HostContext>(
    key: K,
  ): HostContextStore<K> {
    return this.stores[key].store;
  }

  // ── toolResponses ───────────────────────────────────────────────────────

  public callTool = async <
    ToolArgs extends CallToolArgs = null,
    ToolResponse extends CallToolResponse = CallToolResponse,
  >(
    name: string,
    args: ToolArgs,
  ): Promise<ToolResponse> => {
    this.record("callTool", name, args);

    const canned = this.toolResponses[name];
    if (canned !== undefined && isFullCallToolResponse(canned)) {
      return canned as unknown as ToolResponse;
    }
    return {
      content: [],
      // A bare output object is treated as the `structuredContent`; absent
      // entries resolve as an empty success (`{}`), matching a no-op tool.
      structuredContent: (canned ?? {}) as NonNullable<
        CallToolResponse["structuredContent"]
      >,
      isError: false,
      meta: {},
    } as unknown as ToolResponse;
  };

  // ── log-and-resolve ───────────────────────────────────────────────────────

  public requestDisplayMode = async (
    mode: RequestDisplayMode,
  ): Promise<{ mode: RequestDisplayMode }> => {
    this.record("requestDisplayMode", mode);
    // Echo the requested mode back as "applied" — the common host behaviour.
    return { mode };
  };

  public requestClose = async (): Promise<void> => {
    this.record("requestClose");
  };

  public requestSize = async (size: RequestSizeOptions): Promise<void> => {
    this.record("requestSize", size);
  };

  public sendFollowUpMessage = async (
    prompt: string,
    options?: SendFollowUpMessageOptions,
  ): Promise<void> => {
    this.record("sendFollowUpMessage", prompt, options);
  };

  public openExternal(href: string, options?: OpenExternalOptions): void {
    this.record("openExternal", href, options);
  }

  public download = async (params: DownloadParams): Promise<DownloadResult> => {
    this.record("download", params);
    return { isError: false };
  };

  public setViewState = async (
    stateOrUpdater: SetViewStateAction,
  ): Promise<void> => {
    this.record("setViewState", stateOrUpdater);
    const next =
      typeof stateOrUpdater === "function"
        ? stateOrUpdater(this.viewState)
        : stateOrUpdater;
    // Mirror the real adaptor: update the in-memory state and notify the
    // `viewState` store so a subscribed signal reflects the write.
    this.viewState = next;
    this.stores.viewState.push(next);
  };

  public uploadFile = async (
    file: File,
    options?: UploadFileOptions,
  ): Promise<FileMetadata> => {
    this.record("uploadFile", file, options);
    return { fileId: `mock-file-${file.name}`, fileName: file.name };
  };

  public getFileDownloadUrl = async (
    file: FileMetadata,
  ): Promise<{ downloadUrl: string }> => {
    this.record("getFileDownloadUrl", file);
    return { downloadUrl: `mock://download/${file.fileId}` };
  };

  public selectFiles = async (): Promise<FileMetadata[]> => {
    this.record("selectFiles");
    return [];
  };

  public openModal(options: RequestModalOptions): void {
    this.record("openModal", options);
    // Reflect the modal request on the `display` store, as the real mcp-app
    // adaptor does, so an `injectRequestModal` consumer observes the change.
    this.stores.display.push({ mode: "modal", params: options.params });
  }

  public setOpenInAppUrl = async (href: string): Promise<void> => {
    this.record("setOpenInAppUrl", href);
  };

  public registerViewTool = (
    config: ViewToolConfig,
    handler: AnyViewToolHandler,
  ): (() => void) => {
    this.record("registerViewTool", config, handler);
    // Return a teardown noop, recorded too so a test can assert it ran.
    return () => {
      this.record("registerViewTool:dispose", config.name);
    };
  };
}
