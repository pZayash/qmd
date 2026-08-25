## Context

CLI `--path` (repeatable, OR) already filters FTS/vec before RRF. SDK `SearchOptions.pathPrefixes` exists. MCP `query` never forwards path. After dir-nodes + `--kind`, MCP agents still cannot scope a second query to a folder.

Explore locked **agent drill**: get L0, then search with path + usually `kind: file`. No new tool.

## Goals / Non-Goals

**Goals:**

- MCP `query.path: string[]` optional, CLI `--path` semantics.
- Pass through `store.search({ pathPrefixes })`.
- Skill + CLAUDE/README: two-step recipe; trailing `/` is caller duty.

**Non-Goals:**

- `qmd drill`, MCP `ls`/`tree`/`grep`.
- Auto-append `/`.
- New `get` fields (`drillHint`).
- Progressive L0/L1, RRF dir boost.
- Changing SQL path match (`LIKE prefix%`).

## Decisions

### D1: Array, OR, CLI normalize

`path` is `z.array(z.string()).optional()`. Empty/omit = no filter. Each entry: backslash → `/`, strip leading `/` only (same as CLI parseArgs). Do not strip trailing `/`.

### D2: No auto-slash

`docs/ai` still matches `docs/airflow`. Skill says drill prefix = dir-node path + `/`. MCP must not guess.

### D3: Recipe in skill, not a tool

`get` unchanged. HTTP RPC `qmd query --path` already works via executeRpcCommand; native MCP `query` tool is the gap.

### D4: Embedded skill sync

Edit `skills/qmd/SKILL.md`, regenerate `src/embedded-skills.ts` base64 so `qmd skill show` matches.

## Risks / Trade-offs

- Sibling leak without trailing `/` → skill + MCP `path` description, not server rewrite.
- MCP daemon pins old schema → docs: restart daemon after upgrade.

## Migration Plan

Ship code. No index rebuild. Restart MCP daemon.

## Open Questions

None. Explore closed: recipe vs tool, array OR, no auto-slash, get unchanged.
