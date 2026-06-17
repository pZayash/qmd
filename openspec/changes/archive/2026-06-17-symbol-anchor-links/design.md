## Context

The cross-doc graph (`link-graph` capability) resolves links at document
granularity. Extraction already parses a link's `#anchor`
([src/links.ts](../../../src/links.ts)) and persists it on `link_refs.anchor`,
but `resolveDocEdges` in [src/store.ts](../../../src/store.ts) ignores it:
`doc_edges` has no anchor column and resolution maps a raw target to a single
`dst_doc_id` via path/title/basename indexes.

This change adds the missing in-document resolution layer so that
`[[Module#ПроцB]]` resolves to a specific symbol/heading inside `Module`. The
driving consumer is an external, loosely-coupled 1C call-graph→md emitter that
expresses "proc A calls proc B" as anchor links; qmd stays domain-agnostic. The
design term set is fixed in [CONTEXT.md](../../../CONTEXT.md): **doc anchors**,
**symbol anchor**, **anchor slug**, **anchor-dangling**.

## Goals / Non-Goals

**Goals:**

- Resolve link `#anchor`s against the destination document's headings.
- Make proc-level "calls" / "called by" queryable via `qmd links Doc#anchor`
  without introducing symbols as first-class graph nodes.
- Surface a distinct anchor-dangling diagnostic (the grounding signal).
- Backfill anchors from already-indexed content (no forced re-index/re-embed).
- Keep doc-level behavior byte-identical for links without an `#anchor`.

**Non-Goals:**

- AST code-symbol anchors (the `extractSymbols` stub stays empty) — follow-up.
- Encoding detection for non-UTF-8 ingest — separate change.
- PageRank/centrality over the graph — separate change.
- Symbols as first-class graph nodes / a separate symbol-edge table.

## Decisions

### D1: Doc remains the graph node; anchor is an edge attribute

`doc_edges` gains a nullable `anchor` column (the matched **anchor slug**, or
the raw anchor when unresolved). Proc-level "called by" is the query
`SELECT … FROM doc_edges WHERE dst_doc_id = ? AND anchor = ?` — symbol-granular
without a symbol-node table.

- Alternative (rejected): symbols as first-class nodes with their own
  edge table. Heavier schema, duplicates the chunking layer, and the borrowing
  goal (`called_by`, `verify_call`) is fully served by an edge attribute.

### D2: New `doc_anchors` table as the resolution target index

Schema (additive):

```sql
CREATE TABLE IF NOT EXISTS doc_anchors (
  doc_id     INTEGER NOT NULL,
  collection TEXT    NOT NULL,
  slug       TEXT    NOT NULL,   -- normalized anchor slug
  kind       TEXT    NOT NULL,   -- 'heading' in v1
  ord        INTEGER NOT NULL,   -- source order (disambiguates duplicates)
  PRIMARY KEY (doc_id, slug, ord)
);
CREATE INDEX IF NOT EXISTS idx_doc_anchors_lookup ON doc_anchors(doc_id, slug);
```

Rebuilt per document when its content hash changes (same trigger as link refs),
and rebuilt for unchanged docs on the backfill/disk pass.

- Alternative (rejected): resolve anchors on the fly from document body at query
  time. Cheaper schema but O(body scan) per resolve and no dangling diagnostics
  at index time.

### D3: v1 anchor source = markdown headings only

Extract headings via regex (ATX `#`..`######` and the existing `*`-title form
already matched in `store.ts`). `kind = 'heading'`. The `extractSymbols` AST
stub is **not** wired in — code-symbol anchors are a named follow-up. This
matches the upstream(S) contract: emitters render procedures as md headings.

### D4: Anchor slug normalization

A single `slugifyAnchor(text)` used for BOTH heading text and link `#anchor`
text, so they match. Rule: trim → strip leading `#`/markdown markers →
lowercase (Unicode-aware, preserves Cyrillic) → collapse internal whitespace to
single `-`. No transliteration, no ASCII-folding. Duplicate slugs in one doc are
kept distinct by `ord`; resolution picks the first (lowest `ord`).

### D5: Resolve pass extension

`resolveDocEdges` after computing `dst_doc_id`:

- link has no anchor → behavior unchanged; `doc_edges.anchor = NULL`.
- anchor present, `dst_doc_id` NULL → existing doc-level dangling (anchor stored
  raw for diagnostics).
- anchor present, `dst_doc_id` set, slug found in `doc_anchors` → resolved;
  store the matched slug.
- anchor present, `dst_doc_id` set, slug NOT found → **anchor-dangling**; store
  raw anchor, mark unresolved.

### D6: `qmd links` surface

Target parsing accepts `Doc#anchor`. With an anchor:

- out-links: edges from that symbol (links authored under that heading's span —
  scoped by source anchor; see D7).
- backlinks: edges where `(dst_doc_id, anchor slug)` matches — the "called by".
- `--dangling` includes anchor-dangling edges.

Doc-level invocation (no `#`) is unchanged.

### D7: Source-side anchor scoping (out-links)

To answer "what does proc A call", an out-link must know it originated *within*
A's heading span. Record the source anchor on `link_refs`/`doc_edges` by mapping
each link's byte offset to the nearest preceding heading at extraction time.
This reuses the same heading list built for `doc_anchors`, so no extra parse.

## Risks / Trade-offs

- [Duplicate heading text in one doc] → `ord` keeps rows distinct; resolution is
  first-match. 1C modules have one procedure per name, so collisions are rare;
  documented as first-wins.
- [Slug collisions across normalization (e.g. `Проц B` vs `проц-b`)] → exact,
  documented rule; emitters control heading text. Acceptable for v1.
- [Source-anchor scoping (D7) adds offset→heading mapping] → bounded by the
  already-parsed heading list; if it proves costly, out-link scoping can ship
  after backlinks (backlinks are the higher-value "called by" query).
- [Backfill correctness] → anchors derive purely from indexed body, identical to
  link-ref backfill; covered by the existing unchanged-doc disk pass.
- [Schema migration] → purely additive (new table, nullable column); old indexes
  keep working, rollback = ignore the new table.
