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
import { z } from "zod";

server.registerTool(
  {
    name: "create_poll",
    title: "Create poll",
    description: "Create a poll and render it as an interactive view.",
    inputSchema: z.object({ question: z.string().min(1) }),
    outputSchema: z.object({ pollId: z.string(), total: z.number() }),
    view: { component: "poll" },
  },
  (args) => ({
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
| `inputSchema` | Standard Schema, optional | The arguments. The server validates them and infers the type of `args`. |
| `outputSchema` | Standard Schema, optional | The shape of `structuredContent`. |
| `annotations` | `ToolAnnotations`, optional | The standard MCP annotations. |
| `icons` | `Icon[]`, optional | Icons for the tool. |
| `view` | [`ViewConfig`](/docs/guides/csp), optional | The view that renders the result. |
| `securitySchemes` | `SecurityScheme[]`, optional | The auth schemes that the tool supports. |
| `_meta` | `ToolMeta`, optional | More metadata for the host. |

### Schemas

A schema field takes any [Standard Schema](https://standardschema.dev) that can also produce JSON
Schema. In practice that is a zod v4 `z.object({ … })`; ArkType and Valibot also qualify. The raw
zod shape of 0.2.x (`{ question: z.string() }`) is not accepted. Wrap the fields.

Omit `inputSchema` for a tool that takes no arguments. Its handler then gets `{}` as `args`.

### view

Set `view.component` to the name of a registered view. The value is checked against the
`ViewNameRegistry` interface, which the `view` generator keeps current.

The other fields of `view` control the presentation and the CSP of the iframe. See
[Content Security Policy](/docs/guides/csp).

`view.cacheHint` tells the host how long it may cache the view resource. Your fields are merged
over the computed default, field by field.

| The view resource is | Default hint |
| --- | --- |
| A production build with a content hash in its URI | `{ ttlMs: 3_600_000, cacheScope: "private" }` |
| A development shell | `{ ttlMs: 0, cacheScope: "private" }` |

```ts
view: { component: "poll", cacheHint: { ttlMs: 60_000 } }
```

Both view resources of a tool, the `apps-sdk` one and the `mcp-app` one, get the merged hint. For a
hint on a whole operation, use the `cacheHints` option of
[`McpServer`](/docs/api/mcp-server).

### securitySchemes

```ts
securitySchemes: [{ type: "noauth" }, { type: "oauth2", scopes: ["read"] }];
```

The list tells a client which tools need a sign-in. If you list `noauth` and `oauth2` together, the
tool works for an anonymous caller, and it gives more to a caller who signed in.

## Handler

```ts
(args, ctx) => result | Promise<result>
```

`args` holds the parsed input. Its type comes from `inputSchema`.

`ctx` is the request context of the SDK, with the `_meta` field widened by the
[client hints](/docs/guides/client-hints) of an Apps SDK host.

| Field | Contents |
| --- | --- |
| `ctx.mcpReq._meta` | The metadata of the request, including the client hints. |
| `ctx.mcpReq.envelope` | The reserved envelope keys of the request, such as the client capabilities. |
| `ctx.mcpReq.inputResponses` | The answers of an [elicitation](/docs/guides/elicitation) round. |
| `ctx.http?.req` | The original web `Request`. Read a header with `ctx.http?.req?.headers.get("x-foo")`. |
| `ctx.http?.authInfo` | The verified identity. See [`requireBearerAuth`](/docs/api/require-bearer-auth). |
| `ctx.state` | The [sealed state](/docs/guides/sealed-state) helpers. Present when the server has a `state` option. |

## The result

A handler returns one of two things.

| Return | Meaning |
| --- | --- |
| An object with `content`, and optional `structuredContent` and `_meta` | The tool completed. |
| `inputRequired({ … })` | The tool needs more input first. See [elicitation](/docs/guides/elicitation). |

`content` accepts a plain string, one content block, or an array of content blocks. The server
normalizes each form. See [content helpers](/docs/api/content-helpers).

### Always return content

A view renders only on a host that supports MCP Apps or the Apps SDK. Every other client, and the
model reading its own transcript, sees `content` and nothing else. Therefore a tool with a `view`
must still return a short text summary of what the view shows.

```ts
return {
  content: `Created poll "${args.question}" with 4 options.`,
  structuredContent: poll,
};
```

Outside production the server logs a warning once for each view tool that returns no `content`.

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
