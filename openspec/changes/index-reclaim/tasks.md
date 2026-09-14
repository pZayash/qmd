## 1. Store: purgeCollection

- [ ] 1.1 In [src/store.ts](../../../src/store.ts) add exported `purgeCollection(db, name): { vectors, contentVectors, documents }`. Delete in one `db.transaction` (order in [design.md](design.md) D2): vector rows by the collection's `hash_seq`, then `content_vectors`, `documents_fts`, `content`, `documents`. Return the deleted counts.
- [ ] 1.2 No-op with zero counts when the collection has no `documents` rows. Must not require `isSqliteVecAvailable()` for the `documents` / `content_vectors` part; skip vector tables when `vec0` is unavailable.
- [ ] 1.3 In [test/store.test.ts](../../../test/store.test.ts) add a case: store with two collections, remove one from `store_collections`, run `purgeCollection`; assert that collection's `documents` / `content_vectors` / vector rows are gone and the registered collection is intact.

## 2. CLI

- [ ] 2.1 [src/cli/qmd.ts](../../../src/cli/qmd.ts) add `qmd collection purge <name> [--yes]`. Print the row counts and require `--yes` or a TTY confirmation before deleting.
- [ ] 2.2 `qmd cleanup` prints `page_size × page_count` before and after `VACUUM` (reclaimed MB).
- [ ] 2.3 [src/index.ts](../../../src/index.ts) export `purgeCollection`.

## 3. Build and tests

- [ ] 3.1 `pnpm exec tsc -p tsconfig.build.json` clean.
- [ ] 3.2 `npx vitest run test/store.test.ts` (targeted purge cases) green.

## 4. Host op (SRVKPSR42, operator approval required)

- [ ] 4.1 Stop `qmd-mcp`; back up `D:\qmd\index.sqlite` (`VACUUM INTO D:\qmd\index.pre-purge.sqlite`). Do not run `VACUUM` with the service up.
- [ ] 4.2 `qmd collection purge rt.dev.git`, then `qmd cleanup`; `nssm start qmd-mcp`; `GET http://127.0.0.1:8181/health`.
- [ ] 4.3 Verify `qmd status` (Pending unchanged), record before/after index size in [D:\cursor_ssh\docs\qmd.md](D:\cursor_ssh\docs\qmd.md), and run one `qmd query` smoke.
