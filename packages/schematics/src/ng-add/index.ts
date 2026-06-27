import {
  type Rule,
  SchematicsException,
  type SchematicContext,
  type Tree,
  chain,
  externalSchematic,
} from "@angular-devkit/schematics";
import { NodePackageInstallTask } from "@angular-devkit/schematics/tasks";
import {
  NodeDependencyType,
  addPackageJsonDependency,
  getPackageJsonDependency,
} from "@schematics/angular/utility/dependencies";
import { getWorkspace } from "@schematics/angular/utility/workspace";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
 * `ng add ng-mcp-ui` entry point.
 *
 * S24 (PLAN §7.1 steps 1–3): version guard (>=20 <23), ensure SSR (delegating
 * to `@angular/ssr`'s own `ng-add`), and add `ng-mcp-ui` as a dependency with a
 * single `NodePackageInstallTask`. Later slices add the `server.ts` patch,
 * source scaffold, build target, npm scripts and example chaining.
 */
export function ngAdd(options: NgAddOptions): Rule {
  return chain([
    guardAngularVersion(),
    ensureSsr(options),
    addDependencies(options),
  ]);
}
