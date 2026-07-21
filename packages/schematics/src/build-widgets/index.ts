import {
  type BuilderContext,
  type BuilderOutput,
  createBuilder,
} from "@angular-devkit/architect";
import type { JsonObject } from "@angular-devkit/core";
import { relative, resolve } from "node:path";
import {
  WidgetsManifestError,
  missingViewsMessage,
  resolveBrowserOutDir,
  validateWidgetsOutput,
  writeManifest,
} from "./manifest";
import type { BuildWidgetsOptions } from "./schema";

/**
 * The delegate builder. Resolved from the CONSUMER's workspace (the app that
 * `ng add`ed ng-mcp-ui always has `@angular/build` — it is what builds the app
 * itself), so this package needs no dependency on it.
 */
const APPLICATION_BUILDER = "@angular/build:application";

/**
 * `ng-mcp-ui:build-widgets` — the widgets bundling pipeline as a real Angular
 * builder (issue #48): delegate the build to `@angular/build:application` with
 * the passthrough options, then post-validate the emitted bundle graph against
 * the widget registry and optionally emit `views.manifest.json`. Both ends of
 * the registry↔chunk invariant live in this library (`ng generate
 * ng-mcp-ui:view` writes the registry; `ng-mcp-ui/server` serves the views),
 * so the check connecting them ships here too instead of as a script copied
 * into every app by `ng add`.
 */
export async function buildWidgets(
  options: BuildWidgetsOptions,
  context: BuilderContext,
): Promise<BuilderOutput> {
  const { registry, manifestOut, failOnMissingView, ...applicationOptions } =
    options;

  // Delegate the actual build. Passing `target` through lets the application
  // builder resolve project metadata (sourceRoot, cache dir) exactly as if it
  // were the target's own builder; its logs forward to our logger by default.
  const run = await context.scheduleBuilder(
    APPLICATION_BUILDER,
    applicationOptions as JsonObject,
    { target: context.target },
  );
  const result = await run.result;
  await run.stop();
  if (!result.success) {
    return result;
  }

  try {
    const browserOutDir = resolveBrowserOutDir(
      context.workspaceRoot,
      applicationOptions.outputPath,
    );
    const registryPath = resolve(context.workspaceRoot, registry);
    const { manifest, missing } = validateWidgetsOutput({
      browserOutDir,
      registryPath,
    });

    if (missing.length > 0) {
      if (failOnMissingView) {
        return { success: false, error: missingViewsMessage(missing) };
      }
      context.logger.warn(`build-widgets: ${missingViewsMessage(missing)}`);
    }

    if (manifestOut) {
      const manifestPath = resolve(context.workspaceRoot, manifestOut);
      writeManifest(manifestPath, manifest);
      const views = Object.keys(manifest.views);
      context.logger.info(
        `build-widgets: wrote ${relative(context.workspaceRoot, manifestPath)}\n` +
          `  entry=${manifest.entry}` +
          `${manifest.styles ? ` styles=${manifest.styles}` : " styles=(none)"}` +
          ` views=${views.length} [${views.join(", ")}]`,
      );
    }

    return { success: true };
  } catch (err) {
    if (err instanceof WidgetsManifestError) {
      return { success: false, error: `build-widgets: ${err.message}` };
    }
    throw err;
  }
}

export default createBuilder<BuildWidgetsOptions>(buildWidgets);
