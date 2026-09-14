## Purpose

Make `qmd embed` measurable and able to use existing OpenRouter POST
concurrency: durable step logs, insert-time `embedded_at`, transactional
vector writes, and store embed steps large enough for several HTTP embed
slices.

## ADDED Requirements

### Requirement: Store embed step matches configured HTTP concurrency

When generating embeddings, each call to the embedding batch API SHALL include
up to `preferredEmbedBatchSize × preferredEmbedConcurrency` chunk texts
(missing concurrency treated as `1`). The local node-llama-cpp provider SHALL
keep concurrency `1`. Remaining chunks in a document window MAY form a smaller
final step. Document-window limits (`maxDocsPerBatch` / `maxBatchBytes`) SHALL
be unchanged.

#### Scenario: Default stays one HTTP slice per step
- **WHEN** OpenRouter concurrency is unset or `1` and `preferredEmbedBatchSize` is 64
- **THEN** each embed-batch call contains at most 64 texts

#### Scenario: Raised concurrency feeds several slices
- **WHEN** OpenRouter `QMD_EMBED_CONCURRENCY=4` and `preferredEmbedBatchSize` is 64 and at least 256 chunks are waiting in the current document window
- **THEN** a single embed-batch call contains 256 texts so the transport MAY issue up to 4 concurrent HTTP embed slices

#### Scenario: Local llama ignores OpenRouter concurrency
- **WHEN** the active embed provider is local node-llama-cpp and `QMD_EMBED_CONCURRENCY=4`
- **THEN** each embed-batch call still contains at most that provider's preferred batch size (serial inference)

### Requirement: Vector inserts for one store embed step are transactional

All successful embeddings from one store embed step SHALL be committed in one
SQLite transaction covering `content_vectors`, the float vec0 row, and quant
tables when quant is enabled. A failed or null slot SHALL NOT insert a vector.
On transaction failure the step SHALL leave no partial vectors from that step.

#### Scenario: Partial HTTP success
- **WHEN** an embed-batch returns embeddings for some texts and null for others
- **THEN** only the non-null embeddings are inserted, in one transaction

#### Scenario: Transaction abort
- **WHEN** the SQLite transaction for a store embed step fails
- **THEN** none of that step's new `content_vectors` / vec0 / quant rows remain

### Requirement: embedded_at records insert time

Each `content_vectors` row written by embedding SHALL store `embedded_at` as an
ISO-8601 timestamp of the insert, not a single timestamp captured at the start
of the embed run.

#### Scenario: Two steps have different timestamps
- **WHEN** two store embed steps complete at least one second apart
- **THEN** their inserted rows do not all share one identical `embedded_at`

### Requirement: Durable embed progress on stderr

`generateEmbeddings` SHALL write newline-terminated stderr lines (prefix
`[qmd embed]`) at run start, after each store embed step, and at run end.
Step lines SHALL include chunks embedded so far, a chunks-per-second rate,
`api_ms`, `sqlite_ms`, and HTTP 429 retry count for that step (zero when the
provider does not rate-limit). The end line SHALL include chunks embedded,
documents that received at least one insert this run, error count, duration,
and stop reason `complete`, `session_timeout`, or `error_rate`. TTY carriage-
return progress MAY remain in the CLI; redirected logs MUST still receive the
newline lines.

#### Scenario: Non-TTY capture
- **WHEN** `qmd embed` stderr is redirected to a file
- **THEN** the file contains start, at least one step line if any chunks were embedded, and an end line with a stop reason

#### Scenario: Session timeout reason
- **WHEN** the embed session max-duration abort stops remaining work after some chunks were inserted
- **THEN** the end line stop reason is `session_timeout` and already-inserted vectors remain

### Requirement: docsProcessed counts work done this run

`EmbedResult.docsProcessed` SHALL equal the number of distinct documents that
received at least one inserted chunk during this `generateEmbeddings` call, not
the number of pending documents at start.

#### Scenario: Timeout mid-run
- **WHEN** 100 documents are pending and the session aborts after chunks from 8 documents were inserted
- **THEN** `docsProcessed` is 8 and `chunksEmbedded` matches inserted chunks
