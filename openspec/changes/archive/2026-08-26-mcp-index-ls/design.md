## Context

MCP tools: `query`, `get`, `multi_get`, `links`, `status`. `qmd://` resource `list: undefined`. CLI `qmd ls` lists collections or **all** files under `LIKE prefix%`. Explore locked **index ls**: MCP tool, one level, cap 200, one optional path string.

## Goals / Non-Goals

**Goals:**

- Tool `ls` with optional `path` string.
- Omit path → collection names (and doc counts).
- Path → direct indexed children: files (exact path) and dirs (next path segment from file prefixes).
- Cap 200; `truncated` + leftover count.
- Structured JSON entries: `name`, `path` (collection-relative), `kind`.

**Non-Goals:**

- Resource `list()` on `qmd://`.
- Recursive `tree`, MCP `grep`, REST `/ls`.
- Changing CLI `qmd ls` to one-level.
- Replacing agent drill.

## Decisions

### D1: Children from file paths

`getActiveFilePaths` + `getDirectChildren` (existing). Child dirs = prefixes, not a disk walk. `QMD_DIR_NODES=0` does **not** hide those dir names (ls is inventory, not query).

### D2: Parse like CLI

`qmd://` → `parseVirtualPath`. Else first segment = collection, rest = prefix (posix). Unknown collection → tool error.

### D3: Cap after sort

Locale-sort dirs then files (or names). First 200. `truncated: true` if more. Collection list not capped.

### D4: Soften query copy

Query tool description currently says no `ls` command. Change to: drill is still get+path+kind; `ls` is one-level browse.

## Risks / Trade-offs

- [Fat `Documents/`] 200 + truncated → agent uses `query --path`.
- [CLI vs MCP] CLI still dumps all files; skill must say MCP `ls` is one-level.

## Migration Plan

Ship tool. Restart MCP daemon. No index rebuild.

## Open Questions

None.
