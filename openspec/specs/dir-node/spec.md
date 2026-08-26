# dir-node Specification

## Purpose

Index a searchable L0 summary per directory that contains indexed files, so
hybrid query can return a folder (`kind: dir`) as well as files. Extractive L0
by default (including named-child expansion of `Ext` files and `Forms` dirs);
optional contract files under `.qmd/l0/`; 1C sibling xml peek for
Name/ru Synonym without indexing the xml.

## Requirements

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

Unless a contract file applies, the dir-node body SHALL be extractive L0: directory path, optional path context, optional 1C xml peek, **named-child expansion** when applicable, child directory names, and child indexed-file basenames with first markdown `#` heading when present. The text SHALL NOT include LLM-invented sentences. The body SHALL be at most 500 characters. When the budget is exceeded, the system SHALL omit whole names or trailing lines and indicate overflow with `+N more`; it SHALL NOT cut a name mid-token with a character slice. After xml peek, named-child expansion lines SHALL appear before leftover direct child listings. Up to 32 leftover **direct** child dir or file names MAY be listed; that 32 SHALL NOT count names on `Ext:` / `Forms:` expansion lines.

#### Scenario: Markdown folder L0 lists children and headings

- **WHEN** extractive L0 is built for a directory of markdown files with H1 headings and no child dirs named `Ext` or `Forms`
- **THEN** the L0 contains the directory path and at least one `basename — heading` line copied from a child file, and does not contain `Ext:` or `Forms:` expansion lines

#### Scenario: Cap at 32 leftover children

- **WHEN** a directory has more than 32 direct indexed-file or child-dir names to list after expansion lines
- **THEN** L0 lists at most 32 of those leftover names and includes a `+N more` marker

#### Scenario: 500 chars drops whole names

- **WHEN** extractive L0 would exceed 500 characters
- **THEN** the stored body is at most 500 characters, ends with `+N more` or a complete name, and does not contain a mid-name `...` cut from a character slice

### Requirement: Named-child expansion

When a directory has a direct child directory named exactly `Ext`, extractive L0 SHALL include a line listing indexed-file basenames under that `Ext` folder (comma-separated, `Ext: …`). When it has a direct child directory named exactly `Forms`, extractive L0 SHALL include a line listing **child directory names** under that `Forms` folder (comma-separated, `Forms: …`), without peeking per-form xml. Names SHALL come from indexed file paths (same source as other extractive children), not a filesystem walk of unindexed files. Missing `Ext` or `Forms` SHALL omit that line. The system SHALL NOT expand `Commands`, `Templates`, or any other child directory name in this way.

#### Scenario: 1C object lists Ext files and Forms dirs

- **WHEN** extractive L0 is built for `conf/Documents/ЗаказПокупателя` with indexed `Ext/ManagerModule.bsl` and `Forms/ФормаДокумента/…` files
- **THEN** L0 contains `Ext: ManagerModule.bsl` (and other Ext file basenames) and `Forms: ФормаДокумента` (and other Forms directory names)

#### Scenario: Markdown tree without Ext/Forms is unchanged

- **WHEN** extractive L0 is built for `docs/ai` with no child dir named `Ext` or `Forms`
- **THEN** L0 has no `Ext:` or `Forms:` expansion line

#### Scenario: No form xml peek

- **WHEN** `Forms/ФормаДокумента.xml` exists beside a form directory
- **THEN** the `Forms:` line uses the directory name only (does not require `Name` / ru `Synonym` from that xml)

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

### Requirement: MCP query path filter

MCP `query` SHALL accept an optional `path` argument: an array of collection-relative path prefixes. When one or more prefixes are set, FTS and vector retrieval SHALL restrict hits using the same prefix match as CLI `--path` (OR across prefixes; leading `/` stripped; trailing `/` preserved). When `path` is omitted or empty, no path predicate SHALL be applied. The server SHALL NOT append a trailing slash to prefixes.

#### Scenario: Path plus kind file scopes to folder files

- **WHEN** MCP `query` is called with `path` `["docs/ai/"]` and `kind` `file`
- **THEN** every hit has `kind` `file` and a collection-relative path that starts with `docs/ai/`

#### Scenario: Omit path does not constrain prefix

- **WHEN** MCP `query` is called without `path`
- **THEN** hits are not filtered by a path prefix (other filters may still apply)

### Requirement: REST query path and kind filter

HTTP `POST /query` (and alias `POST /search`) SHALL accept optional JSON fields `path` (array of collection-relative prefixes) and `kind` (`file` or `dir`). When set, retrieval SHALL use the same prefix and kind predicates as MCP `query` (OR prefixes; leading `/` stripped; trailing `/` preserved; no auto-slash). When `path` is omitted or empty, no path predicate SHALL apply. When `kind` is omitted, both document kinds remain eligible (subject to `QMD_DIR_NODES=0`). A `path` value that is present but not an array, or a `kind` other than `file` or `dir`, SHALL fail with HTTP 400 and SHALL NOT run search. Each result object SHALL include `kind`. For `kind` `dir`, the result `file` field SHALL end with `/`.

#### Scenario: Path plus kind file scopes REST hits

- **WHEN** `POST /query` is called with `path` `["meetings/"]` and `kind` `file`
- **THEN** every result has `kind` `file` and a `file` value that includes `meetings/`

#### Scenario: Invalid kind is HTTP 400

- **WHEN** `POST /query` is called with `kind` `both`
- **THEN** the response status is 400 and no search runs

#### Scenario: Dir hit exposes kind

- **WHEN** REST search returns a dir-node
- **THEN** that result has `kind` `dir` and `file` ends with `/`

### Requirement: Agent drill is a documented recipe

The packaged QMD skill and operator docs SHALL describe **agent drill** as two existing calls: `get` the dir-node L0, then `query` with `path` equal to that directory plus a trailing `/` and typically `kind` `file`. The system SHALL NOT add a `drill` command, MCP `ls` tool, or extra `get` fields for this change.

#### Scenario: Skill states trailing slash

- **WHEN** an agent follows the packaged skill after a dir hit
- **THEN** the instructed path prefix ends with `/` so sibling path names are not matched by prefix

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
