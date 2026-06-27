import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type UnitTestTree,
  SchematicTestRunner,
} from "@angular-devkit/schematics/testing";
import { beforeAll, describe, expect, it } from "vitest";

// Vitest runs this as ESM, but the schematics runtime is CommonJS and
// `require()`s the compiled factory modules referenced by collection.json. Point
// the runner at the BUILT dist/collection.json (`npm run build` first).
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..", ".."); // src/example -> src -> package root
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

const SRC = "/projects/fixture-app/src";
const WIDGETS = `${SRC}/widgets`;
const SERVER = `${SRC}/mcp/server.ts`;

describe("example", () => {
  let runner: SchematicTestRunner;

  /** A scaffolded fixture app (workspace -> app -> ng-add, echo baseline only). */
  async function scaffolded(): Promise<UnitTestTree> {
    const ws = await createWorkspaceTree("fixture-app");
    // example=none so ng-add leaves the echo baseline alone; the test then runs
    // `example` itself.
    return runner.runSchematic(
      "ng-add",
      { skipInstall: true, example: "none" },
      ws,
    );
  }

  beforeAll(() => {
    runner = new SchematicTestRunner("ng-mcp-ui-schematics", COLLECTION_PATH);
  });

  it("scaffolds the poll demo files (variant=demo)", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic(
      "example",
      { variant: "demo" },
      fixture,
    );

    expect(result.files).toContain(`${SRC}/mcp/tools/poll.ts`);
    expect(result.files).toContain(`${WIDGETS}/poll/poll.widget.ts`);
    expect(result.files).toContain(`${WIDGETS}/poll/poll.css`);

    // poll.ts is the locked source verbatim — the three demo tools.
    const poll = result.readContent(`${SRC}/mcp/tools/poll.ts`);
    expect(poll).toContain(
      "export function registerPollTools(server: McpServer): void",
    );
    expect(poll).toContain('name: "create_poll"');
    expect(poll).toContain('name: "cast_vote"');
    expect(poll).toContain('name: "tally_votes"');

    // The widget mounts via the full inject* surface.
    const widget = result.readContent(`${WIDGETS}/poll/poll.widget.ts`);
    expect(widget).toContain("export default class PollWidget");
    expect(widget).toContain('from "ng-mcp-ui/web"');
    expect(widget).toContain('styleUrl: "./poll.css"');
  });

  it("wires registerPollTools(server) before `return server;`", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic(
      "example",
      { variant: "demo" },
      fixture,
    );

    const server = result.readContent(SERVER);
    expect(server).toContain("./tools/poll");
    expect(server).toContain("registerPollTools");
    expect(server).toContain("registerPollTools(server);");

    const callIdx = server.indexOf("registerPollTools(server);");
    const returnIdx = server.indexOf("return server;");
    expect(callIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeLessThan(returnIdx);
  });

  it("registers poll in registry.ts (preserving echo) + views.d.ts", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic(
      "example",
      { variant: "demo" },
      fixture,
    );

    const registry = result.readContent(`${WIDGETS}/registry.ts`);
    expect(registry).toContain('poll: () => import("./poll/poll.widget")');
    expect(registry).toContain("echo: () => import("); // seed preserved
    expect(registry.indexOf("poll:")).toBeLessThan(
      registry.indexOf("} as const"),
    );

    const dts = result.readContent(`${WIDGETS}/views.d.ts`);
    expect(dts).toContain('declare module "ng-mcp-ui/server"');
    expect(dts).toContain("poll: true;");
    // Load-bearing: makes views.d.ts a module so `declare module` augments (not
    // shadows) `ng-mcp-ui/server` — otherwise a consumer's `ng build` fails with
    // "has no exported member McpServer".
    expect(dts).toMatch(/^\s*export\s*\{\s*\}\s*;?/m);
  });

  it("is idempotent — running example twice produces no diff", async () => {
    const fixture = await scaffolded();

    const once = await runner.runSchematic(
      "example",
      { variant: "demo" },
      fixture,
    );
    const twice = await runner.runSchematic(
      "example",
      { variant: "demo" },
      once,
    );

    expect(twice.readContent(SERVER)).toBe(once.readContent(SERVER));
    expect(twice.readContent(`${WIDGETS}/registry.ts`)).toBe(
      once.readContent(`${WIDGETS}/registry.ts`),
    );
    // No duplicate registration / registry entry.
    expect(
      twice.readContent(SERVER).match(/registerPollTools\(server\);/g)?.length,
    ).toBe(1);
    expect(
      twice
        .readContent(`${WIDGETS}/registry.ts`)
        .match(/poll: \(\) => import/g)?.length,
    ).toBe(1);
  });

  it("variant=minimal is a no-op (no poll files)", async () => {
    const fixture = await scaffolded();

    const result = await runner.runSchematic(
      "example",
      { variant: "minimal" },
      fixture,
    );

    expect(result.files).not.toContain(`${WIDGETS}/poll/poll.widget.ts`);
    expect(result.readContent(SERVER)).not.toContain("registerPollTools");
  });

  it("scaffolds poll files on a bare app, gracefully skipping wiring", async () => {
    // A bare app (no ng-add) — no server.ts/registry.ts. Files still land; the
    // wiring steps log + skip rather than throwing.
    const fixture = await createWorkspaceTree("fixture-app");

    const result = await runner.runSchematic(
      "example",
      { variant: "demo" },
      fixture,
    );

    expect(result.files).toContain(`${WIDGETS}/poll/poll.widget.ts`);
    expect(result.files).toContain(`${SRC}/mcp/tools/poll.ts`);
  });
});
