## Why

`D:\qmd\index.sqlite` on SRVKPSR42 is 22.93 GB, but only 0.13% of its vector
rows belong to the live collection. Read-only probe, 2026-09-14
(`better-sqlite3` `readonly: true` + `dbstat`, `INDEX_PATH=D:\qmd\index.sqlite`,
`QMD_CONFIG_DIR=D:\qmd`):

| Slice | Rows |
| --- | --- |
| `content_vectors` total | 812 802 |
| live `кпср_unf2020.dev.git` (426 hashes) | 1 025 |
| legacy `rt.dev.git` (`active = 1`, 23 799 hashes) | 112 608 |
| no active document (orphan) | 699 274 |

`dbstat` attributes 13.368 GB to `vectors_vec_vector_chunks00`, 3.814 GB to
`vectors_rescore`, ~0.105 GB to `vectors_bit_vector_chunks00`, and 3.87 GB to
the page freelist. `store_collections` and `index.yml` list only
`кпср_unf2020.dev.git`; `documents` still holds 24 338 `active = 1` rows for
`rt.dev.git`, the previous name/scope of the same corpus.

Two problems:

1. **Disk** — ~99.8% of vector storage is unreachable from the live collection.
2. **Query cost and quality** — `searchVec` (`src/store.ts:4719-4774`) runs the
   KNN against the whole `vectors_vec` / `vectors_bit` table and applies
   `collection` / `active` / `kind` only as a post-filter in step 2. Legacy and
   orphan vectors consume the candidate window (`vecK = limit × 3`), so they can
   crowd out live hits and shrink the effective `k`.

Existing tooling does not fix it. `cleanupOrphanedVectors`
(`src/store.ts:2936`) deletes only hashes with **no** active document, and
legacy `rt.dev.git` documents are `active = 1`. `qmd collection remove
rt.dev.git` cannot see the collection because it is absent from
`store_collections`.

## What Changes

- Add `qmd collection purge <name>`: delete, in one transaction, the named
  collection's vector rows (`vectors_vec` / `vectors_bit` / `vectors_rescore`),
  `content_vectors`, `content`, FTS and `documents` rows — whether or not the
  name is registered in `store_collections`.
- Extend `qmd cleanup` to print the database size before and after `VACUUM` so
  the reclaimed bytes are visible.
- Host runbook: stop `qmd-mcp`, back up the SQLite file, purge `rt.dev.git`,
  run cleanup + VACUUM, restart the service, verify `GET /health` and
  `qmd status`.

Out of scope (rationale in design D4): changing `searchVec` to pre-filter the
`vec0` KNN by collection. `vec0` KNN cannot be joined with `documents` in one
statement and exposes no metadata filter; a true pre-filter needs per-collection
vector tables or a partition key plus a re-embed. With the legacy vectors gone
the existing post-filter behaves. Recorded as a follow-up.

## Capabilities

### New Capabilities

- `index-reclaim`: purge an unregistered collection's documents and vectors and
  reclaim SQLite space.

### Modified Capabilities

- (none)

## Impact

- Code: `src/store.ts` (`purgeCollection`), `src/cli/qmd.ts` (`collection purge`
  subcommand, `cleanup` size reporting), `src/index.ts` (export).
- Tests: `test/store.test.ts` case with two collections, one unregistered.
- Data (host, explicit operator approval): `D:\qmd\index.sqlite` — expected to
  shrink from 22.93 GB to well under 2 GB.
- Risk: destructive; only run with `qmd-mcp` stopped and a pre-purge copy in
  place.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/index-reclaim/spec.md](specs/index-reclaim/spec.md)
