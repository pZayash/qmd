## ADDED Requirements

### Requirement: Query explain path-stack

When hybrid or structured `query` is called with `explain` set, each returned hit SHALL include `explain.pathStack`: an ordered list of POSIX ancestor directories of that hit that have an **active dir-node** in the same collection (`kind=dir`, `active=1`). The hit path itself SHALL NOT appear as an ancestor. Path segments with no active dir-node SHALL be omitted. An empty list SHALL be used when the hit has no such ancestors.

Each stack entry SHALL include:

- `path` — collection-relative directory path, no trailing slash
- `kind` — `dir`
- `inCandidates` — true if that dir-node is in the fused candidate list **after** dir RRF weight and **before** the `candidateLimit` slice
- `rrfRank` — 1-indexed rank in that fused list when `inCandidates` is true; omitted when false

The system SHALL NOT include `pathStack` when `explain` is unset or false. The system SHALL NOT change `get`. Path-stack SHALL NOT apply to `search` or `vsearch`.

#### Scenario: File hit lists ancestor dir-nodes

- **WHEN** `query` with `explain` returns a file at `docs/ai/one.md` and active dir-nodes exist for `docs` and `docs/ai`
- **THEN** that hit's `pathStack` contains `docs` then `docs/ai`, each with `kind: dir`

#### Scenario: Dir hit lists parents only

- **WHEN** `query` with `explain` returns a dir-node at `docs/ai` and an active dir-node exists for `docs`
- **THEN** that hit's `pathStack` contains `docs` and does not contain `docs/ai`

#### Scenario: Missing dir-node is omitted

- **WHEN** a hit path has an intermediate directory with no active dir-node
- **THEN** that directory does not appear in `pathStack`

#### Scenario: inCandidates uses post-weight fused list

- **WHEN** an ancestor dir-node is in the fused list after dir RRF weight and before `candidateLimit`
- **THEN** its stack entry has `inCandidates: true` and `rrfRank` equal to its 1-indexed rank in that list

#### Scenario: Ancestor not in fused list

- **WHEN** an ancestor dir-node exists but is not in that fused list
- **THEN** its stack entry has `inCandidates: false` and no `rrfRank`

### Requirement: Query explain dir weight on dir hits

When hybrid or structured `query` is called with `explain` set, each returned **dir** hit SHALL include `explain.dirWeight` and `explain.scoreAfterDirWeight`. `dirWeight` SHALL be the multiplier actually applied: `1` when the kind filter is `file` or `dir`; otherwise the resolved `QMD_DIR_RRF_WEIGHT`. `scoreAfterDirWeight` SHALL be that hit's fused score after `applyDirRrfWeight`. File hits SHALL omit both fields. The system SHALL NOT include these fields when `explain` is unset or false.

#### Scenario: Mix dir hit reports applied weight

- **WHEN** mix `query` with `explain` returns a dir-node and `QMD_DIR_RRF_WEIGHT` is `0.5`
- **THEN** that hit's explain has `dirWeight` `0.5` and `scoreAfterDirWeight` equal to the fused dir score after the multiplier

#### Scenario: Kind dir reports identity weight

- **WHEN** `query` with kind `dir` and `explain` returns a dir-node
- **THEN** that hit's explain has `dirWeight` `1`

### Requirement: Explain surfaces

`qmd query --explain` SHALL print path-stack (and dir-weight lines on dir hits) in TTY output and SHALL include the same fields under each result's `explain` object in `--json`. MCP `query` SHALL accept optional `explain` (default false) and, when true, SHALL include `explain` on each structured result. REST `POST /query` SHALL accept optional `explain` the same way.

#### Scenario: MCP explain omitted keeps payload small

- **WHEN** MCP `query` is called without `explain`
- **THEN** structured results do not include an `explain` object
