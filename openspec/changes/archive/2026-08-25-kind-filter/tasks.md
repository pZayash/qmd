## 1. Store filter

- [x] 1.1 Add `kind?: DocumentKind` to `searchFTS` / `searchVec` (after `pathPrefixes`). When set, add `AND COALESCE(kind,'file') = ?` on the documents filter (FTS `d_filter` / vec JOIN). Omit = no kind predicate.
- [x] 1.2 Thread `kind` through `HybridQueryOptions`, `VectorSearchOptions`, `StructuredSearchOptions`, and every `searchFTS`/`searchVec` call inside `hybridQuery` / `vectorSearchQuery` / `structuredSearch`.
- [x] 1.3 Keep `QMD_DIR_NODES=0` omit-dir behavior. If env is `0` and `kind === "dir"`, return `[]` (optional `console.error` one line).
- [x] 1.4 Export a small `parseDocumentKind(raw: string): DocumentKind` (throws on invalid) for CLI/MCP, or equivalent in one module.

## 2. CLI

- [x] 2.1 `parseArgs`: `--kind` string, not multiple. Put parsed value on `OutputOptions`. Invalid → stderr + exit 1.
- [x] 2.2 Pass `kind` into `searchFTS`, `vectorSearchQuery`, `hybridQuery` / `structuredSearch` in `search` / `vectorSearch` / `querySearch`.
- [x] 2.3 Help text: `--kind file|dir` on search/query. Note `QMD_DIR_NODES=0`.

## 3. MCP / SDK

- [x] 3.1 MCP `query` inputSchema: optional `kind: z.enum(["file","dir"])`. Forward to `store.search`.
- [x] 3.2 If SDK `src/index.ts` search/query options exist, add `kind` and forward. Skip if no such wrapper.

## 4. Tests and docs

- [x] 4.1 Extend `test/dir-node-store.test.ts` (or new `test/kind-filter.test.ts`): after reindex, FTS `kind: "dir"` returns only dirs; `kind: "file"` none of those dirs; omit can include both; `QMD_DIR_NODES=0` + `kind: "dir"` empty.
- [x] 4.2 `CHANGELOG.md` `[Unreleased]` + CLAUDE.md / README: `--kind file|dir`.
- [x] 4.3 `pnpm exec vitest run` on the new/touched tests; `pnpm run build`.
