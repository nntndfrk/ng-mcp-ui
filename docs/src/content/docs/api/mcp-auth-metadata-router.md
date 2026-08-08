---
title: mcpAuthMetadataRouter
description: Serves the OAuth metadata endpoints that a client reads to discover how to sign in.
group: API
groupOrder: 5
order: 8
---

```ts
mcpAuthMetadataRouter(options: AuthMetadataOptions): Router
```

A client reads these endpoints to learn where to send the user for a sign-in, and which scopes to
ask for. Mount the router at the root of your app.

```ts
import { mcpAuthMetadataRouter } from "ng-mcp-ui/server";

app.use(
  mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: new URL("https://example.com/mcp"),
    scopesSupported: ["mcp:tools"],
  }),
);
```

Mount it at the root, not under `/mcp`. The endpoints are well-known paths, and a client reads them
from the origin.

## Options

| Option | Type | Purpose |
| --- | --- | --- |
| `oauthMetadata` | `OAuthMetadata` | The metadata of your authorization server. |
| `resourceServerUrl` | `URL` | The URL of this MCP server. It goes in the protected-resource metadata. |
| `serviceDocumentationUrl` | `URL`, optional | A documentation link for people. |
| `scopesSupported` | `string[]`, optional | The scopes that this server accepts. |
| `resourceName` | string, optional | A name to show in the resource metadata. |

## Order of the parts

An authenticated server needs three parts. Each part does a different job.

1. `mcpAuthMetadataRouter` tells a client how to sign in.
2. [`requireBearerAuth`](/docs/api/require-bearer-auth) or
   [`optionalBearerAuth`](/docs/api/optional-bearer-auth) verifies the token on each request.
3. `securitySchemes` on a tool tells a client which tools need a sign-in.

The router only publishes metadata. It does not verify a token.

## Related

- [`requireBearerAuth`](/docs/api/require-bearer-auth)
- [`optionalBearerAuth`](/docs/api/optional-bearer-auth)
