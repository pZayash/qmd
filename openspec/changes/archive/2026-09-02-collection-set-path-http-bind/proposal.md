## Why

Copying an existing SQLite index to another machine (or another disk path)
currently has no supported remap: `collection add` on an existing name fails,
and `remove` + `add` reindexes and re-embeds. HTTP MCP is hardcoded to
`127.0.0.1` with no `--host`, so a shared LAN daemon cannot bind even when the
operator accepts firewall-only v1. Auth is explicitly **out of this change**
(TODO already marked in `AGENTS.md` / `listen`); this change only unlocks
path remap and an explicit bind address.

## What Changes

- New CLI: `qmd collection set-path <name> <new-root>` — update YAML +
  `store_collections.path` only. Documents, FTS, vectors, hashes stay.
- New CLI/env: `qmd mcp --http --host <addr>` and `QMD_HOST` (default remains
  `127.0.0.1`). Daemon spawn forwards `--host`.
- When bind address is not loopback, print a stderr warning that HTTP MCP has
  **no auth** (do not implement bearer here).
- Help, CHANGELOG `[Unreleased]`, tests for set-path and host default.

Non-goals: HTTP auth/token, Windows Service, copying sqlite between hosts,
OpenRouter keys, dropping collections other than the remapped one.

## Capabilities

### New Capabilities

- `collection-set-path`: remap a collection root without re-index or re-embed.
- `mcp-http-bind`: choose HTTP listen address; default loopback; warn if not
  loopback because there is no auth.

### Modified Capabilities

- (none — no requirement changes to `link-graph`, `symbol-anchor-links`,
  `parallel-embedding`, or `ast-chunking`)

## Impact

- Code: `src/collections.ts`, `src/store.ts` (path upsert only), `src/cli/qmd.ts`
  (`collection set-path`, `--host`, daemon argv), `src/mcp/server.ts`
  (`startMcpHttpServer` host argument), `src/index.ts` if Store public API
  mirrors `renameCollection`, `CLAUDE.md` / `--help`, `CHANGELOG.md`,
  `test/` vitest.
- Specs: two new capabilities under this change.
- Data: no schema migration; no document/vector rewrite.
- **BREAKING**: none if default listen stays `127.0.0.1`.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/collection-set-path/spec.md](specs/collection-set-path/spec.md)
- [specs/mcp-http-bind/spec.md](specs/mcp-http-bind/spec.md)
