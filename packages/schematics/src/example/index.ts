import {
  MergeStrategy,
  type Rule,
  type SchematicContext,
  SchematicsException,
  type Tree,
  apply,
  applyTemplates,
  chain,
  filter,
  mergeWith,
  move,
  url,
} from "@angular-devkit/schematics";
import { getWorkspace } from "@schematics/angular/utility/workspace";
import {
  insertRegisterCall,
  insertRegistryEntry,
  maintainViewsDts,
} from "../utils/wiring";
import type { ExampleOptions } from "./schema";

/**
 * Resolve the target project name: the explicit `project` option, else the
 * workspace's sole/default application project. (Local equivalent of the ng-add
 * helper — kept self-contained rather than reaching across schematics.)
 */
async function resolveProjectName(
  tree: Tree,
  options: ExampleOptions,
): Promise<string> {
  const workspace = await getWorkspace(tree);
  if (options.project) {
    if (!workspace.projects.has(options.project)) {
      throw new SchematicsException(
        `ng-mcp-ui example: project "${options.project}" not found in the ` +
          `workspace.`,
      );
    }
    return options.project;
  }

  const applications = [...workspace.projects].filter(
    ([, p]) => p.extensions.projectType === "application",
  );
  const first = applications[0] ?? [...workspace.projects][0];
  if (!first) {
    throw new SchematicsException(
      "ng-mcp-ui example: no projects found in the workspace.",
    );
  }
  return first[0];
}

/** Resolve the target project's root + sourceRoot (root-relative workspace paths). */
async function resolveProjectPaths(
  tree: Tree,
  options: ExampleOptions,
): Promise<{ root: string; sourceRoot: string }> {
  const projectName = await resolveProjectName(tree, options);
  const workspace = await getWorkspace(tree);
  const project = workspace.projects.get(projectName);
  if (!project) {
    throw new SchematicsException(
      `ng-mcp-ui example: project "${projectName}" not found in the workspace.`,
    );
  }
  const root = project.root ?? "";
  const sourceRoot = project.sourceRoot ?? `${root ? `${root}/` : ""}src`;
  return { root, sourceRoot };
}

/** The copy-pasteable instructions printed when poll wiring can't be applied. */
const MANUAL_WIRE_SNIPPET = `
Could not automatically wire the Quick Poll demo into src/mcp/server.ts.
The demo files were still generated. Wire them by hand:

  1. Add this import at the top of src/mcp/server.ts:

       import { registerPollTools } from "./tools/poll";

  2. Inside createMcpServer(), BEFORE \`return server;\`, add:

       registerPollTools(server);
`;

/**
 * Scaffold the locked Quick Poll demo from `./files` (poll.ts, poll.widget.ts,
 * poll.css — ported byte-identical from the locked draft demo). `move(root)`
 * lands `src/...` under `<root>/src/...`. Pre-existing files are filtered out (no
 * clobber, no throw), mirroring ng-add's `scaffoldSources`. No EJS tokens — the
 * `.template` suffix is stripped, content is byte-identical to the demo source;
 * `poll.css` carries no suffix so its `%`/`{}` survive EJS untouched.
 */
function scaffoldDemoSources(options: ExampleOptions): Rule {
  return async (tree: Tree) => {
    const { root } = await resolveProjectPaths(tree, options);
    const prefix = root ? `/${root}` : "";

    const templates = apply(url("./files"), [
      filter((path) => {
        const dest = `${prefix}${path.replace(/\.template$/, "")}`;
        return !tree.exists(dest);
      }),
      applyTemplates({}),
      move(root),
    ]);

    return mergeWith(templates, MergeStrategy.Default);
  };
}

/** Wire `registerPollTools(<server>)` into `src/mcp/server.ts` (shared helper). */
function wirePollIntoServer(options: ExampleOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const { sourceRoot } = await resolveProjectPaths(tree, options);
    return insertRegisterCall(tree, context, {
      serverTsPath: `/${sourceRoot}/mcp/server.ts`,
      importName: "registerPollTools",
      importPath: "./tools/poll",
      buildRegisterCall: (serverName) => `registerPollTools(${serverName});`,
      manualSnippet: MANUAL_WIRE_SNIPPET,
    });
  };
}

/** Insert the `poll` entry into `src/widgets/registry.ts` (shared helper). */
function insertPollRegistry(options: ExampleOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const { sourceRoot } = await resolveProjectPaths(tree, options);
    return insertRegistryEntry(tree, context, {
      registryPath: `/${sourceRoot}/widgets/registry.ts`,
      key: "poll",
      importPath: "./poll/poll.widget",
    });
  };
}

/** Add `poll: true` to the `ViewNameRegistry` augmentation (shared helper). */
function addPollToViewsDts(options: ExampleOptions): Rule {
  return async (tree: Tree) => {
    const { sourceRoot } = await resolveProjectPaths(tree, options);
    return maintainViewsDts(tree, {
      dtsPath: `/${sourceRoot}/widgets/views.d.ts`,
      key: "poll",
    });
  };
}

/** Print the "try this prompt" hint (PLAN §10.1). No file writes. */
function printTryThisHint(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    context.logger.info(
      `\nQuick Poll demo scaffolded. Build the widgets and serve the app:\n` +
        `  npm run build:widgets && npm run dev:mcp\n` +
        `Then connect the host to your /mcp endpoint and try this prompt:\n` +
        `  "Create a poll asking the team where we should have lunch — ` +
        `options: Sushi, Tacos, Salad"\n`,
    );
    return tree;
  };
}

/**
 * `ng generate ng-mcp-ui:example` entry point (S29 / PLAN §7.3b / §10).
 *
 * `--variant=demo` (default): scaffold the locked Quick Poll demo (poll tool +
 * widget + CSS) and wire it into the app's server + widget registry. Idempotent
 * — every step skips when the demo is already present, so a chained `ng add`
 * re-run produces no diff.
 * `--variant=minimal` / `--variant=none`: no-op — the `echo` sample scaffolded
 * by `ng add` is already the minimal baseline, so nothing more is added here.
 */
export function example(options: ExampleOptions): Rule {
  const variant = options.variant ?? "demo";
  if (variant !== "demo") {
    return (tree: Tree, context: SchematicContext) => {
      context.logger.info(
        `ng-mcp-ui example: --variant=${variant} — the \`echo\` sample ` +
          "scaffolded by `ng add` is the minimal app; nothing more to add.",
      );
      return tree;
    };
  }

  return chain([
    scaffoldDemoSources(options),
    wirePollIntoServer(options),
    insertPollRegistry(options),
    addPollToViewsDts(options),
    printTryThisHint(),
  ]);
}
