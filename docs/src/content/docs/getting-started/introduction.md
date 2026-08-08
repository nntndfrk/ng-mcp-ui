---
title: Introduction
description: An Angular schematic and library that turns the features of your app into interactive widgets in an AI chat.
group: Getting started
groupOrder: 1
order: 1
---

You have an Angular app. You want its features to appear as **interactive widgets in an AI chat**:
a poll that the user can vote on, a chart, a form. Your app serves them, and your tools drive them.

`ng-mcp-ui` does this with one schematic.

```bash
ng add ng-mcp-ui --example=demo
```

The schematic mounts an [MCP](https://modelcontextprotocol.io) server into the Angular SSR
`server.ts` file of your app. It also scaffolds an example tool and widget, and it adds a dev
tunnel. Thus you can connect a real host, for example Claude or ChatGPT, and see your changes
immediately.

## What the package contains

| Import | Purpose |
| --- | --- |
| `ng-mcp-ui/server` | The framework-neutral MCP server: [`McpServer`](/docs/api/mcp-server), the mountable Express router, the content and [`FileRef`](/docs/api/file-ref) helpers, the view shells, and auth |
| `ng-mcp-ui/web` | The Angular host bridge: [`provideMcpUi`](/docs/api/provide-mcp-ui), [`bootstrapWidget`](/docs/api/bootstrap-widget), the `inject*` signal API, the [`[dataLlm]`](/docs/api/data-llm) directive and the [`mcpAsset`](/docs/api/mcp-asset-pipe) pipe |
| `ng-mcp-ui/testing` | The [`MockAdaptor`](/docs/api/mock-adaptor) and [`provideMockMcpUi`](/docs/api/provide-mock-mcp-ui) harness for tests and Storybook |
| `ng-mcp-ui/tunnel` | A marker for a `cloudflared` dev tunnel. It is a skeleton today |

The same package also contains the Angular [schematics](/docs/schematics/ng-add) (`ng-add`, `view`,
`tool` and `example`) and the [`ng-mcp-ui:build-widgets`](/docs/schematics/build-widgets) builder.
The pack step embeds them under `dist/schematics/`.

## What you can do

- Retrofit an Angular app with `ng add`. CI proves this on **Angular v20, v21 and v22**.
- Write one widget for two host runtimes. One `Adaptor` interface covers **Claude** and **ChatGPT**.
- Move typed data from a tool to a view. The server infers your Zod schemas end to end, through
  `typeof server` into [`injectAppHelpers`](/docs/api/inject-app-helpers).
- Call a server tool from the view, keep view state on the host, and show in-view content to the
  model with [`[dataLlm]`](/docs/api/data-llm).
- Match the theme, the display mode and the safe-area insets of the host.
- Connect a real host through a dev tunnel that needs no auth.
- Unit-test a widget with [`MockAdaptor`](/docs/api/mock-adaptor) and
  [`provideMockMcpUi`](/docs/api/provide-mock-mcp-ui).

## Host support

One `Adaptor` interface covers the two runtimes: the **OpenAI Apps SDK** (`window.openai`, which
ChatGPT uses) and the open **MCP-Apps** postMessage specification
(`@modelcontextprotocol/ext-apps`, which Claude and other MCP-Apps hosts use). Therefore your widget
code is the same for each host.

Live-host tests are signed off on Claude and on ChatGPT. A machine verifies the render, and a person
confirms the interactive tool-call rows. **Gemini is not supported.**

For the behavior of each function on each host, see
[host support](/docs/reference/host-support).

## Where to go next

- [Quickstart](/docs/getting-started/quickstart) gives you a retrofitted app in about two minutes.
- [How it works](/docs/getting-started/how-it-works) gives you the architecture, and it tells you
  why the package uses SSR for the server and not for the render.
- [Schematics](/docs/schematics/ng-add) gives you each generator and its options.
