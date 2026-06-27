// Shared source-wiring helpers used by the `tool`, `view`, and `example`
// schematics to splice registrations into a retrofitted app's
// `src/mcp/server.ts` and `src/widgets/{registry.ts,views.d.ts}`.
//
// These were factored out of `tool/index.ts` (server wiring, S28) and
// `view/index.ts` (registry + views.d.ts, S27) in S29 so the `example`
// schematic can reuse the EXACT same insertion logic for the multi-tool poll
// demo (which registers via `registerPollTools(server)` — a literal call, not
// the `register<Cls>Tool` derivation the `tool` generator uses). The extraction
// is behaviour-preserving: it carries the S27/S28 Copilot-review hardening
// verbatim (scoped `createMcpServer` body scan + resolved instance identifier
// for the server-call insertion; 4-space-preserving `views.d.ts` member insert).
// All helpers are synchronous, format-preserving, idempotent, and bail
// gracefully (log + return unchanged) rather than throwing, so a generated file
// always survives even when wiring can't be applied.
import type { SchematicContext, Tree } from "@angular-devkit/schematics";
import { insertImport } from "@schematics/angular/utility/ast-utils";
import {
  type Change,
  InsertChange,
  applyToUpdateRecorder,
} from "@schematics/angular/utility/change";
import * as ts from "typescript";

/** Whether `key` is a bare JS identifier (so it can appear unquoted as a key). */
export function isSafeIdentifier(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

/** Escape a string for embedding into a `RegExp`. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Locate the `return <server>;` statement INSIDE `createMcpServer()` so callers
 * can splice a registration call directly before it, and resolve the McpServer
 * instance identifier (`const <server> = new McpServer(...)`) so the inserted
 * call targets the right variable (e.g. `return mcp;` → `registerXTool(mcp);`).
 *
 * Both scans are SCOPED to the `createMcpServer` function body (S28 hardening)
 * so an unrelated `return server;` / `new McpServer` in another function can't
 * become the anchor. Returns `{ start, serverName }` (the statement's full-text
 * start + the resolved instance name), or `null` when the shape is unrecognized
 * (caller bails gracefully).
 */
export function findReturnServer(
  source: ts.SourceFile,
): { start: number; serverName: string } | null {
  // Scope to the `createMcpServer` function body.
  let body: ts.Block | null = null;
  const visitFn = (node: ts.Node): void => {
    if (
      body === null &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "createMcpServer" &&
      node.body
    ) {
      body = node.body;
      return;
    }
    ts.forEachChild(node, visitFn);
  };
  ts.forEachChild(source, visitFn);
  if (body === null) {
    return null;
  }
  const fnBody: ts.Block = body;

  // The McpServer instance name (`const <server> = new McpServer(...)`).
  let serverName: string | null = null;
  const visitDecl = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const init = node.initializer;
      if (
        init &&
        ts.isNewExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === "McpServer"
      ) {
        serverName = node.name.text;
      }
    }
    ts.forEachChild(node, visitDecl);
  };
  ts.forEachChild(fnBody, visitDecl);

  // The matching `return <serverName>;` within the same body (falling back to a
  // bare `server` when the declaration wasn't recognized).
  const wanted: string = serverName ?? "server";
  let found: number | null = null;
  const visitReturn = (node: ts.Node): void => {
    if (found !== null) {
      return;
    }
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === wanted
    ) {
      found = node.getStart(source);
      return;
    }
    ts.forEachChild(node, visitReturn);
  };
  ts.forEachChild(fnBody, visitReturn);

  return found === null ? null : { start: found, serverName: wanted };
}

/**
 * Wire a tool registration into `src/mcp/server.ts`:
 *   - add `import { <importName> } from "<importPath>";`
 *   - insert `  <registerCall>` immediately before `return <server>;`
 *
 * AST strategy mirrors ng-add's `patchServerTs`: `ast-utils.insertImport` +
 * `InsertChange` + `applyToUpdateRecorder` (no `ts-morph`). Idempotent via the
 * presence of `registerCall` text. Graceful bail (log `manualSnippet`, return
 * unchanged) when `server.ts` is missing or `createMcpServer()` / its
 * `return <server>;` shape isn't found.
 *
 * `buildRegisterCall` receives the RESOLVED McpServer instance identifier (S28
 * hardening — so `const mcp = new McpServer()` yields `registerXTool(mcp);`, not
 * a hard-coded `server`). Callers that follow the `register<Cls>Tool` convention
 * (the `tool` generator) and callers that use a fixed name (the poll demo's
 * `registerPollTools`) build their call the same way.
 */
export function insertRegisterCall(
  tree: Tree,
  context: SchematicContext,
  opts: {
    serverTsPath: string;
    importName: string;
    importPath: string;
    buildRegisterCall: (serverName: string) => string;
    manualSnippet: string;
  },
): Tree {
  const {
    serverTsPath,
    importName,
    importPath,
    buildRegisterCall,
    manualSnippet,
  } = opts;

  if (!tree.exists(serverTsPath)) {
    context.logger.warn(manualSnippet);
    return tree;
  }

  const content = tree.readText(serverTsPath);

  const source = ts.createSourceFile(
    serverTsPath,
    content,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  const target = findReturnServer(source);
  if (target === null) {
    // Unrecognized shape — bail gracefully with copy-pasteable instructions.
    context.logger.warn(manualSnippet);
    return tree;
  }

  // Target the resolved instance name so non-`server` apps still compile.
  const registerCall = buildRegisterCall(target.serverName);

  // Idempotency: the registration call is already present → no-op.
  if (content.includes(registerCall)) {
    return tree;
  }

  const changes: Change[] = [
    insertImport(source, serverTsPath, importName, importPath),
    // `target.start` is the `return` token's start (leading indent excluded by
    // getStart), so the existing indent prefixes the inserted call and the
    // trailing `\n\n  ` re-indents the return — preserving 2-space formatting.
    new InsertChange(serverTsPath, target.start, `${registerCall}\n\n  `),
  ];

  const recorder = tree.beginUpdate(serverTsPath);
  applyToUpdateRecorder(recorder, changes);
  tree.commitUpdate(recorder);

  return tree;
}

/**
 * Insert a `<key>: () => import("<importPath>"),` member into the
 * `registry = { … } as const` literal in `registry.ts`, just before the closing
 * `} as const`. String-anchored (format-preserving, no AST). The key is the RAW
 * `key` (quoted only when not a bare identifier via {@link isSafeIdentifier}).
 * Idempotent: a member already keyed by `key` is left untouched (so a chained
 * re-run produces no diff). Graceful bail (log + skip) when `registry.ts` is
 * missing or its `} as const` shape is unrecognized.
 */
export function insertRegistryEntry(
  tree: Tree,
  context: SchematicContext,
  opts: { registryPath: string; key: string; importPath: string },
): Tree {
  const { registryPath, key, importPath } = opts;
  const entryKey = isSafeIdentifier(key) ? key : JSON.stringify(key);
  const handLine = `${entryKey}: () => import("${importPath}"),`;
  const entry = `  ${handLine}\n`;

  if (!tree.exists(registryPath)) {
    context.logger.warn(
      `ng-mcp-ui: ${registryPath} not found — skipping registry wiring. ` +
        `Add an entry by hand:\n  ${handLine}`,
    );
    return tree;
  }

  const content = tree.readText(registryPath);

  // Idempotency: skip if a member with this key is already registered.
  const keyRe = new RegExp(
    `(^|[{,\\s])(?:"${escapeRegExp(key)}"|${escapeRegExp(key)})\\s*:`,
    "m",
  );
  if (keyRe.test(content)) {
    return tree;
  }

  // Anchor on the `} as const` that closes the registry object; insert the new
  // member immediately before that closing brace.
  const anchorRe = /\n\s*}\s*as const/;
  const match = anchorRe.exec(content);
  if (!match || match.index === undefined) {
    context.logger.warn(
      `ng-mcp-ui: could not find the \`} as const\` anchor in ${registryPath} ` +
        `— skipping registry wiring. Add by hand:\n  ${handLine}`,
    );
    return tree;
  }

  const insertAt = match.index + 1; // keep the preceding newline
  tree.overwrite(
    registryPath,
    `${content.slice(0, insertAt)}${entry}${content.slice(insertAt)}`,
  );
  return tree;
}

/**
 * The fresh `views.d.ts` scaffold. The leading `export {};` is LOAD-BEARING: it
 * makes the file a MODULE, so the `declare module "ng-mcp-ui/server"` below is a
 * module AUGMENTATION (merges into the package's real types). Without it the file
 * is a SCRIPT and `declare module` becomes an ambient module declaration that
 * SHADOWS `ng-mcp-ui/server` — hiding every other export (`McpServer`,
 * `createMcpExpressRouter`, …) from the whole consumer program (a `ng build`
 * would fail with "has no exported member"). Do not remove it.
 */
function viewsDtsScaffold(member: string): string {
  return (
    `// Generated by \`ng generate ng-mcp-ui:view\`. Declaration-merges this app's\n` +
    `// view names into \`ViewNameRegistry\` so \`ViewName\` narrows and\n` +
    `// \`view: { component: "<name>" }\` typechecks (PLAN §7.2).\n` +
    `//\n` +
    `// \`export {}\` makes this file a module so the \`declare module\` below is an\n` +
    `// augmentation (merges) rather than an ambient declaration that would shadow\n` +
    `// \`ng-mcp-ui/server\` and hide its exports. Keep it.\n` +
    `export {};\n\n` +
    `declare module "ng-mcp-ui/server" {\n` +
    `  interface ViewNameRegistry {\n` +
    `${member}\n` +
    `  }\n` +
    `}\n`
  );
}

/** Ensure `content` is a module (has a top-level import/export) so a contained
 *  `declare module` augments rather than shadows. Appends `export {};` if not. */
function ensureModule(content: string): string {
  return /(^|\n)\s*(export|import)\b/.test(content)
    ? content
    : `${content}\nexport {};\n`;
}

/**
 * Maintain the generated `ViewNameRegistry` augmentation `.d.ts`
 * (`src/widgets/views.d.ts`): TS declaration-merges it with the seed `echo`
 * augmentation in `src/mcp/server.ts` so `ViewName` / `view: { component: "<key>"
 * }` narrows (PLAN §7.2).
 *
 * - Absent: create it as a MODULE (see {@link viewsDtsScaffold}) with a
 *   single-member interface.
 * - Present: string-anchored insert of `<key>: true;` into the existing
 *   `interface ViewNameRegistry { … }` body (idempotent).
 */
export function maintainViewsDts(
  tree: Tree,
  opts: { dtsPath: string; key: string },
): Tree {
  const { dtsPath, key } = opts;
  const memberKey = isSafeIdentifier(key) ? key : JSON.stringify(key);
  const member = `    ${memberKey}: true;`;

  if (!tree.exists(dtsPath)) {
    tree.create(dtsPath, viewsDtsScaffold(member));
    return tree;
  }

  const content = tree.readText(dtsPath);
  // Idempotent: skip if the member is already declared.
  const memberRe = new RegExp(
    `(^|[{;\\s])(?:"${escapeRegExp(key)}"|${escapeRegExp(key)})\\s*:\\s*true`,
    "m",
  );
  if (memberRe.test(content)) {
    return tree;
  }

  // Anchor: insert just before the first `}` that closes the interface body.
  const ifaceRe = /interface\s+ViewNameRegistry\s*\{/;
  const ifaceMatch = ifaceRe.exec(content);
  const freshBlock =
    `\ndeclare module "ng-mcp-ui/server" {\n` +
    `  interface ViewNameRegistry {\n` +
    `${member}\n` +
    `  }\n` +
    `}\n`;

  if (!ifaceMatch || ifaceMatch.index === undefined) {
    // Unrecognized shape — append a fresh augmentation block (still valid TS:
    // declaration merging across blocks within the same module). `ensureModule`
    // keeps the file a module so the block augments rather than shadows.
    tree.overwrite(dtsPath, ensureModule(content) + freshBlock);
    return tree;
  }

  const bodyStart = ifaceMatch.index + ifaceMatch[0].length;
  const closeIdx = content.indexOf("}", bodyStart);
  if (closeIdx === -1) {
    // Malformed — append a fresh block rather than throwing, so the file still
    // lands.
    tree.overwrite(dtsPath, ensureModule(content) + freshBlock);
    return tree;
  }

  // Insert the member as its own clean line just BEFORE the brace's line —
  // cutting at the newline that precedes the `}`'s indentation, so `member`'s
  // own 4-space indent is preserved verbatim (slicing at `closeIdx` would keep
  // the brace's leading `\n  `, prefixing it onto the member → over-indented).
  // This is the S27 fix — do NOT regress to `content.slice(0, closeIdx) +
  // member + "\n  " + content.slice(closeIdx)` (the draft's 6-space-indent bug).
  const braceLineStart = content.lastIndexOf("\n", closeIdx);
  if (braceLineStart === -1) {
    // Closing brace on the very first line (hand-authored single-line shape) —
    // append a fresh augmentation block rather than risk a bad splice.
    tree.overwrite(dtsPath, ensureModule(content) + freshBlock);
    return tree;
  }
  const updated = `${content.slice(0, braceLineStart)}\n${member}${content.slice(braceLineStart)}`;
  tree.overwrite(dtsPath, updated);
  return tree;
}
