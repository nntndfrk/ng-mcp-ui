import {
  MergeStrategy,
  type Rule,
  type SchematicContext,
  SchematicsException,
  type Tree,
  apply,
  applyTemplates,
  chain,
  mergeWith,
  move,
  url,
} from "@angular-devkit/schematics";
import { strings } from "@angular-devkit/core";
import { getWorkspace } from "@schematics/angular/utility/workspace";
import { escapeRegExp, insertRegisterCall } from "../utils/wiring";
import type { ToolOptions } from "./schema";

const { camelize, classify, dasherize } = strings;

/**
 * Resolve the target project name: the explicit `project` option, else the
 * workspace's sole/default application project. (Local equivalent of the ng-add
 * helper — kept tiny and self-contained rather than reaching across schematics;
 * S29 will extract the shared wiring once `tool`/`example` share it fully.)
 */
async function resolveProjectName(
  tree: Tree,
  options: ToolOptions,
): Promise<string> {
  const workspace = await getWorkspace(tree);
  if (options.project) {
    if (!workspace.projects.has(options.project)) {
      throw new SchematicsException(
        `ng-mcp-ui tool: project "${options.project}" not found in the ` +
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
      "ng-mcp-ui tool: no projects found in the workspace.",
    );
  }
  return first[0];
}

/**
 * Resolve the target project's root + sourceRoot (root-relative workspace
 * paths, Tree-rooted at "/").
 */
async function resolveProjectPaths(
  tree: Tree,
  options: ToolOptions,
): Promise<{ root: string; sourceRoot: string }> {
  const projectName = await resolveProjectName(tree, options);
  const workspace = await getWorkspace(tree);
  const project = workspace.projects.get(projectName);
  if (!project) {
    throw new SchematicsException(
      `ng-mcp-ui tool: project "${projectName}" not found in the workspace.`,
    );
  }
  const root = project.root ?? "";
  const sourceRoot = project.sourceRoot ?? `${root ? `${root}/` : ""}src`;
  return { root, sourceRoot };
}

/**
 * The copy-pasteable instructions printed when we can't safely auto-wire the
 * tool into `src/mcp/server.ts`. The tool file is still generated; only the
 * registration wiring is left to the user.
 */
function manualWireSnippet(name: string): string {
  const cls = classify(name);
  const dash = dasherize(name);
  return `
Could not automatically wire the "${dash}" tool into src/mcp/server.ts.
The tool file was still generated. Wire it by hand:

  1. Add this import at the top of src/mcp/server.ts:

       import { register${cls}Tool } from "./tools/${dash}";

  2. Inside createMcpServer(), BEFORE \`return server;\`, add:

       register${cls}Tool(server);
`;
}

/**
 * Guard "tool exists": throw a clear exception if the tool file already exists
 * so a second `ng generate tool <name>` does not silently clobber/duplicate.
 * This is the twice-run idempotency gate.
 */
function guardToolExists(options: ToolOptions): Rule {
  return async (tree: Tree) => {
    const { sourceRoot } = await resolveProjectPaths(tree, options);
    const toolPath = `/${sourceRoot}/mcp/tools/${dasherize(options.name)}.ts`;
    if (tree.exists(toolPath)) {
      throw new SchematicsException(
        `ng-mcp-ui tool: a tool already exists at "${toolPath}". ` +
          `Choose a different name or delete the existing tool first.`,
      );
    }
    return tree;
  };
}

/**
 * Scaffold the tool file from `./files`. The filename is name-tokenized
 * (`__name@dasherize__.ts.template`) and the body is EJS-processed; only the
 * `--view` block is conditional (`hasView`). Lands at
 * `<sourceRoot>/mcp/tools/<dashed>.ts`.
 */
function scaffoldTool(options: ToolOptions): Rule {
  return async (tree: Tree) => {
    const { sourceRoot } = await resolveProjectPaths(tree, options);
    const toolsDir = `/${sourceRoot}/mcp/tools`;
    const hasView = typeof options.view === "string" && options.view.length > 0;

    const templates = apply(url("./files"), [
      applyTemplates({
        name: options.name,
        dasherize,
        classify,
        camelize,
        hasView,
        viewName: hasView ? options.view : "",
      }),
      move(toolsDir),
    ]);

    return mergeWith(templates, MergeStrategy.Default);
  };
}

/**
 * Warn (non-fatally) when `--view <name>` references a view that is not present
 * in the app's widget `registry.ts`. generate-tool only writes a NAME reference
 * into the tool config — it does NOT create the view — so a missing view is a
 * hint, not an error.
 */
function warnUnknownView(options: ToolOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    if (!options.view) {
      return tree;
    }
    const { sourceRoot } = await resolveProjectPaths(tree, options);
    const registryPath = `/${sourceRoot}/widgets/registry.ts`;
    if (!tree.exists(registryPath)) {
      return tree;
    }
    const registry = tree.readText(registryPath);
    // Registry keys are the RAW view name (the `view` schematic writes
    // `key = options.name`, quoted only when not a bare identifier), and the
    // tool template emits `component: "<raw>"` — so match the raw name, NOT a
    // dasherized form (else a camelCase view like `castVote` would warn
    // spuriously against its own `castVote:` registry key).
    const keyRe = new RegExp(
      `(^|[,{\\s])["']?${escapeRegExp(options.view)}["']?\\s*:`,
    );
    if (!keyRe.test(registry)) {
      context.logger.warn(
        `ng-mcp-ui tool: --view "${options.view}" is not registered in ` +
          `${registryPath}. The tool's view config still references it; ` +
          `generate the view with \`ng generate ng-mcp-ui:view ${options.view}\`.`,
      );
    }
    return tree;
  };
}

/**
 * Resolve the path to the target app's `src/mcp/server.ts`.
 */
async function resolveServerTsPath(
  tree: Tree,
  options: ToolOptions,
): Promise<string> {
  const { sourceRoot } = await resolveProjectPaths(tree, options);
  return `/${sourceRoot}/mcp/server.ts`;
}

/**
 * Wire the generated tool into `src/mcp/server.ts`:
 *   - add `import { register<Cls>Tool } from "./tools/<dash>";`
 *   - insert `  register<Cls>Tool(<server>);` immediately before
 *     `return <server>;`
 *
 * Delegates to the shared {@link insertRegisterCall} helper (S29
 * `utils/wiring.ts`), which scopes the `return <server>;` / `new McpServer` scan
 * to the `createMcpServer()` body and resolves the instance identifier so the
 * inserted call targets the right variable (e.g. `return mcp;` →
 * `register<Cls>Tool(mcp);`). Idempotent + graceful bail (logs the manual-wire
 * snippet, leaves the generated tool file in place) are handled by the helper.
 */
function wireIntoServer(options: ToolOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const serverTsPath = await resolveServerTsPath(tree, options);
    const cls = classify(options.name);
    const dash = dasherize(options.name);
    return insertRegisterCall(tree, context, {
      serverTsPath,
      importName: `register${cls}Tool`,
      importPath: `./tools/${dash}`,
      buildRegisterCall: (serverName) => `register${cls}Tool(${serverName});`,
      manualSnippet: manualWireSnippet(options.name),
    });
  };
}

/**
 * `ng generate ng-mcp-ui:tool <name>` entry point (S28 / PLAN §7.3).
 *
 * Scaffolds `src/mcp/tools/<name>.ts` (a `registerTool` registration with Zod
 * input/output schemas, optionally linked to an existing view via `--view`) and
 * wires it into `createMcpServer()` in `src/mcp/server.ts`.
 */
export function tool(options: ToolOptions): Rule {
  if (!options.name) {
    throw new SchematicsException("ng-mcp-ui tool: a tool name is required.");
  }
  return chain([
    guardToolExists(options),
    scaffoldTool(options),
    warnUnknownView(options),
    wireIntoServer(options),
  ]);
}
