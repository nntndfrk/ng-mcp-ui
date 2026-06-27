import {
  type Rule,
  SchematicsException,
  type SchematicContext,
  type Tree,
  chain,
  externalSchematic,
} from "@angular-devkit/schematics";
import { NodePackageInstallTask } from "@angular-devkit/schematics/tasks";
import { insertImport } from "@schematics/angular/utility/ast-utils";
import {
  type Change,
  InsertChange,
  applyToUpdateRecorder,
} from "@schematics/angular/utility/change";
import {
  NodeDependencyType,
  addPackageJsonDependency,
  getPackageJsonDependency,
} from "@schematics/angular/utility/dependencies";
import { getWorkspace } from "@schematics/angular/utility/workspace";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import type { NgAddOptions } from "./schema";

/** Supported `@angular/core` major versions (inclusive). */
const MIN_ANGULAR_MAJOR = 20;
const MAX_ANGULAR_MAJOR = 22;

/** Runtime package this schematic installs into the target app. */
const NG_MCP_UI_PACKAGE = "ng-mcp-ui";

/**
 * Resolve the `ng-mcp-ui` version range to pin in the consumer's package.json.
 */
function resolveNgMcpUiVersion(): string {
  // At `ng add` time this schematic runs from the copy embedded inside the lib
  // at <app>/node_modules/ng-mcp-ui/dist/schematics/ng-add/index.js, so the
  // lib's package.json is three directories up — pin the invoked version. Fall
  // back to a caret default when that file isn't there (e.g. unit tests, where
  // the schematic runs from its own package's dist).
  try {
    const pkgPath = join(__dirname, "..", "..", "..", "package.json");
    const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (typeof version === "string" && version.length > 0) {
      return `^${version}`;
    }
  } catch {
    // fall through to the default
  }
  return "^0.0.0";
}

/**
 * Parse a semver major out of a package.json dependency RANGE.
 *
 * In a unit fixture (and during `ng add`) the real installed version is not on
 * disk, so the idiomatic signal is the declared range in package.json. We must
 * therefore tolerate caret/tilde/exact/`>=`/`v`-prefixed ranges and pull out
 * the first numeric segment (the major).
 *
 * @returns the parsed major, or `null` if no major could be extracted.
 */
function parseMajor(range: string): number | null {
  // Strip common range operators/prefixes, then read the leading integer.
  const match = range.replace(/^\s*[\^~>=<v\s]*/, "").match(/^(\d+)/);
  if (!match) {
    return null;
  }
  const major = Number.parseInt(match[1], 10);
  return Number.isNaN(major) ? null : major;
}

/**
 * Step 1 — detect the target app's `@angular/core` major and guard it to the
 * supported `>=20 <23` window. Rejects v19-and-below and v23+ with an
 * actionable message that names the found version and supported range.
 */
function guardAngularVersion(): Rule {
  return (tree: Tree) => {
    const dep = getPackageJsonDependency(tree, "@angular/core");
    if (!dep) {
      throw new SchematicsException(
        "ng-mcp-ui ng-add: could not find `@angular/core` in the workspace " +
          "package.json. Run this inside an Angular application.",
      );
    }

    const major = parseMajor(dep.version);
    if (major === null) {
      throw new SchematicsException(
        `ng-mcp-ui ng-add: could not parse an Angular major version from ` +
          `"@angular/core": "${dep.version}". Supported range is Angular ` +
          `${MIN_ANGULAR_MAJOR}–${MAX_ANGULAR_MAJOR}.`,
      );
    }

    if (major < MIN_ANGULAR_MAJOR || major > MAX_ANGULAR_MAJOR) {
      throw new SchematicsException(
        `ng-mcp-ui ng-add: unsupported Angular version. Found ` +
          `"@angular/core": "${dep.version}" (major ${major}), but ng-mcp-ui ` +
          `requires Angular ${MIN_ANGULAR_MAJOR}–${MAX_ANGULAR_MAJOR} ` +
          `(>=${MIN_ANGULAR_MAJOR} <${MAX_ANGULAR_MAJOR + 1}). ` +
          `Please upgrade/downgrade Angular to a supported version first.`,
      );
    }

    return tree;
  };
}

/**
 * Determine whether the given project already has SSR configured.
 *
 * SSR is keyed off the `build` target's options rather than the presence of a
 * `server.ts` file or the `@angular/ssr` dependency alone, because the build
 * options are the canonical configuration the Angular builder reads to actually
 * render on the server — a stray `server.ts` or transitive `@angular/ssr` would
 * be a false positive. We treat the project as SSR-enabled when its build
 * target sets any of `outputMode: "server"`, an `ssr` option, or a `server`
 * entry.
 */
function projectHasSsr(
  workspace: Awaited<ReturnType<typeof getWorkspace>>,
  projectName: string,
): boolean {
  const project = workspace.projects.get(projectName);
  if (!project) {
    return false;
  }
  const build = project.targets.get("build");
  const options = build?.options ?? {};
  return (
    options.outputMode === "server" ||
    options.ssr != null ||
    options.server != null
  );
}

/**
 * Resolve the target project name: the explicit `project` option, else the
 * workspace's sole/default application project.
 */
async function resolveProjectName(
  tree: Tree,
  options: NgAddOptions,
): Promise<string> {
  const workspace = await getWorkspace(tree);
  if (options.project) {
    if (!workspace.projects.has(options.project)) {
      throw new SchematicsException(
        `ng-mcp-ui ng-add: project "${options.project}" not found in the ` +
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
      "ng-mcp-ui ng-add: no projects found in the workspace.",
    );
  }
  return first[0];
}

/**
 * Step 2 — ensure SSR. If the target project already has SSR configured we
 * leave it untouched (idempotent); otherwise we delegate to `@angular/ssr`'s
 * own `ng-add`, which wires up `server.ts`, the build options and deps.
 */
function ensureSsr(options: NgAddOptions): Rule {
  return async (tree: Tree) => {
    if (options.ssr === false) {
      return;
    }
    const projectName = await resolveProjectName(tree, options);
    const workspace = await getWorkspace(tree);
    if (projectHasSsr(workspace, projectName)) {
      return;
    }
    return externalSchematic("@angular/ssr", "ng-add", {
      project: projectName,
      // Defer the actual install to our single NodePackageInstallTask.
      skipInstall: true,
    });
  };
}

/**
 * Step 3 — add `ng-mcp-ui` as a runtime dependency of the target app and
 * schedule a package install (unless `--skip-install`).
 */
function addDependencies(options: NgAddOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    addPackageJsonDependency(tree, {
      type: NodeDependencyType.Default,
      name: NG_MCP_UI_PACKAGE,
      version: resolveNgMcpUiVersion(),
      overwrite: false,
    });

    if (!options.skipInstall) {
      context.addTask(new NodePackageInstallTask());
    }

    return tree;
  };
}

/**
 * Idempotency marker. Once the MCP routes have been inserted we drop this
 * comment in front of them; a second `ng add` run sees it and bails with no
 * diff. (PLAN §7.1 step 4 — "running twice produces no diff".)
 */
const MCP_ROUTES_MARKER = "// ng-mcp-ui:mcp-routes";

/**
 * The Express block we splice in just before the Angular SSR catch-all. Kept as
 * a single template so the inserted text matches the hand-written M1 reference
 * (`examples/dev-app/src/server.ts`) byte-for-byte modulo indentation.
 */
const MCP_ROUTES_BLOCK = `${MCP_ROUTES_MARKER}
// MCP JSON-RPC endpoint — host (Claude/ChatGPT) connects here.
app.use(express.json());
app.use("/mcp", createMcpExpressRouter(mcp));

// Built widget chunks + CSS, served with CORS + CSP-friendly caching. Resolved
// relative to this server bundle (\`<serverDist>/../../widgets/browser\`); we use
// \`import.meta.dirname\` so the path works regardless of which variables the
// app's server.ts happens to declare.
app.use(
  "/assets/widgets",
  createViewAssetRouter({
    dir: resolve(import.meta.dirname, "../../widgets/browser"),
  }),
);

`;

/** The copy-pasteable instructions printed when we can't safely auto-patch. */
const MANUAL_PATCH_SNIPPET = `
Could not automatically patch src/server.ts — its shape was not recognized.
Add the MCP routes by hand. In src/server.ts:

  1. Add these imports:

       import { resolve } from "node:path";
       import {
         createMcpExpressRouter,
         createViewAssetRouter,
       } from "ng-mcp-ui/server";
       import { createMcpServer } from "./mcp/server";

  2. After \`const app = express();\` (and the AngularNodeAppEngine line) add:

       const mcp = createMcpServer();

  3. BEFORE the Angular SSR catch-all (the \`app.use((req, res, next) => ...)\`
     / \`app.use("*", ...)\` handler), add:

       app.use(express.json());
       app.use("/mcp", createMcpExpressRouter(mcp));
       app.use(
         "/assets/widgets",
         createViewAssetRouter({
           dir: resolve(import.meta.dirname, "../../widgets/browser"),
         }),
       );
`;

/**
 * Resolve the path to the target project's `server.ts`. Mirrors what
 * `@angular/ssr`'s own schematic does: `<sourceRoot>/server.ts`, falling back
 * to `<projectRoot>/src/server.ts`.
 */
async function resolveServerTsPath(
  tree: Tree,
  options: NgAddOptions,
): Promise<string | null> {
  const projectName = await resolveProjectName(tree, options);
  const workspace = await getWorkspace(tree);
  const project = workspace.projects.get(projectName);
  if (!project) {
    return null;
  }
  const sourceRoot = project.sourceRoot ?? `${project.root}/src`;
  // Workspace paths are root-relative; the Tree is rooted at "/".
  return `/${sourceRoot}/server.ts`;
}

/**
 * Find the Angular SSR catch-all `app.use(...)` statement in `server.ts`.
 *
 * The `@angular/ssr` application-builder template (v20–v22) and the M1
 * reference both emit `app.use((req, res, next) => { angularApp.handle(...) })`.
 * Older/exotic templates may instead use a string route (`app.use("*", ...)` or
 * `app.use("/{*splat}", ...)`). We recognize an `app.use(...)` call expression
 * whose argument set EITHER references `angularApp.handle` OR opens with a
 * wildcard string route, and return the top-level statement node so the caller
 * can insert before its full-text start.
 *
 * @returns the catch-all statement, or `null` when no recognizable shape found.
 */
function findCatchAllStatement(source: ts.SourceFile): ts.Statement | null {
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement)) {
      continue;
    }
    const call = statement.expression;
    if (
      !ts.isCallExpression(call) ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.name.text !== "use" ||
      !ts.isIdentifier(call.expression.expression) ||
      call.expression.expression.text !== "app"
    ) {
      continue;
    }

    const text = call.getText(source);
    // Shape A (v20–22 application-builder + M1 ref): callback delegates to the
    // Angular engine. Shape B: an explicit wildcard route string.
    const isEngineHandler = /angularApp\s*\.\s*handle\s*\(/.test(text);
    const firstArg = call.arguments[0];
    const isWildcardRoute =
      firstArg !== undefined &&
      ts.isStringLiteral(firstArg) &&
      (firstArg.text === "*" || firstArg.text.includes("*splat"));
    if (isEngineHandler || isWildcardRoute) {
      return statement;
    }
  }
  return null;
}

/**
 * Find the `const angularApp = new AngularNodeAppEngine();` declaration so we
 * can splice `const mcp = createMcpServer();` directly after it. Falls back to
 * the `const app = express();` declaration. Returns the end position to insert
 * at, or `null` if neither anchor is present.
 */
function findEngineAnchorEnd(source: ts.SourceFile): number | null {
  let appDeclEnd: number | null = null;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) {
        continue;
      }
      const init = decl.initializer.getText(source);
      if (decl.name.text === "angularApp" && /AngularNodeAppEngine/.test(init)) {
        return statement.getEnd();
      }
      if (decl.name.text === "app" && /express\s*\(\s*\)/.test(init)) {
        appDeclEnd = statement.getEnd();
      }
    }
  }
  return appDeclEnd;
}

/**
 * Step 4 — patch the target app's `src/server.ts` so the MCP JSON-RPC router
 * and the widget asset router are mounted BEFORE the Angular SSR catch-all.
 *
 * AST strategy: we use `@schematics/angular`'s `ast-utils.insertImport` +
 * `change`/`InsertChange` + `applyToUpdateRecorder` rather than `ts-morph`.
 * Rationale: ast-utils is already a (transitive) dependency via
 * `@schematics/angular`, whereas `ts-morph` would be a NEW runtime dependency —
 * the step's scope forbids adding/installing one. The devkit utilities are the
 * idiomatic choice for schematics and give us idempotent import insertion for
 * free.
 *
 * Graceful bail: if `server.ts` is missing or its shape is unrecognized, we log
 * the manual-patch snippet via the context logger and return the tree
 * unchanged — we never throw.
 *
 * Idempotency: guarded by the {@link MCP_ROUTES_MARKER} marker comment; a second
 * run is a no-op.
 */
function patchServerTs(options: NgAddOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    if (options.ssr === false) {
      return tree;
    }

    const serverTsPath = await resolveServerTsPath(tree, options);
    if (!serverTsPath || !tree.exists(serverTsPath)) {
      context.logger.warn(MANUAL_PATCH_SNIPPET);
      return tree;
    }

    const content = tree.readText(serverTsPath);

    // Idempotency: marker already present → no-op (no diff on a second run).
    if (content.includes(MCP_ROUTES_MARKER)) {
      return tree;
    }

    const source = ts.createSourceFile(
      serverTsPath,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
    );

    const catchAll = findCatchAllStatement(source);
    const engineAnchorEnd = findEngineAnchorEnd(source);
    if (!catchAll || engineAnchorEnd === null) {
      // Unrecognized shape — bail gracefully with copy-pasteable instructions.
      context.logger.warn(MANUAL_PATCH_SNIPPET);
      return tree;
    }

    const changes: Change[] = [
      // Imports. insertImport is itself idempotent, but the marker guard above
      // already short-circuits a second run.
      insertImport(source, serverTsPath, "resolve", "node:path"),
      insertImport(
        source,
        serverTsPath,
        "createMcpExpressRouter",
        "ng-mcp-ui/server",
      ),
      insertImport(
        source,
        serverTsPath,
        "createViewAssetRouter",
        "ng-mcp-ui/server",
      ),
      insertImport(source, serverTsPath, "createMcpServer", "./mcp/server"),
      // `const mcp = createMcpServer();` right after the engine/app declaration.
      new InsertChange(
        serverTsPath,
        engineAnchorEnd,
        "\nconst mcp = createMcpServer();\n",
      ),
      // The MCP + asset routers, spliced in before the catch-all statement.
      new InsertChange(
        serverTsPath,
        catchAll.getStart(source),
        MCP_ROUTES_BLOCK,
      ),
    ];

    const recorder = tree.beginUpdate(serverTsPath);
    applyToUpdateRecorder(recorder, changes);
    tree.commitUpdate(recorder);

    return tree;
  };
}

/**
 * `ng add ng-mcp-ui` entry point.
 *
 * S24 (PLAN §7.1 steps 1–3): version guard (>=20 <23), ensure SSR (delegating
 * to `@angular/ssr`'s own `ng-add`), and add `ng-mcp-ui` as a dependency with a
 * single `NodePackageInstallTask`.
 * S25 (PLAN §7.1 step 4): patch `server.ts` to mount the MCP JSON-RPC router
 * and the widget asset router before the Angular SSR catch-all. Later slices add
 * the source scaffold, build target, npm scripts and example chaining.
 */
export function ngAdd(options: NgAddOptions): Rule {
  return chain([
    guardAngularVersion(),
    ensureSsr(options),
    addDependencies(options),
    patchServerTs(options),
  ]);
}
