## Why

After a dir-node hit, agents can drill with `query` + `path`, but they cannot **browse one folder** without a keyword. CLI `qmd ls` exists; MCP has no equivalent. Resource `qmd://` has no `list()` (and must not dump 100k URIs).

## What Changes

- MCP tool **`ls`**: one optional string path (CLI `qmd ls` shape). Omit = collections. `qmd://col/rel` or `col[/rel]` = one indexed level (files + child dirs).
- Cap **200** children; report leftover / truncated. Not search. Not recursive `tree`.
- No MCP resource `list()`. CLI `qmd ls` stays recursive dump. Agent drill recipe unchanged.

## Capabilities

### New Capabilities

- `index-ls`: MCP browse of one indexed directory level (and collection list).

### Modified Capabilities

- `dir-node`: query tool text must not say there is no `ls` tool (drill still is not `ls`).

## Impact

- Code: `src/dir-node.ts` helper, `src/mcp/server.ts` tool `ls`, `buildInstructions`.
- Tests: `test/mcp.test.ts` (collections; one-level; cap; unknown collection).
- Docs: skill, CLAUDE, CHANGELOG. Restart MCP daemon.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/index-ls/spec.md](specs/index-ls/spec.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
