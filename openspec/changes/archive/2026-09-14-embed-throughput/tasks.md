## 1. LLM: concurrency hint and 429 counter

- [x] 1.1 In [src/llm.ts](../../../src/llm.ts) on interface `LLM` (next to `preferredEmbedBatchSize` ~L428) add optional `readonly preferredEmbedConcurrency?: number` (JSDoc: OpenRouter POST pool size; omit/1 = serial). Do not add it to `ILLMSession`. `tsc` still typechecks `LlamaCpp` (field omitted).
- [x] 1.2 In [src/llm-openrouter.ts](../../../src/llm-openrouter.ts) add getter `preferredEmbedConcurrency` returning `this.concurrency`. Add private `rateLimitRetries = 0`. In the existing HTTP 429 retry branch of `callEndpoint` (~L289), increment `rateLimitRetries` once per retry (not per final failure). Add public `consumeRateLimitRetries(): number` that returns the counter and resets it to 0.
- [x] 1.3 In `test/embed-concurrency.test.ts` add a case: mock one 429 then 200 on a single-text `embed`; after `embedBatch`/`embed`, `consumeRateLimitRetries()` is `>= 1`, second consume is `0`. Run `npx vitest run test/embed-concurrency.test.ts`.

## 2. SQLite: transactional insert batch

- [x] 2.1 In [src/store.ts](../../../src/store.ts) next to `insertEmbedding` (~L4727) add exported `insertEmbeddingBatch(db, items: { hash, seq, pos, embedding: Float32Array, model, embeddedAt }[])`. Implement as `db.transaction((rows) => { for (const r of rows) insertEmbedding(db, ...) })()`. Empty array is a no-op. Keep per-row ordering (content_vectors then vec0 then quant).
- [x] 2.2 In [test/store.test.ts](../../../test/store.test.ts) (or `test/vec-quant.test.ts` if that file already owns vec inserts) add a test: two hashes, `insertEmbeddingBatch`, both `content_vectors` rows present; a second test stubs/fails the second insert inside a batch (or uses a closed db) and asserts the first hash of that failed batch is not left behind if the transaction throws. If forcing a mid-batch throw is too brittle, document in the test that `db.transaction` rollback is trusted and only assert the happy path of two rows in one call. Run the new test file/filter.

## 3. generateEmbeddings: step window, timestamps, logs, docsProcessed

- [x] 3.1 Extend `EmbedResult` in [src/store.ts](../../../src/store.ts) (~L2026) with `stopReason: "complete" | "session_timeout" | "error_rate"`. Track `insertedHashes: Set<string>`. Change `docsProcessed` in the return value to `insertedHashes.size` (not `docsToEmbed.length` / `totalDocs`).
- [x] 3.2 In `generateEmbeddings`, remove the single run-start `const now = new Date().toISOString()`. Compute `const sliceSize = llm.preferredEmbedBatchSize ?? 32` and `const stepSize = sliceSize * (llm.preferredEmbedConcurrency ?? 1)`. Replace the inner loop `batchStart += BATCH_SIZE` with `stepSize`. Keep the first-chunk dimension probe (`session.embed`) as today.
- [x] 3.3 After each `session.embedBatch`, measure `api_ms`. Build the successful rows with `embeddedAt: new Date().toISOString()` per row. Call `insertEmbeddingBatch`. Measure `sqlite_ms`. On insert success add hashes to `insertedHashes`. Call `consumeRateLimitRetries()` if `typeof (llm as OpenRouterEmbedding).consumeRateLimitRetries === "function"`, else `http_429 = 0`.
- [x] 3.4 Add helpers in `store.ts` (module-private) that `console.error` newline lines prefixed `[qmd embed]`:
  - start: model, `sliceSize`, `concurrency` (`preferredEmbedConcurrency ?? 1`), timeout seconds, `pending_docs`, `pending_bytes`
  - step: `chunks` embedded so far, `rate` (chunks/s from `startTime`), `api_ms`, `sqlite_ms`, `http_429`
  - end: `chunks`, `docs` (`insertedHashes.size`), `errors`, `duration_ms`, `reason`
  Map stop reason: error-rate abort path → `error_rate`; `!session.isValid` or caught `AbortError` after some work → `session_timeout`; otherwise `complete`. Do not throw away already-inserted rows on timeout (same as today).
- [x] 3.5 Update existing `generateEmbeddings` tests in [test/store.test.ts](../../../test/store.test.ts) (`maxDocsPerBatch`, `maxBatchBytes`, model passthrough, paths): they still pass with `preferredEmbedConcurrency` omitted (step = batch size). Add tests:
  - fake LLM `preferredEmbedBatchSize: 2`, `preferredEmbedConcurrency: 3`, enough one-chunk docs in one doc-window → one `embedBatch` call length `6` (or `min(6, n)`);
  - two sequential `embedBatch` calls delayed so `embedded_at` values on `content_vectors` are not all identical (use fake timers or `vi.setSystemTime`);
  - `sessionMaxDurationMs` small + slow `embedBatch` → `stopReason === "session_timeout"` and `docsProcessed` equals hashes actually inserted;
  - spy `console.error` and assert a start line and an end line matching `/\[qmd embed\]/`.
  Run `npx vitest run test/store.test.ts`.

## 4. CLI / SDK / docs

- [x] 4.1 [src/cli/qmd.ts](../../../src/cli/qmd.ts) `vectorIndex`: keep TTY `\r` `onProgress`. After `generateEmbeddings`, the existing `Done!` line uses new `docsProcessed` (docs with inserts). If `result.stopReason !== "complete"`, print that reason on stderr (timeout/error_rate). Confirm `formatETA(result.durationMs/1000)` still used.
- [x] 4.2 [src/index.ts](../../../src/index.ts): no new embed options required; `EmbedResult` export picks up `stopReason`. If SDK typings list `EmbedResult` fields in comments, add `stopReason`.
- [x] 4.3 [CLAUDE.md](../../../CLAUDE.md) Architecture OpenRouter bullet (~L196): note that `qmd embed` store steps send `batchSize × QMD_EMBED_CONCURRENCY` texts per `embedBatch` so the pool can overlap; local llama still serial. Add that nightly long runs should set `QMD_EMBED_SESSION_MAX_DURATION_SEC=0` (product default remains 30 minutes).
- [x] 4.4 [CHANGELOG.md](../../../CHANGELOG.md) under `[Unreleased]` Features: durable `[qmd embed]` stderr throughput logs; insert-time `embedded_at`; transactional vector writes per store step; `qmd embed` feeds OpenRouter concurrency. Do not expand an unrelated merge conflict except to insert this bullet cleanly.
- [x] 4.5 Run `npx vitest run test/store.test.ts test/embed-concurrency.test.ts test/vec-quant.test.ts` and `pnpm exec tsc -p tsconfig.build.json` (or project build without `bun build --compile`). All green.

## 5. Host ops (not this repo)

- [x] 5.1 After merge: on SRVKPSR42 set `QMD_EMBED_SESSION_MAX_DURATION_SEC=0` in the nightly `update-index.cmd` env (cursor_ssh). Confirm next `update.log` has `[qmd embed] start|step|done` and `reason=complete` or a timed `session_timeout` only if still capped. Do not run `qmd embed` from the agent.
  - Done 2026-09-14 on SRVKPSR42: update-index.cmd sets QMD_EMBED_SESSION_MAX_DURATION_SEC=0 (file dated 2026-09-04); update.log run 05.09 shows [qmd embed] start|step|done ... reason=complete; every run since 06.09 logs Pending=0, skip embed.
