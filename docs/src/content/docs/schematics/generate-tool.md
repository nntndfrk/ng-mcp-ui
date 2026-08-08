---
title: generate tool
description: Scaffolds a registerTool call with Zod schemas, optionally linked to a view, wired into createMcpServer.
group: Schematics
groupOrder: 3
order: 3
---

```bash
ng generate ng-mcp-ui:tool cast_vote
ng generate ng-mcp-ui:tool create_poll --view=poll   # link to an existing view
```

The generator writes a [`registerTool`](/docs/api/register-tool) call with a Zod input schema and a
Zod output schema. It also wires the call into the `createMcpServer()` function of your app.

## Options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | string | *(none)* | The name of the tool. It is the first positional argument. **Required.** |
| `--project` | string | current project | The target project. |
| `--view` | string | *(none)* | The name of an existing view to link this tool to. |

## What it writes

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

With `--view=poll` the config also carries the view link. That link makes the host render the tool
result as an interactive widget, and not as text.

```ts
      view: {
        component: "poll",
        description: "Renders the poll view.",
      },
```

`createMcpServer()` in `src/mcp/server.ts` calls the generated `register…Tool(server)` function.
Edit the schemas and the handler to add the real behavior.

Write the `description` field for the model. The model reads it to decide when to call your tool.

## One tool for each view

The tool that carries the `view` link renders that view. A second tool that names the same view
throws an error at registration time.

If several tools must work on one widget, keep the view link on the tool that opens the widget. Make
the others plain tools, and call them from inside the view with
[`injectCallTool`](/docs/api/inject-call-tool).

The Quick Poll demo has this shape. `create_poll` renders the view, and the view calls `cast_vote`.

## Type inference

Each `registerTool` call adds its input, output and `_meta` shape to the type of the server.
Therefore `typeof server` carries enough information for
[`injectAppHelpers`](/docs/api/inject-app-helpers) to give you typed, tool-name-narrowed helpers in
the widget.

You declare nothing more. Export the type of the server from `src/mcp/server.ts`:

```ts
export type AppServer = ReturnType<typeof createMcpServer>;
```

Keep the `registerTool` calls in one chained expression. A version that registers each tool in a
separate statement loses the accumulated types.
