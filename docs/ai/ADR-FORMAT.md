# ADR format

ADR records an architectural decision and why it was chosen.

## Location

- Directory: `docs/adr/`.
- Create lazily with the first ADR.
- Filenames: `0001-slug.md`, `0002-slug.md`, …

## Minimal template

```md
# {Short title}

{1–3 sentences: context, decision, rationale.}
```

## Optional sections

Add only when useful:

- `Status` (`proposed`, `accepted`, `deprecated`, `superseded by ADR-NNNN`)
- `Considered options`
- `Consequences`

## When to propose an ADR

All three must hold:

1. Expensive to roll back.
2. Non-obvious without context.
3. Real trade-off among alternatives.

Otherwise skip ADR.

## Copyright

Adapted from
[mattpocock/skills — ADR-FORMAT.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/ADR-FORMAT.md)
(MIT). Catalog: [docs/adr/README.md](../adr/README.md). Skill: [/explore](../../skills/explore/SKILL.md).
