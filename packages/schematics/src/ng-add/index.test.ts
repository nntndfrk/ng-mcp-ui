import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SchematicTestRunner } from "@angular-devkit/schematics/testing";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

// Vitest runs this test as ESM, but the schematics runtime is CommonJS and
// `require()`s the compiled factory modules referenced by collection.json.
// So we point the runner at the BUILT dist/collection.json (produced by
// `npm run build`) and use createRequire to resolve @schematics/angular.
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..", ".."); // src/ng-add -> src -> package root
const COLLECTION_PATH = join(pkgRoot, "dist", "collection.json");
const require = createRequire(import.meta.url);

// Resolve the @schematics/angular collection via its package.json (which is in
// the package's `exports`), then join collection.json. Resolving
// collection.json directly trips vitest's resolver into appending `.js`.
const ngCollectionPath = join(
  dirname(require.resolve("@schematics/angular/package.json")),
  "collection.json",
);

async function createWorkspaceTree(
  projectName = "fixture-app",
  options: { ssr?: boolean } = {},
) {
  const ng = new SchematicTestRunner("@schematics/angular", ngCollectionPath);
  let tree = await ng.runSchematic("workspace", {
    name: "fixture-workspace",
    version: "22.0.0",
    newProjectRoot: "projects",
  });
  tree = await ng.runSchematic(
    "application",
    { name: projectName, style: "css", skipTests: true, ssr: options.ssr },
    tree,
  );
  return tree;
}

/** Rewrite the @angular/core dependency range to a given major (e.g. "19"). */
function pinAngularMajor(content: string, major: number): string {
  const pkg = JSON.parse(content);
  pkg.dependencies["@angular/core"] = `^${major}.0.0`;
  return JSON.stringify(pkg, null, 2);
}

describe("ng-add", () => {
  let runner: SchematicTestRunner;

  beforeAll(() => {
    runner = new SchematicTestRunner("ng-mcp-ui-schematics", COLLECTION_PATH);
  });

  it("adds SSR to a workspace that has none", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: false });
    expect(fixture.files).not.toContain("/projects/fixture-app/src/server.ts");

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    // @angular/ssr ng-add wires up server.ts + the SSR build options.
    expect(result.files).toContain("/projects/fixture-app/src/server.ts");
    const angularJson = JSON.parse(result.readContent("/angular.json"));
    expect(
      angularJson.projects["fixture-app"].architect.build.options.outputMode,
    ).toBe("server");
  });

  it("leaves the SSR `build` target untouched", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });
    const buildBefore = JSON.parse(fixture.readContent("/angular.json")).projects[
      "fixture-app"
    ].architect.build;

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    // SSR `build` target is left exactly as it was.
    const buildAfter = JSON.parse(result.readContent("/angular.json")).projects[
      "fixture-app"
    ].architect.build;
    expect(buildAfter).toEqual(buildBefore);
  });

  it("adds ng-mcp-ui as a dependency and schedules an install", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const result = await runner.runSchematic("ng-add", {}, fixture);

    const pkg = JSON.parse(result.readContent("/package.json"));
    expect(pkg.dependencies["ng-mcp-ui"]).toBeDefined();
    expect(runner.tasks.some((t) => t.name === "node-package")).toBe(true);
  });

  it("does not schedule an install when --skip-install is set", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    await runner.runSchematic("ng-add", { skipInstall: true }, fixture);

    expect(runner.tasks.some((t) => t.name === "node-package")).toBe(false);
  });

  // ── S25: server.ts patch ────────────────────────────────────────────────

  it("patches server.ts: mounts /mcp + asset router before the catch-all", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    const server = result.readContent("/projects/fixture-app/src/server.ts");

    // Imports inserted (insertImport emits single-quoted module specifiers).
    expect(server).toContain("ng-mcp-ui/server");
    expect(server).toContain("createMcpExpressRouter");
    expect(server).toContain("createViewAssetRouter");
    expect(server).toContain("./mcp/server");
    expect(server).toContain("createMcpServer");
    // mcp instance + routes.
    expect(server).toContain("const mcp = createMcpServer();");
    expect(server).toContain('app.use("/mcp", createMcpExpressRouter(mcp));');
    expect(server).toContain('app.use(\n  "/assets/widgets",');
    // The idempotency marker.
    expect(server).toContain("// ng-mcp-ui:mcp-routes");

    // Ordering: the MCP routes must come BEFORE the Angular SSR catch-all.
    const markerIdx = server.indexOf("// ng-mcp-ui:mcp-routes");
    // Anchor on the catch-all statement, not the earlier `angularApp` declaration,
    // so a formatting change in the handler can't false-fail this.
    const catchAllIdx = server.indexOf("app.use((req, res, next)");
    expect(markerIdx).toBeGreaterThan(-1);
    expect(catchAllIdx).toBeGreaterThan(-1);
    expect(markerIdx).toBeLessThan(catchAllIdx);
  });

  // The @angular/ssr application-builder server.ts template is identical across
  // the supported majors (v20–v22). We assert each pinned major produces the
  // patched shape so the matrix is explicit.
  for (const major of [20, 21, 22]) {
    it(`patches a pristine v${major} server.ts shape`, async () => {
      const fixture = await createWorkspaceTree("fixture-app", { ssr: true });
      fixture.overwrite(
        "/package.json",
        pinAngularMajor(fixture.readContent("/package.json"), major),
      );

      const result = await runner.runSchematic(
        "ng-add",
        { skipInstall: true },
        fixture,
      );

      const server = result.readContent("/projects/fixture-app/src/server.ts");
      expect(server).toContain('app.use("/mcp", createMcpExpressRouter(mcp));');
      expect(server).toContain("const mcp = createMcpServer();");
      // catch-all still present and after the marker.
      expect(server).toContain("angularApp");
      expect(server.indexOf("// ng-mcp-ui:mcp-routes")).toBeLessThan(
        server.lastIndexOf("app.use((req, res, next)"),
      );
    });
  }

  it("is idempotent — running twice produces no diff", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const once = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );
    const afterFirst = once.readContent("/projects/fixture-app/src/server.ts");

    const twice = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      once,
    );
    const afterSecond = twice.readContent(
      "/projects/fixture-app/src/server.ts",
    );

    expect(afterSecond).toBe(afterFirst);
    // Exactly one set of MCP routes — no duplication.
    expect(afterSecond.match(/ng-mcp-ui:mcp-routes/g)?.length).toBe(1);
    expect(
      afterSecond.match(/app\.use\("\/mcp"/g)?.length,
    ).toBe(1);
  });

  it("handles a wildcard-route catch-all (app.use('*', ...))", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });
    const exotic = [
      'import { AngularNodeAppEngine } from "@angular/ssr/node";',
      'import express from "express";',
      "",
      "const app = express();",
      "const angularApp = new AngularNodeAppEngine();",
      "",
      'app.use("*", (req, res, next) => {',
      "  res.send(angularApp);",
      "});",
      "",
    ].join("\n");
    fixture.overwrite("/projects/fixture-app/src/server.ts", exotic);

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    const server = result.readContent("/projects/fixture-app/src/server.ts");
    expect(server).toContain("// ng-mcp-ui:mcp-routes");
    expect(server.indexOf("// ng-mcp-ui:mcp-routes")).toBeLessThan(
      server.indexOf('app.use("*"'),
    );
  });

  it("bails gracefully on an unrecognized server.ts and prints manual steps", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });
    const exotic = [
      "// Some hand-rolled server that we cannot safely patch.",
      'import http from "node:http";',
      "",
      "const server = http.createServer((req, res) => res.end('hi'));",
      "server.listen(4000);",
      "",
    ].join("\n");
    fixture.overwrite("/projects/fixture-app/src/server.ts", exotic);

    const logs: string[] = [];
    runner.logger.subscribe((entry) => logs.push(entry.message));

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    // server.ts is left exactly as-is (no throw, no patch).
    expect(result.readContent("/projects/fixture-app/src/server.ts")).toBe(
      exotic,
    );
    expect(result.readContent("/projects/fixture-app/src/server.ts")).not.toContain(
      "ng-mcp-ui:mcp-routes",
    );
    // The manual-patch instructions were logged.
    const joined = logs.join("\n");
    expect(joined).toContain("Could not automatically patch src/server.ts");
    expect(joined).toContain('createMcpExpressRouter');
    expect(joined).toContain('app.use("/mcp", createMcpExpressRouter(mcp));');
  });

  // ── S26: scaffold sources + build-widgets target + npm scripts ──────────

  const SCAFFOLD_FILES = [
    "/projects/fixture-app/src/mcp/server.ts",
    "/projects/fixture-app/src/mcp/views.manifest.ts",
    "/projects/fixture-app/src/widgets/main.ts",
    "/projects/fixture-app/src/widgets/registry.ts",
    "/projects/fixture-app/src/widgets/index.html",
    "/projects/fixture-app/src/widgets/echo/echo.widget.ts",
    "/projects/fixture-app/tools/build-widgets.mjs",
    "/projects/fixture-app/tsconfig.widgets.json",
  ];

  it("scaffolds the MCP + widgets source tree with the expected anchors", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    for (const path of SCAFFOLD_FILES) {
      expect(result.files).toContain(path);
    }

    const server = result.readContent("/projects/fixture-app/src/mcp/server.ts");
    expect(server).toContain("export function createMcpServer(): McpServer");
    expect(server).toContain('name: "echo"');
    expect(server).toContain("interface ViewNameRegistry");
    // The project-name template variable was interpolated.
    expect(server).toContain('{ name: "fixture-app", version: "0.0.0" }');

    const manifest = result.readContent(
      "/projects/fixture-app/src/mcp/views.manifest.ts",
    );
    expect(manifest).toContain("export function resolveViewManifest()");

    const main = result.readContent("/projects/fixture-app/src/widgets/main.ts");
    expect(main).toContain("bootstrapWidget");

    const registry = result.readContent(
      "/projects/fixture-app/src/widgets/registry.ts",
    );
    expect(registry).toContain('echo: () => import("./echo/echo.widget")');
    expect(registry).toContain("as const");

    const widget = result.readContent(
      "/projects/fixture-app/src/widgets/echo/echo.widget.ts",
    );
    expect(widget).toContain("injectToolInfo");
    expect(widget).toContain("[dataLlm]");

    const tsconfig = result.readContent(
      "/projects/fixture-app/tsconfig.widgets.json",
    );
    expect(JSON.parse(tsconfig).include).toEqual(["src/widgets/**/*.ts"]);

    const buildWidgets = result.readContent(
      "/projects/fixture-app/tools/build-widgets.mjs",
    );
    // The `ng run <project>:build-widgets` target name was interpolated.
    expect(buildWidgets).toContain("fixture-app:build-widgets");
    expect(buildWidgets).toContain("views.manifest.json");
  });

  it("adds the `build-widgets` Angular target with the verified config", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    const angularJson = JSON.parse(result.readContent("/angular.json"));
    const target =
      angularJson.projects["fixture-app"].architect["build-widgets"];
    expect(target).toBeDefined();
    expect(target.builder).toBe("@angular/build:application");
    expect(target.options).toEqual({
      browser: "src/widgets/main.ts",
      index: "src/widgets/index.html",
      outputPath: "dist/widgets",
      tsConfig: "tsconfig.widgets.json",
      namedChunks: true,
      outputHashing: "all",
      styles: [],
    });
    expect(target.configurations.production).toEqual({ outputHashing: "all" });
    expect(target.configurations.development).toEqual({
      optimization: false,
      sourceMap: true,
    });
    expect(target.defaultConfiguration).toBe("production");
  });

  it("adds the build:widgets, dev:mcp and tunnel npm scripts", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    const pkg = JSON.parse(result.readContent("/package.json"));
    expect(pkg.scripts["build:widgets"]).toBe("node tools/build-widgets.mjs");
    expect(pkg.scripts["dev:mcp"]).toBe("ng serve");
    expect(pkg.scripts.tunnel).toContain("localhost:4200");
  });

  it("does not overwrite a pre-existing scaffold file or npm script", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });
    // Pre-author a registry the user already owns + a clashing script.
    fixture.create(
      "/projects/fixture-app/src/widgets/registry.ts",
      "export const registry = { mine: () => import('./mine') } as const;\n",
    );
    const pkgBefore = JSON.parse(fixture.readContent("/package.json"));
    pkgBefore.scripts ??= {};
    pkgBefore.scripts["build:widgets"] = "echo do-not-clobber";
    fixture.overwrite("/package.json", JSON.stringify(pkgBefore, null, 2));

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    // Existing file is respected (MergeStrategy.Default keeps the host tree's).
    expect(
      result.readContent("/projects/fixture-app/src/widgets/registry.ts"),
    ).toContain("mine");
    // Existing script is respected; the other two are still added.
    const pkg = JSON.parse(result.readContent("/package.json"));
    expect(pkg.scripts["build:widgets"]).toBe("echo do-not-clobber");
    expect(pkg.scripts["dev:mcp"]).toBe("ng serve");
  });

  it("S26 scaffold/target/scripts are idempotent across two runs", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const once = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );
    const angularAfterFirst = once.readContent("/angular.json");
    const pkgAfterFirst = once.readContent("/package.json");

    // A second run must not throw and must not duplicate anything.
    const twice = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      once,
    );

    expect(twice.readContent("/angular.json")).toBe(angularAfterFirst);
    expect(twice.readContent("/package.json")).toBe(pkgAfterFirst);

    const angularJson = JSON.parse(twice.readContent("/angular.json"));
    const architect = angularJson.projects["fixture-app"].architect;
    expect(Object.keys(architect).filter((k) => k === "build-widgets").length).toBe(
      1,
    );
    const widget = twice.readContent(
      "/projects/fixture-app/src/widgets/echo/echo.widget.ts",
    );
    expect(widget.match(/export default class EchoWidget/g)?.length).toBe(1);
  });

  it("--ssr=false still scaffolds widgets but skips the server patch", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: false });

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true, ssr: false },
      fixture,
    );

    // No SSR ⇒ no server.ts patch (no server.ts present at all).
    expect(result.files).not.toContain("/projects/fixture-app/src/server.ts");
    // But the widgets/MCP scaffold + target + scripts are still produced.
    for (const path of SCAFFOLD_FILES) {
      expect(result.files).toContain(path);
    }
    const angularJson = JSON.parse(result.readContent("/angular.json"));
    expect(
      angularJson.projects["fixture-app"].architect["build-widgets"],
    ).toBeDefined();
    const pkg = JSON.parse(result.readContent("/package.json"));
    expect(pkg.scripts["build:widgets"]).toBe("node tools/build-widgets.mjs");
  });

  it("rejects an Angular v19 workspace with a clear message", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });
    fixture.overwrite(
      "/package.json",
      pinAngularMajor(fixture.readContent("/package.json"), 19),
    );

    await expect(
      runner.runSchematic("ng-add", { skipInstall: true }, fixture),
    ).rejects.toThrow(/unsupported Angular version.*major 19.*20–22/s);
  });

  it("rejects an Angular v23 workspace", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });
    fixture.overwrite(
      "/package.json",
      pinAngularMajor(fixture.readContent("/package.json"), 23),
    );

    await expect(
      runner.runSchematic("ng-add", { skipInstall: true }, fixture),
    ).rejects.toThrow(/unsupported Angular version.*major 23/s);
  });

  // ── S29: --example chaining ─────────────────────────────────────────────

  it("--example=demo (default) chains the poll demo onto the echo baseline", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    // No explicit example ⇒ schema default "demo".
    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );

    // The demo files landed.
    expect(result.files).toContain(
      "/projects/fixture-app/src/mcp/tools/poll.ts",
    );
    expect(result.files).toContain(
      "/projects/fixture-app/src/widgets/poll/poll.widget.ts",
    );
    expect(result.files).toContain(
      "/projects/fixture-app/src/widgets/poll/poll.css",
    );

    // The poll tools are wired into createMcpServer() before `return server;`,
    // alongside the echo seed (Model 1 — additive).
    const server = result.readContent(
      "/projects/fixture-app/src/mcp/server.ts",
    );
    expect(server).toContain("registerPollTools(server);");
    expect(server.indexOf("registerPollTools(server);")).toBeLessThan(
      server.indexOf("return server;"),
    );

    // The poll view joins echo in the registry + views.d.ts.
    const registry = result.readContent(
      "/projects/fixture-app/src/widgets/registry.ts",
    );
    expect(registry).toContain('poll: () => import("./poll/poll.widget")');
    expect(registry).toContain("echo: () => import(");
    const dts = result.readContent(
      "/projects/fixture-app/src/widgets/views.d.ts",
    );
    expect(dts).toContain("poll: true;");
  });

  it("--example=minimal leaves the echo-only baseline (no poll demo)", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true, example: "minimal" },
      fixture,
    );

    expect(result.files).not.toContain(
      "/projects/fixture-app/src/widgets/poll/poll.widget.ts",
    );
    expect(
      result.readContent("/projects/fixture-app/src/mcp/server.ts"),
    ).not.toContain("registerPollTools");
  });

  it("--example=none leaves the echo-only baseline (no poll demo)", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const result = await runner.runSchematic(
      "ng-add",
      { skipInstall: true, example: "none" },
      fixture,
    );

    expect(result.files).not.toContain(
      "/projects/fixture-app/src/mcp/tools/poll.ts",
    );
    expect(
      result.readContent("/projects/fixture-app/src/mcp/server.ts"),
    ).not.toContain("registerPollTools");
  });

  it("--example=demo chained via ng-add is idempotent on a re-run", async () => {
    const fixture = await createWorkspaceTree("fixture-app", { ssr: true });

    const once = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      fixture,
    );
    const serverAfterFirst = once.readContent(
      "/projects/fixture-app/src/mcp/server.ts",
    );
    const registryAfterFirst = once.readContent(
      "/projects/fixture-app/src/widgets/registry.ts",
    );

    const twice = await runner.runSchematic(
      "ng-add",
      { skipInstall: true },
      once,
    );

    expect(twice.readContent("/projects/fixture-app/src/mcp/server.ts")).toBe(
      serverAfterFirst,
    );
    expect(
      twice.readContent("/projects/fixture-app/src/widgets/registry.ts"),
    ).toBe(registryAfterFirst);
    expect(
      twice
        .readContent("/projects/fixture-app/src/mcp/server.ts")
        .match(/registerPollTools\(server\);/g)?.length,
    ).toBe(1);
  });
});
