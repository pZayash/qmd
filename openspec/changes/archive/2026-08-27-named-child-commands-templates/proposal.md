## Why

1C object L0 already lists `Ext:` modules and `Forms:` names, but `Commands` and `Templates` stay as bare words on `dirs:`. Agents cannot see command or print-template names without a second drill. Same named-child hole Ext/Forms closed.

## What Changes

- Named-child expansion also lists **child directory names** under exact `Commands` and `Templates` (`Commands: …`, `Templates: …`), from indexed paths (not a filesystem walk). Same 500-char whole-name budget; 32 leftover still excludes expansion names.
- Fill order after xml peek: existing `Ext:` / `Forms:`, then `Commands:`, then `Templates:`, then leftover directs. Missing folder → omit that line.
- Markdown dirs without those names: unchanged.

Not in this change: form/command xml peek, universal +1, RRF, MCP/CLI flags, `l0_source: q`.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `dir-node`: named-child expansion includes `Commands` and `Templates` child dir names (same recipe as `Forms`).

## Impact

- Code: `src/dir-node.ts` (`ExtractiveL0Input`, `namedChildExpansion`, `buildExtractiveL0`, `buildExtractiveL0ForDir`). Store already calls `buildExtractiveL0ForDir`.
- Tests: `test/dir-node.test.ts` (1C shape + Commands/Templates; markdown unchanged). Update the test that currently asserts Commands is **not** expanded.
- Docs: CLAUDE/README dir-node bullet, CHANGELOG. User runs `qmd update` then `qmd embed`.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
