# dir-node Specification

## Purpose

Index a searchable L0 summary per directory that contains indexed files, so
hybrid query can return a folder (`kind: dir`) as well as files. Extractive L0
by default (including named-child expansion of `Ext` files and `Forms` /
`Commands` / `Templates` dirs);
optional contract files under `.qmd/l0/` (CLI `qmd l0 seed` writes missing
ones from extractive L0); 1C sibling xml peek for
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

Unless a contract file applies, the dir-node body SHALL be extractive L0: directory path, optional path context, optional 1C xml peek, **named-child expansion** when applicable, child directory names, and child indexed-file basenames with first markdown `#` heading when present. The text SHALL NOT include LLM-invented sentences. The body SHALL be at most 500 characters. When the budget is exceeded, the system SHALL omit whole names or trailing lines and indicate overflow with `+N more`; it SHALL NOT cut a name mid-token with a character slice. After xml peek, named-child expansion lines SHALL appear before leftover direct child listings. Up to 32 leftover **direct** child dir or file names MAY be listed; that 32 SHALL NOT count names on `Ext:` / `Forms:` / `Commands:` / `Templates:` expansion lines.

#### Scenario: Markdown folder L0 lists children and headings

- **WHEN** extractive L0 is built for a directory of markdown files with H1 headings and no child dirs named `Ext`, `Forms`, `Commands`, or `Templates`
- **THEN** the L0 contains the directory path and at least one `basename — heading` line copied from a child file, and does not contain `Ext:`, `Forms:`, `Commands:`, or `Templates:` expansion lines

#### Scenario: Cap at 32 leftover children

- **WHEN** a directory has more than 32 direct indexed-file or child-dir names to list after expansion lines
- **THEN** L0 lists at most 32 of those leftover names and includes a `+N more` marker

#### Scenario: 500 chars drops whole names

- **WHEN** extractive L0 would exceed 500 characters
- **THEN** the stored body is at most 500 characters, ends with `+N more` or a complete name, and does not contain a mid-name `...` cut from a character slice

### Requirement: Named-child expansion

When a directory has a direct child directory named exactly `Ext`, extractive L0 SHALL include a line listing indexed-file basenames under that `Ext` folder (comma-separated, `Ext: …`). When it has a direct child directory named exactly `Forms`, `Commands`, or `Templates`, extractive L0 SHALL include a line listing **child directory names** under that folder (comma-separated, `Forms: …` / `Commands: …` / `Templates: …`), without peeking per-child xml. Names SHALL come from indexed file paths (same source as other extractive children), not a filesystem walk of unindexed files. Missing named folders SHALL omit that line. After xml peek, expansion lines SHALL appear in this order when present: `Ext:`, `Forms:`, `Commands:`, `Templates:`. The system SHALL NOT expand any other child directory name in this way.

#### Scenario: 1C object lists Ext files and Forms dirs

- **WHEN** extractive L0 is built for `conf/Documents/ЗаказПокупателя` with indexed `Ext/ManagerModule.bsl` and `Forms/ФормаДокумента/…` files
- **THEN** L0 contains `Ext: ManagerModule.bsl` (and other Ext file basenames) and `Forms: ФормаДокумента` (and other Forms directory names)

#### Scenario: 1C object lists Commands and Templates dirs

- **WHEN** extractive L0 is built for an object dir with indexed `Commands/Провести/Ext/CommandModule.bsl` and `Templates/ПФ_MXL/…` files
- **THEN** L0 contains `Commands: Провести` and `Templates: ПФ_MXL` (and other child directory names under those folders)

#### Scenario: Markdown tree without named folders is unchanged

- **WHEN** extractive L0 is built for `docs/ai` with no child dir named `Ext`, `Forms`, `Commands`, or `Templates`
- **THEN** L0 has no `Ext:`, `Forms:`, `Commands:`, or `Templates:` expansion line

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

The packaged QMD skill and operator docs SHALL describe **agent drill** as two existing **search** calls: `get` the dir-node L0, then `query` with `path` equal to that directory plus a trailing `/` and typically `kind` `file`. The system SHALL NOT add a `drill` command or extra `get` fields for drill. MCP **index ls** MAY exist as a separate browse tool; docs SHALL NOT present `ls` as a substitute for that query recipe. The server SHALL NOT append a trailing slash to query path prefixes.

#### Scenario: Skill states trailing slash

- **WHEN** an agent follows the packaged skill after a dir hit
- **THEN** the instructed path prefix ends with `/` so sibling path names are not matched by prefix

#### Scenario: Skill separates ls from drill

- **WHEN** an agent reads the packaged skill
- **THEN** `ls` is described as one-level index browse, not as the way to search inside a folder

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
