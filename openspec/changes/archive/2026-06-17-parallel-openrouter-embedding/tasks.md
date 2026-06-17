## 1. Config: read QMD_EMBED_CONCURRENCY

- [x] 1.1 In [src/llm-openrouter.ts](../../../src/llm-openrouter.ts) add module constants near `DEFAULT_BATCH_SIZE` (L55): `const DEFAULT_CONCURRENCY = 1;` and `const MAX_RATE_LIMIT_RETRIES = 5;` and `const RATE_LIMIT_BASE_DELAY_MS = 1000;`.
- [x] 1.2 Add a private readonly field `concurrency: number` to class `OpenRouterEmbedding` (next to `batchSize` at L128).
- [x] 1.3 In the constructor, after `this.batchSize = ...` (L143), parse concurrency: read `process.env.QMD_EMBED_CONCURRENCY`; `parseInt` base 10; if `NaN` or `< 1` set `this.concurrency = 1` and `console.error("[qmd embed] invalid QMD_EMBED_CONCURRENCY, using 1")`; else `this.concurrency = parsed`. Do not throw.
- [x] 1.4 Allow a constructor option override: extend the `options?` object type (L136) with `concurrency?: number`; prefer `options.concurrency` over the env value when provided (env read only if option undefined). Keeps tests deterministic without env mutation.

## 2. Thread AbortSignal through fetch

- [x] 2.1 Change `fetchWithRetry(url, init)` (L111) to also accept the abort signal — read `init.signal` (already part of `RequestInit`); ensure the `signal` is forwarded to the inner `fetch(url, init)` (it already passes `init`, so just guarantee callers set `init.signal`). On `AbortError` (`err.name === "AbortError"`), do NOT retry — rethrow immediately so abort is not masked by network retry.
- [x] 2.2 Add an `options?: EmbedOptions` param plumb so `callEndpoint` can access the signal. Change `callEndpoint(ep, input)` (L196) signature to `callEndpoint(ep, input, signal?: AbortSignal)`. Pass `signal` into the `fetchWithRetry` `init` object (add `signal` key alongside `method`/`headers`/`body` at L201-208).
- [x] 2.3 Change `callEmbeddings(input)` (L245) to `callEmbeddings(input, signal?)` and forward `signal` to `callEndpoint` (L250).
- [x] 2.4 In `embed(text, options)` (L266) pass `options?.signal` to `callEmbeddings`. `EmbedOptions` in [src/llm.ts](../../../src/llm.ts) has `signal?: AbortSignal`. **store.ts** `generateEmbeddings` passes `session.signal` into `session.embed` and `session.embedBatch` ([store.ts:1814](../../../src/store.ts#L1814), [1848](../../../src/store.ts#L1848), [1870](../../../src/store.ts#L1870)).

## 3. Rate-limit backoff (429) before failover

- [x] 3.1 Add a helper `sleepWithAbort(ms, signal?)` in [src/llm-openrouter.ts](../../../src/llm-openrouter.ts): returns a Promise that resolves after `ms`, but rejects with an `AbortError` if `signal` aborts first (attach `signal.addEventListener("abort", ...)`, clear timeout on both paths). Used so backoff waits cancel on session expiry (spec: abort during backoff). **Done also:** `fetchWithRetry` network-retry delay (L183) uses `sleepWithAbort` so abort during inter-attempt sleep is not masked.
- [x] 3.2 Add a helper `parseRetryAfterMs(resp): number | null` — read `resp.headers.get("retry-after")`; if numeric seconds → `*1000`; if HTTP-date → `Date.parse(...) - Date.now()` clamped `>= 0`; else `null`.
- [x] 3.3 In `callEndpoint` (L196), wrap the request in a retry loop for 429: intercept `resp.status === 429` **before** `await resp.json()` (read `Retry-After` from headers only); if attempt `< MAX_RATE_LIMIT_RETRIES`: compute delay = `parseRetryAfterMs(resp) ?? RATE_LIMIT_BASE_DELAY_MS * 2**attempt` plus jitter (`Math.random()*250`); `await sleepWithAbort(delay, signal)`; retry the SAME endpoint. After the cap is exhausted, fall through to the existing `!resp.ok` handler → `EndpointTransportError` (failover at `callEmbeddings` L252). Leave 5xx behavior as-is (immediate `EndpointTransportError`).
- [x] 3.4 Ensure non-429 4xx and malformed-body paths (L219-241) are unchanged (still terminal `Error`, no retry).

## 4. Bounded concurrent dispatch in embedBatch

- [x] 4.1 Rewrite `embedBatch(texts, options)` (L273-289). Keep early return for `texts.length === 0`. Build the list of slice descriptors: for each `offset` in `0, batchSize, 2*batchSize, ...` create `{ offset, chunk: texts.slice(offset, offset+batchSize) }`.
- [x] 4.2 Pre-size output: `const out = new Array(texts.length).fill(null)`.
- [x] 4.3 Implement a bounded worker pool: shared cursor index `let next = 0;` over the slice descriptors. Spawn `Math.min(this.concurrency, slices.length)` workers; each worker loops: atomically take `const i = next++`; if `i >= slices.length` stop; else process slice `i`. Use `await Promise.all(workers)`.
- [x] 4.4 Per-slice processing (the spec's error isolation): wrap in try/catch. On success, map `result.data` items into `out[slice.offset + item.index]`. On caught error: if it is an `AbortError`, set a shared `aborted = true` flag and stop taking new slices (leave remaining `out` entries `null`); otherwise leave that slice's indices `null` (already filled) and continue — do NOT rethrow. This gives per-slice isolation and abort-stops-scheduling.
- [x] 4.5 Each slice calls `this.callEmbeddings(slice.chunk, options?.signal)`. Concurrency degree 1 must produce identical behavior to the old sequential loop (single worker, sequential slices).
- [x] 4.6 Return `out`.

## 5. Tests (vitest, HTTP-mocked)

- [x] 5.1 In [test/](../../../test) add `embed-concurrency.test.ts`. Mock `globalThis.fetch` (or use the existing endpoint-mock pattern from [test/bench-endpoint.test.ts](../../../test/bench-endpoint.test.ts) / [test/embed-fallback.test.ts](../../../test/embed-fallback.test.ts)). Construct `new OpenRouterEmbedding("openrouter:test-model", { apiKey: "k", batchSize: 2, concurrency: 3 })`.
- [x] 5.2 Test: bounded in-flight count — track concurrent fetch calls (increment on enter, decrement on resolve via a deferred); assert max observed concurrency never exceeds 3 when embedding 10 texts (5 slices).
- [x] 5.3 Test: order preserved — make mock resolve in reversed/random order with deterministic embeddings keyed to input; assert `out[i]` matches the embedding for `texts[i]`.
- [x] 5.4 Test: 429 honors Retry-After — first response 429 with `Retry-After: 1`, second 200; use fake timers (`vi.useFakeTimers`) and assert the retry hits the same URL after advancing time, final result populated.
- [x] 5.5 Test: 429 failover after cap — always 429 on primary, 200 on fallback; assert it fails over to fallback after `MAX_RATE_LIMIT_RETRIES`.
- [x] 5.6 Test: per-slice isolation — one slice's POST returns terminal 400, others 200; assert failed slice indices are `null` and sibling indices populated; full-length array.
- [x] 5.7 Test: abort cancels — pass an `AbortController.signal`; abort mid-flight; assert `embedBatch` resolves with `null` for unstarted slices and does not hang (and a backoff sleep is interrupted).
- [x] 5.8 Test: concurrency=1 parity — with `concurrency: 1`, assert fetch calls are strictly sequential (never overlapping) for 6 texts / batchSize 2.

## 6. Docs

- [x] 6.1 Add `QMD_EMBED_CONCURRENCY` to the `QMD_EMBED_*` env documentation in [CLAUDE.md](../../../CLAUDE.md) (Architecture / embed section) and README if it lists embed env vars: default 1, OpenRouter-only, raises request rate (subject to provider rate limits).
- [x] 6.2 Add a `[Unreleased]` CHANGELOG entry under [CHANGELOG.md](../../../CHANGELOG.md): "Added: `QMD_EMBED_CONCURRENCY` for parallel OpenRouter embedding with 429 backoff and abort propagation (local llama path unchanged)."

## 7. Verify

- [x] 7.1 Run `npx vitest run --reporter=verbose test/embed-concurrency.test.ts` — all green.
- [x] 7.2 Run the existing embed/fallback suites (`test/embed-fallback.test.ts`, `test/bench-endpoint.test.ts`) to confirm no regression at default concurrency.
- [x] 7.3 `npm run build` (or Bash POSTBUILD per CLAUDE.md) — confirm `tsc` passes with no type errors from the new signatures.
