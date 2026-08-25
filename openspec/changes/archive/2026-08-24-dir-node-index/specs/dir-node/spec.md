## ADDED Requirements

### Requirement: Dir-node exists for directories with indexed files

The system SHALL persist one dir-node per collection-relative directory that contains at least one active indexed file (`kind=file`). The dir-node SHALL use `kind=dir` and `path` equal to that directory path without a trailing slash. Directories with no remaining active files SHALL NOT keep an active dir-node.

#### Scenario: Directory with files gets a dir-node

- **WHEN** `qmd update` indexes `docs/ai/qmd-search.md` and other files under `docs/ai/`
- **THEN** an active document exists with `collection` of that collection, `path` `docs/ai`, and `kind` `dir`

#### Scenario: Empty directory has no dir-node

- **WHEN** a directory under the collection root has no active indexed files
- **THEN** no active `kind=dir` row exists for that path

#### Scenario: Last file removed deactivates dir-node

- **WHEN** the last active file under `docs/ai/` is deactivated
- **THEN** the dir-node `docs/ai` is deactivated

### Requirement: Extractive L0 text

Unless a contract file applies, the dir-node body SHALL be extractive L0: directory path, optional path context, optional 1C xml peek, child directory names, and up to 32 child indexed-file basenames with first markdown `#` heading when present. The text SHALL NOT include LLM-invented sentences. Overflow SHALL be indicated with `+N more`.

#### Scenario: Markdown folder L0 lists children and headings

- **WHEN** extractive L0 is built for a directory of markdown files with H1 headings
- **THEN** the L0 contains the directory path and at least one `basename — heading` line copied from a child file

#### Scenario: Cap at 32 children

- **WHEN** a directory has more than 32 direct indexed-file or child-dir names to list
- **THEN** L0 lists at most 32 names and includes a `+N more` marker

### Requirement: 1C xml synonym peek

When building extractive L0 for directory `{parent}/{name}`, if `{parent}/{name}.xml` exists, the system SHALL read `Name` and the Russian `Synonym` from that file and include them in L0. The peek SHALL read the first 64KiB prefix even when the file is larger (1C metadata xml is typically hundreds of KiB; Name/Synonym live in the header). The xml file SHALL NOT be inserted as a `kind=file` document solely because of this peek. Parse or I/O failure SHALL skip the peek without failing the whole update.

#### Scenario: ЗаказПокупателя synonym in L0

- **WHEN** `conf/Documents/ЗаказПокупателя/` has indexed `.bsl` children and sibling `ЗаказПокупателя.xml` contains Name `ЗаказПокупателя` and ru Synonym `Заказ покупателя`
- **THEN** that dir-node L0 contains `ЗаказПокупателя` and `Заказ покупателя`

#### Scenario: Large xml still peeks header

- **WHEN** the sibling xml is larger than 64KiB and Name/Synonym appear in the first 64KiB
- **THEN** peek still returns those fields (file is not skipped for size)

#### Scenario: Xml is not a document

- **WHEN** update runs with mask `**/*.{md,bsl}` and peeks `ЗаказПокупателя.xml`
- **THEN** no active `kind=file` document has path ending in `ЗаказПокупателя.xml`

### Requirement: L0 source modes n and p

The system SHALL read `l0_source` (`n` | `p` | `q`) from collection config (collection overrides global `models.l0Source`; default `n`). Mode `n` SHALL always use extractive L0. Mode `p` SHALL use `{collectionRoot}/.qmd/l0/{dirRelPath}.md` when that file exists and is non-empty; otherwise extractive L0. Mode `q` SHALL behave like `p` for contract files and otherwise extractive L0, and SHALL emit a stderr notice that API generate is not implemented. Invalid values SHALL coerce to `n` with a stderr warning.

#### Scenario: Default extractive

- **WHEN** `l0_source` is unset
- **THEN** dir-node body is extractive L0

#### Scenario: Contract overrides extractive

- **WHEN** `l0_source` is `p` and `.qmd/l0/docs/ai.md` contains user text
- **THEN** the dir-node for `docs/ai` uses that file’s contents as L0 (not inventing extra prose)

#### Scenario: q falls back

- **WHEN** `l0_source` is `q` and no contract file exists
- **THEN** L0 is extractive and stderr mentions that generate is unimplemented

### Requirement: Dir-nodes participate in hybrid search

Active dir-nodes SHALL be eligible for FTS and vector search using their L0 content, after the user has embedded pending hashes. Hybrid `query` results SHALL include `kind` `file` or `dir`. A `get` (CLI/MCP) for a dir-node path SHALL return the L0 body.

#### Scenario: Query can return a directory

- **WHEN** a dir-node L0 contains `Заказ покупателя` and that content is indexed (and embedded if the query uses vec)
- **THEN** `qmd query` MAY return a hit with `path` `conf/Documents/ЗаказПокупателя` and `kind` `dir`

#### Scenario: Get dir L0

- **WHEN** the user gets document path `docs/ai` and a dir-node exists
- **THEN** the body is the stored L0 text

### Requirement: Partial update rebuilds ancestor dir-nodes

`qmd update --files` SHALL rebuild dir-nodes for ancestors of each successfully indexed or deactivated file path in that collection, without deactivating unrelated dir-nodes.

#### Scenario: File change updates parent L0

- **WHEN** `--files docs/ai/qmd-search.md` reindexes that file
- **THEN** dir-node `docs/ai` is rebuilt from the current child set

#### Scenario: Unrelated dirs untouched

- **WHEN** `--files` lists only `memory/foo.md`
- **THEN** dir-node `docs/ai` remains active if it still has files

### Requirement: Emergency disable

When environment variable `QMD_DIR_NODES` is `0`, hybrid query SHALL omit `kind=dir` hits. Indexing dir-nodes MAY still run; the flag only affects retrieval.

#### Scenario: Flag hides dir hits

- **WHEN** `QMD_DIR_NODES=0` and dir-nodes exist in the index
- **THEN** query results contain only `kind=file` hits
