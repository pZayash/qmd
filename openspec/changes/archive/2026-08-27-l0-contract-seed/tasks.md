## 1. Helpers

- [x] 1.1 In `src/dir-node.ts` export `buildExtractiveL0ForDir(collectionRoot, dirRelPath, filePaths, pathContext: string | null): string` using `getDirectChildren`, `namedChildExpansion`, `peek1cXml`/`xmlPathForDir`, `readFirstMarkdownHeading`, `buildExtractiveL0` (same assembly as current `upsertDirNode`).
- [x] 1.2 In `src/store.ts` `upsertDirNode`, call `buildExtractiveL0ForDir` instead of duplicating that block.
- [x] 1.3 In `src/dir-node.ts` export `writeContractL0(collectionRoot, dirRelPath, text): "written" | "skipped"`. Path must match `readContractL0`. `mkdir` parents. Skip if `readContractL0` returns non-null. Write UTF-8 with trailing newline.

## 2. CLI

- [x] 2.1 In `src/cli/qmd.ts` add `case "l0"`: subcommand `seed` only. Usage error if missing `seed`, or neither dir path nor `--all`, or `--all` plus a dir path. Parse path like `listFiles` (`qmd://` / first segment collection). If `-c` is set, positional is collection-relative. `--all` collection from `-c` or positional collection name only.
- [x] 2.2 Seed: `getActiveFileDocumentPaths` + `collectDirPathsFromFiles`. One path: fail exit 1 if dir not in that set or collection unknown. `--all`: seed every dir in the set. For each dir, `buildExtractiveL0ForDir` + `writeContractL0`. If `getEffectiveL0Source` / `resolveL0SourceForCollection` is `n`, stderr warn once. Print written/skipped; remind `qmd update` then `qmd embed`. Do not run them.
- [x] 2.3 `showHelp()`: one line `qmd l0 seed <path>|--all` under collections/context.

## 3. Tests

- [x] 3.1 `test/dir-node.test.ts`: temp collection root — `writeContractL0` creates `.qmd/l0/docs/ai.md`; second call skipped and content unchanged. Empty file is overwritten. `buildExtractiveL0ForDir` includes basename for a listed file path.
- [x] 3.2 Same file or CLI: dir not in `collectDirPathsFromFiles` is not a seed target (CLI exits 1 — cover via helper assert or spawn). `--all` would write two dirs given two nested file paths (`docs/ai/one.md` + `docs/other/x.md` → `docs/ai` and `docs/other` plus `docs`). Keep the test to written vs skipped, not live `qmd update`.
- [x] 3.3 `test/cli.test.ts` spawn: `qmd l0 seed qmd://seedcol/notes` writes contract; second call skips; unknown dir and `--all`+dir path exit 1. Isolated INDEX_PATH (not user index).

## 4. Docs

- [x] 4.1 CLAUDE.md Commands + dir-nodes bullet: `qmd l0 seed`. `CHANGELOG.md` `[Unreleased]`. README dir-nodes / help mention. Do not change MCP. Do not run `qmd update` / `embed`.

## 5. Verify

- [x] 5.1 `pnpm exec vitest run test/dir-node.test.ts test/dir-node-store.test.ts`
- [x] 5.2 `pnpm run build`
