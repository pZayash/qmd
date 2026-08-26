## Context

`buildExtractiveL0` lists direct children only. КПСР object L0 is `dirs: Commands, Ext, Forms, Templates` plus xml peek — no module files, no form names. Explore locked named-child expansion: exact `Ext` + `Forms`, 500-char budget, 32 leftover, no form xml peek.

Indexed file paths already feed `getDirectChildren`. Reuse that for `dir/Ext` and `dir/Forms`. No filesystem walk.

## Goals / Non-Goals

**Goals:**

- Object dir L0 includes `Ext:` indexed file basenames and `Forms:` child dir names.
- Markdown dirs without those folders: same L0 shape as today (32 leftover + 500).
- Whole-name drop under 500; replace end-of-string `slice`.

**Non-Goals:**

- Expand `Commands`/`Templates` or every child dir.
- Per-form xml peek.
- New CLI/MCP flags, `l0_source: q`, contracts, RRF weight.
- Auto-run `qmd update` / `embed`.

## Decisions

### D1: Reuse `getDirectChildren` for named folders

In `upsertDirNode`, after direct children: if `childDirs` contains exact `Ext`, call `getDirectChildren(filePaths, dirRelPath + "/Ext")` and take **files** (basenames). If `Forms`, same with **childDirs**. Empty/missing folder → omit that expansion line.

Alternative: one new walker. Rejected — same prefix logic, less code.

### D2: Exact `Ext` / `Forms`

Match the 1C dump segment. No case-fold. No suffix match (`SomethingExt`).

### D3: `dirs:` still lists Ext and Forms

Research sample keeps them on `dirs:` plus expansion lines. Expansion does not remove those names from the leftover list; leftover 32 still includes them as dir names.

### D4: Fill order vs 500

Append in this order, stopping when the next **whole** name or line would exceed 500:

1. path, path context, xml peek (unchanged)
2. `Ext: a, b, …` (comma names; drop trailing names if needed)
3. `Forms: a, b, …`
4. `N files` count (direct files, if any)
5. `dirs: …` then direct file lines, cap **32 names** across dirs+files (same counting as today)
6. `+N more` for omitted leftover names (and omitted expansion names if 500 hit during Ext/Forms)

Replace `text.slice(0, 497) + "..."`.

Alternative: raise cap. Rejected in explore.

### D5: 32 does not count Ext/Forms expansion names

Names on `Ext:` / `Forms:` lines are outside the 32. Direct `dirs:` + file lines still cap at 32.

## Risks / Trade-offs

- [Fat object] 500 still truncates long form lists → `+N more`; drill into `Forms/`.
- [Hash churn] every dir-node with Ext/Forms changes L0 → user must `qmd update` then `embed`.
- [Windows case] dump is `Ext`/`Forms`; exact match misses `ext` → accept; 1C dump is Pascal.

## Migration Plan

Ship code. User rebuilds dir-nodes (`qmd update`) then `qmd embed` for changed hashes. Rollback: revert; old L0 shape returns on next update.

## Open Questions

None. Explore closed: named folders only, 500, 32 leftover, Forms names only.
