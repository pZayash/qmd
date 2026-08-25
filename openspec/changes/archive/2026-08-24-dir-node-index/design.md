## Context

Today `reindexCollection` / `reindexFiles` only index glob-matched files into `documents` (`UNIQUE(collection, path)`). Search (`hybridQuery`, FTS, vec) returns files. Path context is a YAML/DB string map, shown on hits, not embedded.

КПСР (primary consumer) uses mask `**/*.{md,bsl}`. 1C objects live as `conf/Documents/<Name>/` plus sibling `<Name>.xml` (not in the mask). Business-info prose already exists outside `conf/`; L0 contracts will use shadow tree `.qmd/l0/`.

Constraints: do not auto-run `qmd update` / `embed`. Do not treat xml as a searchable document. Do not write into `conf/`.

## Goals / Non-Goals

**Goals:**

- Persist a dir-node per directory that has at least one active indexed file.
- Fill L0 extractively; optionally override from `.qmd/l0/<relpath>.md` when `l0_source` is `p`.
- Peek 1C sibling xml Name/Synonym into extractive L0.
- Embed L0 via existing pending-embed path; hybrid query can return directory hits (`kind: dir`).
- Rebuild ancestor dir-nodes on `--files` updates.

**Non-Goals:**

- MCP L0/L1 progressive load, hierarchical drill, `ls`/`tree`/`grep` on `qmd://`.
- Implementing `l0_source: q` (API chat generate). Config MAY accept the value and MUST fall back to extractive (and `p` contract if present) with a one-line stderr notice.
- Indexing `.xml` as documents.
- Changing path-context semantics (still display/override, not the embed target).

## Decisions

### D1: Dir-nodes are `documents` rows with `kind='dir'`

Add `kind TEXT NOT NULL DEFAULT 'file'` to `documents`. Dir-node `path` is the collection-relative directory path **without** trailing slash (e.g. `conf/Documents/ЗаказПокупателя`). File paths keep extensions (`…/ObjectModule.bsl`), so they do not collide with the folder path. Sibling xml is `conf/Documents/ЗаказПокупателя.xml` — different path.

L0 text goes through existing `content` + hash; chunking: **one chunk** (L0 is ≤ ~500 chars). Vectors use the same `content_vectors` / vec tables.

- **Why:** FTS, embed, RRF, MCP query already key off documents. No second retrieval stack.
- **Rejected:** Separate `dir_nodes` table — duplicates FTS/vec wiring.
- **Rejected:** Trailing-slash paths — `handelize` would normalize them inconsistently.

### D2: Extractive L0 in `src/dir-node.ts`

Pure functions, no DB:

- `extractiveL0({ dirRelPath, childDirs, childFiles, pathContext, xmlPeek })` → string.
- Direct children only; cap 32 names; append `+N more`; target ~256–500 chars.
- Child files: basename + first markdown `#` heading if the file is `.md` and readable.
- Xml peek: if `{parent}/{basename}.xml` exists, parse `Name` and first `v8:lang=ru` `Synonym` / `v8:content`. Fail soft (skip peek) on parse error.
- No invented sentences.

Contract: `{collectionRoot}/.qmd/l0/{dirRelPath}.md`. Dot dirs are not glob-indexed (`dot: false`). Reader is explicit.

### D3: Config `l0_source` on collection, default `n`

Extend `Collection` in `src/collections.ts`: `l0Source?: "n" | "p" | "q"`. Persist in YAML. Optional global default under `models.l0Source`. Collection overrides global. Invalid value → `n` + stderr warning.

`q`: unimplemented generate; if contract exists and mode is `p` or `q`, use contract; else extractive.

### D4: Rebuild dirs after file index, from the file tree

After the file loop in `reindexCollection`:

1. Collect unique ancestor directories of every **active** file path in the collection (not only this run).
2. For each dir, compute L0, upsert dir-node (hash change → new content, pending embed).
3. Deactivate `kind=dir` rows whose path is no longer in that set.

`reindexFiles`: after indexing/deactivating listed files, recompute ancestor dirs of those files (and dirs that lost their last file). Do not deactivate unrelated dir-nodes.

Skip `resolveDocEdges` / link-graph for `kind=dir` (no wikilinks in L0).

### D5: Hits expose `kind`

`SearchResult` / CLI formatter / MCP query item: `kind: "file" | "dir"`. Dir hit `path` is the directory path; snippet is L0 (or first chunk). `get` on a dir path returns L0 body.

Default query mixes file and dir hits in the same RRF list. No new CLI flag in v1 (can add `--kind` later).

## Risks / Trade-offs

- **КПСР dir count ≈ number of metadata objects** → extra embed cost. Mitigation: L0 is tiny; user still runs `embed` explicitly. Document that first enablement is a full update+embed.
- **Xml peek reads files outside the mask** → still not indexed as docs. Mitigation: read-only first 64KB prefix (Name/Synonym live in the metadata header). Do not skip files larger than 64KB — КПСР object xml is typically hundreds of KB.
- **`q` silently extractive** → users may think API generate ran. Mitigation: stderr when `l0_source=q`.
- **Dir hit crowding file hits** → possible on broad queries. Mitigation: accept in v1; tune later (kind filter / RRF weight). Do not hide dirs by default or the feature is invisible.
- **Stale L0 if only xml synonym changes** → xml is not in `--files` glob. Mitigation: full `qmd update` rebuilds all dir-nodes; document it. Optional later: watch xml.

## Migration Plan

1. Ship code; schema migration adds `kind` default `'file'` (existing rows unchanged).
2. User runs `qmd update` then `qmd embed` on collections that should get dir-nodes.
3. Rollback: deactivate `kind='dir'` rows or ignore them in query if a kill-switch is needed — prefer query skip `kind=dir` via env `QMD_DIR_NODES=0` for emergency off without schema drop.

## Open Questions

None blocking implementation. `--kind` filter and MCP layers are follow-up changes.
