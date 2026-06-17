## MODIFIED Requirements

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
