#!/usr/bin/env node
// S30 — cross-major fixture harness (PLAN §7.5).
//
// For one Angular major, prove the whole retrofit works end-to-end in a REAL
// freshly-scaffolded app (not a SchematicTestRunner tree — that is S26–S29):
//
//   1. pack    — `npm run build:pack` + `npm pack` the SINGLE ng-mcp-ui package.
//                Its `prepack` hook embeds the schematics into dist/schematics
//                (M7) and the package's "schematics" field ships them, so the
//                one tarball carries both the runtime lib AND the generators.
//   2. new     — `ng new` a fresh SSR app at the requested major.
//   3. install — install the local tarball + ng-mcp-ui's runtime peers (the
//                Angular peers come from what `ng new` wrote to package.json).
//   4. ng-add  — run `ng generate ng-mcp-ui:ng-add --example=demo` (retrofit:
//                SSR check, server.ts /mcp + /assets/widgets AST patch, scaffold
//                mcp/ + widgets/, build-widgets target + scripts, AND the chained
//                `example` schematic's Quick Poll demo, S29). The collection
//                resolves by the lib's package name via its `"schematics"` field;
//                `ng add` itself needs the package on a registry, so the offline
//                fixture invokes the collection directly with `ng generate`.
//   5. build   — `npm run build:widgets` (AOT widget bundle + manifest) then
//                `ng build` (SSR host). The widget build is the real cross-major
//                gate: it AOT-consumes ng-mcp-ui's ngc-partial declarables and
//                rejects (NG2012) if the partial-linker metadata is wrong for
//                this major.
//   6. probe   — boot the built SSR server and probe /mcp with the MCP SDK
//                client: echo + the Quick Poll tools (create_poll / cast_vote /
//                tally_votes) + view _meta, tools/call echo, and BOTH
//                host-variant view-resource shells (apps-sdk + ext-apps) for the
//                echo AND poll views.
//
// Any step fails => exit non-zero with a "[major N] step <name>" message so the
// CI matrix names the offending major + step (the S30 done-gate).
//
// Usage: node tools/ci-fixture.mjs --ng-version 22 [--port 4400] [--keep]
//   --keep leaves the temp fixture on disk (prints its path) for debugging.

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- args -----------------------------------------------------------------
function parseArgs(argv) {
  const out = { ngVersion: "", port: "4400", keep: false, serve: false, tunnel: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ng-version") {
      out.ngVersion = argv[++i];
    } else if (a === "--port") {
      out.port = argv[++i];
    } else if (a === "--keep") {
      out.keep = true;
    } else if (a === "--serve") {
      // Live-host mode: build the demo, then keep it serving (instead of
      // probe-and-teardown) for a manual real-host walk. See LIVE-HOST-VALIDATION.md.
      out.serve = true;
    } else if (a === "--tunnel") {
      // With --serve: also spawn a cloudflared zero-auth TryCloudflare tunnel.
      out.tunnel = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const { port, serve, tunnel } = args;
// --serve is for a local live walk; default to the host major when unspecified.
const ngVersion = args.ngVersion || (serve ? "22" : "");
// Serving requires the built app to stay on disk, so --serve implies --keep.
const keep = args.keep || serve;
if (!/^\d+$/.test(ngVersion)) {
  console.error(
    "ci-fixture: --ng-version <major> is required, e.g. --ng-version 22",
  );
  process.exit(2);
}

const APP = "fixture-app";
const tag = `[major ${ngVersion}]`;

// The runtime peers ng-mcp-ui declares (packages/ng-mcp-ui/package.json
// `peerDependencies`) that the fixture's SSR server needs at runtime. The
// `@angular/*` peers are satisfied by what `ng new` wrote to package.json at the
// requested major; here we add the non-Angular peers the generated server.ts +
// mcp/ scaffold import. Ranges are the known-good floors from the lib manifest;
// npm resolves the highest matching published version.
const PEERS = [
  "@modelcontextprotocol/sdk@>=1.27.0",
  "@modelcontextprotocol/ext-apps@^1.7.0",
  "express@^5.0.0",
  "zod@^4.0.0",
];

// ---- shell helpers --------------------------------------------------------
function run(step, cmd, args, opts = {}) {
  console.log(`\n${tag} step ${step}: ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    encoding: "utf8",
    env: { ...process.env, NG_CLI_ANALYTICS: "false", CI: "true" },
    ...opts,
  });
  if (r.status !== 0) {
    fail(step, `\`${cmd} ${args.join(" ")}\` exited ${r.status ?? r.signal}`);
  }
  return r;
}

let fixtureDir = "";
function fail(step, detail) {
  console.error(`\n${tag} FAIL at step "${step}": ${detail}`);
  if (keep && fixtureDir) {
    console.error(`${tag} fixture kept at ${fixtureDir}`);
  } else if (fixtureDir) {
    // `fixtureDir` is `<workDir>/<APP>`; remove the whole temp workspace so a
    // failed run doesn't leak the parent dir across repeated invocations.
    rmSync(dirname(fixtureDir), { recursive: true, force: true });
  }
  process.exit(1);
}

// Create a temp dir and return its CANONICAL (symlink-resolved) path. macOS
// `$TMPDIR` is `/var/folders/...`, a symlink to `/private/var/folders/...`. The
// built SSR `server.ts` gates `app.listen()` on `@angular/ssr`'s
// `isMainModule(import.meta.url)`, which compares the symlink-resolved
// `import.meta.url` against `process.argv[1]`. If we spawn `node` with an
// uncanonicalized `/var/...` path, the two disagree and the server never
// listens. realpathSync up front keeps every derived path canonical (no-op on
// Linux CI, where `/tmp` is not a symlink).
function mkCanonTemp(prefix) {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

// Build (ngc + embed the schematics into dist/schematics, M7) then pack the lib.
// `npm pack` also runs the `prepack` hook (re-embed), so the tarball always
// carries the embedded collection.
function packLib(pkgDir, dest) {
  run("pack", "npm", ["run", "build:pack"], { cwd: pkgDir });
  run("pack", "npm", ["pack", "--pack-destination", dest], { cwd: pkgDir });
}

function findTarball(dir, namePrefix) {
  // Require a digit right after the prefix so a version-agnostic prefix
  // (`ng-mcp-ui-`) matches `ng-mcp-ui-<version>.tgz` across major bumps without
  // also matching a sibling like `ng-mcp-ui-schematics-*.tgz`.
  const f = readdirSync(dir).find(
    (x) =>
      x.startsWith(namePrefix) &&
      x.endsWith(".tgz") &&
      /^\d/.test(x.slice(namePrefix.length)),
  );
  if (!f) {
    fail("pack", `no tarball matching ${namePrefix}*.tgz in ${dir}`);
  }
  return join(dir, f);
}

function ngBin() {
  const bin = join(fixtureDir, "node_modules", ".bin", "ng");
  if (!existsSync(bin)) {
    fail("install", `Angular CLI not found at ${bin}`);
  }
  return bin;
}

// ---- probe (mirrors examples/dev-app verify-inspector, fixture-agnostic) ---
function findServerBundle() {
  // Default `application` builder output: dist/<app>/server/server.mjs.
  const guess = join(fixtureDir, "dist", APP, "server", "server.mjs");
  if (existsSync(guess)) {
    return guess;
  }
  // Fallback: walk dist/*/server/server.mjs.
  const distRoot = join(fixtureDir, "dist");
  if (existsSync(distRoot)) {
    for (const proj of readdirSync(distRoot)) {
      const cand = join(distRoot, proj, "server", "server.mjs");
      if (existsSync(cand) && statSync(cand).isFile()) {
        return cand;
      }
    }
  }
  fail("probe", `no SSR server bundle under ${distRoot}`);
}

async function waitForServer(mcpUrl, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(mcpUrl, { method: "GET" });
      if (res.status === 405 || res.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server not ready at ${mcpUrl} within ${timeoutMs}ms`);
}

async function probe() {
  const bundle = findServerBundle();
  const base = `http://127.0.0.1:${port}`;
  const mcpUrl = `${base}/mcp`;

  const server = spawn("node", [bundle], {
    cwd: fixtureDir,
    env: { ...process.env, PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // A spawn failure (bad bundle path, perms) emits 'error'; without a handler
  // it becomes an unhandled exception that crashes the run with no tagged step
  // or cleanup. Route it through fail() for a consistent `[major N] step probe`.
  server.on("error", (e) =>
    fail("probe", `failed to spawn SSR server (${bundle}): ${e.message}`),
  );
  server.stdout.on("data", (d) => process.stderr.write(`[server] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(
      `  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`,
    );
    if (!ok) {
      failures++;
    }
  };
  const hasViewMeta = (meta) =>
    typeof meta["openai/outputTemplate"] === "string" ||
    Boolean(meta.ui && typeof meta.ui === "object" && "resourceUri" in meta.ui);
  const shellOk = (text, viewName) =>
    typeof text === "string" &&
    text.includes('<div id="root">') &&
    text.includes(base) &&
    text.includes(`viewName: "${viewName}"`);

  let client;
  try {
    await waitForServer(mcpUrl);
    client = new Client({ name: "ci-fixture", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name).join(", ");

    // --- echo baseline (S26) ---
    const echo = tools.tools.find((t) => t.name === "echo");
    check("tools/list includes `echo`", Boolean(echo), echo ? "" : "not found");
    check(
      "echo tool carries view _meta",
      hasViewMeta(echo?._meta ?? {}),
      JSON.stringify(echo?._meta ?? {}),
    );

    const callRes = await client.callTool({
      name: "echo",
      arguments: { message: "hi" },
    });
    const structured = callRes.structuredContent;
    check(
      "tools/call echo returns the message",
      structured &&
        typeof structured === "object" &&
        structured.message === "hi",
      `structured=${JSON.stringify(structured)}`,
    );

    const resources = await client.listResources();
    const findRes = (uriPrefix) =>
      resources.resources.find((r) => r.uri.startsWith(uriPrefix));

    const echoAppsSdk = findRes("ui://views/apps-sdk/echo.html");
    const echoExtApps = findRes("ui://views/ext-apps/echo.html");
    check(
      "resources/list includes apps-sdk echo view",
      Boolean(echoAppsSdk),
      echoAppsSdk?.uri,
    );
    check(
      "resources/list includes ext-apps echo view",
      Boolean(echoExtApps),
      echoExtApps?.uri,
    );
    for (const [label, resource] of [
      ["apps-sdk", echoAppsSdk],
      ["ext-apps", echoExtApps],
    ]) {
      if (!resource) {
        check(`resources/read ${label} echo shell`, false, "resource missing");
        continue;
      }
      const read = await client.readResource({ uri: resource.uri });
      const text = (read.contents ?? [])[0]?.text;
      check(
        `resources/read ${label} well-formed echo shell`,
        shellOk(text, "echo"),
        text ? `${text.slice(0, 60)}…` : "no text",
      );
    }

    // --- S29 chained `example` demo: the Quick Poll tools ---
    // create_poll is the view tool (carries the `poll` view); cast_vote /
    // tally_votes are view→server (no view). Confirmed against
    // packages/schematics/src/example/files/src/mcp/tools/poll.ts.template.
    const createPoll = tools.tools.find((t) => t.name === "create_poll");
    check(
      "tools/list includes `create_poll`",
      Boolean(createPoll),
      createPoll ? "" : "not found",
    );
    check(
      "create_poll carries view _meta",
      hasViewMeta(createPoll?._meta ?? {}),
      JSON.stringify(createPoll?._meta ?? {}),
    );
    check(
      "tools/list includes `cast_vote` + `tally_votes`",
      Boolean(tools.tools.find((t) => t.name === "cast_vote")) &&
        Boolean(tools.tools.find((t) => t.name === "tally_votes")),
      toolNames,
    );

    const pollAppsSdk = findRes("ui://views/apps-sdk/poll.html");
    const pollExtApps = findRes("ui://views/ext-apps/poll.html");
    check(
      "resources/list includes apps-sdk poll view",
      Boolean(pollAppsSdk),
      pollAppsSdk?.uri,
    );
    check(
      "resources/list includes ext-apps poll view",
      Boolean(pollExtApps),
      pollExtApps?.uri,
    );
    for (const [label, resource] of [
      ["apps-sdk", pollAppsSdk],
      ["ext-apps", pollExtApps],
    ]) {
      if (!resource) {
        check(`resources/read ${label} poll shell`, false, "resource missing");
        continue;
      }
      const read = await client.readResource({ uri: resource.uri });
      const text = (read.contents ?? [])[0]?.text;
      check(
        `resources/read ${label} well-formed poll shell`,
        shellOk(text, "poll"),
        text ? `${text.slice(0, 60)}…` : "no text",
      );
    }

    // Exercise the poll demo's RUNTIME handlers (create → vote → tally), not
    // just their registration — a `registerPollTools` / handler / in-memory
    // store regression in the chained example demo would pass a list-only check.
    const createRes = await client.callTool({
      name: "create_poll",
      arguments: { question: "Lunch?", options: ["Pizza", "Sushi"] },
    });
    const created = createRes.structuredContent;
    const pollId =
      created && typeof created === "object" ? created.pollId : undefined;
    check(
      "tools/call create_poll returns a snapshot with a pollId",
      typeof pollId === "string" && pollId.length > 0,
      `structured=${JSON.stringify(created)}`,
    );
    if (typeof pollId === "string" && pollId.length > 0) {
      await client.callTool({
        name: "cast_vote",
        arguments: { pollId, option: "Pizza" },
      });
      const tallyRes = await client.callTool({
        name: "tally_votes",
        arguments: { pollId },
      });
      const tallied = tallyRes.structuredContent;
      const pizza =
        tallied && typeof tallied === "object" && Array.isArray(tallied.tally)
          ? tallied.tally.find((t) => t.option === "Pizza")
          : undefined;
      check(
        "tools/call cast_vote → tally_votes counts the vote",
        Boolean(pizza) && pizza.count === 1 && tallied.total === 1,
        `tally=${JSON.stringify(tallied)}`,
      );
    }
  } catch (err) {
    check("probe connect/exchange", false, String(err?.message ?? err));
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

  if (failures > 0) {
    fail("probe", `${failures} /mcp check(s) failed`);
  }
  console.log(`\n${tag} probe: ALL /mcp CHECKS PASSED`);
}

// ---- serve (live-host validation) -----------------------------------------
// Boot the built fixture and KEEP it serving (optionally behind a cloudflared
// zero-auth TryCloudflare tunnel) for a manual real-host walk on Claude /
// ChatGPT. Unlike probe(), the server is not torn down — it runs until Ctrl-C.
// This is the `bootstrapWidget` live-host gate the unit/inspector/fixture gates
// structurally cannot cover (does the widget RENDER + BEHAVE in a real host).
async function liveServe() {
  const bundle = findServerBundle();
  const localBase = `http://localhost:${port}`;
  const mcpUrl = `${localBase}/mcp`;

  const server = spawn("node", [bundle], {
    cwd: fixtureDir,
    env: { ...process.env, PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.on("error", (e) =>
    fail("serve", `failed to spawn SSR server (${bundle}): ${e.message}`),
  );
  server.stdout.on("data", (d) => process.stderr.write(`[server] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  await waitForServer(mcpUrl);
  console.log(`\n${tag} ✅ demo SSR host serving at ${localBase}`);
  console.log(`${tag}    MCP endpoint (local): ${mcpUrl}`);
  console.log(`${tag}    fixture app: ${fixtureDir}`);

  let tunnelProc = null;
  if (tunnel) {
    tunnelProc = spawn("cloudflared", ["tunnel", "--url", localBase], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    tunnelProc.on("error", (e) =>
      console.error(
        `${tag} cloudflared failed (${e.message}). Start it yourself: cloudflared tunnel --url ${localBase}`,
      ),
    );
    const onTunnelData = (d) => {
      const s = String(d);
      process.stderr.write(`[tunnel] ${s}`);
      const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        console.log(`\n${tag} 🌐 PUBLIC URL: ${m[0]}`);
        console.log(
          `${tag} 👉 paste THIS into the host connector: ${m[0]}/mcp\n`,
        );
      }
    };
    tunnelProc.stdout.on("data", onTunnelData);
    tunnelProc.stderr.on("data", onTunnelData);
  } else {
    console.log(
      `\n${tag} to expose publicly (zero-auth): cloudflared tunnel --url ${localBase}`,
    );
    console.log(
      `${tag} then paste <public-url>/mcp into the host connector (see LIVE-HOST-VALIDATION.md).`,
    );
  }
  console.log(`\n${tag} press Ctrl-C to stop.\n`);

  // Keep alive until interrupted; clean up children on the way out.
  await new Promise((resolveExit) => {
    const shutdown = () => {
      console.log(`\n${tag} shutting down…`);
      try {
        server.kill("SIGKILL");
      } catch {
        // ignore
      }
      if (tunnelProc) {
        try {
          tunnelProc.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
      resolveExit();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    server.on("exit", (code) => {
      console.error(`${tag} SSR server exited (code ${code}).`);
      shutdown();
    });
  });
}

// ---- main -----------------------------------------------------------------
async function main() {
  const started = process.hrtime.bigint();
  console.log(`${tag} ng-mcp-ui cross-major fixture run`);

  // 1. pack the single ng-mcp-ui package (with embedded schematics).
  const packDir = mkCanonTemp("ng-mcp-ui-packs-");
  packLib(join(repoRoot, "packages", "ng-mcp-ui"), packDir);
  const libTar = findTarball(packDir, "ng-mcp-ui-");

  // 2. ng new (fresh SSR app at the requested major). --skip-install so we do a
  //    single resolve in step 3 that also pulls our local pack + peers.
  const workDir = mkCanonTemp(`ng-mcp-ui-fixture-${ngVersion}-`);
  fixtureDir = join(workDir, APP);
  run(
    "new",
    "npx",
    [
      "-y",
      `@angular/cli@${ngVersion}`,
      "new",
      APP,
      "--ssr",
      "--style=css",
      "--routing=false",
      "--skip-git",
      "--skip-install",
      "--defaults",
    ],
    { cwd: workDir },
  );

  // 3. install the local pack + ng-mcp-ui's runtime peers (one resolve, which
  //    also installs the Angular deps ng new wrote to package.json).
  run(
    "install",
    "npm",
    ["install", "--no-audit", "--no-fund", libTar, ...PEERS],
    { cwd: fixtureDir },
  );

  // 4. retrofit. We invoke the collection BY THE LIB'S PACKAGE NAME
  //    (`ng-mcp-ui:ng-add`) — which only resolves because the merged lib carries
  //    a `"schematics"` field pointing at the embedded collection (the M7
  //    deliverable). This is exactly the collection `ng add ng-mcp-ui` would run;
  //    we use `ng generate` rather than `ng add` only because `ng add` always
  //    queries the npm registry for a compatible version, which can't resolve our
  //    UNPUBLISHED local tarball offline (registry fetch is CLI machinery, not
  //    our code). --skip-install: deps are present from step 3 (ng-add's
  //    addPackageJsonDependency is overwrite:false). --example=demo chains the
  //    `example` schematic's Quick Poll demo (S29) on top of the echo baseline.
  run(
    "ng-add",
    ngBin(),
    [
      "generate",
      "ng-mcp-ui:ng-add",
      "--skip-install",
      "--example=demo",
      "--defaults",
    ],
    { cwd: fixtureDir },
  );

  // 5. build widgets (AOT, the cross-major declarable gate) then the SSR host.
  run("build:widgets", "npm", ["run", "build:widgets"], { cwd: fixtureDir });
  run("build", ngBin(), ["build"], { cwd: fixtureDir });

  const secs = Number(process.hrtime.bigint() - started) / 1e9;

  // 6a. live-host mode — keep the built demo serving for a manual real-host walk.
  if (serve) {
    console.log(`\n${tag} BUILD COMPLETE in ${secs.toFixed(0)}s — entering live-host serve mode.`);
    await liveServe();
    return; // liveServe() owns the rest of the lifecycle (and we keep the app).
  }

  // 6b. CI mode — probe the running /mcp, then tear down (unless --keep).
  await probe();
  console.log(`\n${tag} ALL STEPS PASSED in ${secs.toFixed(0)}s`);

  if (keep) {
    console.log(`${tag} fixture kept at ${fixtureDir}`);
  } else {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(packDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  fail("fatal", String(err?.stack ?? err));
});
