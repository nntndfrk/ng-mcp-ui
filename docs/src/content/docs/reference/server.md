---
title: ng-mcp-ui/server
description: The framework-neutral MCP server — McpServer, the Express router, view resources, content helpers and auth.
group: Reference
groupOrder: 4
order: 1
---

`ng-mcp-ui/server` is plain TypeScript with no Angular dependency. Construct an `McpServer`, chain
`registerTool(config, handler)` calls, and mount the Express router into your SSR `server.ts`
**before** the Angular catch-all.

## McpServer

```ts
import { McpServer } from "ng-mcp-ui/server";
import { z } from "zod";

import { resolveViewManifest } from "./views.manifest";

export function createMcpServer(): McpServer {
  return new McpServer(
    { name: "my-app", version: "1.0.0" },
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
      view: {
        component: "poll",
        description: "Interactive poll: vote, tally, and discuss the results.",
      },
    },
    (args) => ({
      content: `Created poll "${args.question}".`,
      structuredContent: { /* … */ },
    }),
  );
}
```

`registerTool` accumulates each tool's input, output and `_meta` shape into the server type, so
`typeof server` carries enough type information for `injectAppHelpers<typeof server>()` on the web
side to produce fully typed, tool-name-narrowed helpers.

## Mounting

```ts
import { createMcpExpressRouter, createViewAssetRouter } from "ng-mcp-ui/server";
import { createMcpServer } from "./mcp/server";

// before Angular's SSR catch-all:
app.use("/mcp", createMcpExpressRouter(createMcpServer()));
app.use("/assets/widgets", createViewAssetRouter({ /* … */ }));
```

| Symbol | Purpose |
| --- | --- |
| `createMcpExpressRouter(server, options?)` | The mountable JSON-RPC router. |
| `createViewAssetRouter(options)` | Serves the widgets build output under a path prefix. |

## View naming and manifests

A `view.component` value is checked against the `ViewNameRegistry` interface, which each app
augments — the `view` generator keeps this in sync:

```ts
declare module "ng-mcp-ui/server" {
  interface ViewNameRegistry {
    poll: true;
  }
}
```

| Symbol | Purpose |
| --- | --- |
| `IndexHtmlViewManifest` | Parses the widgets build's `index.html` for hashed asset names. |
| `InMemoryViewManifest` | Fallback manifest for before the widgets build has run. |
| `ViewManifest` | The interface both implement. |
| `ViewManifestError` | Thrown on an unparseable or missing manifest. |
| `AngularShellRenderer`, `ShellRenderer`, `ShellRenderInput`, `ShellMode` | The shell document rendered into the host iframe. |

## Content helpers

`text`, `image`, `audio`, `resourceLink` and `embeddedResource` build well-formed MCP content blocks
for tool results; `normalizeContent` coerces a loose handler return into that shape, and the
`FileRef` schema types file references.

## Auth and middleware

| Symbol | Purpose |
| --- | --- |
| `requireBearerAuth`, `optionalBearerAuth` | Bearer-token middleware for the mounted router. |
| `mcpAuthMetadataRouter` | Serves the auth-metadata endpoints. |
| `InvalidTokenError`, `AuthInfo`, `AuthMetadataOptions`, `BearerAuthMiddlewareOptions` | Supporting types. |
| `McpMiddlewareFn`, `McpTypedMiddlewareFn`, `McpMiddlewareFilter`, `McpExtra`, `McpMethodString`, `McpWildcard` | Protocol-level middleware for cross-cutting concerns. |

## Inference types

`AnyToolRegistry`, `InferTools`, `ToolInput`, `ToolOutput`, `ToolNames`, `ToolResponseMetadata`,
`McpServerTypes`, `ToolDef`, `ToolMeta`, `KnownToolMeta`, `ViewConfig`, `ViewCsp`, `ViewHostType`,
`ViewName` and `SecurityScheme` are exported for library authors building on top of the registry.
