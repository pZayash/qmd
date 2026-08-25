## Context

Dir-nodes (`documents.kind = file|dir`) already appear in hits. Filters today: `-c`, `--path` (SQL), `QMD_DIR_NODES=0` (post-filter hide dirs). No per-request kind constraint. Explore agreed: hard **kind filter**, not RRF weight.

КПСР: tens of thousands of dir-nodes. Filtering after RRF would fill the candidate pool with the wrong kind.

## Goals / Non-Goals

**Goals:**

- `--kind file|dir` on CLI `search`, `vsearch`, `query`.
- MCP `query` `kind` optional enum.
- Apply in FTS `documents` filter and vec document JOIN before fusion.
- Kill switch `QMD_DIR_NODES=0` remains strongest (hides dirs even if kind=dir).

**Non-Goals:**

- Ranking boost for dirs vs files.
- Repeatable `--kind` / comma lists.
- Filtering `get`, `ls`, `links`.

## Decisions

### D1: Hard filter, one value

`kind?: "file" | "dir"` on store search options. Absent = both. Invalid CLI/MCP input is an error (exit 1 / tool error), not coerce-to-omit.

### D2: Filter where `--path` already lives

`searchFTS`: add `AND d_filter.kind = ?` (and the main join) when kind is set. `searchVec`: `AND d.kind = ?` on the document lookup SQL. Thread through `hybridQuery` / `structuredSearch` / `vectorSearchQuery` so RRF never sees the other kind.

`QMD_DIR_NODES=0` stays as today (omit dir hits). Combined with `kind=dir` → empty list.

### D3: Same surfaces as path filter (retrieval only)

CLI OutputOptions + parseArgs `--kind`. MCP query schema only (the only search tool). SDK query options if they wrap hybridQuery.

## Risks / Trade-offs

- Vec ANN still scans mixed embeddings; kind filter is on the JOIN, so some ANN slots may be wasted (same as `--path`). Acceptable; no separate vec index per kind.
- Kill switch + `--kind dir` looks like a bug to agents. Mitigate: one-line stderr when env hides dirs and kind=dir.

## Migration Plan

Ship code. No index rebuild. Users pass `--kind` when they want it.

## Open Questions

None. Explore closed: filter vs weight, env wins, surfaces, single enum.
