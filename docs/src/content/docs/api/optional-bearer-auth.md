---
title: optionalBearerAuth
description: Express middleware that verifies a bearer token when one is present, and lets an anonymous request through.
group: API
groupOrder: 5
order: 7
---

```ts
optionalBearerAuth(options: BearerAuthMiddlewareOptions): RequestHandler
```

Use this middleware for a server that serves anonymous callers and signed-in callers from the same
endpoint.

```ts
app.use("/mcp", optionalBearerAuth({ verifier }), createMcpExpressRouter(server));
```

## Behavior

The middleware reads the `Authorization` header.

| Header | Result |
| --- | --- |
| Absent | The request continues. `ctx.http?.authInfo` is `undefined`. |
| Present and valid | The request continues. `ctx.http?.authInfo` holds the verified identity. |
| Present and not valid | The same 401 or 403 response as [`requireBearerAuth`](/docs/api/require-bearer-auth). |

A bad token is always an error. Only a missing token is permitted.

## Options

The options are the same as [`requireBearerAuth`](/docs/api/require-bearer-auth).

| Option | Type | Purpose |
| --- | --- | --- |
| `verifier` | `OAuthTokenVerifier` | Verifies the token. |
| `requiredScopes` | `string[]`, optional | The token must have each of these scopes. |
| `resourceMetadataUrl` | string, optional | The URL for the `WWW-Authenticate` header. |

## In a tool handler

Test `ctx.http?.authInfo` and give a smaller result to an anonymous caller.

```ts
server.registerTool({ name: "list_items" }, async (_args, ctx) => {
  const auth = ctx.http?.authInfo;
  const items = auth ? await listAll(auth) : await listPublic();
  return { content: `Found ${items.length} items.`, structuredContent: { items } };
});
```

Declare this behavior on the tool, so a client can show the difference:

```ts
securitySchemes: [{ type: "noauth" }, { type: "oauth2" }];
```

## Related

- [`requireBearerAuth`](/docs/api/require-bearer-auth)
- [`registerTool`](/docs/api/register-tool)
