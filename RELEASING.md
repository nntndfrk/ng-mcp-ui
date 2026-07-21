# Releasing `ng-mcp-ui`

The library is published to npm by the **Release** GitHub Actions workflow
(`.github/workflows/release.yml`), triggered by pushing a `vX.Y.Z` git tag. There
is no manual `npm publish` step — tagging is the release.

## Versions that must agree

Three values are gated to stay in lockstep; a mismatch fails the build instead of
shipping a wrong version:

| Source of truth | File |
| --- | --- |
| npm package version | `packages/ng-mcp-ui/package.json#version` |
| Exported `NG_MCP_UI_VERSION` constant | `packages/ng-mcp-ui/src/version.ts` |
| Release git tag `vX.Y.Z` | the tag you push |

`tools/check-version.mjs` enforces (1) === (2) on every CI run and, with `--tag`,
also (3) === (1). The constant is re-exported from every entry point and is
asserted against `package.json` by `src/version.test.ts` and `verify:pack`.

## Cutting a release

1. **Bump both version fields together** (keep them identical):
   - `packages/ng-mcp-ui/package.json#version`
   - `NG_MCP_UI_VERSION` in `packages/ng-mcp-ui/src/version.ts`

   Also re-read `packages/ng-mcp-ui/README.md` — it ships in the tarball and
   **becomes the npm page for this version, permanently** (npm never re-renders
   a published version). Keep its wording version-agnostic; a hardcoded
   "Status: vX.Y.Z" line went stale on the npm page once already (shipped
   stale in 0.1.1/0.2.0; fixed in 0.2.1).

2. **Confirm locally** that everything agrees and the package is publishable:

   ```bash
   npm run check:version
   npm run lint && npm run typecheck && npm test && npm run test:types
   npm run verify:pack --workspace ng-mcp-ui   # builds, packs, installs, resolves subpaths
   ```

3. **Land the bump on `main`** via PR (the version change is a normal reviewed
   change).

4. **Tag the merge commit and push the tag** — this is what publishes:

   ```bash
   git checkout main && git pull
   npm run check:version --silent          # last guard before tagging
   git tag v0.1.0                          # must match package.json#version
   git push origin v0.1.0
   ```

The workflow then runs the version gate (`check-version --tag`), `build:pack`,
`verify:pack`, and `npm publish --access public --provenance`.

## What the workflow needs

- **`NPM_TOKEN`** — an npm **automation** token with publish rights to `ng-mcp-ui`,
  stored as an Actions secret (`Settings → Secrets and variables → Actions`). It is
  referenced only as `${{ secrets.NPM_TOKEN }}` and is never echoed.
- **OIDC provenance** — the job requests `id-token: write` and publishes with
  `--provenance`, so npm records a verifiable build-provenance attestation. No extra
  secret is required for this.

## Recovery / re-publish

`workflow_dispatch` runs the same job **without** the tag check (it publishes the
current `package.json` version). Use it only to re-run a publish that failed after
the version was already finalized — npm will reject republishing an existing
version, so bump first for any real change.

## Notes

- The schematics package (`packages/schematics`) is `private: true` and is **not**
  published separately — it is embedded into `ng-mcp-ui`'s tarball at pack time
  under `dist/schematics/` (see `tools/embed-schematics.mjs`).
- `files: ["dist", "README.md"]` is the publish allowlist; `verify:pack` asserts
  the embedded schematics tree and all four subpath exports actually ship.
