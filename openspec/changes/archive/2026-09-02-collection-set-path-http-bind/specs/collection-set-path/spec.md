## ADDED Requirements

### Requirement: Remap collection root without re-embed

The system SHALL provide `qmd collection set-path <name> <new-root>` that
updates that collection's filesystem root in YAML config and in
`store_collections.path`. The command MUST NOT delete or rewrite `documents`
rows, FTS rows, or vector tables. Content hashes and collection-relative
document paths MUST stay unchanged.

#### Scenario: Path updated in YAML and SQLite

- **WHEN** collection `notes` exists with root `/old/notes` and the operator
  runs `qmd collection set-path notes /new/notes` and `/new/notes` exists
- **THEN** YAML `collections.notes.path` is `/new/notes` (resolved absolute)
  and `store_collections.path` for `notes` is the same value

#### Scenario: Documents and vectors preserved

- **WHEN** `set-path` succeeds on a collection that already has indexed
  documents and embeddings
- **THEN** the count of `documents` rows for that collection is unchanged and
  vector tables are not truncated or rebuilt

#### Scenario: Unknown collection fails

- **WHEN** the operator runs `set-path` with a name that is not in YAML
- **THEN** the process exits non-zero and neither YAML nor SQLite is modified

#### Scenario: Missing destination fails

- **WHEN** `<new-root>` does not exist on disk
- **THEN** the process exits non-zero and the collection path is left unchanged
