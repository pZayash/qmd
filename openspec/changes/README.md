# Project changes

Active proposals and implementations live here.

## Layout

Each change has its own folder:

- `proposal.md` — what and why; includes **Artifacts** TOC (links to other files)
- `design.md` — technical decisions
- `tasks.md` — implementation checklist
- `specs/` — delta specifications
- `implementation-notes.md` (optional) — apply-time journal; not archived;
  see [docs/ai/openspec-implementation-notes.md](../../docs/ai/openspec-implementation-notes.md)

## Status

- `pending` — awaiting implementation
- `in_progress` — in development
- `completed` — done
- `archived` — moved under `archive/`

## Agent workflow (skills)

Entry point: `skills/` (Cursor: `.cursor/skills/` after `openspec init`):

1. `explore` — research, glossary, CONTEXT/ADR (no product code in `src/**`)
2. `openspec-propose` — create change + artifacts
3. `openspec-apply-change` — implement `tasks.md`
4. `openspec-archive-change` — sync delta specs (default), review/delete
   `implementation-notes.md`, move to `archive/`

Invoke by phrase or `/skill-name`. Slash commands: `.cursor/commands/opsx-*.md`.

## CLI

```sh
openspec list
openspec new change "<name>"
openspec status --change "<name>"
openspec instructions apply --change "<name>" --json
openspec archive "<name>"
```

`openspec` from `@fission-ai/openspec` — call directly, no `pnpm exec`.
