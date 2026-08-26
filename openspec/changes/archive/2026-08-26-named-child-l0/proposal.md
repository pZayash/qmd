## Why

1C object dir-nodes (КПСР) list only `dirs: Commands, Ext, Forms, Templates`. Agents cannot see `ManagerModule.bsl` or form names without a second drill. Extractive L0 is still “direct children only”; richer text is index quality, not a new API.

## What Changes

- Extractive L0 gains **named-child expansion**: one extra listing for direct children named `Ext` (indexed file basenames) and `Forms` (child directory names).
- Keep 500-char cap. Prefer xml peek, then `Ext:` / `Forms:`, then leftover direct names. Drop whole names (`+N more`); no mid-name `slice`.
- Cap 32 applies to leftover **direct** child dir/file names only. Expansion lists until 500.
- Exact names `Ext` and `Forms`. `Commands`/`Templates` stay on `dirs:` only.

Not in this change: universal +1, form xml peek, `l0_source: q`, contracts, CLI/MCP flags, RRF weight.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `dir-node`: extractive L0 includes named-child expansion (`Ext` files, `Forms` folder names) under the existing 500-char budget.

## Impact

- Code: `src/dir-node.ts` (`buildExtractiveL0`, `getDirectChildren` reuse), `src/store.ts` `upsertDirNode` (pass expansion lists).
- Tests: `test/dir-node.test.ts` (shape, caps, markdown dirs unchanged).
- Docs: CLAUDE.md / README dir-node bullet, `CHANGELOG.md` `[Unreleased]`. User runs `qmd update` then `qmd embed` (not from this change).

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
