import type { JsonObject } from "@angular-devkit/core";

/**
 * Options for the `ng-mcp-ui:build-widgets` builder (mirrors `schema.json`).
 *
 * The three named options are OWNED by this builder and stripped before
 * delegation; every other key (the index signature) is passed through verbatim
 * to `@angular/build:application` — `browser`, `index`, `outputPath`,
 * `tsConfig`, `namedChunks`, `outputHashing`, `styles`, …
 *
 * `registry`/`failOnMissingView` are non-optional because the architect host
 * applies their `schema.json` defaults before the handler runs.
 */
export type BuildWidgetsOptions = JsonObject & {
  /** Workspace-root-relative path to the widget registry source. */
  registry: string;
  /** Workspace-root-relative manifest output path; absent → skip emission. */
  manifestOut?: string;
  /** Fail the build when a registered view emitted no chunk (default true). */
  failOnMissingView: boolean;
};

/**
 * Every builder-owned option key. The delegate re-validates the forwarded
 * options against the application schema (unknown keys hard-fail every
 * consumer build), so a new owned option MUST be added here in lockstep with
 * `schema.json` — a test asserts this list equals the schema's `properties`.
 */
export const BUILDER_OWNED_KEYS = [
  "registry",
  "manifestOut",
  "failOnMissingView",
] as const satisfies readonly (keyof BuildWidgetsOptions)[];
