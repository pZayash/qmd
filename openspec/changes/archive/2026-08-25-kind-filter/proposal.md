## Why

Dir-nodes mix with files in `search` / `vsearch` / `query`. Agents need «only folders» or «only files» without `QMD_DIR_NODES=0` (global kill switch) or `--path`. Post-RRF drop wastes `candidateLimit` on КПСР (~57k dirs).

## What Changes

- CLI `--kind file|dir` (one value, not repeatable) on `search`, `vsearch`, `query`.
- MCP `query` parameter `kind: "file" | "dir"`.
- Store: filter at FTS SQL and vec JOIN **before** RRF (same layer as `--path`).
- Omit flag = both kinds (today’s default). Invalid value → error.
- `QMD_DIR_NODES=0` still wins: dirs hidden even with `--kind dir` (empty).

Not in this change: RRF weight, `--kind` on `get`/`ls`/`links`.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `dir-node`: retrieval may constrain hits by document kind.

## Impact

- Code: `src/store.ts` (`searchFTS`, `searchVec`, `hybridQuery` / structured search options), `src/cli/qmd.ts`, `src/mcp/server.ts`, SDK `src/index.ts` if it forwards query options.
- Tests: FTS/vec/hybrid with `kind`; env kill switch vs `--kind dir`; invalid CLI value.
- Docs: `CHANGELOG.md` `[Unreleased]`, CLAUDE.md / README `--kind`.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
