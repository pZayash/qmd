## 1. Schema

- [x] 1.1 In `initializeDatabase` ([src/store.ts](../../../src/store.ts)), add `CREATE TABLE IF NOT EXISTS link_refs (hash TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL, raw_target TEXT NOT NULL, anchor TEXT, PRIMARY KEY (hash, seq), FOREIGN KEY (hash) REFERENCES content(hash) ON DELETE CASCADE)` near the existing `content_vectors` table.
- [x] 1.2 Add `CREATE TABLE IF NOT EXISTS doc_edges (id INTEGER PRIMARY KEY AUTOINCREMENT, collection TEXT NOT NULL, src_doc_id INTEGER NOT NULL, dst_doc_id INTEGER, kind TEXT NOT NULL, raw_target TEXT NOT NULL, FOREIGN KEY (src_doc_id) REFERENCES documents(id) ON DELETE CASCADE)`.
- [x] 1.3 Add `CREATE INDEX IF NOT EXISTS idx_doc_edges_dst ON doc_edges(dst_doc_id)` and `CREATE INDEX IF NOT EXISTS idx_doc_edges_src ON doc_edges(src_doc_id, collection)`.

## 2. Extractor module

- [x] 2.1 Create `src/links.ts` exporting `type LinkRef = { kind: "wikilink" | "mdlink"; rawTarget: string; anchor: string | null }` and `extractLinkRefs(body: string): LinkRef[]`.
- [x] 2.2 In `extractLinkRefs`, reuse `findCodeFences` / `isInsideCodeFence` from [src/store.ts](../../../src/store.ts) to skip matches inside fenced code regions.
- [x] 2.3 Match wikilinks and embeds with one regex `!?\[\[([^\]]+)\]\]`: split target on `|` (keep left = target, drop alias), then split target on `#` (left = rawTarget, right = anchor). Emit kind `wikilink` for both `[[...]]` and `![[...]]`.
- [x] 2.4 Match inline markdown links `\[[^\]]*\]\(([^)]+)\)`: skip targets matching `^https?://` or starting with `#`; for the rest split on `#` (left = rawTarget path, right = anchor); emit kind `mdlink`. Only keep targets that look like relative paths (contain no scheme).
- [x] 2.5 Add unit tests `test/links.test.ts` covering each scenario in the spec's "Link ref extraction" requirement (wikilink, alias+anchor, mdlink with anchor, embed, external/anchor-only ignored, fenced code ignored).

## 3. Persist refs during reindex

- [x] 3.1 Add `insertLinkRefs(db, hash, refs: LinkRef[])` and `deleteLinkRefsForHash(db, hash)` to [src/store.ts](../../../src/store.ts); insert clears prior rows for the hash then inserts seq-numbered refs.
- [x] 3.2 In `reindexCollection` ([src/store.ts:1395](../../../src/store.ts#L1395)), inside the branch that runs when a document is new or its hash changed (the `insertContent` calls), call `extractLinkRefs(content)` then `insertLinkRefs(db, hash, refs)`. Do NOT extract on the unchanged-hash path.

## 4. Resolve pass

- [x] 4.1 Add `resolveDocEdges(db, collectionName)` to [src/store.ts](../../../src/store.ts): delete all `doc_edges` for the collection, then rebuild from active documents' link refs.
- [x] 4.2 Build an in-memory resolver index from active docs of the collection: map basename→[docId] and lowercased title→[docId], plus a path→docId map for relative-link resolution. Load each active doc's hash to fetch its `link_refs`.
- [x] 4.3 For `mdlink` refs: resolve `rawTarget` as a path relative to the source doc's collection-relative directory, normalize separators (reuse `normalizePathSeparators` / `handelize`), look up in path→docId map.
- [x] 4.4 For `wikilink` refs: look up `rawTarget` by exact title or basename; on multiple matches pick the shortest collection-relative path; if none, leave unresolved.
- [x] 4.5 Insert one `doc_edges` row per ref with `src_doc_id`, resolved `dst_doc_id` (or NULL = dangling), `kind`, and original `raw_target`.
- [x] 4.6 Call `resolveDocEdges(db, collectionName)` once at the end of `reindexCollection`, after the deactivate-vanished-docs loop and before/with `cleanupOrphanedContent`.
- [x] 4.7 Add tests `test/link-resolve.test.ts` covering resolve scenarios (wikilink resolves, ambiguous shortest-path, mdlink resolves, dangling on missing target, edge rebuilt-dangling after rename).

## 5. Read API

- [x] 5.1 Add `getOutEdges(db, docId): DocEdge[]` to [src/store.ts](../../../src/store.ts) — select `doc_edges` where `src_doc_id = docId`, join `documents` for dst path/title (null when dangling). Define `type DocEdge = { kind: string; rawTarget: string; dstDocId: number | null; dstPath: string | null; dstTitle: string | null }`.
- [x] 5.2 Add `getBacklinks(db, docId)` — select where `dst_doc_id = docId`, join `documents` for src path/title.
- [x] 5.3 Add `getDanglingEdges(db, collection?)` — select where `dst_doc_id IS NULL`, optional collection filter; join `documents` for src path.
- [x] 5.4 Add tests `test/link-read.test.ts` for out-edges-include-dangling, backlinks-from-two-docs, dangling-scoped-to-collection.

## 6. CLI command

- [x] 6.1 In [src/cli/qmd.ts](../../../src/cli/qmd.ts), add `case "links":` to the main `switch (cli.command)`. Resolve `cli.args[0]` to a document via `findDocumentByDocid` (if `isDocid`) else `findDocument`; error with usage if missing and `--dangling` not set.
- [x] 6.2 Implement default view: print out-links, backlinks, and dangling for the resolved doc using `getOutEdges` / `getBacklinks` / `getDanglingEdges`. Use clickable relative paths in human output.
- [x] 6.3 Implement `--dangling`: when set, call `getDanglingEdges(db, cli.opts.collection)` and list collection-wide broken links; ignore the `<doc>` arg.
- [x] 6.4 Wire `-c/--collection` and `--json` options (reuse existing CLI option parsing); `--json` emits edges as JSON, else human-readable grouped output.
- [x] 6.5 Add `links` to CLI help text / usage listing alongside other commands.
- [x] 6.6 Add tests `test/cli-links.test.ts`: links for a doc, docid arg, collection-wide dangling, JSON output, and links-before-reindex returns empty (no crash).

## 7. MCP tool

- [x] 7.1 In [src/mcp/server.ts](../../../src/mcp/server.ts), add a `server.registerTool("links", ...)` entry following the existing tool registration pattern; input schema: `{ doc?: string, collection?: string, view?: "out" | "backlinks" | "dangling" | "all" }`.
- [x] 7.2 In the handler, resolve `doc` (path or docid) and call the matching read fn(s); for `view: "dangling"` (or missing doc) return `getDanglingEdges(db, collection)`. Return structured JSON content.
- [x] 7.3 Add a test exercising the MCP `links` tool returning backlinks for a document.

## 8. Docs

- [x] 8.1 Add the `qmd links` command (with `--dangling` / `-c` / `--json`) to the Commands section of [CLAUDE.md](../../../CLAUDE.md) and any user-facing README/help.
- [x] 8.2 Document that the link graph is empty on existing databases until the next `qmd update` (no backfill, no auto-run).

## 9. Verify

- [x] 9.1 Run `npx vitest run --reporter=verbose test/links.test.ts test/link-resolve.test.ts test/link-read.test.ts test/cli-links.test.ts` and confirm all pass.
- [x] 9.2 Run the full suite `npx vitest run test/` to confirm no regressions in existing reindex/search tests.
