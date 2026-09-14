## Why

Nightly `qmd embed` on a large OpenRouter index cannot be timed from SQLite:
`embedded_at` is frozen at session start, TTY `\r` progress never reaches
`update.log`, and `QMD_EMBED_CONCURRENCY` does not overlap POSTs because each
**store embed step** feeds exactly one **HTTP embed slice**. Operators then
misread a 30-minute session abort as ~0.7 chunk/s. Need durable step logs,
honest timestamps, and a store loop that actually uses the existing transport
pool plus batched SQLite writes.

## What Changes

- **Store embed step** size becomes `preferredEmbedBatchSize × preferredEmbedConcurrency` (local llama concurrency stays 1). One `embedBatch` call can contain several HTTP embed slices so `QMD_EMBED_CONCURRENCY>1` overlaps POSTs on `qmd embed`.
- Successful vectors from one store embed step are written in a **single SQLite transaction** (content_vectors + vec0 + quant), matching the requantize pattern.
- `embedded_at` is set at insert time (ISO), not once per `generateEmbeddings` run.
- Durable stderr lines every store embed step (and a start/end summary): chunks, rate, `api_ms`, `sqlite_ms`, 429 retries, stop reason (`complete` / `session_timeout` / `error_rate`). TTY `\r` bar stays; file logs get newlines.
- `EmbedResult.docsProcessed` counts documents that received at least one inserted chunk this run (not all pending at start). Start log still prints pending docs/bytes.
- Docs: CLAUDE.md / CHANGELOG. Nightly hosts SHOULD set `QMD_EMBED_SESSION_MAX_DURATION_SEC=0` in the update script (ops, not this repo). Product default 30 minutes unchanged.

Out of this change: MCP query queue, session TTL, `candidateLimit` plumbing, HTTP MCP auth, HTTP∥SQLite pipeline (embed v2), changing the product default session timeout.

## Capabilities

### New Capabilities

- `embed-throughput`: durable embed progress logs, live `embedded_at`, transactional inserts per store embed step, driver window sized for OpenRouter concurrency.

### Modified Capabilities

- (none) — `parallel-embedding` transport requirements stay; this change makes `qmd embed` feed that transport enough texts for concurrency to fire.

## Impact

- Code: `src/store.ts` (`generateEmbeddings`, `insertEmbedding` batch wrapper), `src/llm.ts` / `src/llm-openrouter.ts` (`preferredEmbedConcurrency`, 429 counter), `src/cli/qmd.ts` (Done! line uses new `docsProcessed`; non-TTY relies on store stderr).
- Tests: extend `test/store.test.ts` generateEmbeddings cases; new or extended unit tests for step window, transactional insert, `embedded_at`, stderr lines. Existing `test/embed-concurrency.test.ts` unchanged (transport).
- Docs: CHANGELOG `[Unreleased]`, CLAUDE.md embed env (step window + session timeout ops note).
- Host ops (SRVKPSR42, `cursor_ssh`): set `QMD_EMBED_SESSION_MAX_DURATION_SEC=0` on nightly embed; not a file in this repo.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/embed-throughput/spec.md](specs/embed-throughput/spec.md)
