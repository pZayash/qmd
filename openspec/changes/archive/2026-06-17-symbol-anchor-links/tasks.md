## 1. Schema migration

- [x] 1.1 In [src/store.ts](../../../src/store.ts) schema block (near the existing `link_refs` / `doc_edges` `CREATE TABLE` around lines 900–921) add `CREATE TABLE IF NOT EXISTS doc_anchors (doc_id INTEGER NOT NULL, collection TEXT NOT NULL, slug TEXT NOT NULL, kind TEXT NOT NULL, ord INTEGER NOT NULL, PRIMARY KEY (doc_id, slug, ord))` and `CREATE INDEX IF NOT EXISTS idx_doc_anchors_lookup ON doc_anchors(doc_id, slug)`. Done: fresh DB has the table+index.
- [x] 1.2 Add nullable `anchor TEXT` column to the `doc_edges` `CREATE TABLE`. For existing DBs add an idempotent `ALTER TABLE doc_edges ADD COLUMN anchor TEXT` guarded by a `PRAGMA table_info(doc_edges)` check (column absent). Done: opening an old DB adds the column without error; opening twice is a no-op.

## 2. Anchor extraction + slug

- [x] 2.1 Add `slugifyAnchor(text: string): string` (export from [src/links.ts](../../../src/links.ts)): trim → strip leading `#` and `*`/markdown heading markers → Unicode lowercase (`text.toLocaleLowerCase()`, no ASCII-fold/transliterate) → collapse internal whitespace runs to single `-`. Done: unit test `## При Записи` → `при-записи`, `ПриЗаписи`/`приЗаписи` → same slug.
- [x] 2.2 Add `extractHeadingAnchors(content: string): { slug: string; kind: "heading"; ord: number; offset: number }[]` in [src/links.ts](../../../src/links.ts): regex-match ATX headings `^#{1,6}\s+(.+)$` and the existing `^\*+\s+(.+)$` title form (mirror [src/store.ts:2336](../../../src/store.ts#L2336)); `ord` = source order, `offset` = match byte/char start (for §4 scoping); slug via `slugifyAnchor`. Done: returns ordered anchors with offsets.
- [x] 2.3 Add `insertDocAnchors(db, docId, collection, anchors)` and `deleteDocAnchors(db, docId)` in [src/store.ts](../../../src/store.ts) near `insertLinkRefs` ([src/store.ts:2405](../../../src/store.ts#L2405)); insert wrapped in a transaction. Done: rows written; re-insert replaces prior rows for the doc.

## 3. Wire extraction into index + backfill

- [x] 3.1 In `reindexCollection` ([src/store.ts:1423](../../../src/store.ts#L1423)), at each site that calls `insertLinkRefs(db, hash, extractLinkRefs(content))` (lines ~1492/1497/1507), also rebuild anchors for that doc: `deleteDocAnchors` then `insertDocAnchors` from `extractHeadingAnchors(content)`. Done: after `qmd update`, `doc_anchors` populated for changed docs.
- [x] 3.2 In `backfillLinkRefs` ([src/store.ts:2431](../../../src/store.ts#L2431)) extend the backfill transaction (around line 2457–2472) to also populate `doc_anchors` for docs missing anchors, reading body the same way as link-ref backfill — no re-embed. Done: running backfill on an unchanged-hash doc with no anchors fills them.

## 4. Resolve pass carries + matches anchor

- [x] 4.1 In `resolveDocEdges` ([src/store.ts:2562](../../../src/store.ts#L2562)) change `insertEdge` SQL to include the new `anchor` column. Done: edges written with anchor value (NULL when none).
- [x] 4.2 For each ref with `ref.anchor != null`: after computing `dstDocId`, if `dstDocId` set, look up `slugifyAnchor(ref.anchor)` in `doc_anchors` for `dstDocId` (lowest `ord`). On hit → store the matched slug on the edge. On miss → store the raw-slug and mark anchor-dangling (see 4.3). When `dstDocId` is NULL keep existing doc-level dangling, store raw anchor. Refs with no anchor store NULL. Done: scenarios "Anchor resolves", "Unresolved anchor is anchor-dangling", "Link without anchor unaffected" pass.
- [x] 4.3 Represent anchor-dangling without a new column: an edge is anchor-dangling when `dst_doc_id IS NOT NULL AND anchor IS NOT NULL AND` the slug is absent from `doc_anchors`. Add a SQL helper predicate / view used by reads (§6). (If a stored flag is simpler, add `anchor_resolved INTEGER` instead and set it in 4.2.) Done: predicate selects exactly anchor-dangling edges.

## 5. Source-anchor scoping for out-links

- [x] 5.1 Record each link ref's source anchor: in `extractLinkRefs` (or the call site) map every link's char offset to the nearest preceding heading offset from `extractHeadingAnchors`, and persist a `src_anchor` slug on `link_refs` (add nullable column, migrate per §1.2 pattern) carried onto `doc_edges` (nullable `src_anchor`). Done: a link authored under heading `ПроцA` has `src_anchor = проца` on its edge.
- [x] 5.2 If 5.1 proves heavy, ship out-link scoping after backlinks (backlinks need no source scoping). Mark this task deferred in implementation-notes.md if skipped. Done: decision recorded.

## 6. Read API for anchor edges

- [x] 6.1 Extend `getBacklinks` ([src/store.ts:2628](../../../src/store.ts#L2628)) with an optional `anchorSlug?: string`; when provided, filter edges to `dst_doc_id = ? AND anchor = ?`. Done: returns only "called by" edges for that anchor.
- [x] 6.2 Extend `getOutEdges` ([src/store.ts:2604](../../../src/store.ts#L2604)) with optional `srcAnchorSlug?: string` filtering on `src_anchor` (from §5). Done: returns only edges authored under that heading.
- [x] 6.3 Extend `getDanglingEdges` ([src/store.ts:2652](../../../src/store.ts#L2652)) to also return anchor-dangling edges (predicate from §4.3), tagging each with whether it is doc-level or anchor-level. Done: dangling list includes both kinds, distinguishable.

## 7. CLI surface

- [x] 7.1 In the `links` command handler in [src/cli/qmd.ts](../../../src/cli/qmd.ts) (around lines 2940–2995) parse a `Doc#anchor` target: split on first `#`, resolve the doc part by path/docid as today, slugify the anchor part. Done: `qmd links "Module#ПроцB"` parses doc + anchor.
- [x] 7.2 When an anchor is given, call `getBacklinks(db, docId, slug)` and `getOutEdges(db, docId, slug)`; print "Calls"/"Called by" sections. No-anchor invocation keeps current output. Done: anchor and doc-level invocations both render.
- [x] 7.3 Ensure `--dangling` output includes anchor-dangling edges (from 6.3), labeled distinctly from doc-level dangling. Done: a doc with an unresolved `#anchor` appears under `--dangling`.

## 8. MCP tool

- [x] 8.1 In [src/mcp/server.ts](../../../src/mcp/server.ts) `links` tool (around lines 522–575) accept an optional `anchor` field (or `Doc#anchor` in `doc`); pass the slug into `getBacklinks`/`getOutEdges`. Update the tool description string (line ~529) to mention anchor-granular call-graph queries. Done: an MCP client can request backlinks for `Module#ПроцB`.

## 9. Tests

- [x] 9.1 Add `test/` unit tests for `slugifyAnchor` (Cyrillic, case-insensitivity, whitespace) and `extractHeadingAnchors` (ATX + `*` form, ord, offsets). Done: vitest passes.
- [x] 9.2 Add integration test: index a fixture collection with `[[Module#ПроцB]]`, assert the edge resolves to the anchor, `getBacklinks(docId, slug)` returns the caller, and an unresolved `#anchor` is reported anchor-dangling. Done: `npx vitest run test/` green.
- [x] 9.3 Add backfill test: populate a DB without anchors, run backfill, assert `doc_anchors` filled and anchor edges resolve without re-embed. Done: test green.
