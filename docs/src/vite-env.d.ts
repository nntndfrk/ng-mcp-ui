/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Injected by `define` in vite.config.ts from packages/ng-mcp-ui/package.json. */
  readonly NG_MCP_UI_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
