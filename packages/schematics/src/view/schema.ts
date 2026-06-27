/** Options for the `view` schematic. Mirrors view/schema.json. */
export interface ViewOptions {
  /** The name of the view (required, positional argv 0). */
  name: string;
  /** The name of the project to target. */
  project?: string;
  /** Also scaffold a paired MCP tool for this view (delegates to the `tool`
   * generator — S28; gracefully skipped until that schematic is registered). */
  withTool?: boolean;
}
