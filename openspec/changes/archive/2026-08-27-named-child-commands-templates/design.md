## Context

`namedChildExpansion` expands exact `Ext` (files) and `Forms` (child dirs). Spec currently SHALL NOT expand `Commands`/`Templates`. КПСР objects still show those only on `dirs:`. Explore (chat 2026-08-27): both folders are 1C **child directories** (command/template name = folder), same as Forms — not Ext-style files.

`buildExtractiveL0ForDir` already calls `namedChildExpansion`; `upsertDirNode` uses that helper. No store duplicate.

500-char whole-name drop already exists (`l0PushCommaLine`). Fat objects with many Forms will hit `+N more` sooner if Commands/Templates also list.

## Goals / Non-Goals

**Goals:**

- Object L0 includes `Commands:` and `Templates:` child dir names when those folders exist among indexed paths.
- Same 500 / 32 leftover / no invented sentences.
- Markdown trees without those folder names stay the same.

**Non-Goals:**

- Per-command or per-template xml peek.
- Expanding any other child dir name (no universal +1).
- Changing Ext (still **files**) or Forms (still **dirs**).
- RRF, MCP/CLI flags, contracts, `l0_source: q`.
- Auto `qmd update` / `embed`.

## Decisions

### D1: Same recipe as Forms

If `childDirs` contains exact `Commands`, take `getDirectChildren(…, dir/Commands).childDirs`. Same for `Templates`. Exact Pascal names, no case-fold.

- **Rejected:** Ext-style file listing — 1C commands/templates are folders (`Commands/Провести/Ext/CommandModule.bsl`).

### D2: Append after Ext/Forms

Fill order: path → context → xml → `Ext:` → `Forms:` → `Commands:` → `Templates:` → leftover directs. Keeps existing Ext/Forms line order; Commands/Templates are extra, lower priority if 500 runs out.

`dirs:` still lists `Commands`, `Ext`, `Forms`, `Templates`. Expansion does not remove them from leftover dirs.

### D3: 32 leftover still ignores expansion names

Names on `Ext:` / `Forms:` / `Commands:` / `Templates:` do not count toward 32.

## Risks / Trade-offs

- **500 truncates fat objects harder** → `+N more`; drill `Commands/` or `Forms/`. Prefer Ext/Forms first so they win the budget.
- **Hash churn** on every object dir-node → user `qmd update` then `embed`.
- **Windows case** → exact `Commands`/`Templates`; 1C dump is Pascal.

## Migration Plan

Ship. User `qmd update` then `qmd embed`. Rollback: revert; next update restores old L0 (no Commands:/Templates: lines).

## Open Questions

None.
