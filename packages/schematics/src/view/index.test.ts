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
    // Both members sit at the interface's 4-space indent — the inserted member
    // must NOT inherit the closing brace's indentation (over-indent regression).
    expect(dts).toMatch(/\n {4}foo: true;\n/);
    expect(dts).toMatch(/\n {4}bar: true;\n/);
    expect(dts).not.toMatch(/\n {6}\w/);
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

  it("--with-tool delegates to the `tool` generator: produces BOTH the view AND the paired tool (S28)", async () => {
    // S28 registers the `tool` generator in this collection, which flips the
    // `--with-tool` delegation guard live: a `view <name> --with-tool` run now
    // ALSO scaffolds + wires the paired MCP tool, linked back to the view.
    const fixture = await scaffolded();

    const result = await runner.runSchematic(
      "view",
      { name: "foo", withTool: true },
      fixture,
    );

    // The view itself is still produced.
    expect(result.files).toContain(`${WIDGETS}/foo/foo.widget.ts`);
    expect(result.files).toContain(`${WIDGETS}/views.d.ts`);

    // The paired tool was scaffolded, linked to the `foo` view, and wired into
    // createMcpServer() in server.ts.
    const toolPath = "/projects/fixture-app/src/mcp/tools/foo.ts";
    expect(result.files).toContain(toolPath);
    const toolFile = result.readContent(toolPath);
    expect(toolFile).toContain(
      "export function registerFooTool(server: McpServer): void",
    );
    expect(toolFile).toContain('component: "foo"');

    const server = result.readContent("/projects/fixture-app/src/mcp/server.ts");
    expect(server).toContain("registerFooTool(server);");
    expect(server).toContain("./tools/foo");
  });
});
