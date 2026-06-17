## ADDED Requirements

### Requirement: Configurable embedding concurrency

The OpenRouter embedding transport SHALL read a `QMD_EMBED_CONCURRENCY` environment variable at construction and use it as the maximum number of concurrent embedding POST requests. The default SHALL be `1`. Values less than `1` or non-integer SHALL be coerced to `1` with a single stderr warning. The setting SHALL apply only to the OpenRouter HTTP transport, never to the local node-llama-cpp provider.

#### Scenario: Default is serial
- **WHEN** `QMD_EMBED_CONCURRENCY` is unset
- **THEN** `embedBatch` issues at most one POST at a time (behavior identical to prior serial implementation)

#### Scenario: Concurrency raised
- **WHEN** `QMD_EMBED_CONCURRENCY=5` and `embedBatch` receives more texts than `batchSize`
- **THEN** at most 5 `batchSize`-sized POSTs are in flight at any moment

#### Scenario: Invalid value coerced
- **WHEN** `QMD_EMBED_CONCURRENCY=0` or `QMD_EMBED_CONCURRENCY=abc`
- **THEN** concurrency is treated as `1` and a warning is written to stderr

#### Scenario: Local provider unaffected
- **WHEN** the active embedding provider is local node-llama-cpp and `QMD_EMBED_CONCURRENCY=5`
- **THEN** the local provider embeds serially, ignoring the variable

### Requirement: Concurrent batch dispatch preserves result order

When `embedBatch` splits `texts` into `batchSize` slices and dispatches them concurrently, it SHALL return a result array of the same length and order as the input `texts`, regardless of the order in which POSTs complete.

#### Scenario: Out-of-order completion
- **WHEN** multiple concurrent POSTs return in an order different from dispatch
- **THEN** each embedding is placed at the index of its originating input text

#### Scenario: Bounded in-flight count
- **WHEN** there are more slices than the concurrency degree
- **THEN** a slice is dispatched only as an in-flight POST settles, never exceeding the degree

### Requirement: Rate-limit backoff before failover

On an HTTP 429 response, the transport SHALL wait and retry the SAME endpoint before failing over to the next endpoint. When a `Retry-After` header is present it SHALL be honored; otherwise exponential backoff with jitter SHALL be used. Retries SHALL be capped; only after exhausting the cap SHALL the request be treated as a transport failure eligible for failover.

#### Scenario: Honor Retry-After
- **WHEN** an endpoint returns HTTP 429 with `Retry-After: 2`
- **THEN** the transport waits ~2 seconds and retries the same endpoint

#### Scenario: Backoff without header
- **WHEN** an endpoint returns HTTP 429 with no `Retry-After`
- **THEN** the transport retries the same endpoint using exponential backoff with jitter

#### Scenario: Failover after cap
- **WHEN** an endpoint returns HTTP 429 beyond the retry cap
- **THEN** the request fails over to the next configured endpoint (if any), preserving existing failover semantics

### Requirement: Abort cancels in-flight requests

The transport SHALL accept the embed session `AbortSignal` and pass it to every `fetch`. When the signal aborts (session max-duration timeout or release), in-flight POSTs SHALL be cancelled, no new slices SHALL be dispatched, and any pending backoff wait SHALL terminate immediately.

#### Scenario: Expiry during dispatch
- **WHEN** the session aborts while POSTs are in flight
- **THEN** in-flight requests are cancelled and `embedBatch` stops scheduling remaining slices

#### Scenario: Abort during backoff
- **WHEN** the session aborts while the transport is waiting out a `Retry-After` delay
- **THEN** the wait is interrupted immediately rather than running to completion

### Requirement: Per-slice error isolation

A failure of one concurrent slice (terminal 4xx, malformed body, or transport failure after retries) SHALL NOT discard results from sibling slices. Failed texts SHALL map to `null` entries at their input indices; the returned array SHALL remain full length so the caller can count errors and retry individually.

#### Scenario: One slice fails, others succeed
- **WHEN** one of several concurrent slices returns a terminal error and the rest succeed
- **THEN** the failed slice's texts yield `null` and the successful slices' embeddings are returned at their correct indices
