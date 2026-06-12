## Why

qmd search is flat: chunks + vectors, no relations between documents. Markdown
collections (Obsidian vaults, doc trees) carry an explicit `[[wikilink]]` /
`[md link](./x.md)` graph that is currently discarded at index time. Capturing
it unlocks backlinks, neighbor expansion, and broken-link detection — and lays
the foundation for graph-aware retrieval (ported from ontoindex's
graph-for-agents model). This change builds only the foundation: extract,
resolve, store, and expose the cross-doc link graph.

## What Changes

- Extract link refs (wikilinks, relative markdown links) from every document
  body during reindex; store content-addressed (keyed by content `hash`,
  cacheable across reindex like vectors).
- Resolve refs → directed doc edges in a post-loop pass over the collection's
  active paths/titles. Unresolved target = **dangling** edge (`dst_doc_id NULL`).
- New tables `link_refs` and `doc_edges` (added `IF NOT EXISTS`; empty until next
  `qmd update`; no backfill migration).
- Read API: `getOutEdges`, `getBacklinks`, `getDanglingEdges`.
- CLI verb `qmd links <doc>` (out-links + backlinks + dangling for a doc), with
  `--dangling` (collection-wide broken links), `-c/--collection`, `--json`.
- MCP `links` tool wrapping the three read functions (agent-facing 1-hop access).
- Link kinds v1: wikilink `[[Note]]`/`[[Note#h]]`/`[[Note|alias]]`, relative md
  link `[t](./x.md)`/`[t](x.md#h)`, embed `![[Note]]` aliased to wikilink.
  External URLs, reference-style links, and bare anchors are skipped.
- Resolution domain: within-collection only. Anchors captured for diagnostics
  but `dst` resolves at doc level. Tie-break: exact name → shortest path →
  dangling.

Out of scope (later changes): graph channel in RRF, result grouping, intra-doc
heading graph + context/wiki generation, multi-hop / `--depth`, cross-collection
edges, reference-style/external edges, fuzzy "did you mean".

## Capabilities

### New Capabilities
- `link-graph`: extraction, resolution, storage, and read/CLI/MCP exposure of the
  cross-doc link graph (link refs → doc edges, backlinks, dangling).

### Modified Capabilities
<!-- none — no existing spec requirements change -->

## Impact

- **Code**: [src/store.ts](../../../src/store.ts) — new tables in
  `initializeDatabase`, extraction in `reindexCollection` loop, resolve pass
  post-loop, three read fns. New extractor module (e.g. `src/links.ts`).
  [src/cli/qmd.ts](../../../src/cli/qmd.ts) — `links` verb. [src/mcp/server.ts](../../../src/mcp/server.ts) — `links` tool.
- **Schema**: additive only (`link_refs`, `doc_edges`, `idx_doc_edges_dst`).
  Existing DBs safe; graph empty until `qmd update` re-runs.
- **Performance**: extraction is regex over bodies, gated on hash change (near-zero
  on unchanged docs). Resolve pass = full edge rebuild per reindex over an
  in-memory path/title map (acceptable at current collection scale).
- **Dependencies**: none new.

## Artifacts

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/link-graph/spec.md](specs/link-graph/spec.md)
