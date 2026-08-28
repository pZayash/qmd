## ADDED Requirements

### Requirement: Dir RRF weight on mix query

When hybrid or structured `query` omits the kind filter, after reciprocal-rank fusion and before slicing to `candidateLimit`, the system SHALL multiply each fused `kind: dir` score by the dir RRF weight and re-sort by that score descending. File scores SHALL NOT be multiplied. When the kind filter is `dir` or `file`, the system SHALL NOT apply this multiplier.

The weight SHALL come from environment variable `QMD_DIR_RRF_WEIGHT`. When unset or empty, the weight SHALL be `0.5`. A finite number in `[0, 1]` SHALL be used as the weight (`1` means no change). Any other value SHALL be treated as `0.5` and SHALL emit a stderr warning. The system SHALL NOT add a CLI flag or MCP/REST field for this weight. The multiplier SHALL NOT apply to `search` or `vsearch`.

#### Scenario: Mix demotes dirs before candidate slice

- **WHEN** `query` omits kind, fusion would rank a dir-node above a file, and `QMD_DIR_RRF_WEIGHT` is `0.5`
- **THEN** after the dir score is multiplied the file can outrank that dir before `candidateLimit` is applied

#### Scenario: Kind dir is unweighted

- **WHEN** `query` is called with kind `dir`
- **THEN** dir-node fused scores are not multiplied by the dir RRF weight

#### Scenario: Default weight is 0.5

- **WHEN** `QMD_DIR_RRF_WEIGHT` is unset
- **THEN** mix `query` uses weight `0.5`

#### Scenario: 1.0 is identity

- **WHEN** `QMD_DIR_RRF_WEIGHT` is `1`
- **THEN** mix `query` fused order matches fusion without a dir multiplier

#### Scenario: Invalid env falls back

- **WHEN** `QMD_DIR_RRF_WEIGHT` is `2` or `nope`
- **THEN** mix `query` uses `0.5` and stderr mentions the invalid value

#### Scenario: Search is unchanged

- **WHEN** `qmd search` runs a mix keyword query
- **THEN** BM25 ranking does not multiply dir scores by `QMD_DIR_RRF_WEIGHT`
