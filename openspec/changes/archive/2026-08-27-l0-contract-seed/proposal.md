## Why

`l0_source: p` already **reads** shadow contracts under `.qmd/l0/`, but nothing in QMD **writes** them. Mode `p` stays dead unless the user hand-makes files. Seed extractive L0 into missing contracts so they can edit, then `update` + `embed`.

## What Changes

- CLI **`qmd l0 seed <path>`**: path shape like `qmd ls` (`qmd://col/rel` or `col[/rel]`). One named dir-node → one file `{collectionRoot}/.qmd/l0/{dirRelPath}.md`.
- **`--all`** (with collection via path or `-c`): seed every dir-node in that collection. Path required unless `--all`.
- Write **missing / empty** only. Skip non-empty. No `--force`. Not part of `qmd update`. No MCP tool. No descendant walk.
- If `l0_source` is `n`: still write; stderr warns that `update` ignores contracts until `p`.
- After seed, user runs `qmd update` then `qmd embed` (do not auto-run).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `dir-node`: add **contract seed** CLI; reading `p`/`q` unchanged.

## Impact

- Code: `src/dir-node.ts` writer + shared extractive-for-dir helper; `src/cli/qmd.ts` `l0 seed`; reuse file-tree already used by dir-node rebuild.
- Tests: `test/dir-node.test.ts` (write skip existing); CLI or helper test for one-dir vs `--all` and `n` warning.
- Docs: CLAUDE.md, README, CHANGELOG, skill if it mentions contracts. No MCP schema change. No daemon restart.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
