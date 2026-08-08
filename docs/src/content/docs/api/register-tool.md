---
title: registerTool
description: Registers a tool, its schemas, and the view that renders its result.
group: API
groupOrder: 5
order: 2
---

`registerTool` declares one tool on the server. It returns the server, therefore you can chain the
calls.

```ts
server.registerTool(
  {
    name: "create_poll",
    title: "Create poll",
    description: "Create a poll and render it as an interactive view.",
    inputSchema: { question: z.string().min(1) },
    outputSchema: { pollId: z.string(), total: z.number() },
    view: { component: "poll" },
  },
  (args, extra) => ({
    content: `Created poll "${args.question}".`,
    structuredContent: { pollId: "1", total: 0 },
  }),
);
```

## Config

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | string | The identifier of the tool. The model uses it. |
| `title` | string, optional | A label for people. |
| `description` | string, optional | Tells the model when to call the tool. |
| `inputSchema` | Zod shape, optional | The arguments. The server validates them and infers the type of `args`. |
| `outputSchema` | Zod shape, optional | The shape of `structuredContent`. |
| `annotations` | `ToolAnnotations`, optional | The standard MCP annotations. |
| `view` | [`ViewConfig`](/docs/guides/csp), optional | The view that renders the result. |
| `securitySchemes` | `SecurityScheme[]`, optional | The auth schemes that the tool supports. |
| `_meta` | `ToolMeta`, optional | More metadata for the host. |

### view

Set `view.component` to the name of a registered view. The value is checked against the
`ViewNameRegistry` interface, which the `view` generator keeps current.

The other fields of `view` control the presentation and the CSP of the iframe. See
[Content Security Policy](/docs/guides/csp).

### securitySchemes

```ts
securitySchemes: [{ type: "noauth" }, { type: "oauth2", scopes: ["read"] }];
```

The list tells a client which tools need a sign-in. If you list `noauth` and `oauth2` together, the
tool works for an anonymous caller, and it gives more to a caller who signed in.

## Handler

```ts
(args, extra) => result | Promise<result>
```

`args` holds the parsed input. Its type comes from `inputSchema`.

`extra` is the request context of the SDK. Its `_meta` field also carries the
[client hints](/docs/guides/client-hints) of an Apps SDK host.

The handler returns an object with a `content` field, and an optional `structuredContent` field and
`_meta` field. `content` accepts a plain string, one content block, or an array of content blocks.
The server normalizes each form. See [content helpers](/docs/api/content-helpers).

## Types accumulate

Each call adds the input, output and `_meta` shape of that tool to the type of the server.
Therefore `typeof server` carries enough information for
[`injectAppHelpers`](/docs/api/inject-app-helpers) to give you typed, tool-name-narrowed helpers in
the view.

For this to work, export the server type from the same module:

```ts
export function createMcpServer() {
  return new McpServer(/* … */).registerTool(/* … */);
}
export type AppServer = ReturnType<typeof createMcpServer>;
```

## Related

- [`McpServer`](/docs/api/mcp-server)
- [Typed tool data](/docs/guides/typed-tool-data)
- [generate tool](/docs/schematics/generate-tool)
