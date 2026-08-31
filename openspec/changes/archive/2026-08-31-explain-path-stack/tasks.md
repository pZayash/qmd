## 1. Explain helpers

- [x] 1.1 In `src/store.ts`, export `ExplainPathStackEntry` (`path`, `kind: "dir"`, `inCandidates`, optional `rrfRank`) and extend `HybridQueryExplain` with `pathStack: ExplainPathStackEntry[]` plus optional `dirWeight` and `scoreAfterDirWeight`.
- [x] 1.2 Export `appliedDirRrfWeight(kind?: DocumentKind): number` — `1` when kind is `file` or `dir`, else `resolveDirRrfWeight()`.
- [x] 1.3 Export `buildExplainPathStack(hitFile, activeDirRelPaths, fusedRankByFile)` using `parseVirtualPath` + `ancestorDirPaths` + `buildVirtualPath`. Skip ancestors not in `activeDirRelPaths`. Set `inCandidates`/`rrfRank` from the map keyed by `qmd://collection/dirRel`.
- [x] 1.4 Add a private attach helper used by both skipRerank and blend explain builders so the four call sites do not duplicate path-stack / dir-weight fields.

## 2. Query pipelines

- [x] 2.1 In `hybridQuery`, after `applyDirRrfWeight` and before `candidateLimit` slice, when `explain` is true: build `fusedRankByFile` (1-indexed) and cache `getActiveDirPaths` per collection. Pass fused `cand.score` into explain as `scoreAfterDirWeight` on dir hits.
- [x] 2.2 Same in `structuredSearch`. Keep `buildRrfTrace` on pre-weight lists. Do not change `explain.rrf.rank` (still post-slice candidate position).

## 3. CLI / MCP / REST

- [x] 3.1 CLI TTY (`src/cli/qmd.ts`): extra dim lines for path-stack; on dir hits also `dirWeight` and `scoreAfterDirWeight`. JSON already spreads `explain` — no formatter change unless types break.
- [x] 3.2 MCP stdio `query`: optional `explain` boolean (default false). Pass to `store.search`. Include `explain` on each `SearchResultItem` only when present.
- [x] 3.3 REST `POST /query`: accept `params.explain`; pass through; include `explain` on formatted hits when present.

## 4. Tests

- [x] 4.1 Unit tests for `buildExplainPathStack`: file with two ancestor dir-nodes; dir hit omits self; missing dir omitted; `inCandidates`/`rrfRank` from the map.
- [x] 4.2 `test/dir-node-store.test.ts`: `hybridQuery` + `skipRerank` + `explain` after reindex — file hit stack includes `docs`/`docs/ai`; dir hit stack omits self and has `dirWeight`/`scoreAfterDirWeight`.
- [x] 4.3 MCP or REST: `explain: true` includes `explain.pathStack`; omit `explain` keeps results without that object.

## 5. Docs

- [x] 5.1 `CHANGELOG.md` `[Unreleased]`: path-stack + dirWeight on `query --explain` / MCP / REST. Restart MCP daemon. No `qmd update` / `embed`. CLAUDE.md + README `--explain` bullet.

## 6. Verify

- [x] 6.1 `pnpm exec vitest run` on the tests touched in §4
- [x] 6.2 `pnpm run build`
