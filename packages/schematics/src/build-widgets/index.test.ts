import {
  Architect,
  type BuilderContext,
  type BuilderOutput,
  createBuilder,
} from "@angular-devkit/architect";
import { TestingArchitectHost } from "@angular-devkit/architect/testing";
import { schema } from "@angular-devkit/core";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "@angular-devkit/core";
import buildWidgetsBuilder from "./index";
import optionSchema from "./schema.json" with { type: "json" };

// Integration harness: run the REAL ng-mcp-ui:build-widgets builder through
// architect (schema validation + defaults included), with a FAKE
// `@angular/build:application` registered in the testing host that emits a
// minimal-but-shape-accurate widgets output. This pins the delegation contract
// (option stripping/passthrough, failure propagation) without paying for a real
// Angular build.

let workspaceRoot: string;
let architect: Architect;
let host: TestingArchitectHost;
/** Options the fake application builder actually received. */
let receivedAppOptions: JsonObject | null;
/** What the fake emits, tweaked per test. */
let emit: {
  success: boolean;
  views: string[];
  skipOutput?: boolean;
};

function writeWidgetsOutput(root: string, views: string[]): void {
  const out = join(root, "dist", "widgets", "browser");
  mkdirSync(out, { recursive: true });
  const imports = views
    .map((v) => `import("./${v}.widget-Hash123.js")`)
    .join(";");
  writeFileSync(join(out, "main-Hash123.js"), `${imports};\n`, "utf8");
  for (const v of views) {
    writeFileSync(join(out, `${v}.widget-Hash123.js`), "export{};\n", "utf8");
  }
  writeFileSync(
    join(out, "index.html"),
    '<html><body><script src="main-Hash123.js"></script></body></html>',
    "utf8",
  );
}

beforeEach(async () => {
  workspaceRoot = mkdtempSync(join(tmpdir(), "ng-mcp-ui-builder-"));
  receivedAppOptions = null;
  emit = { success: true, views: ["echo"] };

  // The scaffolded registry the validator reads.
  mkdirSync(join(workspaceRoot, "src", "widgets"), { recursive: true });
  writeFileSync(
    join(workspaceRoot, "src", "widgets", "registry.ts"),
    'export const registry = {\n  echo: () => import("./echo/echo.widget"),\n} as const;\n',
    "utf8",
  );

  const registry = new schema.CoreSchemaRegistry();
  registry.addPostTransform(schema.transforms.addUndefinedDefaults);
  host = new TestingArchitectHost(workspaceRoot, workspaceRoot);
  architect = new Architect(host, registry);

  host.addBuilder(
    "ng-mcp-ui:build-widgets",
    buildWidgetsBuilder,
    "build widgets",
    optionSchema as schema.JsonSchema,
  );
  host.addBuilder(
    "@angular/build:application",
    createBuilder(
      async (
        options: JsonObject,
        _context: BuilderContext,
      ): Promise<BuilderOutput> => {
        receivedAppOptions = options;
        if (!emit.success) {
          return { success: false, error: "application build failed" };
        }
        if (!emit.skipOutput) {
          writeWidgetsOutput(workspaceRoot, emit.views);
        }
        return { success: true };
      },
    ),
    "fake application builder",
    { type: "object", additionalProperties: true },
  );
});

afterEach(() => {
  rmSync(workspaceRoot, { recursive: true, force: true });
});

const TARGET_OPTIONS: JsonObject = {
  browser: "src/widgets/main.ts",
  index: "src/widgets/index.html",
  outputPath: "dist/widgets",
  tsConfig: "tsconfig.widgets.json",
  registry: "src/widgets/registry.ts",
  manifestOut: "src/mcp/views.manifest.json",
};

async function runBuilder(options: JsonObject): Promise<BuilderOutput> {
  const run = await architect.scheduleBuilder(
    "ng-mcp-ui:build-widgets",
    options,
  );
  const result = await run.result;
  await run.stop();
  return result;
}

describe("ng-mcp-ui:build-widgets", () => {
  it("delegates to @angular/build:application with the ng-mcp-ui options stripped", async () => {
    const result = await runBuilder(TARGET_OPTIONS);

    expect(result.success).toBe(true);
    expect(receivedAppOptions).not.toBeNull();
    const received = receivedAppOptions as JsonObject;
    expect(received.browser).toBe("src/widgets/main.ts");
    expect(received.outputPath).toBe("dist/widgets");
    // Builder-owned options must NOT leak into the application builder.
    expect(received).not.toHaveProperty("registry");
    expect(received).not.toHaveProperty("manifestOut");
    expect(received).not.toHaveProperty("failOnMissingView");
  });

  it("emits the manifest derived from the emitted output", async () => {
    const result = await runBuilder(TARGET_OPTIONS);

    expect(result.success).toBe(true);
    const manifestPath = join(
      workspaceRoot,
      "src",
      "mcp",
      "views.manifest.json",
    );
    expect(existsSync(manifestPath)).toBe(true);
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual({
      entry: "main-Hash123.js",
      styles: null,
      views: { echo: "echo.widget-Hash123.js" },
    });
  });

  it("skips manifest emission when manifestOut is omitted (validation still runs)", async () => {
    const { manifestOut: _dropped, ...options } = TARGET_OPTIONS;

    const result = await runBuilder(options);

    expect(result.success).toBe(true);
    expect(
      existsSync(join(workspaceRoot, "src", "mcp", "views.manifest.json")),
    ).toBe(false);
  });

  it("applies the schema default registry path when the option is omitted", async () => {
    const { registry: _dropped, ...options } = TARGET_OPTIONS;

    const result = await runBuilder(options);

    expect(result.success).toBe(true);
  });

  it("fails when a registered view emitted no chunk, naming the view", async () => {
    writeFileSync(
      join(workspaceRoot, "src", "widgets", "registry.ts"),
      "export const registry = {\n" +
        '  echo: () => import("./echo/echo.widget"),\n' +
        '  ghost: () => import("./ghost/ghost.widget"),\n' +
        "} as const;\n",
      "utf8",
    );

    const result = await runBuilder(TARGET_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ghost");
    expect(result.error).toContain("no emitted widget chunk");
    // A failed validation must not leave a manifest behind.
    expect(
      existsSync(join(workspaceRoot, "src", "mcp", "views.manifest.json")),
    ).toBe(false);
  });

  it("failOnMissingView: false downgrades a missing view to a warning", async () => {
    writeFileSync(
      join(workspaceRoot, "src", "widgets", "registry.ts"),
      "export const registry = {\n" +
        '  echo: () => import("./echo/echo.widget"),\n' +
        '  ghost: () => import("./ghost/ghost.widget"),\n' +
        "} as const;\n",
      "utf8",
    );

    const result = await runBuilder({
      ...TARGET_OPTIONS,
      failOnMissingView: false,
    });

    expect(result.success).toBe(true);
    const manifest = JSON.parse(
      readFileSync(
        join(workspaceRoot, "src", "mcp", "views.manifest.json"),
        "utf8",
      ),
    );
    // The missing view is left out; the resolved one ships.
    expect(manifest.views).toEqual({ echo: "echo.widget-Hash123.js" });
  });

  it("propagates an application-builder failure without post-validation", async () => {
    emit.success = false;

    const result = await runBuilder(TARGET_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain("application build failed");
  });

  it("fails with the named error when the build emitted no index.html", async () => {
    emit.skipOutput = true;

    const result = await runBuilder(TARGET_OPTIONS);

    expect(result.success).toBe(false);
    expect(result.error).toContain("did not emit");
  });
});
