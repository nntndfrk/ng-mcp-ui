---
title: Introduction
description: An Angular schematic and library that turns your app's features into interactive widgets inside an AI chat.
group: Getting started
groupOrder: 1
order: 1
---

You have an Angular app. You want its features to show up as **interactive widgets inside an AI
chat** — a poll the user can vote on, a chart, a form — served from your own app and driven by your
own tools.

`ng-mcp-ui` makes that essentially a single schematic:

```bash
ng add ng-mcp-ui --example=demo
```

It mounts an [MCP](https://modelcontextprotocol.io) server into your app's existing Angular SSR
`server.ts`, scaffolds an example tool and widget, and wires a dev tunnel so you can connect a real
host — Claude, ChatGPT — and iterate live.

## What ships

| Import | Purpose |
| --- | --- |
| `ng-mcp-ui/server` | Framework-neutral MCP server: `McpServer`, the mountable Express router, content and `FileRef` helpers, view-resource shells, auth |
| `ng-mcp-ui/web` | Angular host bridge: `provideMcpUi`, `bootstrapWidget`, the `inject*` signal API, the `[dataLlm]` directive and `mcpAsset` pipe |
| `ng-mcp-ui/testing` | `MockAdaptor` and `provideMockMcpUi` test/Storybook harness |
| `ng-mcp-ui/tunnel` | `cloudflared` dev-tunnel marker — a skeleton today |

The same package also ships the Angular **schematics** (`ng-add`, `view`, `tool`, `example`) and the
**`ng-mcp-ui:build-widgets` builder**, embedded under `dist/schematics/` at pack time.

## Capabilities

- `ng add` retrofit for existing Angular apps, CI-green across **Angular v20, v21 and v22**
- One `Adaptor` interface, two host runtimes: the same widget targets **Claude** and **ChatGPT**
- Typed tool ⇄ view data flow — Zod schemas inferred end to end via `typeof server` into
  `injectAppHelpers`
- View → server tool calls, persisted view state, and LLM-visible context via `[dataLlm]`
- Theme, display-mode and safe-area adaptation
- A zero-auth dev tunnel for live iteration against real hosts
- A testing harness (`MockAdaptor` / `provideMockMcpUi`) for unit-testing widgets

## Host support

A single `Adaptor` interface abstracts the **OpenAI Apps SDK** (`window.openai`, ChatGPT) and the
open **MCP-Apps** postMessage spec (`@modelcontextprotocol/ext-apps`, Claude and other MCP-Apps
hosts) behind one API, so widget code is identical across hosts.

Live-host validation is signed off on both Claude and ChatGPT: render is machine-verified and the
interactive tool-call rows are human-confirmed. **Gemini is not supported.**

## Where to go next

- [Quickstart](/docs/getting-started/quickstart) — retrofit an app in about two minutes.
- [How it works](/docs/getting-started/how-it-works) — the architecture, and why SSR is used for the
  server rather than the render.
- [Schematics](/docs/schematics/ng-add) — every generator and its options.
