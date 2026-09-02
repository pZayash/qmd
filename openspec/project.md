# Project context

## Purpose

QMD (Query Markup Documents) is a CLI and MCP server for local hybrid search over
indexed collections: BM25 full-text, vector similarity (sqlite-vec), optional LLM
reranking and query expansion (node-llama-cpp). Targets markdown, code, and mixed
knowledge bases on disk.

## Tech stack

- **Runtime**: Node.js ≥22 (development may use `tsx`; shipped CLI runs compiled `dist/`)
- **Language**: TypeScript (ES modules)
- **Package manager**: `pnpm` (not npm/bun unless user asks)
- **Database**: SQLite + FTS5 + sqlite-vec
- **Tests**: Vitest (`test/`, preload `src/test-preload.ts`)
- **Build**: `tsc` → `dist/` (`npm run build` / `pnpm run build`)

## Conventions

### Code style

- Match surrounding files: naming, imports, error handling
- Minimal scope — smallest correct diff
- Comments only for non-obvious logic
- User-facing CLI/MCP behavior changes → `CHANGELOG.md` under `[Unreleased]`

### Architecture

- `src/cli/` — CLI entry and commands
- `src/` — core indexing, search, embeddings, MCP
- `test/` — Vitest tests
- `skills/` — agent skills (release, explore, review, openspec workflow)
- `openspec/` — spec-driven changes (OpenSpec)
- `research/` — investigations and design notes (long-lived, searchable)

### Testing

```sh
pnpm test
# or: npx vitest run --reporter=verbose test/
```

Add/update tests when behavior changes.

### Git workflow

- Commits only on explicit user request
- OpenSpec `tasks.md`: no checkboxes for commit, push, branch, or PR
  (see `openspec/config.yaml` → `rules.tasks`)
- Feature branches + PRs for upstream contributions

## Domain context

- **Collection** — indexed root path with glob mask
- **Chunk** — searchable text segment (regex or AST-aware via tree-sitter)
- **Query pipeline** — hybrid `qmd query` (lex/vec/hyde structured lines, RRF, rerank)
- **Docid** — short content hash prefix (`#abc123`)

## Important constraints

- **Do not run automatically**: `qmd collection add`, `qmd embed`, `qmd update`
- **Do not compile** with `bun build --compile` (breaks sqlite-vec wrapper)
- **Index path**: `~/.cache/qmd/index.sqlite` — never edit SQLite directly
- MCP daemon pins old code — restart after `dist/` changes
- **HTTP MCP has no auth** (TODO). Bind is `127.0.0.1`. LAN listen without
  a token is not “done”: warn the developer; implement auth in its own change

## OpenSpec CLI

```sh
openspec list
openspec new change "<name>"
openspec status --change "<name>"
```

Installed via `@fission-ai/openspec` (`pnpm install`). Invoke as `openspec` — no `pnpm exec`.

## External references

- [CLAUDE.md](../CLAUDE.md) — agent command reference
- [README.md](../README.md) — user documentation
- [OpenSpec implementation notes](../docs/ai/openspec-implementation-notes.md)
