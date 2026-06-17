## Why

The cross-doc graph resolves links at **document** granularity only: a link's
`#anchor` is extracted and stored on `link_refs` but **dropped** by the resolve
pass. Upstream emitters (e.g. a 1C call-graph→md tool) need to express
*symbol-level* relations — "procedure A calls procedure B" — as ordinary links
`[[Module#ПроцB]]`. Without anchor resolution those collapse to a single
module-level edge, losing the call-graph signal that makes "who calls B"
answerable. Resolving anchors against in-document headings closes this gap with
a universal, domain-agnostic primitive.

## What Changes

- Build a persisted **doc anchors** index (`doc → {slug, kind, ord}`) at index
  time. **v1 source = markdown headings only** (regex, no AST). AST code-symbol
  anchors are an explicit follow-up (the `extractSymbols` stub stays stubbed).
- Define an **anchor slug** normalization: case-insensitive, unicode preserved
  (Cyrillic), spaces → dashes. Headings and link `#anchor`s reduce to the same
  slug for matching.
- Extend the resolve pass to carry the link's `anchor` onto `doc_edges` and
  match it against the destination document's anchors.
- Add an **anchor-dangling** edge state: `dst_doc_id` resolved but the
  `#anchor` matched no slug in that document (distinct from doc-level dangling).
- Extend `qmd links` to accept a `Doc#anchor` target and return symbol/section
  granular out-links and backlinks (the call-graph "calls" / "called by" view).
- Backfill: anchors are derivable from already-indexed content, so the existing
  `qmd links --backfill` / unchanged-doc disk pass populates anchors without a
  full re-index.

Non-goals (separate changes, do NOT implement here): AST code-symbol anchors,
encoding detection for non-UTF-8 ingest, PageRank/centrality over the graph.

## Capabilities

### New Capabilities
- `symbol-anchor-links`: the doc-anchor index, anchor-slug normalization,
  anchor-aware edge resolution, the anchor-dangling state, and the
  `qmd links Doc#anchor` query surface.

### Modified Capabilities
- `link-graph`: the resolve pass now carries `anchor` onto `doc_edges` and the
  dangling taxonomy gains the anchor-dangling case; doc-level resolution and
  existing edges are unchanged when a link has no `#anchor`.

## Impact

- Code: `src/links.ts` (anchor already parsed — no change expected),
  `src/store.ts` (`doc_anchors` table + schema migration, anchor extraction in
  the index/backfill pass, `resolveDocEdges` carries+matches anchor,
  `doc_edges.anchor` column, backlink/out-link queries), `src/cli/qmd.ts`
  (`qmd links` target parsing + output), `src/mcp/server.ts` (links tool).
- Specs: new `symbol-anchor-links`, delta on `link-graph`.
- Data: additive schema (new table + nullable column); no destructive migration.
- Consumers: enables the external 1C call-graph emitter (loose-coupling
  contract) to express proc-level edges; no qmd domain awareness added.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/symbol-anchor-links/spec.md](specs/symbol-anchor-links/spec.md)
- [specs/link-graph/spec.md](specs/link-graph/spec.md)
