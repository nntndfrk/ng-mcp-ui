import { Pipe, type PipeTransform, inject } from "@angular/core";
import { resolveMcpAsset } from "./mcp-asset.js";
import { MCP_SERVER_URL } from "./tokens.js";

/**
 * Resolve a relative asset path to an absolute URL on the MCP server origin.
 * Thin Angular pipe over {@link resolveMcpAsset} (the tested, decorator-free
 * core in `mcp-asset.ts`); injects {@link MCP_SERVER_URL} and delegates.
 *
 * Output: `${serverUrl}/assets/widgets/${path}`; empty `serverUrl` (dev) returns
 * the relative path unchanged. See `mcp-asset.ts` for the rationale (PLAN §5.5
 * cross-origin asset fix).
 *
 * @example
 * ```html
 * <!-- serverUrl = "https://app.example.com" -->
 * <img [src]="'media/poll.png' | mcpAsset" />
 * <!-- → https://app.example.com/assets/widgets/media/poll.png -->
 * ```
 */
@Pipe({
  name: "mcpAsset",
  pure: true,
})
export class McpAssetPipe implements PipeTransform {
  private readonly serverUrl = inject(MCP_SERVER_URL);

  transform(path: string): string {
    return resolveMcpAsset(this.serverUrl, path);
  }
}
