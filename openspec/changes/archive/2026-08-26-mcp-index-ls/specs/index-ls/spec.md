## ADDED Requirements

### Requirement: MCP ls lists collections or one indexed level

MCP SHALL expose a read-only tool `ls` with an optional string argument `path`. When `path` is omitted or empty, the tool SHALL list indexed collections (name and active document count). When `path` is `qmd://collection[/rel]` or `collection[/rel]`, the tool SHALL list **direct** indexed children of that directory: indexed files whose path is exactly one segment under the prefix, and child directory names implied by deeper indexed file paths. Listing SHALL NOT walk the filesystem. Listing SHALL NOT recurse. The tool SHALL NOT implement resource `list()` on `qmd://`.

#### Scenario: Omit path lists collections

- **WHEN** MCP `ls` is called without `path`
- **THEN** the result includes collection names from the index config (not a file listing)

#### Scenario: One level under a folder

- **WHEN** MCP `ls` is called with path `docs/ai` (or `qmd://docs/ai`) in a collection that has `docs/ai/one.md` and `docs/ai/sub/two.md`
- **THEN** the listing includes a file `one.md` and a dir `sub`, and does not include `two.md`

#### Scenario: Unknown collection is an error

- **WHEN** MCP `ls` is called with path `no-such-collection/`
- **THEN** the tool fails with an error (does not return an empty fake tree)

### Requirement: MCP ls caps children at 200

When listing children of a directory, the tool SHALL return at most 200 entries. If more exist, the response SHALL indicate truncation and how many names were omitted. Collection listing SHALL NOT use this cap.

#### Scenario: Overflow is truncated

- **WHEN** a directory has more than 200 direct indexed children
- **THEN** at most 200 children are listed and the payload reports the remainder
