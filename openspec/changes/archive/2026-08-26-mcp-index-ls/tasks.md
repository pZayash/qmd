## 1. Store helper

- [x] 1.1 In `src/dir-node.ts` export `MAX_LS_CHILDREN = 200` and `listIndexedChildren(filePaths: string[], dirRelPath: string): { childDirs: string[]; childFiles: { path: string; basename: string }[]; truncated: boolean; omitted: number }`. Reuse `getDirectChildren`. After sort, if `childDirs.length + childFiles.length > 200`, keep 200 names (dirs first, then files) and set `truncated`/`omitted`.

## 2. MCP tool ls

- [x] 2.1 In `src/mcp/server.ts` register tool `ls`. Input: optional `path: z.string()`. Description: one-level indexed browse; not search; not drill. Omit/empty → `store.listCollections()` (name + `active_count`). Parse `qmd://` via `parseVirtualPath` (import from store or index). Else split on `/`: first segment collection, rest posix prefix.
- [x] 2.2 Unknown collection → throw/error like other tools. Known: `getActiveFileDocumentPaths` / `store.internal.getActiveFileDocumentPaths` if exposed; else add a one-liner on `QMDStore` that calls existing `getActiveFileDocumentPaths`. Pass prefix to `listIndexedChildren`. Return structured JSON: collections `{ name, docs }` or entries `{ name, path, kind: "file"|"dir" }` plus `truncated`/`omitted`. Dir `path` is `prefix/name` without trailing slash (get-compatible).
- [x] 2.3 `buildInstructions`: mention `ls` as one-level browse. Query tool description: remove “no ls command”; say drill is get+path+kind; `ls` is browse.

## 3. Tests

- [x] 3.1 `test/mcp.test.ts` (or unit on `listIndexedChildren` in `test/dir-node.test.ts`): two files `docs/ai/one.md` + `docs/ai/sub/two.md` → children file `one.md` + dir `sub`, not `two.md`. More than 200 fake names → truncated and omitted > 0.
- [x] 3.2 HTTP or in-process MCP: `ls` without path returns collection `docs` from the existing fixture; `ls` path unknown collection errors.

## 4. Docs

- [x] 4.1 `skills/qmd/SKILL.md` Other MCP Tools table: `ls`. Drill section stays get+query; one line that `ls` is not drill. Sync `src/embedded-skills.ts` base64 (LF).
- [x] 4.2 CLAUDE.md + `CHANGELOG.md` `[Unreleased]`. Restart daemon note. Do not change CLI `qmd ls` behavior.

## 5. Verify

- [x] 5.1 `pnpm exec vitest run test/dir-node.test.ts test/mcp.test.ts` — pass.
- [x] 5.2 `pnpm run build`. Do not run `qmd update` / `embed`.
