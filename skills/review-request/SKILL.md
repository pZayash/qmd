---
name: review-request
description: >-
  EXECUTOR role: file review request for architect-reviewer — what was done,
  focus, blockers, doubts. Writes rN-request.md in handoffs/<slug>/.
  Triggers: /review-request, «request review», «hand to reviewer».
  Verdict by review skill.
argument-hint: "<slug>"
---

# review-request — executor review request

You are the **executor**. Describe work for the reviewer: done, focus areas,
blockers, doubts. Write **request** (`rN-request.md`) in `handoffs/<slug>/`.

**Principle:** link stable artifacts (`openspec/`, `research/`, commits, diff),
don't copy them.

**Pair skill:** verdict by [review](../review/SKILL.md). Executor only — no verdict here.

## When to invoke

«request review», «hand to reviewer», «file review request» — often when stuck
or uncertain.

For **verdict** («do review») → [review](../review/SKILL.md).

## Arguments

`/review-request <slug>` — same slug rules as [review](../review/SKILL.md).

## Output location

- `handoffs/<slug>/rN-request.md` (gitignored).
- **Read target first** before write.
- `N` = max existing round + 1, or first open round if resuming protocol.

## Request template (`rN-request.md`)

```markdown
# Review request: <slug> — round N

**When**: YYYY-MM-DD HH:MM (local)
**Author**: <model/agent>
**Status**: ready | stuck

## Summary

2–5 sentences: what was attempted and outcome.

## Scope for reviewer

- [ ] <what to verify>
- [ ] <what to verify>

## Changes

- Commits: <hashes or «uncommitted»>
- OpenSpec: <change name or —>
- Key paths: `src/...`, `test/...`

## Author doubts

- …

## Open questions

- …

## Stuck (if Status: stuck)

What failed, what was tried, hypothesis.

## Links

openspec/, research/, prior `r*-result.md` if any.
```

## Do not write

- full specs or large code — pointers only;
- secrets.

## After writing

1. Path to user.
2. Next: «reviewer session: `/review <slug>`».

## Boundaries

- No commit/push.
- Not a substitute for OpenSpec artifacts.
