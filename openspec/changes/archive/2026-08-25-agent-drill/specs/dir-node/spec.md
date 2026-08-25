## ADDED Requirements

### Requirement: MCP query path filter

MCP `query` SHALL accept an optional `path` argument: an array of collection-relative path prefixes. When one or more prefixes are set, FTS and vector retrieval SHALL restrict hits using the same prefix match as CLI `--path` (OR across prefixes; leading `/` stripped; trailing `/` preserved). When `path` is omitted or empty, no path predicate SHALL be applied. The server SHALL NOT append a trailing slash to prefixes.

#### Scenario: Path plus kind file scopes to folder files

- **WHEN** MCP `query` is called with `path` `["docs/ai/"]` and `kind` `file`
- **THEN** every hit has `kind` `file` and a collection-relative path that starts with `docs/ai/`

#### Scenario: Omit path does not constrain prefix

- **WHEN** MCP `query` is called without `path`
- **THEN** hits are not filtered by a path prefix (other filters may still apply)

### Requirement: Agent drill is a documented recipe

The packaged QMD skill and operator docs SHALL describe **agent drill** as two existing calls: `get` the dir-node L0, then `query` with `path` equal to that directory plus a trailing `/` and typically `kind` `file`. The system SHALL NOT add a `drill` command, MCP `ls` tool, or extra `get` fields for this change.

#### Scenario: Skill states trailing slash

- **WHEN** an agent follows the packaged skill after a dir hit
- **THEN** the instructed path prefix ends with `/` so sibling path names are not matched by prefix
