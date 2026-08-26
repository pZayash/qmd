## 1. REST handler

- [x] 1.1 In `src/mcp/server.ts` REST `POST /query` (`pathname === "/query" || pathname === "/search"`, ~L1080): if `params.path` is present and not an array, 400 `{ error: "..." }` and return. Else `pathPrefixes: normalizePathPrefixes(params.path)` (already defined in this file).
- [x] 1.2 If `params.kind` is present: `try { kind = parseDocumentKind(String(params.kind)) } catch { 400 }`. Import `parseDocumentKind` from `../dir-node.js` if not already imported. Omit `kind` when absent.
- [x] 1.3 Pass `pathPrefixes` and `kind` into `store.search`. If `typeof params.rerank === "boolean"`, also pass `rerank: params.rerank`. Do not add `candidateLimit`.
- [x] 1.4 In the `formatted` map, set `kind: r.kind` on every hit. Set `file` to `r.kind === "dir" ? \`${r.displayPath}/\` : r.displayPath`. Keep docid/title/score/context/snippet.

## 2. Tests

- [x] 2.1 In `test/mcp.test.ts` HTTP suite (`describe.skipIf(!!process.env.CI)`), add `POST /query` with `searches: [{ type: "lex", query: "meeting" }]`, `path: ["meetings/"]`, `kind: "file"`, `rerank: false`. Expect 200; every `results[]` has `kind === "file"`; `file` contains `meetings/`; no `readme.md`.
- [x] 2.2 Same suite: `kind: "both"` → status 400; body has `error`. `path: "meetings/"` (string, not array) → 400.

## 3. Docs

- [x] 3.1 `skills/qmd/SKILL.md` HTTP example: show `path` + `kind` on the curl JSON. If `src/embedded-skills.ts` is generated from that file, regenerate base64 (same LF process as agent-drill).
- [x] 3.2 `CHANGELOG.md` `[Unreleased]`: REST `/query` path+kind + `kind` on hits. Note MCP HTTP daemon restart. README only if it documents the HTTP body.

## 4. Verify

- [x] 4.1 `pnpm exec vitest run test/mcp.test.ts` — pass (HTTP tests skip on CI).
- [x] 4.2 `pnpm run build` — tsc clean. Do not run `qmd update` / `embed`.
