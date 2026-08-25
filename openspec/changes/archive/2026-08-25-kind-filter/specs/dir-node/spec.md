## MODIFIED Requirements

### Requirement: Dir-nodes participate in hybrid search

Active dir-nodes SHALL be eligible for FTS and vector search using their L0 content, after the user has embedded pending hashes. Hybrid `query` results SHALL include `kind` `file` or `dir`. A `get` (CLI/MCP) for a dir-node path SHALL return the L0 body.

Callers MAY pass a **kind filter** of exactly `file` or `dir`. When set, FTS and vector retrieval SHALL exclude the other document kind **before** RRF fusion. When omitted, both kinds remain eligible (subject to `QMD_DIR_NODES=0`). Invalid kind values SHALL be rejected with an error. The filter SHALL apply to CLI `search`, `vsearch`, and `query`, and to MCP `query`. It SHALL NOT apply to `get`, `ls`, or `links`.

When `QMD_DIR_NODES` is `0`, dir hits SHALL be omitted even if the kind filter is `dir` (empty dir result).

#### Scenario: Query can return a directory

- **WHEN** a dir-node L0 contains `Заказ покупателя` and that content is indexed (and embedded if the query uses vec)
- **THEN** `qmd query` MAY return a hit with `path` `conf/Documents/ЗаказПокупателя` and `kind` `dir`

#### Scenario: Get dir L0

- **WHEN** the user gets document path `docs/ai` and a dir-node exists
- **THEN** the body is the stored L0 text

#### Scenario: Kind filter dir only

- **WHEN** the caller searches with kind `dir`
- **THEN** every hit has `kind` `dir` and no `kind` `file` hit is returned

#### Scenario: Kind filter file only

- **WHEN** the caller searches with kind `file`
- **THEN** every hit has `kind` `file` and no `kind` `dir` hit is returned

#### Scenario: Omit kind keeps mix

- **WHEN** the caller omits the kind filter and `QMD_DIR_NODES` is not `0`
- **THEN** hits MAY include both `file` and `dir`

#### Scenario: Kill switch beats kind dir

- **WHEN** `QMD_DIR_NODES=0` and the kind filter is `dir`
- **THEN** the result list contains no dir hits

#### Scenario: Invalid kind is an error

- **WHEN** the caller passes a kind other than `file` or `dir`
- **THEN** the command or MCP tool fails with an error (does not silently mix)
