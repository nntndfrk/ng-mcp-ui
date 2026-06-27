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
});
