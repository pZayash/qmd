# OpenSpec implementation journal (`implementation-notes.md`)

> © Thariq (@trq212). Idea:
> [X post](https://x.com/trq212/status/2056415973125796184) —
> running notes while executing a spec.

## Purpose

Optional Markdown file in an active change folder. Agent creates/appends during
[`openspec-apply-change`](../../skills/openspec-apply-change/SKILL.md) when
implementation reveals information not in `specs/**`, `design.md`, `tasks.md`.

**Not** archived with the change: before
[`openspec-archive-change`](../../skills/openspec-archive-change/SKILL.md) the
user reviews the journal, migrates anything valuable, then **deletes** the file.

## Path and format

- Path: `openspec/changes/<change-name>/implementation-notes.md`
- Markdown only (no HTML).

## When to create

Only when needed — not on every apply. Triggers:

- decision not described in spec/design;
- deviation from `tasks.md` or `design.md`;
- tradeoff chosen on the spot;
- risk, debt, or manual acceptance the reviewer must know;
- user asks for a journal.

If no deviations — do not create the file.

## When to append

After each material deviation or decision during apply.
Brief: date (optional), context, decision, why.

## Task checkbox `[x]`

Mark `[x]` only with evidence: automated test **or** recorded manual check (line
in this journal). «Scenarios pass» without test or acceptance is not enough;
leave `[ ]` and note why in the journal.

## What not to write

- duplicate `design.md` / `proposal.md` without new information;
- full chat log;
- secrets, tokens, passwords;
- contract changes — update spec/design/tasks first; journal records the **fact**
  of deviation.

## Template

```markdown
# Implementation notes: <change-name>

> © Thariq (@trq212). [Source](https://x.com/trq212/status/2056415973125796184)

Optional apply journal. Delete before archive change.

## Outside spec

- …

## Deviations from design / tasks

- …

## Tradeoffs

- …

## For reviewer

- …
```

Remove empty sections.

## Related artifacts

| Artifact | Role |
| --- | --- |
| `design.md` | Plan before code |
| `implementation-notes.md` | Facts of deviation during apply |
| `research/` | Stable lessons after digesting notes before archive |

## Archive

See `openspec-archive-change` skill: file is **not** moved to
`openspec/changes/archive/` — delete after user review.
