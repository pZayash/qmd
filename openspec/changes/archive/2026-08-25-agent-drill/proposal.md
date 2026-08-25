## Why

After a dir-node hit, agents must open L0 then search **inside that folder**. CLI already has `--path` + `--kind file`. MCP `query` has `kind` but no `path`, so MCP agents cannot drill. A new `drill` / `ls` tool is not needed.

## What Changes

- MCP `query`: optional `path: string[]` (OR prefixes), same semantics as CLI `--path` (strip leading `/`, keep trailing `/`, SQL `LIKE prefix%`).
- Forward `pathPrefixes` into `store.search` (SDK already has the option).
- Docs/skill: **agent drill** recipe — `get` L0, then query with `path: ["<dir>/"]` and `kind: "file"`. No auto-slash. `get` payload unchanged.

Not in this change: `qmd drill`, MCP `ls`/`tree`, progressive L0/L1, RRF weight, `get` extra fields.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `dir-node`: MCP query accepts path prefixes so agents can drill from a dir-node into files.

## Impact

- Code: `src/mcp/server.ts` (`query` inputSchema + `store.search({ pathPrefixes })`).
- Docs: `skills/qmd/SKILL.md` + `src/embedded-skills.ts` (keep in sync), CLAUDE.md, README, `CHANGELOG.md` `[Unreleased]`.
- Tests: MCP `query` with `path` (+ `kind: "file"`) only hits under that prefix; omit `path` unchanged.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
