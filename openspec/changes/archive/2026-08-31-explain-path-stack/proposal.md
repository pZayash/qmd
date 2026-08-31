## Why

Mix `query --explain` shows pre-weight RRF totals while candidate order is post-`QMD_DIR_RRF_WEIGHT`. Agents cannot see which ancestor dir-nodes exist, whether those dirs made the fused list, or the score after the dir multiplier. Path-stack + dir-weight fields on explain close that gap without hierarchical retrieval.

## What Changes

- When `explain` is set on hybrid/structured `query`, each hit gains `pathStack`: POSIX ancestors that have an **active dir-node** in the same collection (not every path segment).
- Each stack entry: collection-relative `path`, `kind: dir`, `inCandidates`, and `rrfRank` when that dir is in the **fused list after dir-weight and before `-C`**.
- Dir hits also get `dirWeight` (multiplier actually applied) and `scoreAfterDirWeight` (fused score after `applyDirRrfWeight`).
- Surfaces: `qmd query --explain` (TTY + JSON), MCP `query` (`explain: true`), REST `POST /query` if `explain` is already/now forwarded. SDK `search({ explain: true })` inherits store fields.
- `get` unchanged. Not `search` / `vsearch`. No hierarchical query.

Not in this change: MCP/CLI `tree`, `grep`, child xml peek, `l0_source: q`, progressive L1.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `dir-node`: `query` explain includes path-stack of ancestor dir-nodes and, on dir hits, dir RRF weight plus post-weight fused score.

## Impact

- Code: `src/store.ts` (`HybridQueryExplain`, `hybridQuery`, `structuredSearch`); CLI TTY in `src/cli/qmd.ts`; MCP `query` + REST `POST /query` pass-through.
- Tests: helper unit tests; store integration with `skipRerank` + `explain`; MCP/REST accept `explain`.
- Docs: `CHANGELOG.md` `[Unreleased]`, CLAUDE.md / README `--explain` bullet. Restart MCP daemon. No index rebuild.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
