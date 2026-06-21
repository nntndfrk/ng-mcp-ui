// S06 wire-through: McpServer + IndexHtmlViewManifest(spike fixture) +
// AngularShellRenderer → the production `resources/read` shell references the
// hashed entry bundle resolved from the parsed index.html.

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpExpressRouter } from "./express.js";
import { IndexHtmlViewManifest } from "./index-html-manifest.js";
import { McpServer } from "./server.js";
import { AngularShellRenderer } from "./shell-templates.js";
import type { ViewName } from "./types.js";

const SPIKE_INDEX_HTML = `<!doctype html>
<html data-beasties-container>
<head><meta charset="utf-8"><title>widgets</title></head>
<body><div id="root"></div><link rel="modulepreload" href="chunk-YA22Z7VT.js"><link rel="modulepreload" href="chunk-ZNJYLT2K.js"><script src="main-XBYE53NT.js" type="module"></script></body>
</html>
`;

const ACCEPT_BOTH = "application/json, text/event-stream";

afterEach(() => {
  delete process.env.NODE_ENV;
});

describe("S06 wire-through: index.html manifest → production shell", () => {
  it("resources/read shell script src is {serverUrl}/assets/widgets/main-XBYE53NT.js", async () => {
    process.env.NODE_ENV = "production";

    const manifest = new IndexHtmlViewManifest({ html: SPIKE_INDEX_HTML });
    const server = new McpServer(
      { name: "t", version: "0.0.0" },
      {
        viewManifest: manifest,
        shellRenderer: new AngularShellRenderer("production", manifest),
      },
    );
    server.registerTool(
      { name: "show", view: { component: "demo" as ViewName } },
      () => ({ content: [{ type: "text", text: "ok" }] }),
    );

    const app = express();
    app.use(express.json());
    app.use("/mcp", createMcpExpressRouter(server));

    // Production view URIs carry a `?v=` hash; discover it from resources/list.
    const list = await request(app)
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .send({ jsonrpc: "2.0", id: 1, method: "resources/list", params: {} });
    const resources = list.body.result.resources as Array<{ uri: string }>;
    const uri = resources.find((r) => r.uri.includes("apps-sdk/demo"))?.uri;
    expect(uri).toBeDefined();

    const res = await request(app)
      .post("/mcp")
      .set("Accept", ACCEPT_BOTH)
      .set("Host", "example.com")
      .send({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/read",
        params: { uri },
      });

    expect(res.status).toBe(200);
    const text = res.body.result.contents[0].text as string;
    expect(text).toContain(
      'src="https://example.com/assets/widgets/main-XBYE53NT.js"',
    );
    // Spike build inlined CSS (beasties) → no stylesheet link in the shell.
    expect(text).not.toContain('rel="stylesheet"');
  });
});
