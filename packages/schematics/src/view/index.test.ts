import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type UnitTestTree,
  SchematicTestRunner,
} from "@angular-devkit/schematics/testing";
import { beforeAll, describe, expect, it } from "vitest";

// Vitest runs this test as ESM, but the schematics runtime is CommonJS and
// `require()`s the compiled factory modules referenced by collection.json. We
// point the runner at the BUILT dist/collection.json (`npm run build` first).
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..", ".."); // src/view -> src -> package root
const COLLECTION_PATH = join(pkgRoot, "dist", "collection.json");
const require = createRequire(import.meta.url);

const ngCollectionPath = join(
  dirname(require.resolve("@schematics/angular/package.json")),
  "collection.json",
);

async function createWorkspaceTree(
  projectName = "fixture-app",
): Promise<UnitTestTree> {
  const ng = new SchematicTestRunner("@schematics/angular", ngCollectionPath);
  let tree = await ng.runSchematic("workspace", {
    name: "fixture-workspace",
    version: "22.0.0",
    newProjectRoot: "projects",
  });
  tree = await ng.runSchematic(
    "application",
    { name: projectName, style: "css", skipTests: true, ssr: true },
    tree,
  );
  return tree;
}

const WIDGETS = "/projects/fixture-app/src/widgets";

describe("view", () => {
  let runner: SchematicTestRunner;

  /** A scaffolded fixture app (workspace -> app -> ng-add). */
  async function scaffolded(): Promise<UnitTestTree> {
    const ws = await createWorkspaceTree("fixture-app");
    return runner.runSchematic("ng-add", { skipInstall: true }, ws);
  }

  beforeAll(() => {
    runner = new SchematicTestRunner("ng-mcp-ui-schematics", COLLECTION_PATH);
  });

  it("creates the widget with the right selector + default-export class", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic("view", { name: "foo" }, fixture);

    const widgetPath = `${WIDGETS}/foo/foo.widget.ts`;
    expect(result.files).toContain(widgetPath);

    const widget = result.readContent(widgetPath);
    expect(widget).toContain('selector: "foo-widget"');
    expect(widget).toContain("export default class FooWidget");
    // The view shape: injectToolInfo + injectViewState + [dataLlm].
    expect(widget).toContain("injectToolInfo");
    expect(widget).toContain("injectViewState");
    expect(widget).toContain("[dataLlm]");
    expect(widget).toContain("ChangeDetectionStrategy.OnPush");
    expect(widget).toContain('from "ng-mcp-ui/web"');
  });

  it("inserts the registry entry before `} as const`", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic("view", { name: "foo" }, fixture);

    const registry = result.readContent(`${WIDGETS}/registry.ts`);
    expect(registry).toContain('foo: () => import("./foo/foo.widget")');
    // Seed echo entry is preserved.
    expect(registry).toContain("echo: () => import(");
    expect(registry).toContain("as const");
    // The new entry must precede the `} as const` closer.
    expect(registry.indexOf("foo:")).toBeLessThan(
      registry.indexOf("} as const"),
    );
  });

  it("creates views.d.ts with the ViewNameRegistry augmentation", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic("view", { name: "foo" }, fixture);

    const dtsPath = `${WIDGETS}/views.d.ts`;
    expect(result.files).toContain(dtsPath);
    const dts = result.readContent(dtsPath);
    expect(dts).toContain('declare module "ng-mcp-ui/server"');
    expect(dts).toContain("interface ViewNameRegistry");
    expect(dts).toContain("foo: true;");
    // `export {}` is load-bearing: it makes views.d.ts a MODULE so `declare
    // module` AUGMENTS the package rather than SHADOWING it (which would hide
    // McpServer/createMcpExpressRouter/… from the consumer's `ng build`).
    expect(dts).toMatch(/^\s*export\s*\{\s*\}\s*;?/m);
  });

  it("merges a second view into the existing views.d.ts + registry", async () => {
    const fixture = await scaffolded();

    const once = await runner.runSchematic("view", { name: "foo" }, fixture);
    const twice = await runner.runSchematic("view", { name: "bar" }, once);

    const dts = twice.readContent(`${WIDGETS}/views.d.ts`);
    expect(dts).toContain("foo: true;");
    expect(dts).toContain("bar: true;");
    // Single interface block (members merged, not duplicated blocks).
    expect(dts.match(/interface ViewNameRegistry/g)?.length).toBe(1);

    const registry = twice.readContent(`${WIDGETS}/registry.ts`);
    expect(registry).toContain('foo: () => import("./foo/foo.widget")');
    expect(registry).toContain('bar: () => import("./bar/bar.widget")');
  });

  it("throws 'already exists' on a second run of the same view", async () => {
    const fixture = await scaffolded();

    const once = await runner.runSchematic("view", { name: "foo" }, fixture);

    await expect(
      runner.runSchematic("view", { name: "foo" }, once),
    ).rejects.toThrow(/view "foo" already exists/);
  });

  it("dasherizes/classifies a multi-word name", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic(
      "view",
      { name: "quickPoll" },
      fixture,
    );

    expect(result.files).toContain(
      `${WIDGETS}/quick-poll/quick-poll.widget.ts`,
    );
    const widget = result.readContent(
      `${WIDGETS}/quick-poll/quick-poll.widget.ts`,
    );
    expect(widget).toContain('selector: "quick-poll-widget"');
    expect(widget).toContain("export default class QuickPollWidget");

    const registry = result.readContent(`${WIDGETS}/registry.ts`);
    expect(registry).toContain(
      'quickPoll: () => import("./quick-poll/quick-poll.widget")',
    );
  });

  it("still produces the widget + d.ts on an app without a registry.ts (graceful bail)", async () => {
    // A bare app (no ng-add) — no registry.ts. The widget + d.ts are still
    // produced; the registry step logs + skips rather than throwing.
    const fixture = await createWorkspaceTree("fixture-app");

    const result = await runner.runSchematic("view", { name: "foo" }, fixture);

    expect(result.files).toContain(`${WIDGETS}/foo/foo.widget.ts`);
    expect(result.files).toContain(`${WIDGETS}/views.d.ts`);
    expect(result.files).not.toContain(`${WIDGETS}/registry.ts`);
  });

  it("--with-tool is gracefully skipped while the `tool` generator is unbuilt (S28)", async () => {
    // S28's `tool` schematic is not registered in this collection yet, so the
    // `--with-tool` delegation must NOT throw: the view is still generated, and
    // the paired tool is skipped (logged) until S28 lands.
    const fixture = await scaffolded();

    const result = await runner.runSchematic(
      "view",
      { name: "foo", withTool: true },
      fixture,
    );

    // The view itself is produced regardless of the `--with-tool` outcome.
    expect(result.files).toContain(`${WIDGETS}/foo/foo.widget.ts`);
    expect(result.files).toContain(`${WIDGETS}/views.d.ts`);
    // No paired tool file — `tool` (S28) is not registered yet, so delegation
    // was skipped rather than scaffolding `mcp/tools/foo.ts`.
    expect(result.files).not.toContain(
      "/projects/fixture-app/src/mcp/tools/foo.ts",
    );
  });
});
