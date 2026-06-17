## Why

Embedding via OpenRouter is serial: `OpenRouterEmbedding.embedBatch` POSTs each batch one at a time. At ~319 chunk/min only ~25% of a 25 934-doc help-set embedded inside the 20-min post-commit hook window; the rest needs ~65 min of catch-up. I/O-bound HTTP — concurrent POSTs give near-linear speedup, letting a full re-index fit the hook window.

## What Changes

- New env `QMD_EMBED_CONCURRENCY` (default `1` = current serial behavior). When `>1`, `OpenRouterEmbedding.embedBatch` POSTs that many `batchSize`-sized batches concurrently via a bounded worker pool.
- Concurrency lives **only** in the OpenRouter transport layer (`src/llm-openrouter.ts`). Local node-llama-cpp path is untouched and stays serial (single inference context — parallel useless).
- Add real **429 / rate-limit backoff** honoring the `Retry-After` header. Current code treats 429 as a failover signal; at 5× concurrency that loses chunks. Retry the same endpoint with backoff before failing over.
- Wire the embed **session `AbortSignal`** into `fetch` so in-flight POSTs cancel when the session expires (max-duration timeout / release), instead of dangling.
- **Per-POST error isolation**: one failed batch inside a concurrent group must not discard sibling results; failures map to `null` slots, preserving the ordered result array.

## Capabilities

### New Capabilities
- `parallel-embedding`: concurrent OpenRouter embedding transport — bounded-pool POST concurrency, rate-limit backoff, abort propagation, per-batch error isolation.

### Modified Capabilities
<!-- none: ast-chunking and link-graph specs unaffected; serial llama path unchanged -->

## Impact

- Code: `src/llm-openrouter.ts` (`embedBatch` L273-289, `callEndpoint` L196, `fetchWithRetry` L111, constructor env read). No signature change to `store.ts` embed loop (L1782-1816) — it keeps calling `session.embedBatch`; concurrency is internal to the provider.
- Config: new env `QMD_EMBED_CONCURRENCY`; document alongside `QMD_EMBED_*` in CLAUDE.md / README.
- Behavior: default unchanged (concurrency 1). Higher values increase OpenRouter request rate — interacts with provider rate limits (mitigated by new backoff).
- Tests: `test/` HTTP-mocked OpenRouter cases for concurrency, 429 backoff, abort, partial failure.
- Docs: CHANGELOG `[Unreleased]`.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/parallel-embedding/spec.md](specs/parallel-embedding/spec.md)
