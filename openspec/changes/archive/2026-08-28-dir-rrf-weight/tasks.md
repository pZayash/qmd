## 1. Env + scale helper

- [x] 1.1 In `src/store.ts` next to `dirNodesDisabled`, add `export function resolveDirRrfWeight(): number`. Read `process.env.QMD_DIR_RRF_WEIGHT` trimmed. Unset or `""` → `0.5`. `Number(raw)` finite and `>= 0` and `<= 1` → that number. Else `console.error` (include the raw value) and return `0.5`.
- [x] 1.2 In `src/store.ts` add `export function applyDirRrfWeight(fused: RankedResult[], kind?: DocumentKind): RankedResult[]`. If `kind` is `"file"` or `"dir"`, return `fused` unchanged. If `resolveDirRrfWeight() === 1`, return `fused`. Else map: `r.kind === "dir"` → `{ ...r, score: r.score * w }`; missing kind = file (no multiply). Then `sort` by `score` descending. Do not mutate the input array in place.

## 2. Query pipelines

- [x] 2.1 In `hybridQuery`, after `reciprocalRankFusion(...)` and `buildRrfTrace(...)` (keep traces on pre-weight lists), set `fused = applyDirRrfWeight(fused, kind)` **before** `fused.slice(0, candidateLimit)`. Use the same `kind` already passed into FTS/vec.
- [x] 2.2 Same insertion in `structuredSearch` (after fusion, before `candidateLimit` slice).

## 3. Tests

- [x] 3.1 `test/store.test.ts` (RRF describe): `resolveDirRrfWeight` — unset → 0.5; `"1"` → 1; `"0"` → 0; `"0.5"` → 0.5; `"2"` and `"nope"` → 0.5 and `console.error` (spy). Restore env in `finally`.
- [x] 3.2 Same file: `applyDirRrfWeight` with two results (dir score 0.2, file score 0.15), `kind` omitted, env `0.5` → file ranks first. With `kind: "dir"` → original order (dir still first). With env `1` → dir still first.
- [x] 3.3 Existing `reciprocalRankFusion` tests still pass (helper is not inside fusion).

## 4. Docs

- [x] 4.1 `CHANGELOG.md` `[Unreleased]`: mix `query` dir RRF weight, env name, default 0.5, `1.0` off, MCP restart. `CLAUDE.md` + README: one line next to `QMD_DIR_NODES`. No new CLI flags. Do not run `qmd update` / `embed`.

## 5. Verify

- [x] 5.1 `pnpm exec vitest run test/store.test.ts test/rrf-trace.test.ts`
- [x] 5.2 `pnpm run build`
