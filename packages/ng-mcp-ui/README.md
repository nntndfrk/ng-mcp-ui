# ng-mcp-ui

Angular library that retrofits Angular apps with **MCP interactive UI views** —
MCP servers whose tools render **interactive Angular widgets** inside Claude,
ChatGPT, and other [MCP-Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
hosts (Angular **v20–v22**).

> ### Status: v0.1.0 — first npm release
> The public API surface (`server` / `web` / `testing` / `tunnel` + the
> schematics) is **complete and CI-green across Angular v20, v21, and v22** (a
> cross-major fixture matrix builds a real retrofit app, AOT-builds the widget
> bundle + SSR host, and probes `/mcp` on every push). Real-host validation is
> **signed off**: render is machine-verified on Claude — the poll widget renders
> in the host iframe, typed tool data arrives, and display-mode works — and the
> interactive vote/tally rows plus ChatGPT parity are human-confirmed (see
> [`LIVE-HOST-VALIDATION.md`](https://github.com/nntndfrk/ng-mcp-ui/blob/main/LIVE-HOST-VALIDATION.md)).

## What it does

You have an Angular app. You want its features to show up as **interactive
widgets inside an AI chat** — a poll the user can vote on, a chart, a form —
served from your own app and driven by your own tools. `ng-mcp-ui` mounts an
[MCP](https://modelcontextprotocol.io) server into your app's Angular SSR
`server.ts`, ships client-bootstrapped Angular widgets that hydrate from
host-pushed tool data, and gives you a signal-based, zoneless-friendly view API
that is identical across hosts.

## Subpath exports

| Import | Purpose |
| --- | --- |
| `ng-mcp-ui/server` | Framework-neutral MCP server: `McpServer`, the mountable Express router, content/`FileRef` helpers, view-resource shells, auth |
| `ng-mcp-ui/web` | Angular host bridge: `provideMcpUi`, `bootstrapWidget`, the `inject*` signal API, the `[dataLlm]` directive + `mcpAsset` pipe |
| `ng-mcp-ui/testing` | `MockAdaptor` + `provideMockMcpUi` test/Storybook harness |
| `ng-mcp-ui/tunnel` | `cloudflared` dev-tunnel marker (live surface lands in the tunnel track) |

The package also ships the Angular **schematics** (`ng-add`, `view`, `tool`,
`example`), embedded under `dist/schematics/` at pack time.

## Getting started

### Install

```bash
npm i ng-mcp-ui
```

The fastest path is `ng add` (next section), which installs the package and
retrofits your app in one step.

### Retrofit an app

Run `ng add` against an existing Angular app — it installs the package, ensures
SSR, mounts the MCP server before the SSR catch-all, adds a widgets build target,
and (by default) scaffolds the runnable Quick Poll demo:

```bash
ng add ng-mcp-ui --example=demo
```

> Already installed? The same schematic runs via
> `ng generate ng-mcp-ui:ng-add --example=demo`.

See the [schematics README](https://github.com/nntndfrk/ng-mcp-ui/blob/main/packages/schematics/README.md)
for the full generator + options reference.

## `web` API reference

All of the following come from `ng-mcp-ui/web`. Every `inject*` function must be
called from an Angular **injection context**; each resolves the host adaptor from
the `MCP_ADAPTOR` DI token (provided by `provideMcpUi()`), so widget code is
identical across Claude / ChatGPT / MCP-Apps hosts.

### Setup

| Symbol | Signature | Purpose |
| --- | --- | --- |
| `provideMcpUi` | `(): EnvironmentProviders` | Zoneless change detection + the two host-derived tokens (`MCP_SERVER_URL`, `MCP_ADAPTOR`) + the mcp-app modal service. |
| `bootstrapWidget` | `(component: Type<unknown>, providers?: Array<Provider \| EnvironmentProviders>): Promise<ApplicationRef>` | Boots a standalone widget into the host shell's `#root` with `provideMcpUi()` applied first. |
| `MCP_ADAPTOR` / `MCP_SERVER_URL` | `InjectionToken<…>` | The host bridge + server-origin tokens; provide `MCP_ADAPTOR` yourself to use a custom/mock adaptor. |

### Reading host + tool state (signal-returning)

| Symbol | Signature | Purpose |
| --- | --- | --- |
| `injectToolInfo` | `<…>(): Signal<ToolState<…>>` | The rendering tool's input/output/metadata as an idle/pending/success state signal. |
| `injectLayout` | `(): Signal<LayoutState>` | Host theme, display mode, safe-area insets, max height. |
| `injectUser` | `(): Signal<UserState>` | The host-provided user info, when available. |
| `injectViewState` | `<T>(default?): InjectViewStateResult<T>` | `{ value, set }` over the host's persisted, bidirectionally-synced view state. |
| `injectViewStore` | `<…>(options?): InjectViewStore<…>` | Store-style view state: `state` signal + `set`/`update`/`patch`/`select`/`flush` (debounced host writes, conflict guard). |
| `injectDisplayMode` | `(): InjectDisplayModeResult` | `{ displayMode, setDisplayMode }` — read + request `inline` / `fullscreen` / `pip`. |
| `injectFiles` | `(): InjectFilesResult` | Host-shared files as a signal. |
| `injectHostContext` | `(): HostContextSignals` | Low-level: a readonly signal per raw host-context key. |

### Calling the server + driving the host (callable)

| Symbol | Signature | Purpose |
| --- | --- | --- |
| `injectCallTool` | `<Args, Resp>(name: string): InjectCallToolResult<…>` | `{ callTool, callToolAsync, status, data, error }` to invoke a server tool from the view and track its lifecycle. |
| `injectSendFollowUpMessage` | `(): SendFollowUpMessageFn` | Send a follow-up prompt into the conversation. |
| `injectOpenExternal` | `(): OpenExternalFn` | Ask the host to open an external URL. |
| `injectRequestModal` | `(): InjectRequestModalResult` | Request a host modal (mcp-app). |
| `injectRequestSize` | `(): RequestSizeFn` | Request a new iframe size. |
| `injectRequestClose` | `(): RequestCloseFn` | Ask the host to close the view. |
| `injectDownload` | `(): DownloadFn` | Trigger a host-mediated download. |
| `injectSetOpenInAppUrl` | `(): SetOpenInAppUrlFn` | Set the "open in app" deep link. |
| `injectRegisterViewTool` | `(): RegisterViewToolHandle` | Register a view-scoped tool with the host. |
| `injectAppHelpers` | `<AppType = never>()` — call as `injectAppHelpers<typeof server>()` | Typed sugar: tool-name-narrowed `injectCallTool` / `injectToolInfo`, inferred from the server's `$types` registry. |

### Declarables

| Symbol | Use | Purpose |
| --- | --- | --- |
| `DataLlmDirective` | `[dataLlm]="content"` | Surfaces in-view content to the model (persisted on the host's `viewState`) so the LLM can read it — no extra tool call. |
| `McpAssetPipe` | `path \| mcpAsset` | Rewrites a relative asset path to an absolute URL on the MCP server origin, fixing the cross-origin asset hazard inside the host iframe. |

The mcp-app modal surface (`provideMcpModal`, `createMcpModal`, `MCP_MODAL`,
`MCP_MODAL_ENABLED`, `McpModal`) is also exported for advanced callers.

### Example widget

A standalone, zoneless, OnPush widget (this is the shape the `example` schematic
generates):

```ts
import { ChangeDetectionStrategy, Component, computed } from "@angular/core";
import {
  DataLlmDirective,
  injectCallTool,
  injectLayout,
  injectToolInfo,
  injectViewState,
} from "ng-mcp-ui/web";

type PollSnapshot = {
  pollId: string;
  question: string;
  options: string[];
  tally: { option: string; count: number }[];
  total: number;
};

@Component({
  selector: "poll-widget",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataLlmDirective],
  template: `
    @let p = poll();
    @if (p) {
      <h1>{{ p.question }}</h1>
      @for (o of p.options; track o) {
        <button (click)="vote(p.pollId, o)" [class.voted]="myVote() === o">
          {{ o }}
        </button>
      }
      <!-- the model learns what the user voted, no extra tool call -->
      <p [dataLlm]="voteSummary()"></p>
    }
  `,
})
export default class PollWidget {
  // the tool that rendered this view: typed input/output as a state signal
  private readonly tool = injectToolInfo<{
    input: { question?: string; options?: string[] };
    output: PollSnapshot;
  }>();

  // view → server: call a tool and track its lifecycle
  private readonly castVote = injectCallTool<
    { pollId: string; option: string },
    { structuredContent: PollSnapshot }
  >("cast_vote");

  // persisted, host-synced view state (survives reopen)
  private readonly viewState = injectViewState<{ myVote: string | null }>({
    myVote: null,
  });
  private readonly layout = injectLayout();

  protected readonly poll = computed(() => {
    const s = this.tool();
    return s.isSuccess ? s.output : null;
  });
  protected readonly myVote = computed(() => this.viewState.value()?.myVote ?? null);
  protected readonly voteSummary = computed(() =>
    this.myVote() ? `User voted: ${this.myVote()}` : "User has not voted yet.",
  );

  protected vote(pollId: string, option: string): void {
    this.castVote.callTool(
      { pollId, option },
      { onSuccess: () => this.viewState.set({ myVote: option }) },
    );
  }
}
```

The host shell boots it with `bootstrapWidget`:

```ts
import { bootstrapWidget } from "ng-mcp-ui/web";
import PollWidget from "./poll.widget";

bootstrapWidget(PollWidget);
```

## `server` usage

`ng-mcp-ui/server` is framework-neutral (plain TS). Construct an `McpServer`,
chain `registerTool(config, handler)` calls, and mount the Express router into
your SSR `server.ts` **before** the Angular catch-all.

```ts
import { McpServer } from "ng-mcp-ui/server";
import { z } from "zod";

export function createMcpServer(): McpServer {
  return new McpServer({ name: "my-app", version: "1.0.0" }).registerTool(
    {
      name: "create_poll",
      title: "Create poll",
      description: "Create a poll and render it as an interactive view.",
      inputSchema: {
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2),
      },
      outputSchema: {
        pollId: z.string(),
        question: z.string(),
        options: z.array(z.string()),
        tally: z.array(z.object({ option: z.string(), count: z.number() })),
        total: z.number(),
      },
      // a `view` links this tool to the `poll` widget component (one tool per view)
      view: {
        component: "poll",
        description: "Interactive poll: vote, tally, and discuss the results.",
      },
    },
    (args) => ({
      content: `Created poll "${args.question}".`,
      structuredContent: {
        pollId: "poll-1",
        question: args.question,
        options: args.options,
        tally: args.options.map((option) => ({ option, count: 0 })),
        total: 0,
      },
    }),
  );
}
```

Mount it (and the widget asset router) in `server.ts`:

```ts
import {
  createMcpExpressRouter,
  createViewAssetRouter,
} from "ng-mcp-ui/server";
import { createMcpServer } from "./mcp/server";

// before Angular's SSR catch-all:
app.use("/mcp", createMcpExpressRouter(createMcpServer()));
app.use("/assets/widgets", createViewAssetRouter({ /* … */ }));
```

`registerTool` accumulates each tool's input/output/`_meta` shape into the
server type, so `typeof server` carries enough type information for the
`injectAppHelpers<typeof server>()` web helper to produce fully-typed,
tool-name-narrowed hooks.

Content helpers — `text`, `image`, `audio`, `resourceLink`, `embeddedResource`,
and the `FileRef` schema — build well-formed MCP content blocks for tool
results. Auth helpers (`requireBearerAuth`, `optionalBearerAuth`,
`mcpAuthMetadataRouter`) and protocol-level `mcpMiddleware(...)` cover bearer
auth and cross-cutting concerns.

## `testing`

`ng-mcp-ui/testing` gives unit tests and Storybook a pure provider override that
mirrors `provideMcpUi()` — no `window.mcpUi`, no real host. `provideMockMcpUi()`
binds `MCP_ADAPTOR` to an in-memory `MockAdaptor` and returns `{ providers,
adaptor }` so the test can drive host pushes and inspect the call log:

```ts
import { provideMockMcpUi } from "ng-mcp-ui/testing";

const { providers, adaptor } = provideMockMcpUi({
  hostContext: { theme: "dark" },
  toolResponses: { cast_vote: { structuredContent: { /* … */ } } },
});

TestBed.configureTestingModule({ providers: [providers] });
adaptor.pushHostContext("toolOutput", { question: "Lunch?", options: [] });
// … assert against the widget, then read adaptor.calls
```

## `tunnel`

`ng-mcp-ui/tunnel` is the slot for the `cloudflared` zero-auth dev-tunnel
manager used to expose a local server to a real host during development. Today
the live tunnel walk runs through the repo's `npm run live-host` harness (see
[`LIVE-HOST-VALIDATION.md`](https://github.com/nntndfrk/ng-mcp-ui/blob/main/LIVE-HOST-VALIDATION.md));
the importable tunnel surface lands in the tunnel track.

## Host compatibility

A single `Adaptor` interface abstracts the **OpenAI Apps SDK** (`window.openai`,
ChatGPT) and the open **MCP-Apps** postMessage spec
(`@modelcontextprotocol/ext-apps`, Claude & other MCP-Apps hosts) behind one
API, so widget code is identical across hosts. Live-host validation is signed
off on both Claude and ChatGPT (render machine-verified, interactive-call rows
human-confirmed). **Gemini is not supported.**

## Build tooling

Built with the Angular compiler **`ngc` in *partial* compilation mode** — one
`tsconfig.json` over all four entry dirs — **not** ng-packagr.

- The Node-only entries (`server`, `tunnel`) emit as plain TypeScript.
- The Angular entries (`web`, `testing`) emit Ivy **partial** declarations
  (`ɵɵngDeclare*`) for the directive/pipe, so a consuming app's Angular linker
  (built into `@angular/build`) finalizes them at AOT build time — the
  published-Angular-library contract.
- `package.json#exports` maps each subpath to its `dist` `types` + `default`.

ng-packagr is a poor fit here: this is a **hybrid** package whose `server` /
`tunnel` entries import `express`, `node:http`, and the MCP SDK. `ngc` partial
fits the hand-mapped `exports` layout and keeps the Node entries as plain TS.

```bash
npm run build        # ngc -p tsconfig.json — compile all four entries into dist/
npm run build:pack   # build + embed the schematics under dist/schematics/
npm run verify:pack  # pack into a scratch project and assert the subpaths resolve
```

## License

[MIT](https://github.com/nntndfrk/ng-mcp-ui/blob/main/LICENSE)
