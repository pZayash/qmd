## ADDED Requirements

### Requirement: Doc anchors index

The system SHALL build and persist a `doc anchors` index mapping each active
document to its resolvable in-document targets `{slug, kind, ord}`. In v1 the
only source SHALL be markdown headings (ATX `#`..`######` and the existing
`*`-prefixed title form); `kind` SHALL be `heading`. Anchors SHALL be rebuilt
for a document when its content hash changes (same trigger as link refs) and
SHALL be populated for unchanged documents during the backfill/disk pass so that
no full re-index or re-embed is required. The AST `extractSymbols` path SHALL NOT
be used as an anchor source in v1.

#### Scenario: Headings indexed as anchors
- **WHEN** a document body contains headings `## ПроцА` and `## ПроцБ`
- **THEN** two `doc anchors` rows of kind `heading` are stored for that document with slugs for `ПроцА` and `ПроцБ`

#### Scenario: Anchors rebuilt on content change
- **WHEN** a document's content hash changes between reindexes
- **THEN** its `doc anchors` rows are rebuilt from the new body

#### Scenario: Anchors backfilled without re-embed
- **WHEN** the backfill/disk pass runs over a document whose hash is unchanged and which has no `doc anchors` rows yet
- **THEN** its anchors are extracted and stored without re-embedding the document

#### Scenario: Code symbols not indexed in v1
- **WHEN** a `.bsl` document defines procedures but contains no markdown headings
- **THEN** no `doc anchors` rows are produced (AST symbols are out of scope for v1)

### Requirement: Anchor slug normalization

The system SHALL normalize both a heading's text and a link's `#anchor` text to a
shared `anchor slug` using one function so they match. Normalization SHALL: trim
surrounding whitespace; strip leading `#` and markdown heading markers; lowercase
using Unicode-aware case folding (preserving Cyrillic and other non-ASCII
letters, no transliteration or ASCII-folding); and collapse internal whitespace
runs to a single `-`. When one document yields duplicate slugs, the rows SHALL be
kept distinct by source order (`ord`) and anchor resolution SHALL select the
lowest `ord`.

#### Scenario: Cyrillic heading slug preserved
- **WHEN** the heading `## При Записи` is normalized
- **THEN** the slug is `при-записи` (lowercased, spaces collapsed to `-`, Cyrillic preserved)

#### Scenario: Anchor and heading match case-insensitively
- **WHEN** a link `[[Doc#ПриЗаписи]]` targets a document whose heading is `## приЗаписи`
- **THEN** both normalize to the same slug and the anchor resolves

#### Scenario: Duplicate slug resolves to first
- **WHEN** a document has two headings normalizing to the same slug
- **THEN** the rows are stored with distinct `ord` and an anchor link resolves to the lowest `ord`

### Requirement: Anchor-granular links query

The system SHALL extend the links read surface so a target of the form
`Doc#anchor` returns symbol/section-granular edges: backlinks SHALL return edges
whose `(dst_doc_id, anchor slug)` matches the requested document and anchor (the
"called by" view), and out-links SHALL return edges authored within that anchor's
heading span in the source document (the "calls" view). A target with no `#`
SHALL behave exactly as the existing document-level links query. The `--dangling`
listing SHALL include anchor-dangling edges alongside doc-level dangling edges.

#### Scenario: Anchor backlinks ("called by")
- **WHEN** the user runs `qmd links "Module#ПроцB"` and two documents link to `[[Module#ПроцB]]`
- **THEN** both source edges are returned as backlinks of that anchor

#### Scenario: Anchor out-links ("calls")
- **WHEN** the user runs `qmd links "Module#ПроцA"` and the body under heading `ПроцA` links `[[Other#ПроцX]]`
- **THEN** the edge to `Other#ПроцX` is returned as an out-link of `Module#ПроцA`

#### Scenario: Doc-level query unchanged
- **WHEN** the user runs `qmd links Module` with no anchor
- **THEN** document-level out-links, backlinks, and dangling edges are returned as before

#### Scenario: Anchor-dangling listed
- **WHEN** the user runs `qmd links --dangling` and an edge resolved its document but not its anchor
- **THEN** that anchor-dangling edge appears in the dangling listing, distinguished from doc-level dangling

### Requirement: Additive anchor schema and migration

The system SHALL create the `doc_anchors` table and its lookup index, and add a
nullable `anchor` column to `doc_edges`, using additive `IF NOT EXISTS` /
nullable-column migration so existing databases open without error. No
destructive migration SHALL be performed; anchors remain empty until the next
reindex or backfill populates them, and the system SHALL NOT auto-run
`qmd update`.

#### Scenario: Existing database upgraded safely
- **WHEN** an existing index database is opened after this change
- **THEN** the `doc_anchors` table and `doc_edges.anchor` column are created without error and contain no rows/values until a reindex or backfill runs

#### Scenario: Anchor query before backfill
- **WHEN** the user runs `qmd links "Doc#anchor"` on a database whose anchors are not yet populated
- **THEN** the command reports no anchor edges rather than failing
