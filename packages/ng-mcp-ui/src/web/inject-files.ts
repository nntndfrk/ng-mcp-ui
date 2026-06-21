import { assertInInjectionContext, inject } from "@angular/core";
import type {
  Adaptor,
  FileMetadata,
  UploadFileOptions,
} from "./bridges/types.js";
import { MCP_ADAPTOR } from "./tokens.js";

/**
 * File operations bound to the current host, returned by {@link injectFiles}:
 * `upload`, `getDownloadUrl`, `selectFiles`.
 */
export type InjectFilesResult = {
  upload: (file: File, options?: UploadFileOptions) => Promise<FileMetadata>;
  getDownloadUrl: (file: FileMetadata) => Promise<{ downloadUrl: string }>;
  selectFiles: () => Promise<FileMetadata[]>;
};

/**
 * Signal-DI file-operations wrapper.
 *
 * Returns `{ upload, getDownloadUrl, selectFiles }` bound to the current host.
 * Apps-SDK-only — the adaptor throws under MCP Apps; `selectFiles` additionally
 * requires a ChatGPT host that exposes the picker.
 *
 * Each method is wrapped in an arrow so the adaptor's `this` is preserved
 * regardless of how the returned functions are later destructured/invoked.
 *
 * Must be called from an injection context. The adaptor is resolved from
 * {@link MCP_ADAPTOR} — nothing here calls `getAdaptor()` (THE RULE, PLAN §5.3).
 */
export function injectFiles(): InjectFilesResult {
  assertInInjectionContext(injectFiles);
  const adaptor: Adaptor = inject(MCP_ADAPTOR);
  return {
    upload: (file, options) => adaptor.uploadFile(file, options),
    getDownloadUrl: (file) => adaptor.getFileDownloadUrl(file),
    selectFiles: () => adaptor.selectFiles(),
  };
}
