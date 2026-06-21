// The view HTML-shell renderer interface (the {@link ShellRenderer} seam).
//
// The resource HTML is rendered without Handlebars (intentionally NOT a
// dependency here), and the shell bootstraps an **Angular** widget bundle rather
// than a React entry. `McpServer` depends only on this {@link ShellRenderer}
// interface; the
// concrete production/development shells live in `shell-templates.ts`
// ({@link AngularShellRenderer}, PLAN §5.3) and are the injected default.

import type { ViewHostType } from "./types.js";
import type { ViewManifest } from "./view-manifest.js";

/** Inputs the shell needs to boot a widget inside the host iframe. */
export interface ShellRenderInput {
  hostType: ViewHostType;
  serverUrl: string;
  /** The view component name the widget entry should bootstrap. */
  viewName: string;
  /** `true` for `NODE_ENV=production` — picks the hashed-asset shell. */
  isProduction: boolean;
  /** Resolves hashed asset filenames in production. */
  manifest: ViewManifest;
}

/**
 * Renders the thin HTML shell returned by `resources/read`. The host renders it
 * in a sandboxed iframe; the bundle boots and the bridge delivers tool data
 * afterwards (see PLAN §1.1). Implementations must include `serverUrl` and
 * `viewName` so the bootstrapped widget knows where to load assets and which
 * view to render.
 */
export interface ShellRenderer {
  render(input: ShellRenderInput): string;
}
