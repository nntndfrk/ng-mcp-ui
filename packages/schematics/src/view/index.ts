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
  schematic,
  url,
} from "@angular-devkit/schematics";
import { strings } from "@angular-devkit/core";
import { getWorkspace } from "@schematics/angular/utility/workspace";
import type { ViewOptions } from "./schema";

const { dasherize, classify, camelize } = strings;

/** Whether `key` is a bare JS identifier (so it can appear unquoted as a key). */
function isSafeIdentifier(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

/** Escape a string for embedding into a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the target project name: the explicit `project` option, else the
 * workspace's sole/default application project. (Local equivalent of the ng-add
 * helper — kept tiny and self-contained rather than reaching across schematics;
 * S29 will extract the shared wiring once `tool`/`example` need it too.)
 */
async function resolveProjectName(
  tree: Tree,
  options: ViewOptions,
): Promise<string> {
  const workspace = await getWorkspace(tree);
  if (options.project) {
    if (!workspace.projects.has(options.project)) {
      throw new SchematicsException(
        `ng-mcp-ui view: project "${options.project}" not found in the ` +
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
      "ng-mcp-ui view: no projects found in the workspace.",
    );
  }
  return first[0];
}

/**
 * Resolve the target project's `<sourceRoot>/widgets` directory (root-relative,
 * Tree-rooted at "/").
 */
async function resolveWidgetsDir(
  tree: Tree,
  options: ViewOptions,
): Promise<string> {
  const projectName = await resolveProjectName(tree, options);
  const workspace = await getWorkspace(tree);
  const project = workspace.projects.get(projectName);
  if (!project) {
    throw new SchematicsException(
      `ng-mcp-ui view: project "${projectName}" not found in the workspace.`,
    );
  }
  const root = project.root ?? "";
  const sourceRoot = project.sourceRoot ?? `${root ? `${root}/` : ""}src`;
  return `/${sourceRoot}/widgets`;
}

/**
 * Guard: throw if a view of this name already exists, either as a widget file or
 * as a key in `registry.ts`. This is the twice-run idempotency gate.
 */
function guardViewExists(options: ViewOptions): Rule {
  return async (tree: Tree) => {
    const widgetsDir = await resolveWidgetsDir(tree, options);
    const name = options.name;
    const dashed = dasherize(name);
    const widgetPath = `${widgetsDir}/${dashed}/${dashed}.widget.ts`;

    if (tree.exists(widgetPath)) {
      throw new SchematicsException(
        `ng-mcp-ui view: view "${name}" already exists (${widgetPath}).`,
      );
    }

    const registryPath = `${widgetsDir}/registry.ts`;
    if (tree.exists(registryPath)) {
      const content = tree.readText(registryPath);
      // Match `  <key>:` or `  "<key>":` as an object member of the registry.
      const keyRe = new RegExp(
        `(^|[{,\\s])(?:"${escapeRegExp(name)}"|${escapeRegExp(name)})\\s*:`,
        "m",
      );
      if (keyRe.test(content)) {
        throw new SchematicsException(
          `ng-mcp-ui view: view "${name}" already exists in ${registryPath}.`,
        );
      }
    }
    return tree;
  };
}

/**
 * Scaffold the widget from `./files`. Path tokens (`__name@dasherize__`) need
 * the `dasherize` pipe in scope, and the EJS content uses `name`/`dasherize`/
 * `classify`/`camelize`. `move(widgetsDir)` lands the `<dashed>/<dashed>.widget
 * .ts` tree under the project's `widgets` dir.
 */
function scaffoldWidget(options: ViewOptions): Rule {
  return async (tree: Tree) => {
    const widgetsDir = await resolveWidgetsDir(tree, options);
    const templates = apply(url("./files"), [
      applyTemplates({
        name: options.name,
        dasherize,
        classify,
        camelize,
      }),
      move(widgetsDir),
    ]);
    return mergeWith(templates, MergeStrategy.Default);
  };
}

/**
 * Insert a `<key>: () => import("<importPath>"),` member into the
 * `registry = { … } as const` literal in `registry.ts`, just before the closing
 * `} as const`. String-anchored (format-preserving, no AST). Idempotent: a
 * member already keyed by `key` is left untouched. Graceful bail (log + skip)
 * when `registry.ts` is missing or its `} as const` shape is unrecognized — so a
 * non-ng-add'd app still gets the widget file + d.ts.
 *
 * Inlined here (rather than extracted to `utils/wiring.ts`) to keep S27
 * self-contained; S28/S29 will factor the shared insertion logic out when the
 * `tool`/`example` generators need the exact same machinery.
 */
function insertRegistryEntry(options: ViewOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const widgetsDir = await resolveWidgetsDir(tree, options);
    const dashed = dasherize(options.name);
    const registryPath = `${widgetsDir}/registry.ts`;
    const key = options.name;
    const importPath = `./${dashed}/${dashed}.widget`;

    const entryKey = isSafeIdentifier(key) ? key : JSON.stringify(key);
    const handLine = `${entryKey}: () => import("${importPath}"),`;
    const entry = `  ${handLine}\n`;

    if (!tree.exists(registryPath)) {
      context.logger.warn(
        `ng-mcp-ui: ${registryPath} not found — skipping registry wiring. ` +
          `Add an entry by hand:\n  ${handLine}`,
      );
      return tree;
    }

    const content = tree.readText(registryPath);

    // Idempotency: skip if a member with this key is already registered.
    const keyRe = new RegExp(
      `(^|[{,\\s])(?:"${escapeRegExp(key)}"|${escapeRegExp(key)})\\s*:`,
      "m",
    );
    if (keyRe.test(content)) {
      return tree;
    }

    // Anchor on the `} as const` that closes the registry object; insert the new
    // member immediately before that closing brace.
    const anchorRe = /\n\s*}\s*as const/;
    const match = anchorRe.exec(content);
    if (!match || match.index === undefined) {
      context.logger.warn(
        `ng-mcp-ui: could not find the \`} as const\` anchor in ` +
          `${registryPath} — skipping registry wiring. Add by hand:\n` +
          `  ${handLine}`,
      );
      return tree;
    }

    const insertAt = match.index + 1; // keep the preceding newline
    tree.overwrite(
      registryPath,
      `${content.slice(0, insertAt)}${entry}${content.slice(insertAt)}`,
    );
    return tree;
  };
}

/**
 * The fresh `views.d.ts` scaffold. The leading `export {};` is LOAD-BEARING: it
 * makes the file a MODULE, so the `declare module "ng-mcp-ui/server"` below is a
 * module AUGMENTATION (merges into the package's real types). Without it the
 * file is a SCRIPT and `declare module` becomes an ambient module declaration
 * that SHADOWS `ng-mcp-ui/server` — hiding every other export (`McpServer`,
 * `createMcpExpressRouter`, …) from the whole consumer program (a `ng build`
 * would fail with "has no exported member"). Do not remove it.
 */
function viewsDtsScaffold(member: string): string {
  return (
    `// Generated by \`ng generate ng-mcp-ui:view\`. Declaration-merges this app's\n` +
    `// view names into \`ViewNameRegistry\` so \`ViewName\` narrows and\n` +
    `// \`view: { component: "<name>" }\` typechecks (PLAN §7.2).\n` +
    `//\n` +
    `// \`export {}\` makes this file a module so the \`declare module\` below is an\n` +
    `// augmentation (merges) rather than an ambient declaration that would shadow\n` +
    `// \`ng-mcp-ui/server\` and hide its exports. Keep it.\n` +
    `export {};\n\n` +
    `declare module "ng-mcp-ui/server" {\n` +
    `  interface ViewNameRegistry {\n` +
    `${member}\n` +
    `  }\n` +
    `}\n`
  );
}

/** Ensure `content` is a module (has a top-level import/export) so a contained
 *  `declare module` augments rather than shadows. Appends `export {};` if not. */
function ensureModule(content: string): string {
  return /(^|\n)\s*(export|import)\b/.test(content)
    ? content
    : `${content}\nexport {};\n`;
}

/**
 * Maintain the generated `ViewNameRegistry` augmentation `.d.ts`
 * (`src/widgets/views.d.ts`): TS declaration-merges it with the seed `echo`
 * augmentation in `src/mcp/server.ts` so `ViewName` / `view: { component:
 * "<key>" }` narrows (PLAN §7.2).
 *
 * - Absent: create it as a MODULE (see {@link viewsDtsScaffold}) with a
 *   single-member interface.
 * - Present: string-anchored insert of `<key>: true;` into the existing
 *   `interface ViewNameRegistry { … }` body (idempotent).
 */
function maintainViewsDts(options: ViewOptions): Rule {
  return async (tree: Tree) => {
    const widgetsDir = await resolveWidgetsDir(tree, options);
    const dtsPath = `${widgetsDir}/views.d.ts`;
    const key = options.name;

    const memberKey = isSafeIdentifier(key) ? key : JSON.stringify(key);
    const member = `    ${memberKey}: true;`;

    if (!tree.exists(dtsPath)) {
      tree.create(dtsPath, viewsDtsScaffold(member));
      return tree;
    }

    const content = tree.readText(dtsPath);
    // Idempotent: skip if the member is already declared.
    const memberRe = new RegExp(
      `(^|[{;\\s])(?:"${escapeRegExp(key)}"|${escapeRegExp(key)})\\s*:\\s*true`,
      "m",
    );
    if (memberRe.test(content)) {
      return tree;
    }

    // Anchor: insert just before the first `}` that closes the interface body.
    const ifaceRe = /interface\s+ViewNameRegistry\s*\{/;
    const ifaceMatch = ifaceRe.exec(content);
    const freshBlock =
      `\ndeclare module "ng-mcp-ui/server" {\n` +
      `  interface ViewNameRegistry {\n` +
      `${member}\n` +
      `  }\n` +
      `}\n`;

    if (!ifaceMatch || ifaceMatch.index === undefined) {
      // Unrecognized shape — append a fresh augmentation block (still valid TS:
      // declaration merging across blocks within the same module). `ensureModule`
      // keeps the file a module so the block augments rather than shadows.
      tree.overwrite(dtsPath, ensureModule(content) + freshBlock);
      return tree;
    }

    const bodyStart = ifaceMatch.index + ifaceMatch[0].length;
    const closeIdx = content.indexOf("}", bodyStart);
    if (closeIdx === -1) {
      // Malformed — append a fresh block rather than throwing, so the file still
      // lands.
      tree.overwrite(dtsPath, ensureModule(content) + freshBlock);
      return tree;
    }

    const updated = `${content.slice(0, closeIdx)}${member}\n  ${content.slice(closeIdx)}`;
    tree.overwrite(dtsPath, updated);
    return tree;
  };
}

/**
 * `--with-tool`: delegate to the sibling `tool` generator (S28) for a paired MCP
 * tool linked to this view. The `tool` schematic is NOT YET BUILT (it lands in
 * S28), so we GUARD the delegation: if `tool` isn't registered in this
 * collection we log a notice and skip rather than throwing, keeping S27
 * self-contained and green. Once S28 registers `tool`, this delegation activates
 * automatically with no change here.
 */
function maybeDelegateTool(options: ViewOptions): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const available = context.schematic.collection
      .listSchematicNames()
      .includes("tool");
    if (!available) {
      context.logger.info(
        `ng-mcp-ui view: \`--with-tool\` requested but the \`tool\` generator ` +
          `is not available yet (lands in S28). Skipping the paired tool; the ` +
          `view was still generated. Re-run \`ng generate ng-mcp-ui:tool ` +
          `${options.name} --view ${options.name}\` once it ships.`,
      );
      return tree;
    }
    return schematic("tool", {
      name: options.name,
      project: options.project,
      view: options.name,
    });
  };
}

/**
 * `ng generate ng-mcp-ui:view <name>` entry point (PLAN §7.2).
 *
 * Chain: guard the view does not already exist, scaffold the widget from
 * `./files`, wire the registry entry, maintain the `ViewNameRegistry`
 * augmentation `.d.ts`, and — with `--with-tool` — delegate to the sibling
 * `tool` generator for a paired MCP tool (guarded until S28 ships it).
 */
export function view(options: ViewOptions): Rule {
  const rules: Rule[] = [
    guardViewExists(options),
    scaffoldWidget(options),
    insertRegistryEntry(options),
    maintainViewsDts(options),
  ];

  if (options.withTool) {
    rules.push(maybeDelegateTool(options));
  }

  return chain(rules);
}
