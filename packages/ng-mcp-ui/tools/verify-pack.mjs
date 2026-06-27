#!/usr/bin/env node
// Skeleton done-gate: pack the package, install the tarball into a throwaway
// scratch project alongside its declared peers, and assert that every subpath
// export resolves — importing /server for its NG_MCP_UI_VERSION, and resolving
// /web, /testing, /tunnel (resolve-only, since the Angular entries will later
// ship partial-compiled declarables that must not be eagerly JIT-imported in a
// plain Node context). The schematics-embedding assertions return with the M7
// single-package merge. Scratch lives in the OS tmp dir, never inside the repo.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), "ng-mcp-ui-pack-"));

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`\`${cmd} ${args.join(" ")}\` failed (exit ${r.status})`);
  }
}

function runCapture(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    process.stderr.write(r.stderr ?? "");
    throw new Error(`\`${cmd} ${args.join(" ")}\` failed (exit ${r.status})`);
  }
  return r.stdout;
}

try {
  // 1. Build, then pack into the scratch dir.
  run("npm", ["run", "build"], pkgRoot);
  run("npm", ["pack", "--pack-destination", scratch], pkgRoot);
  const tarball = readdirSync(scratch).find((f) => f.endsWith(".tgz"));
  if (!tarball) {
    throw new Error("npm pack produced no tarball");
  }

  // 2. Scratch project: install the tarball + its declared peers.
  writeFileSync(
    join(scratch, "package.json"),
    `${JSON.stringify(
      { name: "scratch-consumer", version: "1.0.0", type: "module", private: true },
      null,
      2,
    )}\n`,
  );
  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      `./${tarball}`,
      "@modelcontextprotocol/sdk@^1.29.0",
      "@modelcontextprotocol/ext-apps@^1.7.3",
      "express@^5.2.1",
      "zod@^4.3.6",
    ],
    scratch,
  );

  // 3. Resolve the subpath exports.
  const probe = `
    const { NG_MCP_UI_VERSION: server } = await import("ng-mcp-ui/server");
    if (server !== "0.0.0") {
      throw new Error("unexpected /server version: " + server);
    }
    for (const entry of ["web", "testing", "tunnel"]) {
      const url = import.meta.resolve("ng-mcp-ui/" + entry);
      if (!url.endsWith("/dist/" + entry + "/index.js")) {
        throw new Error("unexpected /" + entry + " resolution: " + url);
      }
      console.log("ng-mcp-ui/" + entry.padEnd(7) + " ->", url);
    }
    console.log("ng-mcp-ui/server  ->", server);
  `;
  process.stdout.write(runCapture("node", ["--input-type=module", "-e", probe], scratch));
  console.log(
    "\nverify-pack: OK — all four subpath exports resolve from a packed install.",
  );

  // 4. Assert the embedded schematics shipped in the tarball. `npm pack` runs
  //    this package's `prepack` → embed-schematics, so the installed tree must
  //    carry the `"schematics"` field and the embedded collection + ng-add
  //    factory under dist/schematics.
  const schematicsProbe = `
    import { existsSync } from "node:fs";
    import { dirname, join } from "node:path";
    import { fileURLToPath } from "node:url";
    const pkgJsonUrl = import.meta.resolve("ng-mcp-ui/package.json");
    const pkgDir = dirname(fileURLToPath(pkgJsonUrl));
    const { default: pkg } = await import(pkgJsonUrl, { with: { type: "json" } });
    if (pkg.schematics !== "./dist/schematics/collection.json") {
      throw new Error("unexpected schematics field: " + pkg.schematics);
    }
    for (const rel of [
      "dist/schematics/collection.json",
      "dist/schematics/ng-add/index.js",
      "dist/schematics/view/index.js",
      "dist/schematics/view/schema.json",
      // The generators read these template trees at RUNTIME, so a packaging
      // regression that drops the files trees from the tarball would break ng
      // generate / ng add even with the factories present. Assert a concrete
      // template from each tree actually shipped (embed-schematics only checks
      // the pre-pack dist; this checks the installed tarball).
      "dist/schematics/ng-add/files/src/widgets/registry.ts.template",
      "dist/schematics/view/files/__name@dasherize__/__name@dasherize__.widget.ts.template",
    ]) {
      const abs = join(pkgDir, rel);
      if (!existsSync(abs)) {
        throw new Error("embedded schematics asset missing: " + rel);
      }
      console.log("ng-mcp-ui/" + rel + " ->", abs);
    }
    console.log("ng-mcp-ui schematics field ->", pkg.schematics);
  `;
  process.stdout.write(
    runCapture("node", ["--input-type=module", "-e", schematicsProbe], scratch),
  );
  console.log(
    "\nverify-pack: OK — embedded schematics collection + ng-add factory shipped.",
  );
} catch (err) {
  console.error(`\nverify-pack: FAILED — ${err.message}`);
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
