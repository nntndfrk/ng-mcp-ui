---
title: generate tool
description: Scaffold a registerTool call with Zod schemas, optionally linked to an existing view, wired into createMcpServer.
group: Schematics
groupOrder: 3
order: 3
---

```bash
ng generate ng-mcp-ui:tool cast_vote
ng generate ng-mcp-ui:tool create_poll --view=poll   # link to an existing view
```

Generates a `registerTool` call with Zod input and output schemas and wires it into your app's
`createMcpServer()`.

## Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | string | — | Tool name (first positional argument). **Required.** |
| `--project` | string | current project | Target project name. |
| `--view` | string | — | Name of an existing view to link this tool to. |

## What it generates

```ts
import { McpServer } from "ng-mcp-ui/server";
import { z } from "zod";

export function registerCastVoteTool(server: McpServer): void {
  server.registerTool(
    {
      name: "cast_vote",
      title: "Cast vote",
      description: "Describe what the cast_vote tool does.",
      inputSchema: { message: z.string() },
      outputSchema: { message: z.string() },
    },
    (args) => {
      const message = args.message;
      return {
        content: message,
        structuredContent: { message },
      };
    },
  );
}
```

With `--view=poll` the config also carries the view link, which is what makes the host render the
tool result as an interactive widget instead of text:

```ts
      view: {
        component: "poll",
        description: "Renders the poll view.",
      },
```

The generated `register…Tool(server)` function is called from `createMcpServer()` in
`src/mcp/server.ts`; edit the schemas and the handler to implement the real behaviour.

## One tool per view

A view is rendered by the tool that carries its `view` link. If several tools should be able to
render the same widget, keep the view link on the tool that opens it and let the others be plain
tools the widget calls through [`injectCallTool`](/docs/guides/typed-tool-data) — that is exactly
the shape of the Quick Poll demo, where `create_poll` renders the view and `cast_vote` is called
from inside it.

## Type inference

Each `registerTool` call accumulates its input, output and `_meta` shape into the server type, so
`typeof server` carries enough information for `injectAppHelpers<typeof server>()` to produce
fully typed, tool-name-narrowed helpers in the widget. Nothing extra to declare — just export the
server's type from `src/mcp/server.ts`.
