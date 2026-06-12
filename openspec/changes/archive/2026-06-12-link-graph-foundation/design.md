## Context

qmd stores documents content-addressed: `content(hash, doc)`, `documents(collection, path, title, hash, active)`, chunk vectors keyed by `hash_seq`, FTS5 over body. There is no relational layer between documents. `reindexCollection` ([src/store.ts](../../../src/store.ts)) is incremental: a document whose content hash is unchanged is skipped entirely; embedding is a separate `qmd embed` pass with no LLM in the index path.

This change ports ontoindex's "graph for agents" idea, reduced to its markdown-relevant core: the **cross-doc link graph** (`[[wikilinks]]` + relative markdown links). It is the foundation only — graph-aware retrieval, grouping, and heading-graph generation are deferred to later changes.

Terms (link ref, doc edge, dangling, resolve pass, cross-doc vs intra-doc graph) are defined in [CONTEXT.md](../../../CONTEXT.md).

## Goals / Non-Goals

**Goals:**
- Extract and persist the cross-doc link graph during normal reindex, at near-zero added cost for unchanged documents.
- Survive renames/adds/removals without leaving stale resolved edges.
- Expose 1-hop neighbors (out, backlinks, dangling) via store API, CLI, and MCP.
- Additive, backward-safe schema; no auto-reindex.

**Non-Goals:**
- Multi-hop traversal / `--depth`, graph RRF channel, result grouping (later changes).
- Intra-doc heading graph and context/wiki generation (later change).
- Cross-collection edges, reference-style/external links, fuzzy "did you mean" matching.
- Symbol-level code graph (CALLS/EXTENDS) — qmd indexes prose, not ASTs.

## Decisions

### D1 — Two-layer storage: hash-keyed refs + collection-rebuilt edges

`link_refs` is keyed by content `hash` (like vectors): raw tokens depend only on body, so they are cacheable and skipped when hash is unchanged. `doc_edges` is keyed by `(collection, src_doc_id, dst_doc_id)`: resolution depends on the *whole* collection's path/title set, so a rename/add/remove of any document can change a target even when bodies are untouched.

*Alternative rejected:* fully hash-keyed edges (simpler, one table). Rejected — leaves stale/incorrect cross-doc targets after rename, the exact failure ontoindex's `crossFile` phase exists to prevent.

Sketch:
```
link_refs(hash TEXT, seq INTEGER, kind TEXT, raw_target TEXT, anchor TEXT)   -- FK hash → content
doc_edges(id, collection TEXT, src_doc_id INTEGER, dst_doc_id INTEGER NULL,
          kind TEXT, raw_target TEXT)                                         -- dst NULL = dangling
idx_doc_edges_dst ON doc_edges(dst_doc_id)                                    -- backlinks
```

### D2 — Extract in reindex loop, resolve post-loop

Extraction runs per-document inside the `reindexCollection` loop, gated on the same hash-changed branch that already inserts content. No LLM, pure regex → fits the index path (extraction must not wait for `qmd embed`). The resolve pass runs once after the loop, when all active paths/titles for the collection are known — mirroring ontoindex's `scan → parse → crossFile` ordering.

### D3 — Resolution rules and tie-break

- Relative markdown link: resolve target path relative to the source document's collection-relative path; strip anchor.
- Wikilink/embed: match `raw_target` against document title or filename basename. Tie-break: exact name → shortest collection-relative path → dangling. Deterministic, pure path/title map lookup — no levenshtein in the hot path (`findSimilarFiles` reserved for a future diagnostic only).
- Anchors are captured into `link_refs.anchor` for diagnostics but never used for `dst` resolution (doc-level only; section targets need the intra-doc graph, out of scope).

### D4 — Read API and surfaces

Three flat store functions map 1:1 to three views: `getOutEdges` (src=doc), `getBacklinks` (dst=doc, reverse query via `idx_doc_edges_dst`), `getDanglingEdges` (dst NULL, optional collection). CLI `qmd links <doc>` reuses existing `findDocument` / `findDocumentByDocid` for the `<doc>` arg; `--dangling` gives a collection-wide broken-link report (validation harness + a real feature, mirroring `qmd context check`). The MCP `links` tool wraps the same three functions — agent-facing 1-hop access is the primary ontoindex value being imported.

### D5 — Full edge rebuild per reindex

The resolve pass drops and rebuilds all `doc_edges` for the collection each reindex. Incremental edge maintenance is premature at current scale (collections in the hundreds–low-thousands of docs; resolution is an in-memory map lookup). Flagged for measurement, not designed now.

## Risks / Trade-offs

- **Full edge rebuild cost on large collections** → Acceptable at current scale; resolve is O(refs) over an in-memory path/title index. Revisit with incremental rebuild only if measured reindex time regresses.
- **Stale graph on existing databases** → Tables are created empty; `qmd links` reports no edges until the user runs `qmd update`. No auto-reindex (project rule). Documented in proposal/specs.
- **Wikilink ambiguity** → Deterministic tie-break (exact → shortest path → dangling) instead of nondeterministic first-match; ambiguous-but-resolved edges are reproducible.
- **Regex extraction false positives** (e.g. `[[...]]` inside code fences) → Reuse existing code-fence detection (`findCodeFences` / `isInsideCodeFence` in store.ts) to skip fenced regions during extraction.

## Migration Plan

Additive only. `initializeDatabase` adds the two tables and index with `IF NOT EXISTS`. No data migration; the graph populates on the next `qmd update` / `reindexCollection`. Rollback = drop `link_refs` / `doc_edges`; no other table depends on them.
