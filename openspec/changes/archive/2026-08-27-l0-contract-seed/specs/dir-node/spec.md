## ADDED Requirements

### Requirement: Contract seed CLI writes missing L0 files

The system SHALL provide CLI `qmd l0 seed` that writes extractive L0 text to `{collectionRoot}/.qmd/l0/{dirRelPath}.md` for dir-nodes (directories that have at least one active indexed file). The command SHALL NOT run as part of `qmd update`. The command SHALL NOT be an MCP tool.

A single positional path SHALL seed exactly one dir-node. Path shape SHALL match `qmd ls`: `qmd://collection/rel` or `collection/rel`. When `-c` is set, the positional path SHALL be collection-relative. `--all` SHALL seed every dir-node in one collection and SHALL require a collection (`-c` or a positional collection name with no dir). `--all` combined with a directory path SHALL fail. Omitting both a directory path and `--all` SHALL fail.

If the target file already exists and is non-empty, the command SHALL skip that file and SHALL NOT overwrite it. Missing or empty files SHALL be written. Parent directories under `.qmd/l0/` SHALL be created as needed.

If the collection’s effective `l0_source` is `n`, the command SHALL still write and SHALL emit a stderr warning that `qmd update` ignores contracts until `l0_source` is `p`. Unknown collection or a path that is not a dir-node SHALL fail with a non-zero exit. The command SHALL NOT invoke `qmd update` or `qmd embed`.

#### Scenario: Seed one missing dir

- **WHEN** `qmd l0 seed qmd://docs/docs/ai` runs and `.qmd/l0/docs/ai.md` does not exist and `docs/ai` is a dir-node
- **THEN** that file is created with extractive L0 text and the command exits 0

#### Scenario: Existing contract is skipped

- **WHEN** `.qmd/l0/docs/ai.md` already contains user text
- **THEN** `qmd l0 seed` for that dir does not change the file

#### Scenario: n warns but writes

- **WHEN** the collection `l0_source` is `n` and the contract file is missing
- **THEN** the file is written and stderr mentions that update ignores contracts until `p`

#### Scenario: Unknown dir is an error

- **WHEN** `qmd l0 seed` is given a path that has no indexed files under it
- **THEN** the command exits non-zero and writes no contract file
