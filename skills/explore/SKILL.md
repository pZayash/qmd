---
name: explore
description: >
  Research mode before OpenSpec proposal in QMD.
  Hybrid upstream explore-stance + grill-with-docs: free exploration,
  one question at a time, project glossary, inline CONTEXT/ADR,
  bridge to openspec-propose.
license: MIT
metadata:
  derivedFrom:
    - https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs
  projectAdaptation: QMD (TypeScript CLI/MCP hybrid search)
---

# /explore

Enter research mode.
Goal: remove uncertainty until ready for [openspec-propose](../openspec-propose/SKILL.md).

**Hard limit:** no product code in this mode — no feature implementation.

Allowed:

- read/analyze code, docs, web search, read-only MCP;
- formalize OpenSpec artifacts (`proposal.md`, `design.md`, `spec.md`, `tasks.md`)
  on request;
- **documentation edits**: `CONTEXT.md`, `docs/adr/*.md`, `research/*.md`.

Forbidden:

- runtime/product changes in `src/**` or `test/**` that implement features
  (doc-only test fixture tweaks for glossary examples — ask user first).

## Behavior

- Understand project context before conclusions.
- Focus on causes, constraints, risks, testable hypotheses.
- Two styles:
  - **Explore:** curiosity, alternatives, diagrams, forks (no script).
  - **Grill:** one hard question at a time with a recommended answer
    ([grill-with-docs](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs)).
- Maintain a **project glossary** for the task: canonical terms, boundaries,
  forbidden synonyms.
- Stop and clarify overloaded terms.

## Core loop

1. **Gather context:**
   - active OpenSpec changes (`openspec list --json`)
   - if change named — read `proposal.md`, `design.md`, `tasks.md`, `specs/**`
   - where logic lives (`src/`, `test/` — grep/semantic search)
2. **Task map:** known / unclear / breakage risk.
3. **Dialog:**
   - **one question per reply — last block of the answer**
   - recommended answer per question
   - verify claims in code before asking
   - new term → check glossary conflict → propose canonical name →
     update `CONTEXT.md` / `research/` (full definition in file;
     chat = short delta + link)
4. **Stabilize:**
   - agreed solution model
   - mini-glossary: `**Term** → [file](path)` (no definitions duplicated in chat)
   - open questions / blockers
   - next: continue explore or `openspec-propose`
5. **Persist:**
   - first agreed term → create/update `CONTEXT.md` inline
   - architectural choice → check ADR criteria → maybe `docs/adr/*.md`

## Glossary delta (chat)

```text
- **Term** → [CONTEXT.md#language](CONTEXT.md#language)
- **Other** → [research/2026-06-12-topic.md](research/2026-06-12-topic.md)
```

Rules: repo-relative paths; `#language` anchor for `CONTEXT.md` terms.
Omit **Glossary (delta)** section if nothing new.

Files: full definitions per [docs/ai/CONTEXT-FORMAT.md](../../docs/ai/CONTEXT-FORMAT.md).

## CONTEXT and ADR

- No `CONTEXT-MAP.md` → single root `CONTEXT.md`.
- Lazy create: first agreed term only.
- Update inline during dialog.
- Domain terms, not implementation detail.
- ADR only if all three hold (costly rollback, non-obvious, real trade-off):
  [docs/ai/ADR-FORMAT.md](../../docs/ai/ADR-FORMAT.md), [docs/adr/README.md](../../docs/adr/README.md).

## During the session

- **Challenge glossary:** user term conflicts with `CONTEXT.md` → stop, clarify.
- **Sharpen fuzzy language:** propose canonical term.
- **Concrete scenarios:** boundary cases for responsibilities.
- **Cross-reference code:** verify before asserting.
- **Update CONTEXT inline:** no batching at end.
- **ADR sparingly:** three criteria above.
- **Document/code boundary:** `CONTEXT.md`, `docs/adr/`, `openspec/**`, `research/`
  OK; `src/**` feature code not OK.

## Grill rules inside /explore

- Question last, after context, conclusion, risk, glossary, diagram.
- Short, decision-reducing questions.
- If repo answers it — bring fact, don't ask.
- After user answer: what changed, which branches closed.

## Response format

**Structural** (default) — **question always last**:

1. **Context** — what was checked.
2. **Conclusion** — current understanding.
3. **Risk / gap** — main open node.
4. **Glossary (delta)** — new/changed terms only.
5. **Next question (one)** + recommended answer — **last section**.

ASCII diagram after (3), before glossary/question, if useful.

**Light dialog:** user asks «explain…», «lite», «no structure» → short Q&A;
still update `CONTEXT.md` for new terms; still no `src/**` features.
Return to structural when moving big decisions.

## OpenSpec integration

Active change → reference artifacts; update only when stable.
No change yet → clear problem boundaries → propose `openspec-propose` when ready.

## Bridge to openspec-propose

Ready when:

- problem in 1–2 unambiguous sentences;
- key terms agreed;
- scope in/out defined;
- main risks and assumptions listed;
- open questions don't block a draft proposal.

Handoff phrase:

`Ready for openspec-propose: context gathered, glossary agreed, boundaries set.`

## Success criteria

- critical assumptions explicit;
- clear path to implementation;
- short specific open-question list;
- user knows next step.

## Copyright

Grill techniques and CONTEXT/ADR blocks from
[mattpocock/skills — grill-with-docs](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs)
(MIT). Local adaptation: QMD, `src/` boundary, OpenSpec, `research/` notes.
