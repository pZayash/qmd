# CONTEXT format

`CONTEXT.md` holds domain glossary and term relationships.
Tag conventions for `research/` notes — keep inline in each file or a future
`TAGS.md` if the project grows multi-topic memory.

## When to create

- Lazily: only after the first agreed term.
- Single-context project: one root `CONTEXT.md`.
- Multi-context: if `CONTEXT-MAP.md` exists, place `CONTEXT.md` per context.

## Template

```md
# {Context Name}

{One or two sentences: what this context is and why it exists.}

## Language

**Term**:
Canonical definition in one sentence.
_Avoid_: synonym1, synonym2

## Relationships

- **Term A** relates to **Term B** as …

## Example dialogue

> **Dev:** "When …"
> **Expert:** "…"

## Flagged ambiguities

- "foo" meant both X and Y — resolved: …
```

## Rules

- One canonical term per concept.
- Record conflicts in `Flagged ambiguities`.
- Short definitions — what it *is*, not implementation detail.
- Domain terms only, not generic programming jargon.
- Skill: [/explore](../../skills/explore/SKILL.md).

## Copyright

Adapted from
[mattpocock/skills — CONTEXT-FORMAT.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/CONTEXT-FORMAT.md)
(MIT).
