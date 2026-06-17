## Context

`OpenRouterEmbedding.embedBatch` ([src/llm-openrouter.ts:273-289](../../../src/llm-openrouter.ts#L273-L289)) splits `texts` into `batchSize` (default 64) slices and POSTs each sequentially. The embed driver `generateEmbeddings` ([src/store.ts:1782-1816](../../../src/store.ts#L1782-L1816)) already calls `session.embedBatch` per `BATCH_SIZE` chunk-slice inside a serial loop, then `insertEmbedding` to SQLite.

Two serial layers, both blocked on OpenRouter HTTP round-trips. Observed ~319 chunk/min → ~25% of 25 934 docs in the 20-min post-commit hook window. Throughput is the bottleneck, not CPU.

Existing transport behavior to preserve:
- Endpoint failover chain (primary cloud → local fallback) on transport errors only ([callEmbeddings L245-264](../../../src/store.ts)).
- `fetchWithRetry` retries network-level failures (DNS/TLS/reset), NOT HTTP error responses ([L111-124](../../../src/llm-openrouter.ts#L111-L124)).
- 429/5xx → `EndpointTransportError` → failover ([L229](../../../src/llm-openrouter.ts#L229)).
- Ordered result array via `item.index` mapping ([L281-286](../../../src/llm-openrouter.ts#L281-L286)).

## Goals / Non-Goals

**Goals:**
- Concurrent POSTs in `OpenRouterEmbedding.embedBatch` via bounded pool; degree from `QMD_EMBED_CONCURRENCY` (default 1 = today's behavior).
- 429/rate-limit backoff honoring `Retry-After`; retry same endpoint before failover.
- Propagate the embed session `AbortSignal` into `fetch`; cancel in-flight POSTs on session expiry.
- Per-POST error isolation: one failed slice → its texts map to `null`; siblings keep results.
- Default behavior byte-identical to current (concurrency 1, no behavioral drift).

**Non-Goals:**
- No concurrency for local node-llama-cpp (`LlamaCpp`) — single inference context, serial stays.
- No change to `store.ts` embed loop structure or `embedBatch` signature (only `signal` plumbed in `EmbedOptions`).
- No adaptive/auto-tuned concurrency; fixed integer from env.
- No change to chunking, vector tables, RRF, or failover ordering semantics.

## Decisions

### D1: Concurrency in transport layer, not the store loop
Keep parallelism inside `OpenRouterEmbedding.embedBatch`. `store.ts` keeps calling `session.embedBatch` with the same signature; passes `session.signal` in `EmbedOptions` so abort propagates. The provider decides how many internal `batchSize` slices fly concurrently.
- **Why:** Cleanest boundary. Local llama path (same `embedBatch` interface via different class) untouched, so it can't accidentally parallelize a single GPU/CPU context. No session/abort/insert refactor in `store.ts`.
- **Alternative rejected:** Parallelize in `store.ts` by firing K `session.embedBatch` calls. Would parallelize the local path too (unsafe) and tangle SQLite insert ordering + session bookkeeping.

### D2: Bounded worker pool over `Promise.all` of all slices
Run at most `concurrency` POSTs in flight; as one settles, start the next slice.
- **Why:** A 64-slice `embedBatch` with `Promise.all` would open 64 sockets — defeats rate control. Bounded pool caps request rate predictably.
- **Implementation:** index-cursor worker pool (N workers pull next slice offset from a shared counter). Results written to a pre-sized output array by absolute index — order preserved without sorting.

### D3: 429 backoff retries the SAME endpoint before failover
On HTTP 429 (and optionally 503 with `Retry-After`): sleep `Retry-After` seconds (or exponential backoff with jitter when header absent), retry same endpoint up to a cap. Only after the cap → raise `EndpointTransportError` to trigger failover.
- **Why:** At 5× concurrency a 429 burst is expected and transient; current immediate-failover loses the slice (no fallback endpoint in cloud-only setup) or hammers the fallback. Honoring `Retry-After` is the provider's explicit contract.
- **Alternative rejected:** Keep 429→failover. Unsafe at concurrency >1.
- **Cap:** new constant (e.g. `MAX_RATE_LIMIT_RETRIES`), separate from `MAX_NETWORK_RETRIES`.

### D4: AbortSignal threaded through `fetch`
`embedBatch` / `embed` accept the signal via `EmbedOptions`; `generateEmbeddings`
passes `session.signal` into `session.embedBatch` and `session.embed`
([store.ts:1814](../../../src/store.ts#L1814), [1848](../../../src/store.ts#L1848),
[1870](../../../src/store.ts#L1870)). `callEndpoint` / `fetchWithRetry` pass
`{ signal }` to `fetch`. On abort: in-flight POSTs reject, pool stops scheduling
new slices, `embedBatch` returns partial (`null` for unstarted/aborted).
- **Why:** Session max-duration timer aborts the controller ([llm.ts:1562](../../../src/llm.ts#L1562)); without signal wiring, 5 dangling POSTs continue after "Session expired".
- **Note:** abort during backoff sleep must also wake and bail — sleep races the signal.

### D5: Per-slice error isolation
Each pool task wraps its slice POST in try/catch. Failure (terminal 4xx, malformed body, or post-cap transport error) → mark that slice's indices `null`, record but don't throw. `embedBatch` returns the full-length array.
- **Why:** Today one thrown slice aborts the whole `embedBatch`; `store.ts` then retries individually ([L1817-1839](../../../src/store.ts#L1817-L1839)). With concurrency, sibling successes must survive. `store.ts`'s existing `null`→`errors++` path already handles null slots, and its individual-retry fallback still triggers on a fully-thrown batch.

### D6: Config — `QMD_EMBED_CONCURRENCY`, read at construction
Parse env in `OpenRouterEmbedding` constructor (like `batchSize`); store as private field. Invalid/<1 → coerce to 1 with a one-line stderr warning (mirrors session-duration parse). Only meaningful for OpenRouter; local provider ignores it.
- **Why:** Construction-time read matches existing `QMD_EMBED_*` pattern; `loadConfigEnv()` runs before provider build.

## Risks / Trade-offs

- **Provider rate limits / cost spikes** → D3 backoff + default 1 (opt-in). Document that higher concurrency raises request rate against OpenRouter quotas.
- **Out-of-order / lost results** → D2 pre-sized array by absolute index; covered by ordered-result test.
- **Abort leaves partial DB state** → acceptable: pending docs re-embed next run (idempotent; `getPendingEmbeddingDocs` re-selects). Same as current expiry behavior.
- **Backoff sleep ignoring abort** → D4 note: sleep must race the signal, else expiry waits out a long `Retry-After`.
- **Fallback endpoint amplification** → on sustained 429 the pool could stampede the local fallback. Mitigation: failover only after retry cap, and concurrency applies per-slice scheduling, not a fresh burst per failover.
- **Local llama mis-parallelized** → D1 confines concurrency to `OpenRouterEmbedding`; `LlamaCpp.embedBatch` unchanged. Test asserts local path ignores the env.
