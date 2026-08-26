## Why

HTTP `POST /query` (and `/search`) ignores `path` and `kind`. MCP `query` and CLI already filter. Curl/HTTP clients cannot agent-drill. Hits also omit `kind`, so a mix cannot tell dir vs file.

## What Changes

- REST body: optional `path` (`string[]`, same normalize as MCP) and `kind` (`file`|`dir`).
- Forward into `store.search` (`pathPrefixes`, `kind`).
- Each result includes `kind`. Dir `file` gets a trailing `/` (MCP/CLI JSON).
- Invalid `kind` → HTTP 400. `/search` alias same.
- Honor existing `rerank` boolean if present (tests need `false`); do not add `candidateLimit`.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `dir-node`: REST `POST /query` accepts path/kind filters and returns `kind` on hits (parity with MCP `query`).

## Impact

- Code: `src/mcp/server.ts` REST `/query` handler.
- Tests: `test/mcp.test.ts` HTTP `POST /query` (skipIf CI, same fixture as MCP path test).
- Docs: SKILL HTTP example, README/CHANGELOG if they document `/query`.

## Artifacts

- [design.md](design.md)
- [tasks.md](tasks.md)
- [specs/dir-node/spec.md](specs/dir-node/spec.md)
