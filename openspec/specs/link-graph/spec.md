# link-graph Specification

## Purpose
TBD - created by archiving change link-graph-foundation. Update Purpose after archive.
## Requirements
### Requirement: Link ref extraction

The system SHALL extract link refs from each document body during reindex and
store them content-addressed by content `hash`. Extraction SHALL run only when a
document's hash is new or changed (unchanged hashes reuse existing refs).
Recognized kinds: wikilink (`[[Note]]`, `[[Note#anchor]]`, `[[Note|alias]]`),
relative markdown link (`[text](./x.md)`, `[text](x.md#anchor)`), and embed
(`![[Note]]`, treated as a wikilink). External URLs (`http(s)://`),
reference-style links, and bare anchors (`#x`) SHALL NOT produce link refs.

#### Scenario: Wikilink extracted
- **WHEN** a document body contains `[[Setup Guide]]`
- **THEN** a link ref of kind `wikilink` with raw target `Setup Guide` is stored for that document's hash

#### Scenario: Wikilink with alias and anchor
- **WHEN** a document body contains `[[Setup Guide#install|how to install]]`
- **THEN** a link ref of kind `wikilink` is stored with raw target `Setup Guide` and anchor `install` (alias discarded)

#### Scenario: Relative markdown link extracted
- **WHEN** a document body contains `[install](./guide.md#step-1)`
- **THEN** a link ref of kind `mdlink` is stored with raw target `./guide.md` and anchor `step-1`

#### Scenario: Embed aliased to wikilink
- **WHEN** a document body contains `![[Diagram]]`
- **THEN** a link ref of kind `wikilink` with raw target `Diagram` is stored

#### Scenario: External and anchor-only links ignored
- **WHEN** a document body contains `[site](https://example.com)` and `[top](#intro)`
- **THEN** no link ref is stored for either

#### Scenario: Unchanged hash reuses refs
- **WHEN** reindex processes a document whose content hash is unchanged
- **THEN** the extractor is not re-run and existing link refs for that hash are retained

### Requirement: Doc edge resolution

After the reindex document loop, the system SHALL run a resolve pass that maps
every link ref of each active document to a directed doc edge `src → dst` within
the same collection. Resolution domain is within-collection only. Wikilink
resolution SHALL match by document title or filename basename using the
tie-break: exact name match first, then shortest collection-relative path,
otherwise dangling. Relative markdown links SHALL resolve against the path
relative to the source document. The resolve pass SHALL rebuild all doc edges
for the collection on every reindex (no hash caching of resolved edges).

When a link ref carries an `anchor`, the resolve pass SHALL additionally attempt
to match it against the destination document's `doc anchors` (see the
`symbol-anchor-links` capability) using the shared anchor-slug normalization, and
SHALL record the matched slug on the doc edge. A link ref with no `anchor` SHALL
resolve exactly as before and store a NULL edge anchor. An `anchor` whose `dst`
document resolved but whose slug matches no `doc anchors` entry SHALL produce an
**anchor-dangling** edge (the doc edge keeps `dst_doc_id` and the raw anchor,
flagged unresolved-anchor), distinct from a doc-level dangling edge whose `dst`
itself is NULL.

#### Scenario: Wikilink resolves to a document
- **WHEN** `[[Setup Guide]]` is resolved and exactly one active document has title or basename `Setup Guide`
- **THEN** a doc edge `src → that document` of kind `wikilink` is created with a non-null `dst_doc_id` and a NULL anchor

#### Scenario: Ambiguous wikilink uses shortest path
- **WHEN** `[[setup]]` matches both `a/setup.md` and `a/b/setup.md`
- **THEN** the doc edge resolves to `a/setup.md` (shortest collection-relative path)

#### Scenario: Relative markdown link resolves
- **WHEN** source document `docs/intro.md` links `[g](./guide.md)` and `docs/guide.md` is active
- **THEN** a doc edge `docs/intro.md → docs/guide.md` of kind `mdlink` is created

#### Scenario: Unresolved target is dangling
- **WHEN** a link ref's target matches no active document in the collection
- **THEN** a doc edge with `dst_doc_id` NULL is created, preserving the `raw_target`

#### Scenario: Edges rebuilt after rename
- **WHEN** a document is renamed so a previously resolved target no longer exists
- **THEN** the next reindex's resolve pass marks the affected edge dangling

#### Scenario: Anchor resolves to a destination heading
- **WHEN** `[[Module#ПроцB]]` is resolved, `Module` resolves to an active document, and that document has a `doc anchors` slug matching `ПроцB`
- **THEN** the doc edge is created with a non-null `dst_doc_id` and the matched anchor slug recorded

#### Scenario: Unresolved anchor is anchor-dangling
- **WHEN** `[[Module#Missing]]` is resolved, `Module` resolves to an active document, but no `doc anchors` slug matches `Missing`
- **THEN** the doc edge keeps `dst_doc_id` set, records the raw anchor, and is flagged anchor-dangling

#### Scenario: Link without anchor unaffected
- **WHEN** a link ref has no `anchor`
- **THEN** the resolved doc edge stores a NULL anchor and resolution is identical to prior behavior

### Requirement: Link graph read API

The system SHALL expose three read functions over doc edges:
`getOutEdges(db, docId)` returning resolved and dangling edges where the document
is the source; `getBacklinks(db, docId)` returning edges where the document is
the destination (reverse lookup); and `getDanglingEdges(db, collection?)`
returning all edges with null `dst`, optionally scoped to one collection.
Backlinks SHALL be served by reverse query (no separate table), supported by an
index on `dst_doc_id`.

#### Scenario: Out edges include dangling
- **WHEN** `getOutEdges` is called for a document with one resolved and one dangling link
- **THEN** both edges are returned, the dangling one with null destination

#### Scenario: Backlinks returned
- **WHEN** documents `index.md` and `readme.md` both link to `setup.md`
- **THEN** `getBacklinks` for `setup.md` returns edges from both `index.md` and `readme.md`

#### Scenario: Dangling scoped to collection
- **WHEN** `getDanglingEdges` is called with a collection name
- **THEN** only dangling edges from that collection are returned

### Requirement: links CLI command

The system SHALL provide a `qmd links <doc>` command that prints out-links,
backlinks, and dangling edges for the given document, where `<doc>` is a path or
docid (`#abc123`). The command SHALL support `--dangling` (list collection-wide
broken links instead of a single document), `-c/--collection` to scope, and
`--json` for machine-readable output.

#### Scenario: Links for a document
- **WHEN** the user runs `qmd links setup.md`
- **THEN** the command prints setup.md's out-links, backlinks, and dangling links

#### Scenario: Document by docid
- **WHEN** the user runs `qmd links #abc123`
- **THEN** the document is resolved by docid and its links are printed

#### Scenario: Collection-wide dangling
- **WHEN** the user runs `qmd links --dangling -c notes`
- **THEN** all dangling edges in the `notes` collection are listed

#### Scenario: JSON output
- **WHEN** the user runs `qmd links setup.md --json`
- **THEN** the edges are emitted as JSON

### Requirement: links MCP tool

The MCP server SHALL expose a `links` tool wrapping the three read functions so
agents can retrieve 1-hop out-links, backlinks, and dangling edges for a document.

#### Scenario: Agent fetches backlinks
- **WHEN** an MCP client calls the `links` tool for a document requesting backlinks
- **THEN** the tool returns the documents that link to it

### Requirement: Additive schema and migration

The system SHALL create tables `link_refs` and `doc_edges` and the index on
`doc_edges.dst_doc_id` using `IF NOT EXISTS`. No backfill migration is performed:
on existing databases the graph is empty until the next `qmd update` repopulates
it. The system SHALL NOT auto-run `qmd update`.

#### Scenario: Existing database upgraded safely
- **WHEN** an existing index database is opened after this change
- **THEN** the new tables are created without error and contain no edges until a reindex runs

#### Scenario: Links before reindex
- **WHEN** the user runs `qmd links <doc>` on a database not yet reindexed
- **THEN** the command reports no edges rather than failing

