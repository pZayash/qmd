## Why

Hybrid search only indexes files. Queries like “заказ покупателя” or “qmd search guide” hit a module or a single markdown file and miss the folder that is the real unit of meaning (1C metadata object, `docs/ai/`, `memory/`). OpenViking’s useful idea — a searchable directory summary — should land in QMD as an index feature, not as an agent memory OS.

## What Changes

- On `qmd update`, build a **dir-node** per directory that contains indexed files: short **extractive L0** text (child names, first markdown headings, path context; for 1C object dirs, peek sibling `*.xml` `Name` + ru `Synonym` without indexing the xml as a document).
- Config `l0_source`: `n` (extractive only) or `p` (read `.qmd/l0/<relpath>.md` if present, else extractive). `q` (API generate) is reserved in config but **not implemented** in this change.
- Embed dir-node L0 with the existing embedding pipeline; `qmd query` / FTS / vec may return a directory hit.
- Partial `update --files` rebuilds ancestor dir-nodes of touched files.

Not in this change: MCP progressive load (L0/L1 layers), hierarchical drill, `ls`/`grep` on `qmd://`, LLM sidecar generation (`l0_source: q`).

No **BREAKING** CLI flags. Existing file hits stay; directory hits are additive. Collections without the feature (or with empty dir-node set) behave as today.

## Capabilities

### New Capabilities

- `dir-node`: build, store, embed, and retrieve directory L0 summaries as first-class index units.

### Modified Capabilities

<!-- none: ast-chunking, link-graph, parallel-embedding, symbol-anchor-links unchanged -->

## Impact

- Code: `src/store.ts` (schema, reindex, partial update, search result shape), `src/collections.ts` (config), `src/cli/qmd.ts` / `src/cli/formatter.ts` (show dir hits), `src/mcp/server.ts` (query payload `kind`), new helper e.g. `src/dir-node.ts` for extractive L0 + contract read.
- Config: `l0_source` on collection and/or `models` in `~/.config/qmd/index.yml`.
- Index: extra `documents` rows (or equivalent) with `kind=dir`; extra vectors for those hashes. First enablement needs user-run `qmd update` then `qmd embed` (do not auto-run).
- Tests: `test/` unit tests for extractive L0, xml peek, contract override, ancestor rebuild; search tests that a dir path can rank.
- Docs: `CHANGELOG.md` `[Unreleased]`, short note in README / CLAUDE.md.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
