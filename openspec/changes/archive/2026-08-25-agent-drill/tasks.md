## 1. MCP query path

- [x] 1.1 In `src/mcp/server.ts` `query` `inputSchema`, add optional `path: z.array(z.string())`. Describe: collection-relative prefixes, OR, leading `/` stripped, trailing `/` kept, same as CLI `--path`. For drill use `dirpath/`.
- [x] 1.2 In the `query` handler, normalize `path` like CLI (`\\` → `/`, strip leading `/`, do **not** strip trailing `/`). Pass `pathPrefixes` into `store.search({ ... existing, pathPrefixes })`. Omit/empty array → `undefined`.
- [x] 1.3 Add a one-paragraph **Agent drill** note to the `query` tool `description` string: get dir L0, then query with `path: ["<dir>/"]` and `kind: "file"`. No new tool.

## 2. Docs and skill

- [x] 2.1 `skills/qmd/SKILL.md`: MCP example includes `"path"` and `"kind"`; short drill section (get → path+`/` → kind file). Rebuild `src/embedded-skills.ts` base64 for `SKILL.md` (and mcp-setup if unchanged skip).
- [x] 2.2 `CLAUDE.md` / `README.md`: MCP `query` `path`; drill recipe next to `--kind`. `CHANGELOG.md` `[Unreleased]`.

## 3. Tests

- [x] 3.1 `test/mcp.test.ts` HTTP (or handler) `tools/call query` with `path: ["meetings/"]` (and `kind: "file"` if schema available): hits only under that prefix; without `path`, existing readme query still works.
- [x] 3.2 `pnpm exec vitest run test/mcp.test.ts`; `pnpm run build`.
