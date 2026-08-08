---
title: requireBearerAuth
description: Express middleware that rejects a request without a valid bearer token.
group: API
groupOrder: 5
order: 6
---

```ts
requireBearerAuth(options: BearerAuthMiddlewareOptions): RequestHandler
```

Put the middleware in front of the MCP router. A request without a valid token does not reach your
tools.

```ts
import { createMcpExpressRouter, requireBearerAuth } from "ng-mcp-ui/server";

app.use(
  "/mcp",
  requireBearerAuth({ verifier, requiredScopes: ["mcp:tools"] }),
  createMcpExpressRouter(server),
);
```

The middleware comes from the MCP SDK. The package re-exports it, therefore you import it from one
place.

## Options

| Option | Type | Purpose |
| --- | --- | --- |
| `verifier` | `OAuthTokenVerifier` | Verifies the token. You supply it. |
| `requiredScopes` | `string[]`, optional | The token must have each of these scopes. |
| `resourceMetadataUrl` | string, optional | The URL that the middleware puts in the `WWW-Authenticate` header. |

## Responses

| Condition | Status |
| --- | --- |
| No token, or a bad token | 401 |
| A valid token without a required scope | 403 |

## Reading the identity

After the middleware runs, the verified identity is on the request. A tool handler reads it from
the `extra` argument:

```ts
server.registerTool({ name: "whoami" }, async (_args, extra) => {
  const subject = extra.authInfo?.clientId;
  return { content: `You are ${subject}.` };
});
```

Use `extra.authInfo` for an access decision. Do not use the
[client hints](/docs/guides/client-hints) for that, because the host supplies them and they are not
verified.

## Related

- [`optionalBearerAuth`](/docs/api/optional-bearer-auth)
- [`mcpAuthMetadataRouter`](/docs/api/mcp-auth-metadata-router)
- [`mcpMiddleware`](/docs/api/mcp-middleware) for an MCP-level check on each transport
