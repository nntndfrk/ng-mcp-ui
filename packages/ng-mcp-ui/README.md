# ng-mcp-ui

> Angular schematic + library for MCP interactive UI views.

[![npm](https://img.shields.io/npm/v/ng-mcp-ui)](https://www.npmjs.com/package/ng-mcp-ui)
[![CI matrix](https://github.com/nntndfrk/ng-mcp-ui/actions/workflows/ci-matrix.yml/badge.svg)](https://github.com/nntndfrk/ng-mcp-ui/actions/workflows/ci-matrix.yml)
[![Angular](https://img.shields.io/badge/Angular-v20%20%7C%20v21%20%7C%20v22-dd0031)](https://github.com/nntndfrk/ng-mcp-ui/actions/workflows/ci-matrix.yml)
[![license](https://img.shields.io/npm/l/ng-mcp-ui)](https://github.com/nntndfrk/ng-mcp-ui/blob/main/LICENSE)

**📖 [Documentation](https://nntndfrk.github.io/ng-mcp-ui/)** ·
[Quickstart](https://nntndfrk.github.io/ng-mcp-ui/docs/getting-started/quickstart) ·
[How it works](https://nntndfrk.github.io/ng-mcp-ui/docs/getting-started/how-it-works) ·
[Schematics](https://nntndfrk.github.io/ng-mcp-ui/docs/schematics/ng-add) ·
[API reference](https://nntndfrk.github.io/ng-mcp-ui/docs/reference/web)

<!-- TODO(readme): drop the live-host capture here — the Quick Poll widget
     rendering in Claude and a vote being cast. Highest-value addition to this
     page; everything below is text arguing for what this would just show. -->

## Description

You have an Angular app. You want its features to show up as **interactive
widgets inside an AI chat** — a poll the user can vote on, a chart, a form —
served from your own app and driven by your own tools.

`ng-mcp-ui` mounts an [MCP](https://modelcontextprotocol.io) server into your
app's Angular SSR `server.ts`, ships client-bootstrapped Angular widgets that
hydrate from host-pushed tool data, and gives you a signal-based,
zoneless-friendly view API that is identical across Claude, ChatGPT, and other
[MCP-Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
hosts. Retrofits an existing app on **Angular v20–v22**.

## Quickstart

Run `ng add` against an existing Angular app — it installs the package, ensures
SSR, mounts the MCP server before the SSR catch-all, adds a widgets build target,
and (by default) scaffolds the runnable Quick Poll demo:

```bash
ng add ng-mcp-ui --example=demo
```

> Already installed (`npm i ng-mcp-ui`)? The same schematic runs via
> `ng generate ng-mcp-ui:ng-add --example=demo`.

`ng add` wires three npm scripts; the dev loop is:

```bash
npm run build:widgets   # ng run <app>:build-widgets — AOT-builds the widget
                        # bundle, validates every registered view emitted its
                        # code-split chunk (fails loudly if one is broken),
                        # and derives src/mcp/views.manifest.json
npm run dev:mcp         # ng serve — /mcp and /assets/widgets are now live
npm run tunnel          # expose it, e.g. cloudflared tunnel --url http://localhost:4200
```

Then add the tunnel URL + `/mcp` as a custom connector in the host
(Claude: Settings → Connectors; ChatGPT: developer-mode connectors) and ask the
model to use your tool. Re-run `build:widgets` after changing a widget;
generate more views/tools with `ng generate ng-mcp-ui:view <name>` /
`ng generate ng-mcp-ui:tool <name>`.

See the [schematics reference](https://nntndfrk.github.io/ng-mcp-ui/docs/schematics/ng-add)
for the full generator + options reference.

## Subpath exports

| Import | Purpose |
| --- | --- |
| `ng-mcp-ui/server` | Framework-neutral MCP server: `McpServer`, the mountable Express router, content/`FileRef` helpers, view-resource shells, auth |
| `ng-mcp-ui/web` | Angular host bridge: `provideMcpUi`, `bootstrapWidget`, the `inject*` signal API, the `[dataLlm]` directive + `mcpAsset` pipe |
| `ng-mcp-ui/testing` | `MockAdaptor` + `provideMockMcpUi` test/Storybook harness |

The package also ships the Angular **schematics** (`ng-add`, `view`, `tool`,
`example`) and the **`ng-mcp-ui:build-widgets` builder** (bundles the widgets,
validates every registered view emitted a code-split chunk, derives
`views.manifest.json`), embedded under `dist/schematics/` at pack time.

> A fourth subpath, `ng-mcp-ui/tunnel`, is reserved for the `cloudflared`
> dev-tunnel manager but **is not implemented yet** — today the live tunnel walk
> runs through the repo's `npm run live-host` harness. Don't import it.

## `web` API

Everything below comes from `ng-mcp-ui/web`. Every `inject*` function must be
called from an Angular **injection context**; each resolves the host adaptor from
the `MCP_ADAPTOR` DI token (provided by `provideMcpUi()`), so widget code is
identical across Claude / ChatGPT / MCP-Apps hosts.

| Symbol | Purpose |
| --- | --- |
| `provideMcpUi` / `bootstrapWidget` | Zoneless setup + the host-derived tokens; boot a standalone widget into the host shell |
| `injectToolInfo` | The rendering tool's typed input/output as an idle/pending/success state signal |
| `injectCallTool` | `{ callTool, callToolAsync, status, data, error }` — invoke a server tool from the view |
| `injectViewState` / `injectViewStore` | Host-persisted, bidirectionally-synced view state (signal, or store-style with debounced writes) |
| `injectLayout` / `injectDisplayMode` | Host theme, safe-area insets, max height; read + request `inline` / `fullscreen` / `pip` |
| `injectAppHelpers` | Typed sugar: tool-name-narrowed helpers inferred from `typeof server` |
| `[dataLlm]` / `\| mcpAsset` | Surface in-view content to the model; rewrite asset paths to the server origin |

Also exported: `injectUser`, `injectFiles`, `injectHostContext`,
`injectSendFollowUpMessage`, `injectOpenExternal`, `injectRequestModal`,
`injectRequestSize`, `injectRequestClose`, `injectDownload`,
`injectSetOpenInAppUrl`, `injectRegisterViewTool`, and the mcp-app modal surface.

**→ Full signatures and options: [`ng-mcp-ui/web` API reference](https://nntndfrk.github.io/ng-mcp-ui/docs/reference/web)**

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

## Host compatibility

A single `Adaptor` interface abstracts the **OpenAI Apps SDK** (`window.openai`,
ChatGPT) and the open **MCP-Apps** postMessage spec
(`@modelcontextprotocol/ext-apps`, Claude & other MCP-Apps hosts) behind one
API, so widget code is identical across hosts. Both are supported and exercised
against real hosts during development. **Gemini is not supported.**

## Documentation

Full docs, searchable, at **<https://nntndfrk.github.io/ng-mcp-ui/>**.

| | |
| --- | --- |
| **Getting started** | [Introduction](https://nntndfrk.github.io/ng-mcp-ui/docs/getting-started/introduction) · [Quickstart](https://nntndfrk.github.io/ng-mcp-ui/docs/getting-started/quickstart) · [How it works](https://nntndfrk.github.io/ng-mcp-ui/docs/getting-started/how-it-works) |
| **Guides** | [Host bridge and adaptors](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/host-bridge) · [Typed tool data](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/typed-tool-data) · [View state](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/view-state) · [Theme and display mode](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/theme-display-mode) · [Files and downloads](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/files) · [Content Security Policy](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/csp) · [Client hints](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/client-hints) · [Protocol middleware](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/mcp-middleware) · [Testing widgets](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/testing-widgets) · [Troubleshooting](https://nntndfrk.github.io/ng-mcp-ui/docs/guides/troubleshooting) |
| **Schematics** | [ng add](https://nntndfrk.github.io/ng-mcp-ui/docs/schematics/ng-add) · [generate view](https://nntndfrk.github.io/ng-mcp-ui/docs/schematics/generate-view) · [generate tool](https://nntndfrk.github.io/ng-mcp-ui/docs/schematics/generate-tool) · [build-widgets](https://nntndfrk.github.io/ng-mcp-ui/docs/schematics/build-widgets) |
| **Reference** | [`ng-mcp-ui/server`](https://nntndfrk.github.io/ng-mcp-ui/docs/reference/server) · [`ng-mcp-ui/web`](https://nntndfrk.github.io/ng-mcp-ui/docs/reference/web) · [`ng-mcp-ui/testing`](https://nntndfrk.github.io/ng-mcp-ui/docs/reference/testing) · [Host support matrix](https://nntndfrk.github.io/ng-mcp-ui/docs/reference/host-support) |
| **API** | One page for each exported symbol, with its full signature: [`createMcpServer`](https://nntndfrk.github.io/ng-mcp-ui/docs/api/mcp-server) · [`registerTool`](https://nntndfrk.github.io/ng-mcp-ui/docs/api/register-tool) · [`provideMcpUi`](https://nntndfrk.github.io/ng-mcp-ui/docs/api/provide-mcp-ui) · [`injectToolInfo`](https://nntndfrk.github.io/ng-mcp-ui/docs/api/inject-tool-info) · [`injectCallTool`](https://nntndfrk.github.io/ng-mcp-ui/docs/api/inject-call-tool) · [and 33 more](https://nntndfrk.github.io/ng-mcp-ui/docs/reference/web) |

## License

[MIT](https://github.com/nntndfrk/ng-mcp-ui/blob/main/LICENSE)
