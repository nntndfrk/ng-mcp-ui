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
import {
  escapeRegExp,
  insertRegistryEntry,
  maintainViewsDts,
} from "../utils/wiring";
import type { ViewOptions } from "./schema";

const { dasherize, classify, camelize } = strings;

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
 * `registry = { … } as const` literal in `registry.ts`. Delegates to the shared
 * {@link insertRegistryEntry} helper (S29 `utils/wiring.ts`) with this view's
 * RAW name as the key and `./<dashed>/<dashed>.widget` as the import path.
 */
function wireRegistryEntry(options: ViewOptions): Rule {
  return async (tree: Tree, context: SchematicContext) => {
    const widgetsDir = await resolveWidgetsDir(tree, options);
    const dashed = dasherize(options.name);
    return insertRegistryEntry(tree, context, {
      registryPath: `${widgetsDir}/registry.ts`,
      key: options.name,
      importPath: `./${dashed}/${dashed}.widget`,
    });
  };
}

/**
 * Maintain the generated `ViewNameRegistry` augmentation `.d.ts`. Delegates to
 * the shared {@link maintainViewsDts} helper (S29 `utils/wiring.ts`) with this
 * view's RAW name as the key.
 */
function wireViewsDts(options: ViewOptions): Rule {
  return async (tree: Tree) => {
    const widgetsDir = await resolveWidgetsDir(tree, options);
    return maintainViewsDts(tree, {
      dtsPath: `${widgetsDir}/views.d.ts`,
      key: options.name,
    });
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
    wireRegistryEntry(options),
    wireViewsDts(options),
  ];

  if (options.withTool) {
    rules.push(maybeDelegateTool(options));
  }

  return chain(rules);
}
