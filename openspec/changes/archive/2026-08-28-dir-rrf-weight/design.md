## Context

RRF (`reciprocalRankFusion`) fuses FTS/vec lists with per-**list** weights (first two lists ×2). `RankedResult.kind` is already set. Mix `query` (omit `--kind`) treats file and dir scores equally, so КПСР dir-nodes crowd `candidateLimit` (`-C`, default 40) and the top.

Kind filter is SQL before fusion. This change is ranking in mix only.

## Goals / Non-Goals

**Goals:**

- After fusion, before `fused.slice(0, candidateLimit)`, scale `kind: dir` scores when kind filter is omitted.
- Env `QMD_DIR_RRF_WEIGHT`, default `0.5`, clamp `[0, 1]`.
- Same helper in `hybridQuery` and `structuredSearch`.
- `--kind dir` / `--kind file`: no scale (file: no dirs; dir: unweighted).

**Non-Goals:**

- `search` / `vsearch` score scaling.
- CLI/MCP/YAML knobs.
- Changing list weights, k=60, or top-rank bonus.
- Post-rerank blend formula (position `1/rank` stays; order into rerank changes).
- Index rebuild / embed.

## Decisions

### D1: Scale fused scores, then re-sort

Do not put kind into `reciprocalRankFusion` list weights (those are FTS vs vec). Map fused rows: `kind === "dir"` → `score * w`, then sort descending. Files unchanged. Missing `kind` treat as `file` (same as the rest of query).

- **Rejected:** Separate dir/file RRF lists then interleave — two fusion policies, worse `--explain`.
- **Rejected:** Scale only after rerank — dirs still fill `-C`.

### D2: Mix-only

`options.kind` set → return fused unchanged. `QMD_DIR_NODES=0` still drops dirs later; weight still runs in mix (dirs may occupy `-C` until that filter). Accept; kill switch is not this slice.

### D3: Env parse next to `dirNodesDisabled`

`resolveDirRrfWeight(): number` in `src/store.ts`: unset/empty → `0.5`. Finite number in `[0, 1]` → that value. Else `0.5` + `console.error` (invalid or out of range). `1` skips multiply (identity). No per-query override.

### D4: `--explain`

Traces stay list contributions (pre-weight). Displayed candidate **order** and post-slice `1/rank` follow weighted order. Do not require a new explain field this slice.

## Risks / Trade-offs

- **Default 0.5 too weak/strong** → env without code change; `1.0` restores old mix.
- **`w = 0`** → dirs sort last; may still enter `-C` if fewer than 40 files. Accept.
- **MCP pins old env** → document restart daemon (same as other `QMD_*`).
- **Reranker can still promote a dir** that made the slice → intended; weight only gates who is reranked.

## Migration Plan

Ship. No schema. User/daemon pick up env on process start. Rollback: `QMD_DIR_RRF_WEIGHT=1` or revert.

## Open Questions

None. Explore closed: mix-only, before `-C`, query only, env+clamp.
