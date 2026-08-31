## Context

`--explain` is built in four places (`hybridQuery` / `structuredSearch` × skipRerank / rerank blend). RRF traces (`buildRrfTrace`) stay on **pre-weight** lists. `applyDirRrfWeight` runs after fusion and before `candidateLimit`. Ancestor paths already exist as `ancestorDirPaths` in `src/dir-node.ts`. Active dir-nodes live in `documents` (`kind=dir`, `active=1`). MCP stdio `query` has no `explain` argument today; HTTP RPC already forwards `--explain`. REST `POST /query` does not forward `explain`.

## Goals / Non-Goals

**Goals:**

- Attach `pathStack` to every explained `query` hit.
- Stack = ancestors of the hit that have an active dir-node in the same collection (hit itself is not an ancestor).
- `inCandidates` / `rrfRank` from the fused list **after** dir-weight, **before** `-C`.
- Dir hits: `dirWeight` (applied multiplier) and `scoreAfterDirWeight` (`cand.score` after `applyDirRrfWeight`).
- CLI TTY extra dim lines; JSON already spreads `explain`.
- MCP `query` optional `explain`; REST `POST /query` same.

**Non-Goals:**

- Changing `get` or adding hierarchical retrieval.
- Rewriting pre-weight `rrf.totalScore` traces (keep list contributions; new fields sit beside them).
- `search` / `vsearch` explain.
- `tree` / `grep`.

## Decisions

### D1: Ancestors with active dir-nodes only

Use `ancestorDirPaths(relPath)` then keep dirs present in `documents` for that collection (`active=1`, `kind=dir`). Omit segments with no dir-node. Empty stack when the hit has no such ancestors (root file, missing dirs).

- **Rejected:** Every POSIX prefix — agents would see folders that are not searchable L0.

### D2: Rank map from weighted fused list

After `applyDirRrfWeight`, before `slice(0, candidateLimit)`, `Map<virtualFile, 1-based rank>`. Ancestor `inCandidates` iff `qmd://collection/<dirRel>` is in that map. `rrfRank` omitted (JSON) / absent when not in the map.

Existing `explain.rrf.rank` stays post-slice candidate position (unchanged). Path-stack rank is the pre-slice fused rank.

### D3: `dirWeight` is the multiplier actually applied

`kind` filter `file` or `dir` → `dirWeight` is `1` (helper returns fused unchanged). Mix → `resolveDirRrfWeight()`. `scoreAfterDirWeight` is always the fused `cand.score` after `applyDirRrfWeight`. File hits omit both fields.

### D4: Shared helper, four call sites

`buildExplainPathStack(hitFile, activeDirRelPaths, fusedRankByFile)` plus a small attach helper so skipRerank and blend paths do not drift. Load active dir paths **only when `explain` is true**, cached per collection.

### D5: MCP and REST opt-in

MCP `query` adds `explain: z.boolean().optional()` (default false). When true, pass `explain: true` into `store.search` and include `explain` on each `SearchResultItem`. REST `POST /query` reads `params.explain` the same way. Omit the field when false so payloads stay small.

## Risks / Trade-offs

- **SQL for active dirs on every explained query** — one `SELECT path FROM documents WHERE collection=? AND active=1 AND kind='dir'` per collection in the result set; explain is already a debug path.
- **Reranker can promote a dir** that is not in the pre-slice fused top — path-stack still reports fused membership, not post-rerank rank. Intended.
- **MCP daemon pins old schema** — document restart.

## Migration Plan

Ship. No schema. Restart MCP/HTTP daemon. Rollback: revert; `--explain` without new fields is the old traces only.

## Open Questions

None. Locked in explore: ancestors with dir-nodes, fused-after-weight-before-C, CLI+MCP, REST if it already has explain (it will after this change), `get` unchanged.
