## 1. Extractive L0

- [x] 1.1 In `src/dir-node.ts` extend `ExtractiveL0Input` with `commandDirs?: string[]` and `templateDirs?: string[]` (child dir names). Default missing to empty.
- [x] 1.2 In `buildExtractiveL0`, after `Forms:` (`l0PushCommaLine` for `formDirs`), push `Commands: ` then `Templates: ` the same way. Add their omitted-name counts to `overflow`. Do not count these names toward `MAX_LISTED_NAMES` (32).
- [x] 1.3 In `namedChildExpansion`, return also `commandDirs` and `templateDirs`. If `childDirs` contains exact `"Commands"`, set `commandDirs` from `getDirectChildren(filePaths, dirRelPath ? dirRelPath + "/Commands" : "Commands").childDirs`. Same for `"Templates"`. Keep Ext = files, Forms = child dirs. No xml peek. No other folder names.
- [x] 1.4 In `buildExtractiveL0ForDir`, pass `commandDirs` / `templateDirs` into `buildExtractiveL0`. Do not change `src/store.ts` unless it still duplicates expansion (it should already call `buildExtractiveL0ForDir`).

## 2. Tests

- [x] 2.1 `test/dir-node.test.ts`: 1C-shaped `buildExtractiveL0` with `commandDirs` + `templateDirs` contains `Commands: Провести` and `Templates: ПФ_MXL`. Markdown-only test: also assert no `Commands:` / `Templates:`.
- [x] 2.2 Change `namedChildExpansion` test that currently expects Commands **not** expanded: input `obj/Commands/X/Ext/CommandModule.bsl` → `commandDirs` includes `X` (or `Провести` if you rename the fixture). Still return Ext files + Forms dirs.
- [x] 2.3 Keep 500-char Forms test valid. Optional: many `commandDirs` also ≤ 500 with `+N more`.

## 3. Docs

- [x] 3.1 CLAUDE.md + README dir-node bullets: Ext/Forms **and** Commands/Templates. `CHANGELOG.md` `[Unreleased]`: user must `qmd update` then `qmd embed`. No new CLI flags. Do not run update/embed from this change.

## 4. Verify

- [x] 4.1 `pnpm exec vitest run test/dir-node.test.ts test/dir-node-store.test.ts`
- [x] 4.2 `pnpm run build`
