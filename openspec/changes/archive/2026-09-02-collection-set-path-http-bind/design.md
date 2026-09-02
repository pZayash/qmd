## Context

Collections live in two places: YAML (`~/.config/qmd/index.yml`) and
`store_collections` in SQLite. `syncConfigToDb` copies YAML → SQLite and
**deletes SQLite collections missing from YAML**. Document rows store
**collection-relative** `path`; vectors are keyed by **content hash**, not
filesystem root. Changing `store_collections.path` therefore does not require
rewriting documents or embeddings.

HTTP MCP (`startMcpHttpServer` in [src/mcp/server.ts](../../../src/mcp/server.ts))
calls `listen(port, "127.0.0.1")`. CLI `parseArgs` has `http` / `daemon` /
`port` but no host. Daemon spawn argv is only `--http --port`. TODO comments
already state: LAN bind without auth is incomplete.

Driver: copy a large existing index to another machine and point the collection
at a new worktree without `embed`.

## Goals / Non-Goals

**Goals:**

- Remap one collection's root path in YAML + SQLite without touching documents,
  FTS, or vectors.
- Listen on an operator-chosen address; default stays loopback.
- Warn on non-loopback bind because HTTP MCP has no authentication.

**Non-Goals:**

- Bearer/token auth (separate change; keep TODO markers).
- Windows Service, sqlite copy, host firewall, OpenRouter keys.
- `collection remove` / `add` as the remap path.
- Rewriting `documents.path` (they stay relative).
- Changing collection **name** (use existing `rename`).

## Decisions

### D1: YAML is source of truth; then `syncConfigToDb`

`set-path` updates `collections[name].path` via `saveConfig`, then opens the
index DB and calls `syncConfigToDb` (hash will change → `upsertStoreCollection`
writes the new path). Do **not** `DELETE` the collection row, do **not** run
`removeCollection` / reindex.

- Alternative (rejected): edit SQLite only. Next process start would overwrite
  path from stale YAML.
- Alternative (rejected): `remove` + `add`. Drops documents and forces re-embed.

### D2: Fail if collection missing or destination missing

Unknown name → exit 1 (same as `rename`). Destination path: `resolve` +
`existsSync`; missing → exit 1. Optional `--force` allows a missing dest
(operator may create the tree after remap). No `--force` in v1 unless tests
need it; v1 fails closed.

- Alternative (rejected): silent success on missing dest. `qmd update` would
  then look like an empty tree.

### D3: `--host` + `QMD_HOST`, never default to `0.0.0.0`

Default `127.0.0.1`. Precedence: CLI `--host` > env `QMD_HOST` > default.
Pass the string to `httpServer.listen(port, host)`. Daemon child argv MUST
include `--host` when non-default (and always include it if we spawn with
explicit host to avoid the child falling back).

- Alternative (rejected): default `0.0.0.0` for “shared server”. Unsafe without
  auth.

### D4: Warn, do not block, non-loopback bind

If host is not `127.0.0.1` / `::1` / `localhost`, log stderr that HTTP MCP has
no auth and LAN bind is incomplete (point at `AGENTS.md`). Still listen — the
operator chose `--host` for firewall-only v1.

Keep existing TODO comments at `listen`.

### D5: Public Store API mirrors `renameCollection`

If `src/index.ts` exposes collection ops on Store, add `setCollectionPath(name,
absPath)` that only upserts path (preserve pattern/ignore/context). CLI can
also call YAML helper + `syncConfigToDb` without a new Store method; prefer a
small `setCollectionPath` in [src/collections.ts](../../../src/collections.ts)
plus `syncConfigToDb` from CLI, same split as `rename`.

## Risks / Trade-offs

- [Wrong dest / empty tree] → Fail if dest missing; operator runs `qmd status`
  after remap.
- [YAML/SQLite skew if crash mid-command] → Write YAML then sync in the same
  CLI invocation; if sync fails, YAML already new (operator re-runs set-path).
- [Windows `path + '/'` joins] → Store already uses `coll.path + '/'` in
  `getContextForFile`. Do not change slash convention in this change; `set-path`
  stores `resolve()` output the same way `collection add` does.
- [LAN bind without auth] → Warning + existing TODO; firewall is operator-side.

## Migration Plan

1. Ship CLI; default MCP behavior unchanged.
2. Operator: stop MCP, checkpoint sqlite, copy index+yaml, `set-path`, start
   with `--host` only if firewall is in place.
3. Rollback: restore previous YAML path and re-run `set-path` (or restore yaml
   + sqlite together). Vectors never rewritten.

## Open Questions

- None for this change. Auth is deferred by design.
