## Context

`readContractL0` / `chooseL0Text` already apply `.qmd/l0/{dirRelPath}.md` when `l0_source` is `p` or `q`. `qmd update` never creates those files. `.qmd/` is not glob-indexed (`dot: false`). Extractive L0 is built in `upsertDirNode` (`src/store.ts`) via `getDirectChildren` + `namedChildExpansion` + `buildExtractiveL0`.

КПСР has many dir-nodes; a prefix walk would spam `Ext`/`Forms` contracts. Explore lock: [CONTEXT.md](../../../CONTEXT.md).

Constraints: no auto `qmd update` / `embed`. Never write into `conf/`. Never overwrite non-empty contracts.

## Goals / Non-Goals

**Goals:**

- CLI `qmd l0 seed` writes extractive L0 into missing contract files.
- One path = one dir-node file. `--all` = every dir-node in one collection.
- Share extractive assembly with dir-node rebuild (same text as `update` would store in mode `n`).
- Warn on stderr when collection `l0_source` is `n`.

**Non-Goals:**

- MCP tool, REST endpoint, recursive descendant seed, `--force`, `l0_source: q` generate.
- Seeding as a side effect of `qmd update`.
- Editing contracts (user’s editor). Empty-file overwrite is allowed (reader treats empty as missing).

## Decisions

### D1: Writer in `src/dir-node.ts`, CLI in `src/cli/qmd.ts`

Export `writeContractL0(collectionRoot, dirRelPath, text): "written" | "skipped"`. Path must match `readContractL0` (POSIX `dirRelPath`, `.md` suffix, `mkdir` parents). Skip if existing file trim-length > 0.

Export `buildExtractiveL0ForDir(collectionRoot, dirRelPath, filePaths, pathContext): string` that runs the same child/xml/heading steps as `upsertDirNode` (refactor `upsertDirNode` to call it). Seed must not invent a second recipe.

- **Why:** unit-test writer without CLI; one L0 recipe.
- **Rejected:** dump current index L0 body — that may already be a contract or stale vs extractive.

### D2: Path parse like `qmd ls`, plus `-c`

Reuse the `qmd ls` split: `qmd://col/rel` via `parseVirtualPath`, else first `/` segment is collection. If `-c` is set, the positional path is collection-relative (all segments). `--all` needs a collection (`-c` or positional collection name only). `--all` plus a dir path is an error (no recursive). Neither path nor `--all` is usage error.

Unknown collection → exit 1. Dir not in `collectDirPathsFromFiles(active files)` → exit 1 (not a dir-node). `--all` skips that check per dir (only dirs in that set).

- **Why:** same mental model as `ls`; `-c` for Cyrillic collection names.
- **Rejected:** query `--path` prefix semantics.

### D3: `--all` uses existing CLI boolean `all`

`parseArgs` already has `all`. `qmd l0 seed --all -c name`. Do not add a second flag.

### D4: `l0_source: n` writes + warns

Seed is a disk tool, not a config mutator. Stderr one line: contracts unused until `l0_source: p`. Still write.

### D5: After write, print next commands; do not run them

Stdout: written/skipped counts and paths. Remind `qmd update` then `qmd embed`.

## Risks / Trade-offs

- **`--all` on КПСР creates thousands of md files** → path required by default; `--all` is explicit.
- **Stale extractive after seed, user never edits** → files still beat empty; user can delete to fall back. Skip-if-exists protects edits.
- **Windows path join** → same `join(".qmd","l0", dirRelPath + ".md")` as reader; tests use `mkdtemp`.
- **Index not updated until user `update`** → document; never auto-index.

## Migration Plan

1. Ship CLI. User sets `l0_source: p` when ready, seeds chosen dirs, then `qmd update` + `qmd embed`.
2. Rollback: delete `.qmd/l0` files; `update` returns to extractive.

## Open Questions

None blocking.
