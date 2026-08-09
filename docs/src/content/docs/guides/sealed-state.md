---
title: Sealed state
description: Keep tool state on the wire instead of in server memory. The server seals state into an HMAC token, and the widget carries it between calls.
group: Guides
groupOrder: 2
order: 4
---

MCP 2026-07-28 is stateless: every request builds a fresh server, so a module-level `Map` of
session data breaks on serverless and multi-instance hosting. Sealed state replaces it. The
server **seals** its state into a signed token, hands the token to the widget, and **opens** it
when the widget echoes it back. No storage, no session affinity.

> Sealed tokens are signed (HMAC-SHA256), not encrypted. The client can read the payload, it just
> cannot forge or alter it. Never seal secrets.

## The three state carriers

| Carrier | Lives where | Trust | Use for |
| --- | --- | --- | --- |
| [View state](/docs/guides/view-state) | host, per widget instance | client-owned | UI state: selections, drafts |
| Sealed state (this page) | tool results and arguments | server-verified | server state a widget carries between calls |
| `requestState` | one elicitation round trip | server-verified | mid-tool context, see [elicitation](/docs/guides/elicitation) |

One `state` option powers both verified carriers with the same key. The two are not
interchangeable: every token seals the purpose it was minted for, so a widget token cannot be
replayed as an elicitation `requestState` or the reverse. MRTR tokens additionally seal the tool
that minted them.

## Configure the server

```ts
import { McpServer } from "ng-mcp-ui/server";

export function createMcpServer(): McpServer {
  return new McpServer(
    { name: "my-app", version: "0.0.0" },
    {
      viewManifest: resolveViewManifest(),
      state: { key: process.env["NG_MCP_STATE_KEY"] },
    },
  );
}
```

- `key`: the HMAC key, at least 32 bytes. In production (`NODE_ENV=production`) a missing key
  throws at startup. In development, ng-mcp-ui mints an ephemeral key and logs a warning; tokens
  then die with each restart, which is fine for a dev loop.
- `ttlSeconds`: token lifetime, default 600. An expired token fails `open()`.
- `bind`: derive extra verification context from the request, so a token minted for one principal
  fails for another. Bind by principal (for example the authenticated user), never by method: the
  same token legitimately flows through several tools.

You can also pass a ready-made codec from `createRequestStateCodec(...)` if you share one across
servers.

## Seal on the way out, open on the way in

With the option set, every tool handler gets `ctx.state`:

```ts
import { STATE_META_KEY } from "ng-mcp-ui/server";

server
  .registerTool({ name: "start", /* ... */ }, async (_args, ctx) => {
    const game = { board: emptyBoard(), turn: 1 };
    return {
      content: "New game.",
      structuredContent: publicView(game),
      _meta: { [STATE_META_KEY]: await ctx.state?.seal(game) },
    };
  })
  .registerTool(
    { name: "move", inputSchema: z.object({ state: z.string(), cell: z.number() }) },
    async ({ state, cell }, ctx) => {
      const game = await ctx.state!.open<Game>(state);
      applyMove(game, cell);
      return {
        content: describe(game),
        structuredContent: publicView(game),
        _meta: { [STATE_META_KEY]: await ctx.state!.seal(game) },
      };
    },
  );
```

The wire path is explicit and ordinary:

1. The handler seals the state and returns the token under `_meta[STATE_META_KEY]`
   (`"ng-mcp-ui/state"`).
2. The widget reads it from the tool response metadata. It is not model-visible.
3. The widget echoes it back as a plain tool argument (`state` by convention).
4. The handler opens it, mutates, and re-seals. Re-sealing also restarts the token's lifetime.

## The widget side

Type the token into the response metadata, echo it, and persist the freshest copy in
[view state](/docs/guides/view-state) so a remounted widget keeps working:

```ts
const STATE_KEY = "ng-mcp-ui/state"; // widget code must not import server code
type WeaveMeta = { [STATE_KEY]?: string };

private readonly tool = injectToolInfo<{
  output: GameView;
  responseMetadata: WeaveMeta;
}>();

private readonly move = injectCallTool<
  { state: string; cell: number },
  { structuredContent: GameView; meta: WeaveMeta }
>("move");

private readonly viewState = injectViewState<{ token: string | null }>({ token: null });
```

The scaffolded poll example (`ng add ng-mcp-ui@next --example=demo`) is a complete worked version of
this pattern, including token adoption on every response.

## Expiry and tampering

`open()` throws on any bad token: tampered, expired, or bound to someone else. The error message
is the stable `SEALED_STATE_INVALID_MESSAGE` constant, and the SDK converts the throw into an
`isError` tool result. In the widget, treat that result as "expired" and tell the user to start
over:

```ts
this.move.callTool({ state: token, cell }, {
  onSuccess: (data) => {
    if (data.isError) {
      this.expired.set(true);
      return;
    }
    // adopt data.structuredContent and data.meta?.[STATE_KEY]
  },
});
```

The message carries no reason on purpose. Whether verification failed on the MAC, the expiry, or
the binding is not something a client should be able to distinguish.

## The API

| Method | Use |
| --- | --- |
| `ctx.state.seal(payload)` | Mint a widget-carried token. |
| `ctx.state.open<T>(token)` | Verify one and read its payload. |
| `ctx.state.sealRequestState(payload)` | Mint an [elicitation](/docs/guides/elicitation) `requestState`, bound to the current tool. |
| `ctx.state.requestState<T>()` | Read the verified echo on a retry round. |

## Design limits

- Keep payloads small. The token rides every call in both directions.
- Each widget instance carries its own fork of the state. Two open widgets on the same data are
  last-writer-wins. If you need one authoritative copy, put it in a database and seal only its id.
- Tokens are replayable within their lifetime by design: the widget retries with the same token
  after a network error. Use `bind` and short lifetimes to narrow the window.
