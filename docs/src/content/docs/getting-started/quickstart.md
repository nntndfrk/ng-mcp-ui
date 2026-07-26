---
title: Quickstart
description: Retrofit an existing Angular application with an MCP server, a widget build target, and a working example view.
group: Getting started
groupOrder: 1
order: 2
---

> Requires **Angular v20, v21 or v22** and Node 22 or newer. If your app has no SSR yet, the
> schematic adds it.

## 1. Install and retrofit

A single schematic mounts the MCP JSON-RPC endpoint into your `server.ts`, scaffolds an example tool
and widget, and wires the dev scripts:

```bash
ng add ng-mcp-ui --example=demo
```

`ng add` installs the package and runs the retrofit in one step. If `ng-mcp-ui` is already
installed, run the same schematic directly:

```bash
ng generate ng-mcp-ui:ng-add --example=demo
```

What lands in your app:

| Path | What it is |
| --- | --- |
| `src/mcp/server.ts` | Your `createMcpServer()` — register tools here |
| `src/mcp/views.manifest.ts` | Resolves the widgets build output for the view shell |
| `src/widgets/registry.ts` | View name → lazy `import()` of the widget module |
| `src/widgets/main.ts` | Widget bootstrap entry, reads `viewName` from the shell |
| `tsconfig.widgets.json` | TypeScript project for the widgets build |

Plus a `build-widgets` target on the `ng-mcp-ui:build-widgets` builder, the `/mcp` and
`/assets/widgets` routes mounted in `src/server.ts` before Angular's SSR catch-all, and three npm
scripts.

## 2. Register a tool

Tools are typed with Zod. A tool that carries a `view` renders as an interactive widget instead of
plain text:

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
    { viewManifest: resolveViewManifest() },
  ).registerTool(
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

Generating one is a single command — see [generate tool](/docs/schematics/generate-tool).

## 3. Write the widget

A widget is a standalone, zoneless, OnPush Angular component that reads live host state through the
`inject*` API:

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

Register it in `src/widgets/registry.ts` so the builder can code-split it:

```ts
export const registry = {
  echo: () => import("./echo/echo.widget"),
  poll: () => import("./poll/poll.widget"),
} as const;

export type ViewName = keyof typeof registry;
```

`ng generate ng-mcp-ui:view poll` writes both the component and the registry entry for you.

## 4. Run it

`ng add` wires three npm scripts. The dev loop is:

```bash
npm run build:widgets   # AOT-build the widget bundle, validate every registered
                        # view emitted its code-split chunk, derive views.manifest.json
npm run dev:mcp         # ng serve — /mcp and /assets/widgets are now live
npm run tunnel          # expose it, e.g. cloudflared tunnel --url http://localhost:4200
```

Then add the tunnel URL plus `/mcp` as a custom connector in the host — Claude: Settings →
Connectors; ChatGPT: developer-mode connectors — and ask the model to use your tool.

Re-run `build:widgets` after changing a widget.

## Next steps

- [How it works](/docs/getting-started/how-it-works) — what actually happens inside the host iframe.
- [Typed tool data](/docs/guides/typed-tool-data) — get end-to-end inference from Zod to widget.
- [Testing widgets](/docs/guides/testing-widgets) — unit-test without a real host.
