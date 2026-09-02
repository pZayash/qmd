# QMD - Query Markup Documents

Use Bun instead of Node.js (`bun` not `node`, `bun install` not `npm install`).

## Terse like caveman.

Technical substance exact. Only fluff die.
Drop: articles, filler (just/really/basically), pleasantries, hedging.
Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step].
ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift.
Code/commits/PRs: normal. Off: "stop caveman" / "normal mode".

## Commands

```sh
qmd collection add . --name <n>   # Create/index collection
qmd collection list               # List all collections with details
qmd collection remove <name>      # Remove a collection by name
qmd collection rename <old> <new> # Rename a collection
qmd collection set-path <n> <root> # Remap collection filesystem root (no re-embed)
qmd ls [collection[/path]]        # List collections or files in a collection
qmd l0 seed <path> | --all        # Seed missing .qmd/l0 contracts from extractive L0
qmd context add [path] "text"     # Add context for path (defaults to current dir)
qmd context list                  # List all contexts
qmd context check                 # Check for collections/paths missing context
qmd context rm <path>             # Remove context
qmd get <file>                    # Get document by path or docid (#abc123)
qmd multi-get <pattern>           # Get multiple docs by glob or comma-separated list
qmd links <doc> [--dangling]      # Out-links, backlinks, broken links (-c collection, --json)
qmd links --backfill [-c name]    # Extract links from indexed content (post-upgrade backfill)
qmd status                        # Show index status and collections
qmd update [--pull]               # Re-index all collections (--pull: git pull first)
qmd update --files <path>…        # Re-index only listed paths (collection-relative or fs)
qmd update --files <path>… --strict  # Exit 1 on paths outside collections / glob mismatch
qmd embed [--files <path>…]       # Embed pending hashes (all, or only listed paths)
qmd embed                         # Generate vector embeddings (uses node-llama-cpp)
qmd embed --requantize            # Rebuild quantized vector tables from existing floats (local, no re-embed)
qmd query <query>                 # Search with query expansion + reranking (recommended)
qmd search <query>                # Full-text keyword search (BM25, no LLM)
qmd vsearch <query>               # Vector similarity search (no reranking)
qmd mcp                           # Start MCP server (stdio transport)
qmd mcp --http [--port N] [--host ADDR]  # HTTP MCP (default 127.0.0.1:8181)
qmd mcp --http --daemon           # Start as background daemon
qmd mcp stop                      # Stop background MCP daemon
```

**TODO (security, warn the developer):** HTTP MCP has **no auth**. Listen is
`127.0.0.1` (`src/mcp/server.ts`). LAN bind without a token is incomplete.
Firewall-only is a temporary v1. Do not silent-skip; dedicated change for
bearer/token (or equivalent). See [AGENTS.md](AGENTS.md).

## Search vs query (agents)

- **`qmd query`** — hybrid pipeline: optional expand, `lex:` / `vec:` / `hyde:` **structured query document** (multi-line or typed lines), RRF fusion, LLM rerank. **`lex:` / `vec:` / `hyde:` / `intent:` apply only here**, not to `search`.
- **`qmd search`** — BM25 (FTS) on indexed files only: pass **plain keywords** (phrases in `"quotes"`, `-negation` per FTS lexer). A single leading **`lex:`** is stripped for convenience (same as keywords after it); **`vec:`** / **`hyde:`** are not structured here — use **`qmd query`**.
- **`qmd vsearch`** — vector similarity only (no rerank stage like `query`).
- **Latency** — `qmd query --no-rerank` and `-C <n>` / `--candidate-limit` reduce rerank cost; wide `query` + full rerank can be tens of seconds on CPU.
- **`--explain`** — `qmd query --explain` (JSON and TTY) and MCP/REST `query` with `explain: true`: RRF traces plus `pathStack` of ancestor dir-nodes (active L0 only) with `inCandidates`/`rrfRank` from the fused list after dir-weight, before `-C`. Dir hits also get `dirWeight` and `scoreAfterDirWeight`. Restart MCP daemon after upgrade.
- **Path filter** — `--path <prefix>` restricts results to a collection-relative path prefix without creating separate collections. Repeatable (OR logic). Filtering is at SQL level (`LIKE prefix%`) — no cost when omitted. Works with `query`, `search`, `vsearch`. Leading `/` is stripped automatically.

  ```sh
  qmd query "something" --path 2025/
  qmd query "something" --path work/ --path personal/
  qmd search "keyword" --path docs/api/
  qmd vsearch "concept" -c mycollection --path archive/2024/
  qmd query "folder name" --kind dir
  qmd search "token" --kind file
  qmd query "token" --path conf/Documents/ЗаказПокупателя/ --kind file
  ```

- **Kind filter** — `--kind file|dir` (not repeatable) restricts hits to files or dir-nodes at SQL level before RRF. Omit = mix. Invalid value → exit 1. `QMD_DIR_NODES=0` wins over `--kind dir` (empty). Works with `query`, `search`, `vsearch`, MCP `query`. Mix `query` also scales dir RRF scores by `QMD_DIR_RRF_WEIGHT` (default `0.5`; `1` = off; clamp `[0,1]`). Restart MCP daemon after changing the env.

- **Agent drill** — after a dir hit: `qmd get` the L0, then search with `--path <dir>/` (trailing slash) and `--kind file`. MCP `query` has `path: string[]` (OR, same as CLI). No `drill` tool. MCP `ls` is one-level index browse, not drill. `get` payload unchanged.

- **Collection mask** — only paths matching the collection glob are indexed. Example: mask `**/*.{md,bsl}` excludes `*.xml` (e.g. 1C `Form.xml`); add `xml` to the mask and run `qmd update` if those files must be searchable.

- **Dir-nodes** — `qmd update` builds a searchable L0 summary per directory with indexed files (`kind: dir` in query hits). TTY shows `Dir-nodes: n/m` after file `Indexing:` (L0 rebuild is not silent). Config `l0_source` on collection or `models`: `n` extractive (default), `p` read `{collectionRoot}/.qmd/l0/<relpath>.md`, `q` reserved (falls back to extractive). Seed missing contracts with `qmd l0 seed <qmd://col/dir>` (one dir) or `qmd l0 seed --all -c <col>` (never overwrites non-empty; not part of `update`). If `l0_source` is `n`, seed still writes and warns. Then `qmd update` + `qmd embed`. 1C dirs peek sibling `<Name>.xml` for Name/ru Synonym without indexing xml. Extractive L0 also lists `Ext` file basenames and `Forms` / `Commands` / `Templates` child dir names. `QMD_DIR_NODES=0` hides dir hits. `--kind file|dir` filters retrieval.

## Collection Management

```sh
# List all collections
qmd collection list

# Create a collection with explicit name
qmd collection add ~/Documents/notes --name mynotes --mask '**/*.md'

# Remove a collection
qmd collection remove mynotes

# Rename a collection
qmd collection rename mynotes my-notes
qmd collection set-path mynotes /new/root

# List all files in a collection
qmd ls mynotes

# List files with a path prefix
qmd ls journals/2025
qmd ls qmd://journals/2025
```

## Context Management

```sh
# Add context to current directory (auto-detects collection)
qmd context add "Description of these files"

# Add context to a specific path
qmd context add /subfolder "Description for subfolder"

# Add global context to all collections (system message)
qmd context add / "Always include this context"

# Add context using virtual paths
qmd context add qmd://journals/ "Context for entire journals collection"
qmd context add qmd://journals/2024 "Journal entries from 2024"

# List all contexts
qmd context list

# Check for collections or paths without context
qmd context check

# Remove context
qmd context rm qmd://journals/2024
qmd context rm /  # Remove global context
```

## Document IDs (docid)

Each document has a unique short ID (docid) - the first 6 characters of its content hash.
Docids are shown in search results as `#abc123` and can be used with `get` and `multi-get`:

```sh
# Search returns docid in results
qmd search "query" --json
# Output: [{"docid": "#abc123", "score": 0.85, "file": "docs/readme.md", ...}]

# Get document by docid
qmd get "#abc123"
qmd get abc123              # Leading # is optional

# Docids also work in multi-get comma-separated lists
qmd multi-get "#abc123, #def456"
```

## Options

```sh
# Search & retrieval
-c, --collection <name>  # Restrict search to a collection (matches pwd suffix)
--path <prefix>          # Restrict to collection-relative path prefix (repeatable, OR logic)
--kind file|dir          # Restrict to files or dir-nodes (omit = both; QMD_DIR_NODES=0 hides dirs)
-n <num>                 # Number of results
--all                    # Return all matches
--min-score <num>        # Minimum score threshold
--full                   # Show full document content
--line-numbers           # Add line numbers to output
# query only: --no-rerank, -C / --candidate-limit (faster; skips LLM rerank or fewer candidates)

# Multi-get specific
-l <num>                 # Maximum lines per file
--max-bytes <num>        # Skip files larger than this (default 10KB)

# Output formats (search and multi-get)
--json, --csv, --md, --xml, --files
```

## Development

```sh
bun src/cli/qmd.ts <command>   # Run from source
bun link               # Install globally as 'qmd'
```

## Tests

All tests live in `test/`. Run everything:

```sh
npx vitest run --reporter=verbose test/
bun test --preload ./src/test-preload.ts test/
```

## Architecture

- SQLite FTS5 for full-text search (BM25)
- sqlite-vec for vector similarity search. Quantized two-pass by default: binary
  `bit[cutDim]` coarse hamming knn (`vectors_bit`) + exact `int8[fullDim]` cosine
  rescore (`vectors_rescore`); the original `float` vectors (`vectors_vec`) are
  kept as the exact fallback. Tune via `QMD_VEC_QUANT` / `QMD_VEC_CUT_DIM` /
  `QMD_VEC_OVERSAMPLE`; rebuild from existing floats with `qmd embed --requantize`.
- node-llama-cpp for embeddings (embeddinggemma), reranking (qwen3-reranker), and query expansion (Qwen3)
- OpenRouter embeddings: `QMD_EMBED_CONCURRENCY` (default `1`) — max concurrent
  `batchSize` POSTs in `embedBatch`; OpenRouter transport only (local llama stays
  serial). Higher values raise request rate — subject to provider rate limits; 429
  backoff honors `Retry-After`.
- Reciprocal Rank Fusion (RRF) for combining results
- Smart chunking: 900 tokens/chunk with 15% overlap, prefers markdown headings as boundaries
- AST-aware chunking: use `--chunk-strategy auto` to chunk code files (.ts/.js/.py/.go/.rs/.bsl/.osl) at function/class/import boundaries via tree-sitter (BSL wasm vendored in `assets/grammars/`). Default is `regex` (existing behavior). Markdown and unknown file types always use regex chunking. SDBL (`.sdbl`) not supported for AST chunking.

## Link graph

Cross-doc links (`[[wikilinks]]`, relative `[md](./x.md)`) build during `qmd update`
when content hash changes. After upgrading link-graph on an existing index, run
`qmd links --backfill` (or `qmd update` — unchanged docs backfill missing refs
on disk pass). No auto-run. `--force-links` re-extracts all bodies from index.

## Important: Do NOT run automatically

- Never run `qmd collection add`, `qmd embed`, or `qmd update` automatically
- Never modify the SQLite database directly
- Write out example commands for the user to run manually
- Index is stored at `~/.cache/qmd/index.sqlite`

## Do NOT compile

- Never run `bun build --compile` - it overwrites the shell wrapper and breaks sqlite-vec
- The `qmd` file is a shell script that runs compiled JS from `dist/` - do not replace it
- `npm run build` compiles TypeScript to `dist/` via `tsc -p tsconfig.build.json`

### Building on Windows / PowerShell

`npm run build` has a postbuild step that prepends a shebang to `dist/cli/qmd.js`
using Unix tools (`printf | cat - ... > tmp && mv && chmod`). On Windows/PowerShell
the `tsc` part succeeds but the postbuild **fails** with `'printf' is not recognized`.
The compile still happened — only the shebang is missing. Two options:

- Run the whole build through the Bash tool (POSIX), not PowerShell, OR
- After `npm run build` reports the printf error, finish the postbuild manually in bash.

```sh
printf '#!/usr/bin/env node\n' | cat - dist/cli/qmd.js > dist/cli/qmd.tmp \
  && mv dist/cli/qmd.tmp dist/cli/qmd.js && chmod +x dist/cli/qmd.js
```

Verify success: `head -1 dist/cli/qmd.js` shows `#!/usr/bin/env node`.

After editing TS, the `qmd` CLI runs `dist/` — changes need a rebuild. A running
MCP daemon also pins old code + env vars; restart it (`qmd mcp stop` then start)
to pick up new code or new `QMD_EMBED_*` env vars.

## Releasing

Use `/release <version>` to cut a release. Full changelog standards,
release workflow, and git hook setup are documented in the
[release skill](skills/release/SKILL.md).

Key points:
- Add changelog entries under `## [Unreleased]` **as you make changes**
- The release script renames `[Unreleased]` → `[X.Y.Z] - date` at release time
- Credit external PRs with `#NNN (thanks @username)`
- GitHub releases roll up the full minor series (e.g. 1.2.0 through 1.2.3)
