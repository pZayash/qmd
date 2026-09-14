## Purpose

Reclaim SQLite space and remove stale vector/document rows that belong to a
collection no longer present in the index registry, without touching live
collections.

## ADDED Requirements

### Requirement: Purge an unregistered collection

`qmd collection purge <name>` SHALL remove, in a single transaction, the
`documents`, `content`, FTS, `content_vectors` and vector-table
(`vectors_vec`, `vectors_bit`, `vectors_rescore`) rows that belong to the named
collection, whether or not that name is present in `store_collections`. Rows of
other collections SHALL NOT be touched. The command SHALL report the number of
removed documents and vector chunks.

#### Scenario: Legacy collection removed
- **WHEN** `documents` contains rows for `rt.dev.git` with `active = 1` while
  `store_collections` does not list `rt.dev.git`, and the operator runs
  `qmd collection purge rt.dev.git`
- **THEN** no `documents`, `content_vectors` or vector-table rows for
  `rt.dev.git` remain, and the registered collection is unchanged

#### Scenario: Unknown name is a no-op
- **WHEN** the name has no `documents` rows
- **THEN** the command deletes nothing and reports zero counts

#### Scenario: Destructive confirmation
- **WHEN** the command runs without `--yes` and stdin is not a TTY
- **THEN** it refuses and exits non-zero without deleting anything

### Requirement: Reclaimed space is reported after cleanup

`qmd cleanup` SHALL print the database size before and after running `VACUUM`
so the reclaimed bytes are visible to the operator.

#### Scenario: Size delta printed
- **WHEN** `qmd cleanup` runs on a database with free pages
- **THEN** the output includes the pre-VACUUM and post-VACUUM sizes

### Requirement: Registered collections are unaffected

Purging an unregistered collection SHALL NOT alter `documents`,
`content_vectors` or vector rows belonging to collections still present in
`store_collections`.

#### Scenario: Registered collection survives
- **WHEN** `кпср_unf2020.dev.git` is registered and `rt.dev.git` is purged
- **THEN** all active `кпср_unf2020.dev.git` documents and their vectors remain
