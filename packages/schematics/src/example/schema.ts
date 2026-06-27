/** Which example app to scaffold. */
export type ExampleSchematicVariant = "demo" | "minimal" | "none";

/** Options for the `example` schematic. Mirrors example/schema.json. */
export interface ExampleOptions {
  /** Which example app to scaffold. */
  variant?: ExampleSchematicVariant;
  /** The name of the project to target. */
  project?: string;
}
