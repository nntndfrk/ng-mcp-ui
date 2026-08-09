---
title: Quickstart
description: Retrofit an Angular application with an MCP server, a widget build target, and a working example view.
group: Getting started
groupOrder: 1
order: 2
---

> You need **Angular v20, v21 or v22**, and Node 22 or later. If your app has no SSR, the schematic
> adds it. The 1.x server serves the **MCP 2026-07-28** revision only. It builds on version 2 of the
> MCP TypeScript SDK: `@modelcontextprotocol/server`, `/express` and `/node` at `^2.0.0`, with zod
> `^4.2.0` and Express 5. See [ng add](/docs/schematics/ng-add) for the full peer list.

## 1. Install and retrofit

One schematic mounts the MCP JSON-RPC endpoint into your `server.ts` file. It also scaffolds an
example tool and widget, and it adds the dev scripts.

```bash
ng add ng-mcp-ui@next --example=demo
```

The `@next` tag is needed while 1.x is beta. A plain `ng add ng-mcp-ui` installs the 0.2.x line,
which speaks the 2025-era protocol. See [migrate from 0.2.x](/docs/getting-started/migrate-from-0-2).

`ng add` installs the package and runs the retrofit in one step. If the package is already
installed, run the schematic directly:

```bash
ng generate ng-mcp-ui:ng-add --example=demo
```

The schematic writes these files.

| Path | What it is |
| --- | --- |
| `src/mcp/server.ts` | Your `createMcpServer()` function. Register your tools here |
| `src/mcp/views.manifest.ts` | Resolves the widget build output for the view shell |
| `src/widgets/registry.ts` | Maps each view name to a lazy `import()` of the widget module |
| `src/widgets/main.ts` | The widget entry. It reads `viewName` from the shell |
| `src/widgets/index.html` | The shell document of the widget browser build |
| `src/widgets/echo/echo.widget.ts` | The sample `echo` widget |
| `tsconfig.widgets.json` | The TypeScript project for the widget build |

`--example=demo` adds the Quick Poll demo on top: `src/mcp/tools/poll.ts`,
`src/widgets/poll/poll.widget.ts`, `src/widgets/poll/poll.css`, and the `src/widgets/views.d.ts`
file that declares the view names.

It also adds a `build-widgets` target on the
[`ng-mcp-ui:build-widgets`](/docs/schematics/build-widgets) builder, mounts the `/mcp` and
`/assets/widgets` routes in `src/server.ts` before the SSR catch-all route of Angular, and adds
three npm scripts.

## 2. Register a tool

A Zod object types each tool. A tool with a `view` field renders as an interactive widget, and not
as plain text.

```ts
import { McpServer } from "ng-mcp-ui/server";
import { z } from "zod";

import { resolveViewManifest } from "./views.manifest";

declare module "ng-mcp-ui/server" {
  interface ViewNameRegistry {
    poll: true;
  }
}

export function createMcpServer(): McpServer {
  return new McpServer(
    { name: "my-app", version: "0.0.0" },
    {
      viewManifest: resolveViewManifest(),
      // sealed state: ctx.state.seal() / ctx.state.open() in your handlers
      state: { key: process.env["NG_MCP_STATE_KEY"] },
    },
  ).registerTool(
    {
      name: "create_poll",
      title: "Create poll",
      description: "Create a poll and render it as an interactive view.",
      inputSchema: z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2),
      }),
      outputSchema: z.object({
        pollId: z.string(),
        question: z.string(),
        options: z.array(z.string()),
        tally: z.array(z.object({ option: z.string(), count: z.number() })),
        total: z.number(),
      }),
      // links this tool to the `poll` widget — one tool per view
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

The schema of each tool is a [Standard Schema](https://standardschema.dev). `z.object({ … })` is
the common form, and ArkType and Valibot work too. A handler receives `(args, ctx)`. This one needs
no context, so it takes `args` alone.

The `state` option is what `ng add` scaffolds. It gives each handler a `ctx.state` that seals
server state into a signed token the widget carries back, so the server keeps no session. In
development you can leave `NG_MCP_STATE_KEY` unset: the server then mints an ephemeral key and logs
a warning. In production a missing key throws. The scaffolded poll demo works this way. See
[sealed state](/docs/guides/sealed-state).

One command generates a tool. See [generate tool](/docs/schematics/generate-tool), and
[`registerTool`](/docs/api/register-tool) for each config field.

## 3. Write the widget

A widget is a standalone Angular component. It uses `OnPush`, it needs no Zone.js, and it reads live
host state through the `inject*` API.

```ts
import { ChangeDetectionStrategy, Component, computed } from "@angular/core";
import { DataLlmDirective, injectCallTool, injectToolInfo, injectViewState } from "ng-mcp-ui/web";

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
        <button (click)="vote(p.pollId, o)" [class.voted]="myVote() === o">{{ o }}</button>
      }
      <!-- the model learns what the user voted, no extra tool call -->
      <p [dataLlm]="voteSummary()"></p>
    }
  `,
})
export default class PollWidget {
  private readonly tool = injectToolInfo<{
    input: { question?: string; options?: string[] };
    output: PollSnapshot;
  }>();

  private readonly castVote = injectCallTool<
    { pollId: string; option: string },
    { structuredContent: PollSnapshot }
  >("cast_vote");

  private readonly viewState = injectViewState<{ myVote: string | null }>({ myVote: null });

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

Add it to `src/widgets/registry.ts`, so the builder can put it in its own chunk.

```ts
export const registry = {
  echo: () => import("./echo/echo.widget"),
  poll: () => import("./poll/poll.widget"),
} as const;

export type ViewName = keyof typeof registry;
```

`ng generate ng-mcp-ui:view poll` writes the component and the registry entry for you.

## 4. Run it

`ng add` adds three npm scripts. The dev loop is:

```bash
npm run build:widgets   # AOT-build the widget bundle, validate every registered
                        # view emitted its code-split chunk, derive views.manifest.json
npm run dev:mcp         # ng serve — /mcp and /assets/widgets are now live
npm run tunnel          # expose it, e.g. cloudflared tunnel --url http://localhost:4200
```

Then add the tunnel URL with `/mcp` at the end as a custom connector in the host. In Claude, open
Settings and then Connectors. In ChatGPT, use the developer-mode connectors. Then ask the model to
use your tool.

Run `build:widgets` again after you change a widget.

To skip that step while you write widget code, put the asset router in development mode. It proxies
your running `ng serve` process, therefore you need no widget build. See
[`createViewAssetRouter`](/docs/api/create-view-asset-router).

## Next steps

- [How it works](/docs/getting-started/how-it-works) tells you what happens in the host iframe.
- [Typed tool data](/docs/guides/typed-tool-data) gives you inference from Zod to the widget.
- [Testing widgets](/docs/guides/testing-widgets) tests a widget with no real host.
- [Troubleshooting](/docs/guides/troubleshooting) lists each error and its correction.
