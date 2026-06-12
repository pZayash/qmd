---
name: review
description: >-
  REVIEWER role (architect): on executor's request, produce review verdict —
  findings, answers to doubts, fix checklist. Writes rN-result.md in
  handoffs/<slug>/. Triggers: /review, «do review», «write review verdict»,
  «save findings». Request filed by executor via review-request skill.
argument-hint: "<slug>"
---

# review — reviewer verdict

You are the **reviewer**. Read executor's `rN-request.md`, inspect the work,
write **verdict** (`rN-result.md`) in the same folder. Working channel between
sessions — not spec, not long-term memory.

**Principle:** link stable artifacts (`openspec/`, `research/`, commits, diff),
don't copy them.

**Pair skill:** executor files request via
[review-request](../review-request/SKILL.md). This skill is reviewer only.

## When to invoke

«do review», «write review verdict», «save findings» — reviewing a fresh request.

For **filing a request** («request review») → [review-request](../review-request/SKILL.md).

## Arguments

`/review <slug>`

- `<slug>` — review thread id. OpenSpec change name if tied to a change; else
  kebab topic (`path-filter-or`, `mcp-http-auth`).
- Missing slug → infer from context; if ambiguous, one question.

## Output location

- Directory: `handoffs/<slug>/` (gitignored — local channel).
- File: `rN-result.md`. Round `N` pairs with `rN-request.md`.
- **Read target file first** (missing file = OK; prevents overwrite).

### Round numbering

Scan `handoffs/<slug>/` for `r*-*.md`:

- `N` = latest `rN-request.md` without matching `rN-result.md`.
- No open request → say so; offer explicit round.

## Required checks (QMD)

When forming verdict, verify against project rules ([CLAUDE.md](../../CLAUDE.md),
[AGENTS.md](../../AGENTS.md), [openspec/project.md](../../openspec/project.md)):

1. **Minimal diff:** changes scoped to stated task; no drive-by refactors.
2. **Tests:** behavior changes have `test/` coverage or documented manual check.
3. **Tooling:** `pnpm` for scripts; no silent `qmd collection add` / `embed` / `update`.
4. **Build safety:** no `bun build --compile`; dist/SQLite vec constraints respected.
5. **API/CLI surface:** user-visible changes noted in `CHANGELOG.md` `[Unreleased]`
   when appropriate.
6. **Types & style:** match surrounding TypeScript; no unnecessary abstractions.
7. **OpenSpec alignment:** if change-bound — code matches `specs/**` / `tasks.md`;
   drift only with updated spec or `implementation-notes.md` entry.
8. **Secrets:** no tokens, connection strings, or `.env` values in diff or review file.

Violations → **Findings** (🔴/🟠) and **What to fix**.

## Verdict template (`rN-result.md`)

```markdown
# Review verdict: <slug> — round N

**When**: YYYY-MM-DD HH:MM (local)
**Reviewer**: <model/agent>
**Summary**: pass | rework | blocker

## Findings

Format: label + `file:line` + issue + fix.

- 🔴 `path:line` — critical: <issue>. Fix: <how>.
- 🟠 `path:line` — important: <issue>. Fix: <how>.
- 🟡 `path:line` — nit: <issue>. Fix: <how>.

## Answers to author doubts / questions

From «Doubts» and «Open questions» in `rN-request.md`.

## Stuck diagnosis

Only if request reported a blocker: likely cause + direction.

## What to fix

Checklist — executor reports in `rN+1-request.md`.

- [ ] <action>

## Open questions

To author or user. Omit if none.

## Links

openspec/, research/, commits.
```

Free prose after formal sections is OK if it helps.

## Do not write

- full proposal/design/tasks or large code dumps — links and `file:line` only;
- secrets or env values;
- huge MCP/log dumps — summary + how to reproduce.

## After writing

1. Tell user path and size.
2. Next step: «executor: `/review-request <slug>` after fixes».
3. Candidates for `research/` — list separately; don't write without user ask.

## Boundaries

- `/review` does not commit or push.
- Does not replace OpenSpec — contract changes go in `openspec/**`.
- Does not duplicate `research/` long-term notes.

## Related skills

- [review-request](../review-request/SKILL.md) — executor request.
- [openspec-apply-change](../openspec-apply-change/SKILL.md) — requirement drift.
- [close-chat](../close-chat/SKILL.md) — open `rN-request` with «stuck» may block close.
