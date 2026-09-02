## 1. YAML + CLI set-path

- [x] 1.1 In [src/collections.ts](../../src/collections.ts) add
      `setCollectionPath(name: string, newRoot: string): boolean` next to
      `renameCollection`: `loadConfig()`, if `collections[name]` missing return
      `false`; set `path` to `resolve(newRoot)`; `saveConfig`; return `true`.
      Do not change pattern/ignore/context. Done: unit can call it with a temp
      YAML and read the new path back.
- [x] 1.2 In [src/cli/qmd.ts](../../src/cli/qmd.ts) add `collectionSetPath(name,
      newRoot)` next to `collectionRename`: unknown name → stderr + exit 1;
      `!existsSync(resolve(newRoot))` → stderr + exit 1; call
      `setCollectionPath` then `resyncConfig()` (already clears `config_hash`).
      Done: existing collection remaps; missing dest / unknown name leave YAML
      unchanged.
- [x] 1.3 In the `case "collection"` switch (~3496) add `set-path` requiring
      `cli.args[1]` and `cli.args[2]`; usage string
      `qmd collection set-path <name> <new-root>`. Add the same line to the
      `help` command list (~3610) and to [CLAUDE.md](../../CLAUDE.md) next to
      `collection rename`. Done: `--help` / `qmd collection` lists `set-path`.

## 2. SDK Store path remap

- [x] 2.1 In [src/index.ts](../../src/index.ts) add `setCollectionPath(name,
      absPath)` on `QMDStore`: `getStoreCollection`; if missing return `false`;
      `upsertStoreCollection` with the same pattern/ignore/context and new
      `path`; if YAML/inline config is in play, call `setCollectionPath` from
      collections.ts. Do **not** call `deleteStoreCollection` or reindex. Done:
      SDK remap updates `store_collections.path` only.

## 3. HTTP listen host

- [x] 3.1 In [src/mcp/server.ts](../../src/mcp/server.ts) export
      `resolveMcpListenHost(cliHost?: string, envHost?: string): string`
      (CLI > `QMD_HOST` > `127.0.0.1`) and
      `isLoopbackMcpHost(host: string): boolean` (`127.0.0.1`, `::1`,
      `localhost`, case-insensitive). Change `startMcpHttpServer(port, options?)`
      to accept `host?: string`, default via `resolveMcpListenHost`. Replace
      hardcoded `listen(port, "127.0.0.1")` with that host. Keep the existing
      TODO comment. Done: default bind still loopback.
- [x] 3.2 If `!isLoopbackMcpHost(host)`, `console.error` a warning that HTTP MCP
      has no auth (point at `AGENTS.md`). Loopback: no that warning. Done:
      `--host 0.0.0.0` warns; default does not.
- [x] 3.3 In [src/cli/qmd.ts](../../src/cli/qmd.ts) `parseArgs` options add
      `host: { type: "string" }`. MCP HTTP branch: resolve host, pass into
      `startMcpHttpServer`. Daemon `spawnArgs` MUST include `--host` and the
      resolved host (not only `--http --port`). Log URL uses the chosen host.
      Done: `qmd mcp --http --daemon --host 0.0.0.0` child is not loopback.

## 4. Tests and changelog

- [x] 4.1 Add [test/collection-set-path.test.ts](../../test/collection-set-path.test.ts):
      temp YAML + sqlite; index one md file; `setCollectionPath` +
      `syncConfigToDb`; assert document count and hashes unchanged; unknown
      name / missing dest fail. Do **not** call `qmd embed` or `collection add`
      against the developer’s real index. Done: `pnpm test` includes the file.
- [x] 4.2 Add tests for `resolveMcpListenHost` / `isLoopbackMcpHost` (same file
      or `test/mcp-http-bind.test.ts`): default, env, CLI wins, warning
      predicate. Done: four host scenarios from the spec pass without binding a
      port if the helpers are unit-tested.
- [x] 4.3 Under [CHANGELOG.md](../../CHANGELOG.md) `## [Unreleased]` →
      `### Features` add `collection set-path` and `mcp --http --host` /
      `QMD_HOST`. Done: Unreleased mentions both.
