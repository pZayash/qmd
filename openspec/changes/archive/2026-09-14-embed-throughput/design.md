## Context

See [proposal.md](proposal.md) for why. Transport concurrency already lives in
`OpenRouterEmbedding.embedBatch` ([openspec/specs/parallel-embedding/spec.md](../../specs/parallel-embedding/spec.md)).
The gap is `generateEmbeddings` in `src/store.ts`: it slices work to
`llm.preferredEmbedBatchSize` (one HTTP embed slice), freezes `embedded_at` at
run start, inserts with auto-commit per chunk, and the CLI only paints `\r`
progress when stderr is a TTY.

Terms: [CONTEXT.md](../../../CONTEXT.md) — **HTTP embed slice**, **store embed
step**, **embed session timeout**.

## Goals / Non-Goals

**Goals:**
- Size each store embed step so OpenRouter `embedBatch` sees `concurrency` slices when enough chunks exist.
- Commit each step's successful vectors in one SQLite transaction.
- Stamp `embedded_at` at insert; emit parseable newline logs from `generateEmbeddings` (not only the CLI).
- Honest `docsProcessed` for partial runs.

**Non-Goals:**
- No change to OpenRouter worker-pool / 429 backoff algorithms (already specified).
- No overlapping the next HTTP step with the current SQLite transaction (embed v2 pipeline).
- No product default change to 30-minute embed session timeout.
- No MCP query backpressure, session TTL, or HTTP auth.

## Decisions

### D1: Expose `preferredEmbedConcurrency` on `LLM`

Add optional `readonly preferredEmbedConcurrency?: number` next to
`preferredEmbedBatchSize` in `src/llm.ts`. `OpenRouterEmbedding` returns its
parsed concurrency field. `LlamaCpp` omits it (store treats missing as `1`).

Store step size:

```
step = (preferredEmbedBatchSize ?? 32) * (preferredEmbedConcurrency ?? 1)
```

Then `embedBatch(texts.slice(i, i + step))` as today, with a larger `step`.

- **Why:** Keeps D1 from parallel-embedding (pool stays in the transport). Store
  does not fire parallel `embedBatch` calls (unsafe for llama).
- **Rejected:** Parallel `embedBatch` from the store — would parallelize llama.
- **Rejected:** Changing `preferredEmbedBatchSize` on OpenRouter to
  `64 * concurrency` — overloads “batch size” and breaks the HTTP 64-input cap
  inside the transport.

### D2: Transaction wrapper around existing `insertEmbedding`

Add `insertEmbeddingBatch(db, rows)` using `db.transaction`, each row calling
current `insertEmbedding` (content_vectors → vec0 DELETE/INSERT → quant). Do
not rewrite per-row SQL. Tests that call `insertEmbedding` stay valid.

- **Why:** Same crash-safe ordering as today; requantize already uses this
  pattern (`writeBatch` in `store.ts`).
- **Rejected:** One giant transaction for the whole run — abort/timeout would
  roll back tens of minutes of work.

### D3: Logs from `generateEmbeddings`, not only CLI

`console.error` lines prefixed `[qmd embed]`. Start / per-step / end. CLI TTY
`\r` bar in `src/cli/qmd.ts` can stay. Redirected nightly scripts capture
store lines via existing `:run_qmd` tee.

429 count: increment a counter on `OpenRouterEmbedding` during the existing
429 retry loop; expose `consumeRateLimitRetries(): number` (read-and-reset)
after each `embedBatch`. Llama returns 0.

- **Why:** `update-index.cmd` never has a TTY; `onProgress` today is
  TTY-gated in the CLI.
- **Rejected:** `QMD_EMBED_DEBUG=1` only — too noisy (URL per POST) and off by
  default.

### D4: `embedded_at` per insert inside the transaction

Pass `new Date().toISOString()` at each `insertEmbedding` call (or once per
row in the batch loop). Second resolution is enough to separate store steps;
chunks in the same UTC second MAY share a value.

- **Rejected:** One timestamp per transaction — hides intra-step duration and
  still collapses a whole step to one bucket (better than today, worse than
  per-row).

### D5: Stop reason derived from existing abort paths

Reuse current `session.isValid` breaks and the `>80%` error-rate abort. Map:
- loop finishes with session valid → `complete`
- `!session.isValid` or AbortError from embed → `session_timeout`
- error-rate warning path → `error_rate`

`EmbedResult` gains optional `stopReason` for tests; stderr end line always
prints it. `docsProcessed` = distinct hashes inserted this run (track a Set
on successful insert).

## Risks / Trade-offs

- **Large step + slow sqlite** → one `embedBatch` of 256 waits for all POSTs,
  then one transaction. Mitigation: logs split `api_ms` / `sqlite_ms`; v2 can
  pipeline later.
- **429 under real concurrency** → existing backoff; step log shows
  `http_429`. Do not auto-tune concurrency.
- **Stderr in unit tests** → prefix is greppable; fake LLM tests may spy
  `console.error`. Accept a few extra lines.
- **Host still 30 min** → code cannot fix `update-index.cmd`. Document env
  override; ops is out of repo.

## Migration Plan

- Default concurrency 1 → step size unchanged; behavior compatible except
  `embedded_at` uniqueness, `docsProcessed` on partial runs, and extra stderr.
- Deploy: `tsc` + restart MCP not required for CLI embed (embed is not the
  HTTP daemon). Nightly: set `QMD_EMBED_SESSION_MAX_DURATION_SEC=0` on the host
  after this ships.
- Rollback: revert the change; old indexes remain valid (`embedded_at` format
  unchanged).

## Open Questions

None. Ops timeout on SRVKPSR42 is a host checklist, not a spec fork.
