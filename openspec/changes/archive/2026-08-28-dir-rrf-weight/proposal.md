## Why

Mix `query` (no `--kind`) fuses file and dir-node hits with equal RRF. КПСР has tens of thousands of dirs; they crowd `-C` and the top of the list. Kind filter already hides a kind; agents who want a mix still need folders visible but not stealing file slots.

## What Changes

- After RRF fusion in hybrid and structured `query`, multiply `kind: dir` scores by **dir RRF weight**, then slice to `candidateLimit`.
- Apply only when kind filter is omitted (mix). `--kind dir` unweighted. `--kind file` has no dirs.
- Env `QMD_DIR_RRF_WEIGHT`: default `0.5`; `1.0` = identity. Clamp `[0, 1]`; missing / non-numeric / out of range → `0.5` + stderr. No new CLI or MCP fields.
- Not `search` / `vsearch`. No YAML. No post-rerank-only cosmetic.

Not in this change: form xml peek, `l0_source: q`, progressive L0/L1, `--explain` path-stack, MCP `tree`/`grep`.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `dir-node`: mix `query` demotes dir-nodes in RRF ranking via env weight.

## Impact

- Code: `src/store.ts` (`reciprocalRankFusion` callers `hybridQuery` / `structuredSearch`; env parse helper). `--explain` RRF totals should match post-weight scores if traces are built from the same fused list.
- Tests: mix vs `--kind dir`; env default / `1.0` / invalid; `search`/`vsearch` unchanged.
- Docs: `CHANGELOG.md` `[Unreleased]`, CLAUDE.md / README env. MCP daemon restart to pick up env. No index rebuild.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
