/** Options for the `tool` schematic. Mirrors tool/schema.json. */
export interface ToolOptions {
  /** The name of the tool (required, positional argv 0). */
  name: string;
  /** The name of the project to target. */
  project?: string;
  /** Name of an existing view to link this tool to. */
  view?: string;
}
