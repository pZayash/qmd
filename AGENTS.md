# Agent Instructions

## Package manager

- This project uses `pnpm`.
- Prefer `pnpm` commands for install, scripts, and dependency management.
- Do not use `npm` or `bun` unless explicitly requested by the user.

## OpenSpec

- `openspec/` — spec-driven changes (proposals, design, tasks, delta specs).
- CLI: `openspec` (`list`, `new change`, `status`, `instructions`, `archive`) —
  from `@fission-ai/openspec`; call directly, no `pnpm exec`.
- Project context: [openspec/project.md](openspec/project.md), [openspec/config.yaml](openspec/config.yaml).
- Implementation journal: [docs/ai/openspec-implementation-notes.md](docs/ai/openspec-implementation-notes.md).

### Workflow skills (`skills/`)

1. `explore` — research, glossary, CONTEXT/ADR (no feature code in `src/**`)
2. `openspec-propose` — create change + artifacts
3. `openspec-apply-change` — implement `tasks.md`
4. `openspec-archive-change` — sync specs, archive change
5. `review` / `review-request` — two-session review protocol (`handoffs/<slug>/`, gitignored)
6. `close-chat` — end-of-session pipeline (open items → changelog + OpenSpec archive → cleanup → commit)

Cursor/Claude copies: `.cursor/skills/`, `.claude/skills/` (from `openspec init` + project skills).
Slash commands: `.cursor/commands/opsx-*.md`.
