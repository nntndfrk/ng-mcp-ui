/** Bundling strategy for widget views (PLAN §5). */
export type Bundling = "lazy" | "targets" | "esbuild";

/** Zero-auth dev tunnel provider (PLAN §6). */
export type TunnelProvider = "cloudflare" | "localtunnel" | "untun";

/** Which example app to scaffold (PLAN §10). */
export type ExampleVariant = "demo" | "minimal" | "none";

/** Options for the `ng-add` schematic. Mirrors ng-add/schema.json. */
export interface NgAddOptions {
  /** The name of the project to target. */
  project?: string;
  /** Ensure Angular SSR is set up (adds it if absent). */
  ssr?: boolean;
  /** How widget views are bundled. */
  bundling?: Bundling;
  /** Zero-auth dev tunnel provider. */
  tunnelProvider?: TunnelProvider;
  /** Which example app to scaffold. */
  example?: ExampleVariant;
  /** Skip installing dependencies. */
  skipInstall?: boolean;
}
