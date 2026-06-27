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
import { insertImport } from "@schematics/angular/utility/ast-utils";
import {
  type Change,
  InsertChange,
  applyToUpdateRecorder,
} from "@schematics/angular/utility/change";
import { getWorkspace } from "@schematics/angular/utility/workspace";
import * as ts from "typescript";
import type { ToolOptions } from "./schema";

const { camelize, classify, dasherize } = strings;

/** Escape a string for embedding into a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
 * Locate the `return <server>;` statement INSIDE `createMcpServer()` so we can
 * splice the tool registration call directly before it, and resolve the
 * McpServer instance identifier (`const <server> = new McpServer(...)`) so the
 * inserted call targets the right variable (e.g. `return mcp;` →
 * `registerXTool(mcp);`). Both scans are scoped to the `createMcpServer` body so
 * an unrelated `return server;` / `new McpServer` in another function can't
 * become the anchor. Returns `{ start, serverName }` (the statement's full-text
 * start + the resolved instance name), or `null` when the shape is unrecognized
 * (caller bails gracefully).
 */
function findReturnServerStart(
  source: ts.SourceFile,
): { start: number; serverName: string } | null {
  // Scope to the `createMcpServer` function body.
  let body: ts.Block | null = null;
  const visitFn = (node: ts.Node): void => {
    if (
      body === null &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "createMcpServer" &&
      node.body
    ) {
      body = node.body;
      return;
    }
    ts.forEachChild(node, visitFn);
  };
  ts.forEachChild(source, visitFn);
  if (body === null) {
    return null;
  }
  const fnBody: ts.Block = body;

  // The McpServer instance name (`const <server> = new McpServer(...)`).
  let serverName: string | null = null;
  const visitDecl = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const init = node.initializer;
      if (
        init &&
        ts.isNewExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === "McpServer"
      ) {
        serverName = node.name.text;
      }
    }
    ts.forEachChild(node, visitDecl);
  };
  ts.forEachChild(fnBody, visitDecl);

  // The matching `return <serverName>;` within the same body (falling back to a
  // bare `server` when the declaration wasn't recognized).
  const wanted: string = serverName ?? "server";
  let found: number | null = null;
  const visitReturn = (node: ts.Node): void => {
    if (found !== null) {
      return;
    }
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === wanted
    ) {
      found = node.getStart(source);
      return;
    }
    ts.forEachChild(node, visitReturn);
  };
  ts.forEachChild(fnBody, visitReturn);

  return found === null ? null : { start: found, serverName: wanted };
}

/**
 * Wire the generated tool into `src/mcp/server.ts`:
 *   - add `import { register<Cls>Tool } from "./tools/<dash>";`
 *   - insert `  register<Cls>Tool(server);` immediately before `return server;`
 *
 * AST strategy mirrors S25's `patchServerTs`: `@schematics/angular`'s
 * `ast-utils.insertImport` + `InsertChange` + `applyToUpdateRecorder` (NO
 * ts-morph). Idempotent: guarded by `content.includes(registerCall)`. Graceful
 * bail: if `server.ts` is missing or its `createMcpServer()` / `return server;`
 * shape is unrecognized, we log the manual-wire snippet and return the tree
 * unchanged (the generated tool file is left in place) — we never throw.
 *
 * Inlined here (rather than extracted to `utils/wiring.ts`) to keep S28
 * self-contained; the shared `insertRegisterCall` extraction is the S29 wave.
 */
function wireIntoServer(options: ToolOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const serverTsPath = await resolveServerTsPath(tree, options);
    const cls = classify(options.name);
    const dash = dasherize(options.name);
    const importName = `register${cls}Tool`;
    const importPath = `./tools/${dash}`;

    if (!tree.exists(serverTsPath)) {
      context.logger.warn(manualWireSnippet(options.name));
      return tree;
    }

    const content = tree.readText(serverTsPath);

    const source = ts.createSourceFile(
      serverTsPath,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
    );

    const target = findReturnServerStart(source);
    if (target === null) {
      // Unrecognized shape — bail gracefully with copy-pasteable instructions.
      context.logger.warn(manualWireSnippet(options.name));
      return tree;
    }

    // Target the resolved instance name so non-`server` apps still compile.
    const registerCall = `${importName}(${target.serverName});`;

    // Idempotency: the registration call is already present → no-op.
    if (content.includes(registerCall)) {
      return tree;
    }

    const changes: Change[] = [
      insertImport(source, serverTsPath, importName, importPath),
      // `target.start` is the `return` token's start (leading indent excluded by
      // getStart), so the existing indent prefixes the inserted call and the
      // trailing `\n\n  ` re-indents the return — preserving 2-space formatting.
      new InsertChange(serverTsPath, target.start, `${registerCall}\n\n  `),
    ];

    const recorder = tree.beginUpdate(serverTsPath);
    applyToUpdateRecorder(recorder, changes);
    tree.commitUpdate(recorder);

    return tree;
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
