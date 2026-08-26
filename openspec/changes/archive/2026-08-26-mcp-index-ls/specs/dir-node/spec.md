## MODIFIED Requirements

### Requirement: Agent drill is a documented recipe

The packaged QMD skill and operator docs SHALL describe **agent drill** as two existing **search** calls: `get` the dir-node L0, then `query` with `path` equal to that directory plus a trailing `/` and typically `kind` `file`. The system SHALL NOT add a `drill` command or extra `get` fields for drill. MCP **index ls** MAY exist as a separate browse tool; docs SHALL NOT present `ls` as a substitute for that query recipe. The server SHALL NOT append a trailing slash to query path prefixes.

#### Scenario: Skill states trailing slash

- **WHEN** an agent follows the packaged skill after a dir hit
- **THEN** the instructed path prefix ends with `/` so sibling path names are not matched by prefix

#### Scenario: Skill separates ls from drill

- **WHEN** an agent reads the packaged skill
- **THEN** `ls` is described as one-level index browse, not as the way to search inside a folder
