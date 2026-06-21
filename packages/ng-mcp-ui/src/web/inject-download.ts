import { assertInInjectionContext, inject } from "@angular/core";
import type {
  Adaptor,
  DownloadParams,
  DownloadResult,
} from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";

/** Function that asks the host to download resource contents. */
export type DownloadFn = (params: DownloadParams) => Promise<DownloadResult>;

/**
 * Signal-DI download wrapper.
 *
 * Returns `{ download }` where `download(params)` asks the host to download the
 * given resource contents (resolving `{ isError? }`). MCP-Apps-with-capability
 * only — the adaptor surfaces `{ isError: true }` (and logs) where unsupported
 * (the host/runtime decision lives in the adaptor, not this wrapper).
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectDownload(): { download: DownloadFn } {
  assertInInjectionContext(injectDownload);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  return { download: (params) => adaptor.download(params) };
}
