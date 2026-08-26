## Context

MCP `query` already: `normalizePathPrefixes(path)` + `kind` → `store.search`. REST `POST /query` maps `searches`/`collections`/`limit`/`minScore`/`intent` only. Formatted hits: `docid`, `file`, `title`, `score`, `context`, `snippet` — no `kind`. Explore locked: filters + `kind` on hits. Not `candidateLimit`.

## Goals / Non-Goals

**Goals:**

- `path` array + `kind` on REST body; same SQL as MCP.
- Hits include `kind`. Dirs: `file` ends with `/`.
- Invalid kind → 400 JSON `{ error: ... }`.
- `/search` alias identical.

**Non-Goals:**

- `candidateLimit`.
- New drill tool.
- Changing MCP tool (already done).
- Auto-slash on path prefixes.

## Decisions

### D1: Reuse `normalizePathPrefixes`

Same helper as MCP. Omit/empty/`[]` → no path filter. Non-array `path` → 400.

### D2: `kind` via `parseDocumentKind`

String `file`|`dir` (trim, case-insensitive, existing helper). Missing → mix. Invalid → 400, do not search.

### D3: Hit shape

Always set `kind`. Dir: `file` = `displayPath + "/"`. Match MCP tool JSON, not the CLI omit-kind-on-file quirk.

### D4: `rerank` passthrough only

`store.search` already defaults rerank on. If body has boolean `rerank`, pass it (HTTP tests must send `false` or they load the LLM). Do not document as a new REST feature beyond what the handler already implied. No `candidateLimit`.

## Risks / Trade-offs

- [Dir `file` + `/`] clients that treated `file` as a get path must strip `/` → same as MCP.
- [Default rerank] unchanged; path/kind tests use `rerank: false`.

## Migration Plan

Ship code. Restart MCP HTTP daemon to pick up handler. No index rebuild.

## Open Questions

None.
