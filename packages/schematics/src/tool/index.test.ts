import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type UnitTestTree,
  SchematicTestRunner,
} from "@angular-devkit/schematics/testing";
import { beforeAll, describe, expect, it } from "vitest";

// Vitest runs this test as ESM, but the schematics runtime is CommonJS and
// `require()`s the compiled factory modules referenced by collection.json. So
// we point the runner at the BUILT dist/collection.json (produced by
// `npm run build`) and use createRequire to resolve @schematics/angular.
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..", ".."); // src/tool -> src -> package root
const COLLECTION_PATH = join(pkgRoot, "dist", "collection.json");
const require = createRequire(import.meta.url);

const ngCollectionPath = join(
  dirname(require.resolve("@schematics/angular/package.json")),
  "collection.json",
);

const TOOLS = "/projects/fixture-app/src/mcp/tools";
const SERVER = "/projects/fixture-app/src/mcp/server.ts";

describe("tool", () => {
  let runner: SchematicTestRunner;

  /** A scaffolded fixture app (workspace -> app -> ng-add). ng-add scaffolds
   *  src/mcp/server.ts + the widgets tree (echo view registered), so server.ts
   *  exists for the tool wiring to patch. */
  async function scaffolded(): Promise<UnitTestTree> {
    const ng = new SchematicTestRunner("@schematics/angular", ngCollectionPath);
    let tree = await ng.runSchematic("workspace", {
      name: "fixture-workspace",
      version: "22.0.0",
      newProjectRoot: "projects",
    });
    tree = await ng.runSchematic(
      "application",
      { name: "fixture-app", style: "css", skipTests: true, ssr: true },
      tree,
    );
    return runner.runSchematic("ng-add", { skipInstall: true }, tree);
  }

  beforeAll(() => {
    runner = new SchematicTestRunner("ng-mcp-ui-schematics", COLLECTION_PATH);
  });

  it("scaffolds src/mcp/tools/<name>.ts with zod schemas + registerTool", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic("tool", { name: "bar" }, fixture);

    expect(result.files).toContain(`${TOOLS}/bar.ts`);
    const toolFile = result.readContent(`${TOOLS}/bar.ts`);
    expect(toolFile).toContain(
      "export function registerBarTool(server: McpServer): void",
    );
    expect(toolFile).toContain('import { McpServer } from "ng-mcp-ui/server";');
    expect(toolFile).toContain('import { z } from "zod";');
    expect(toolFile).toContain('name: "bar"');
    expect(toolFile).toContain("inputSchema: { message: z.string() }");
    expect(toolFile).toContain("outputSchema: { message: z.string() }");
    expect(toolFile).toContain("structuredContent: { message }");
    // No --view ⇒ no view config block.
    expect(toolFile).not.toContain("view: {");
  });

  it("wires the import + registerBarTool(server) before `return server;`", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic("tool", { name: "bar" }, fixture);

    const server = result.readContent(SERVER);
    expect(server).toContain("./tools/bar");
    expect(server).toContain("registerBarTool");
    expect(server).toContain("registerBarTool(server);");

    // Ordering: the registration call must precede `return server;`.
    const callIdx = server.indexOf("registerBarTool(server);");
    const returnIdx = server.indexOf("return server;");
    expect(callIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeLessThan(returnIdx);

    // Formatting: the inserted call keeps the body's 2-space indent and leaves a
    // blank line before `return` (matches the ng-add template formatting).
    expect(server).toMatch(/\n {2}registerBarTool\(server\);\n\n {2}return server;/);
  });

  it('--view <existing> wires `view: { component: "echo" }` into the config', async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic(
      "tool",
      { name: "baz", view: "echo" },
      fixture,
    );

    const toolFile = result.readContent(`${TOOLS}/baz.ts`);
    expect(toolFile).toContain("view: {");
    expect(toolFile).toContain('component: "echo"');
    // Still wired into the server.
    const server = result.readContent(SERVER);
    expect(server).toContain("registerBazTool(server);");
  });

  it("warns (non-fatally) when --view names a view not in the registry", async () => {
    const fixture = await scaffolded();

    const logs: string[] = [];
    runner.logger.subscribe((e) => logs.push(e.message));

    const result = await runner.runSchematic(
      "tool",
      { name: "qux", view: "nope" },
      fixture,
    );

    // Tool is still generated + wired with the (unknown) view reference.
    const toolFile = result.readContent(`${TOOLS}/qux.ts`);
    expect(toolFile).toContain('component: "nope"');
    expect(logs.join("\n")).toContain('--view "nope" is not registered');
  });

  it("does NOT warn for a camelCase --view that IS registered (raw-key match)", async () => {
    // The `view` schematic registers the RAW key `castVote`; warnUnknownView must
    // match the raw name, not a dasherized `cast-vote` (regression: false warn).
    const fixture = await scaffolded();
    const withView = await runner.runSchematic(
      "view",
      { name: "castVote" },
      fixture,
    );

    const logs: string[] = [];
    runner.logger.subscribe((e) => logs.push(e.message));

    const result = await runner.runSchematic(
      "tool",
      { name: "vote", view: "castVote" },
      withView,
    );

    expect(result.readContent(`${TOOLS}/vote.ts`)).toContain(
      'component: "castVote"',
    );
    expect(logs.join("\n")).not.toContain("is not registered");
  });

  it("wires with the resolved instance name (non-`server`) + only inside createMcpServer", async () => {
    // server.ts where the McpServer instance is `mcp`, plus a decoy helper with
    // its own `return server;` BEFORE createMcpServer. The register call must
    // target `mcp` (not a hard-coded `server`) and land inside createMcpServer,
    // not at the decoy's return.
    const fixture = await scaffolded();
    const custom = [
      'import { McpServer } from "ng-mcp-ui/server";',
      "",
      "function decoy(server: McpServer): McpServer {",
      "  return server;",
      "}",
      "",
      "export function createMcpServer(): McpServer {",
      "  const mcp = new McpServer({ name: 'x', version: '0.0.0' });",
      "  return mcp;",
      "}",
      "",
    ].join("\n");
    fixture.overwrite(SERVER, custom);

    const result = await runner.runSchematic("tool", { name: "bar" }, fixture);
    const server = result.readContent(SERVER);

    // Targets the resolved instance name.
    expect(server).toContain("registerBarTool(mcp);");
    expect(server).not.toContain("registerBarTool(server);");
    // Lands before createMcpServer's `return mcp;`, NOT the decoy's `return server;`.
    expect(server).toMatch(/registerBarTool\(mcp\);\n\n {2}return mcp;/);
    const decoyIdx = server.indexOf("return server;");
    expect(server.indexOf("registerBarTool(mcp);")).toBeGreaterThan(decoyIdx);
  });

  it("throws when the tool already exists", async () => {
    const fixture = await scaffolded();
    const once = await runner.runSchematic("tool", { name: "bar" }, fixture);

    await expect(
      runner.runSchematic("tool", { name: "bar" }, once),
    ).rejects.toThrow(/already exists/);
  });

  it("re-wiring the same tool is idempotent (no duplicate import/call)", async () => {
    const fixture = await scaffolded();
    const once = await runner.runSchematic("tool", { name: "bar" }, fixture);
    const serverAfterFirst = once.readContent(SERVER);

    // Delete the tool file so the exists-guard passes, then re-run the SAME
    // tool: the server wiring must NOT be duplicated.
    once.delete(`${TOOLS}/bar.ts`);
    const twice = await runner.runSchematic("tool", { name: "bar" }, once);
    const serverAfterSecond = twice.readContent(SERVER);

    expect(serverAfterSecond).toBe(serverAfterFirst);
    expect(serverAfterSecond.match(/registerBarTool\(server\);/g)?.length).toBe(
      1,
    );
    expect(serverAfterSecond.match(/\.\/tools\/bar/g)?.length).toBe(1);
  });

  it("dasherizes/classifies a multi-word name", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic(
      "tool",
      { name: "castVote" },
      fixture,
    );

    expect(result.files).toContain(`${TOOLS}/cast-vote.ts`);
    const toolFile = result.readContent(`${TOOLS}/cast-vote.ts`);
    expect(toolFile).toContain(
      "export function registerCastVoteTool(server: McpServer): void",
    );
    expect(toolFile).toContain('name: "cast-vote"');

    const server = result.readContent(SERVER);
    expect(server).toContain("registerCastVoteTool(server);");
    expect(server).toContain("./tools/cast-vote");
  });
});
