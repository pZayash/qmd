## ADDED Requirements

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
