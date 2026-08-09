---
title: Client hints
description: The locale, location and session data that an Apps SDK host adds to each tool call, and the correct way to use it.
group: Guides
groupOrder: 2
order: 9
---

An Apps SDK host adds data about the caller to each tool call. The host puts this data in
`params._meta`. Your tool handler reads it from the second argument.

This data gives hints only. Do not use it for authorization. Each field is optional, and the host
can omit any field. Always write code that operates correctly when a field is absent.

## How to read the hints

The second argument of a tool handler is the `extra` object. Its `_meta` field holds the hints.

```ts
server.registerTool(
  {
    name: "list_events",
    inputSchema: { query: z.string() },
  },
  async ({ query }, extra) => {
    const locale = extra._meta?.["openai/locale"] ?? "en-US";
    const city = extra._meta?.["openai/userLocation"]?.city;

    return text(await search(query, { locale, city }));
  },
);
```

TypeScript knows these keys. The handler type widens `_meta` with the `ClientHintsMeta` interface.
Therefore you get completion for each key, and you do not write a cast.

## The fields

| Key | Type | Contents |
| --- | --- | --- |
| `openai/locale` | string | The requested locale, in BCP-47 form. An example is `"en-US"`. |
| `openai/userAgent` | string | The user agent of the browser. |
| `openai/userLocation` | object | An approximate location. See the table below. |
| `openai/subject` | string | An anonymous identifier for the user. |
| `openai/session` | string | An anonymous identifier for the conversation. It is stable in one session. |
| `openai/organization` | string | An anonymous identifier for the organization of the user account. |
| `openai/widgetSessionId` | string | A stable identifier for the widget instance on screen. |

The `openai/userLocation` object has these fields. The host can send some fields and omit others.

| Field | Type |
| --- | --- |
| `city` | string |
| `region` | string |
| `country` | string |
| `timezone` | string |
| `longitude` | number |
| `latitude` | number |

## Correct use

Use the hints to make a result better. Do not use them to make a decision about access.

- **Correct.** Sort results by distance from `openai/userLocation`. Format dates with
  `openai/locale`. Group your logs by `openai/session`.
- **Not correct.** Give data to a user because `openai/subject` has a specific value. The host
  supplies these values. They are not a verified identity.

For authorization, use a bearer token. See `requireBearerAuth` and `optionalBearerAuth` in the
[server reference](/docs/reference/server).

## Host support

Only an Apps SDK host sends these hints. On an MCP Apps host, `extra._meta` does not contain them.
Give a default value for each field that you read. The example above shows this pattern with the
`??` operator.
