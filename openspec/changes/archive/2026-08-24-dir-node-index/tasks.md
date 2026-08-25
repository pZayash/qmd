## 1. Schema and document kind

- [x] 1.1 In `src/store.ts` `initializeDatabase`, add `kind TEXT NOT NULL DEFAULT 'file'` to `CREATE TABLE IF NOT EXISTS documents`. After create, if `PRAGMA table_info(documents)` has no `kind`, run `ALTER TABLE documents ADD COLUMN kind TEXT NOT NULL DEFAULT 'file'`.
- [x] 1.2 Extend `insertDocument` and `updateDocument` (and the `ON CONFLICT` upsert) to set `kind` (`file` | `dir`). File indexing MUST pass `'file'` (or rely on default) so current callers stay valid.
- [x] 1.3 Thread `kind` through `DocumentResult` and `SearchResult` in `src/store.ts` (SELECT lists for search hits and `get`). Missing column reads as `'file'`.
- [x] 1.4 Skip `resolveDocEdges` / link-ref extraction for `kind='dir'` rows. Confirm FTS trigger still indexes dir-node `content.doc` as body.

## 2. Extractive L0 module

- [x] 2.1 Add `src/dir-node.ts` exporting `L0Source = "n" | "p" | "q"` and `resolveL0Source(raw: unknown): L0Source` (invalid → `"n"` + `console.error` warning).
- [x] 2.2 Export `peek1cXml(xmlPath: string): { name: string; synonym: string } | null` — read the first 64KiB prefix (even if the file is larger); parse `Name` and ru `Synonym`/`v8:content`; return null on error.
- [x] 2.3 Export `buildExtractiveL0(input)` with `dirRelPath`, `pathContext`, `xmlPeek`, `childDirs: string[]`, `childFiles: { basename: string; heading?: string }[]`. Direct children only; max 32 names; `+N more`; no invented sentences; include xml peek when present.
- [x] 2.4 Export `readContractL0(collectionRoot, dirRelPath): string | null` reading `{collectionRoot}/.qmd/l0/{dirRelPath}.md` (POSIX, `.md` suffix). Empty/missing → null.
- [x] 2.5 Export `chooseL0Text({ source, contract, extractive }): string` — `n` always extractive; `p`/`q` prefer contract; `q` also `console.error` that API generate is unimplemented.
- [x] 2.6 Export `ancestorDirPaths(fileRelPath: string): string[]` (posix, no trailing slash, exclude `.`).

## 3. Config

- [x] 3.1 In `src/collections.ts` add `l0Source?: L0Source` on `Collection` and on `ModelsConfig`. Parse YAML `l0_source` / `l0Source`. Collection overrides `models.l0Source`; default `"n"`.
- [x] 3.2 Persist `l0_source` on config write (YAML round-trip). Add a case in `test/collections-config.test.ts`.

## 4. Rebuild dir-nodes on update

- [x] 4.1 Add `rebuildDirNodes(db, collectionName, collectionPath, options: { l0Source, pathContextLookup, limitToDirs?: string[] })` in `src/store.ts` (helpers may live in `src/dir-node.ts`). For each target dir: list active `kind=file` children with path prefix `dir/`; build L0; insert `content` + upsert `kind=dir` document; when `limitToDirs` is omitted, deactivate dir-nodes not in the desired set.
- [x] 4.2 Call a full rebuild at the end of `reindexCollection` (after the file loop). Pass collection `l0Source` and `getContextForPath`. Skip `resolveDocEdges` for dir rows.
- [x] 4.3 In `reindexFiles`, after the file loop, set `limitToDirs` = union of `ancestorDirPaths` for each target (including deactivated files); rebuild only those; deactivate a dir-node in that set if it has zero remaining files.
- [x] 4.4 Pass `l0Source` from YAML in `src/cli/qmd.ts` (update ~L729 `reindexCollection` call) and `src/index.ts` SDK update (~L560). Do not run `qmd update`/`embed` against the user’s real index from tests.

## 5. Query, get, CLI, MCP

- [x] 5.1 Include `kind` in `hybridQuery` result mapping (and FTS/vec joins that build hits). If `process.env.QMD_DIR_NODES === "0"`, omit `kind='dir'` hits.
- [x] 5.2 `get` by path must resolve dir-nodes (`docs/ai` → L0 body).
- [x] 5.3 In `src/cli/formatter.ts` and CLI query output in `src/cli/qmd.ts`, mark directory hits (trailing `/` or `[dir]`); JSON includes `kind`.
- [x] 5.4 In `src/mcp/server.ts` extend `SearchResultItem` with `kind: "file" | "dir"` and map it from store results.

## 6. Tests

- [x] 6.1 Add `test/dir-node.test.ts`: extractive shape; 32-cap `+N more`; xml peek success/skip; contract vs extractive for `n`/`p`/`q`; `ancestorDirPaths`.
- [x] 6.2 Store integration using existing temp-db helpers in `test/store.test.ts`: two md files under `docs/ai/` → dir-node exists; last file gone → dir-node inactive; `reindexFiles` rebuilds parent only.
- [x] 6.3 Query: FTS on L0 returns `kind: dir`. `QMD_DIR_NODES=0` hides dir hits.
- [x] 6.4 Small 1C xml fixture (Name + ru Synonym «Заказ покупателя») — do not copy production `conf/`.

## 7. Docs

- [x] 7.1 `CHANGELOG.md` `[Unreleased]`: dir-nodes, `l0_source` n/p, xml peek, `.qmd/l0/`, `QMD_DIR_NODES=0`. User must run `qmd update` then `qmd embed`.
- [x] 7.2 README and/or CLAUDE.md: directory hits + config keys. State `q` is reserved (no generate).

## 8. Verify

- [x] 8.1 `pnpm test` (or `npx vitest run`) for dir-node, collections-config, and store tests touched.
- [x] 8.2 `pnpm run build` — `tsc` clean with new `kind` fields.
