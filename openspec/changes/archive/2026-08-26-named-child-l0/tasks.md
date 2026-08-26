## 1. Extractive L0 input and budget

- [x] 1.1 In `src/dir-node.ts`, extend `ExtractiveL0Input` with `extFiles?: string[]` (basenames) and `formDirs?: string[]`. Keep existing fields. Default missing arrays to empty.
- [x] 1.2 Rewrite `buildExtractiveL0` fill order: path → pathContext → xmlPeek → `Ext: a, b` (if `extFiles.length`) → `Forms: a, b` (if `formDirs.length`) → `N files` (direct files) → `dirs:` leftover child dir names → direct file lines with headings. Expansion names MUST NOT count toward `MAX_LISTED_NAMES` (32). Direct `childDirs` + `childFiles` still cap at 32 names with `+N more`.
- [x] 1.3 Replace `text.slice(0, 497) + "..."` with a whole-name budget: before appending a name or line, if `current + "\n" + next` would exceed 500, skip remaining names, increment overflow, then append `+N more` if overflow > 0. Result `.length` ≤ 500. Never emit mid-name `...` from a char slice.
- [x] 1.4 Export a helper `namedChildExpansion(filePaths: string[], dirRelPath: string): { extFiles: string[]; formDirs: string[] }` in `src/dir-node.ts`. If `getDirectChildren(filePaths, dirRelPath).childDirs` contains exact `"Ext"`, set `extFiles` from `getDirectChildren(filePaths, dirRelPath ? dirRelPath + "/Ext" : "Ext").childFiles` basenames (sorted already). Same for `"Forms"` → `formDirs` from that call’s `childDirs`. No other folder names. No xml peek.

## 2. Store wiring

- [x] 2.1 In `src/store.ts` `upsertDirNode`, after `getDirectChildren(filePaths, dirRelPath)`, call `namedChildExpansion(filePaths, dirRelPath)` and pass `extFiles` / `formDirs` into `buildExtractiveL0`. Do not change `chooseL0Text`, xml peek, or contract path.

## 3. Tests

- [x] 3.1 In `test/dir-node.test.ts`, keep the existing 32-cap test valid for leftover names (no Ext/Forms). Add: 1C-shaped input (`childDirs` includes Ext/Forms, `extFiles` + `formDirs`) → L0 contains `Ext: ManagerModule.bsl` and `Forms: ФормаДокумента`. Add: markdown-only input → no `Ext:` / `Forms:` lines.
- [x] 3.2 Add a 500-char test: many long `formDirs` names so naive join > 500 → result length ≤ 500, includes `+N more`, does not end with a sliced `...` mid-name. Add: `namedChildExpansion` on a fake path list (`obj/Ext/ManagerModule.bsl`, `obj/Forms/ФормаДокумента/Module.bsl`, `obj/Commands/X/Ext/CommandModule.bsl`) returns Ext files + Forms dirs and does not treat `Commands` as expansion.
- [x] 3.3 If `test/dir-node-store.test.ts` asserts exact L0 body, update it so Ext/Forms expansion is allowed; otherwise leave store tests unchanged.

## 4. Docs

- [x] 4.1 `CHANGELOG.md` `[Unreleased]`: extractive L0 lists `Ext` files and `Forms` dir names; 500 whole-name cap; user must `qmd update` then `qmd embed`.
- [x] 4.2 CLAUDE.md dir-nodes bullet (and README if it describes extractive children): mention named-child expansion. No new CLI flags.

## 5. Verify

- [x] 5.1 `pnpm exec vitest run test/dir-node.test.ts test/dir-node-store.test.ts` — all pass.
- [x] 5.2 `pnpm run build` — `tsc` clean. Do not run `qmd update` / `embed` / `collection add`.
