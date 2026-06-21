#!/usr/bin/env node
// M1 SERVER-TRACK EXIT GATE — boot the built Angular SSR server and probe the
// mounted /mcp endpoint with the MCP SDK client (StreamableHTTP transport).
// Asserts:
//
//   (a) tools/list includes `echo` with view _meta (the Apps-SDK output
//       template / mcp-app resourceUri attached by registerTool({ view })).
//   (b) tools/call echo {message:"hi"} returns the message.
//   (c) resources/list + resources/read return BOTH host-variant view
//       resources (apps-sdk + ext-apps), each a well-formed shell HTML
//       containing serverUrl + viewName + `<div id="root">`.
//
// Prints PASS/FAIL per check; exits non-zero on any failure. Tears down the
// server process at the end.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const devAppRoot = resolve(__dirname, "..");

// Default Angular `application` builder output for project `dev-app` with no
// explicit outputPath: `dist/dev-app/server/server.mjs`.
const SERVER_BUNDLE = resolve(devAppRoot, "dist/dev-app/server/server.mjs");
const PORT = process.env.PORT || "4123";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MCP_URL = `${BASE_URL}/mcp`;

let failures = 0;
function check(label, ok, detail) {
  const status = ok ? "PASS" : "FAIL";
  console.log(`  [${status}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) {
    failures += 1;
  }
}

function startServer() {
  if (!existsSync(SERVER_BUNDLE)) {
    console.error(
      `verify-inspector: server bundle not found at ${SERVER_BUNDLE}\n` +
        "Build it first: `npm run build:app` (ng build) in examples/dev-app.",
    );
    process.exit(2);
  }
  const child = spawn("node", [SERVER_BUNDLE], {
    cwd: devAppRoot,
    env: { ...process.env, PORT },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => process.stderr.write(`[server] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  return child;
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // The MCP endpoint rejects GET with 405 — that proves it is mounted and
      // the server is accepting connections.
      const res = await fetch(MCP_URL, { method: "GET" });
      if (res.status === 405 || res.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `server did not become ready at ${MCP_URL} within ${timeoutMs}ms`,
  );
}

function shellOk(text, viewName) {
  return (
    typeof text === "string" &&
    text.includes('<div id="root">') &&
    text.includes(BASE_URL) && // serverUrl interpolated into the shell
    text.includes(`viewName: "${viewName}"`)
  );
}

async function main() {
  const server = startServer();
  let client;
  try {
    await waitForServer();

    client = new Client({ name: "verify-inspector", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    await client.connect(transport);

    // (a) tools/list includes echo with view _meta.
    const tools = await client.listTools();
    const echo = tools.tools.find((t) => t.name === "echo");
    check("tools/list includes `echo`", Boolean(echo), echo ? "" : "not found");
    const meta = echo?._meta ?? {};
    const hasViewMeta =
      typeof meta["openai/outputTemplate"] === "string" ||
      Boolean(
        meta.ui && typeof meta.ui === "object" && "resourceUri" in meta.ui,
      );
    check(
      "echo tool carries view _meta (outputTemplate / ui.resourceUri)",
      hasViewMeta,
      JSON.stringify(meta),
    );

    // (b) tools/call echo {message:"hi"} returns the message.
    const callRes = await client.callTool({
      name: "echo",
      arguments: { message: "hi" },
    });
    const textBlock = (callRes.content ?? []).find((c) => c.type === "text");
    const structured = callRes.structuredContent;
    const returnedMessage =
      structured && typeof structured === "object"
        ? structured.message
        : undefined;
    check(
      "tools/call echo returns the message (content)",
      textBlock?.text === "hi",
      `content=${JSON.stringify(textBlock)}`,
    );
    check(
      "tools/call echo returns the message (structuredContent)",
      returnedMessage === "hi",
      `structured=${JSON.stringify(structured)}`,
    );

    // (c) resources/list + resources/read for BOTH host variants.
    const resources = await client.listResources();
    const appsSdk = resources.resources.find((r) =>
      r.uri.startsWith("ui://views/apps-sdk/echo.html"),
    );
    const extApps = resources.resources.find((r) =>
      r.uri.startsWith("ui://views/ext-apps/echo.html"),
    );
    check(
      "resources/list includes apps-sdk view resource",
      Boolean(appsSdk),
      appsSdk?.uri,
    );
    check(
      "resources/list includes ext-apps view resource",
      Boolean(extApps),
      extApps?.uri,
    );

    for (const [label, resource] of [
      ["apps-sdk", appsSdk],
      ["ext-apps", extApps],
    ]) {
      if (!resource) {
        check(`resources/read ${label} shell HTML`, false, "resource missing");
        continue;
      }
      const read = await client.readResource({ uri: resource.uri });
      const content = (read.contents ?? [])[0];
      const text = content?.text;
      check(
        `resources/read ${label} returns well-formed shell (serverUrl + viewName + #root)`,
        shellOk(text, "echo"),
        text ? `${text.slice(0, 80)}…` : "no text",
      );
    }
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }
    server.kill("SIGKILL");
  }

  console.log("");
  if (failures > 0) {
    console.error(`verify-inspector: ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("verify-inspector: ALL CHECKS PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error("verify-inspector: fatal error", err);
  process.exit(1);
});
