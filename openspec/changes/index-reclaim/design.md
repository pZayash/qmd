## Context

See [proposal.md](proposal.md). Probe method: read-only `better-sqlite3` open of
`D:\qmd\index.sqlite`, `dbstat` per-table sums, and hash joins against
`documents.active`. `vectors_vec`, `vectors_bit` and `vectors_rescore` each hold
812 802 rows; the live collection owns 1 025 of them.

`documents.collection` is a plain string; `store_collections` is the registry.
Renaming the corpus (`rt.dev.git` → `кпср_unf2020.dev.git`) left the old rows
behind as `active = 1` documents that the current
`cleanupOrphanedVectors` definition does not consider orphaned.

## Goals / Non-Goals

**Goals:**

- Remove every row that belongs to a named unregistered collection.
- Reclaim disk with `VACUUM` and report before/after numbers.
- Keep the operation explicit, confirmable and transactional.

**Non-Goals:**

- Rewriting `searchVec` to pre-filter the `vec0` KNN by collection.
- Changing `cleanupOrphanedVectors` semantics for collections that are
  registered.
- MCP query backpressure / session TTL / HTTP auth (separate change).

## Decisions

### D1: Explicit `qmd collection purge <name>`, not auto-clean

Auto-deleting documents whose collection is not in `store_collections` would
also delete a collection that is only temporarily unregistered (for example
during a `qmd collection set-path` migration, see the `collection-set-path`
capability). Purge takes an explicit name and reports the affected counts.

### D2: Delete vectors by collection membership, not by the orphan rule

Order inside one `db.transaction`:

```sql
DELETE FROM vectors_vec     WHERE hash_seq IN (<collection hash_seq>);
DELETE FROM vectors_bit     WHERE hash_seq IN (<collection hash_seq>);
DELETE FROM vectors_rescore WHERE hash_seq IN (<collection hash_seq>);
DELETE FROM content_vectors WHERE hash IN (SELECT hash FROM documents WHERE collection = ?);
DELETE FROM documents_fts   WHERE ...;
DELETE FROM content         WHERE hash IN (<collection hashes>);
DELETE FROM documents       WHERE collection = ?;
```

`<collection hash_seq>` is `content_vectors.hash || '_' || seq` restricted to
that collection's hashes. No `LIKE` on hashes, no regex.

### D3: Reclaim with the existing `VACUUM`

`vacuumDatabase` already exists. `qmd cleanup` prints
`page_size × page_count` before and after the VACUUM so the operator sees the
reclaim.

### D4: Do NOT pre-filter the `vec0` KNN (deferred)

- A `vec0` virtual table cannot be joined with `documents` in the same
  statement (see the PR #23 comment in `searchVec`), and it exposes no metadata
  column to filter `collection` inside the `MATCH`.
- The quantized path has the same shape: `quantVecSearch` runs the coarse KNN
  over `vectors_bit` with `k = pool`, again without a collection filter.
- A real pre-filter needs per-collection vector tables or a partition key — a
  schema change with a re-embed.
- After the purge, only the live collection's hashes participate, so the
  existing `vecK = limit × 3` over-fetch is no longer diluted by junk. The
  post-filter is enough; revisit only if a future multi-collection index shows
  recall loss.

## Risks / Trade-offs

- **Destructive** — purge removes documents, not just vectors. Mitigation:
  explicit name, printed counts, `--yes`/TTY confirmation, and a pre-purge copy
  on the host.
- **`VACUUM` needs space** roughly equal to the final file and an exclusive
  lock. SRVKPSR42 has the space; `qmd-mcp` must be stopped first.
- **Recurrence** — a future rename repeats this. Mitigation: the purge command
  plus a runbook note; optionally a `qmd status` warning for collections present
  in `documents` but absent from `store_collections`.

## Migration Plan

1. Ship the command and tests; rebuild `dist/`.
2. Host: `nssm stop qmd-mcp`; back up (`VACUUM INTO D:\qmd\index.pre-purge.sqlite`
   or copy the file); `qmd collection purge rt.dev.git`; `qmd cleanup`;
   `nssm start qmd-mcp`; `GET /health`; `qmd status`.
3. Rollback: restore the pre-purge copy of `index.sqlite`.

## Open Questions

- Should `qmd status` warn about unregistered collections (cheap, prevents the
  next occurrence)? Proposed yes; decide during apply.
