# ast-chunking Specification

## Purpose

Chunk code files at syntactic boundaries (functions, classes, imports) instead
of mid-symbol, improving vector-search recall and rerank quality for code. AST
chunking is opt-in (`--chunk-strategy auto`), degrades gracefully to regex
chunking on any failure, and never changes default behavior.

## Requirements

### Requirement: Opt-in AST chunk strategy

AST-aware chunking SHALL apply only when the caller selects the `auto`
chunk strategy. The default strategy SHALL remain `regex`, preserving existing
behavior for all callers that do not opt in. Markdown and unknown file types
SHALL always use regex chunking regardless of strategy.

#### Scenario: Default strategy unchanged

- **WHEN** a file is chunked without selecting `auto`
- **THEN** regex chunking is used and AST break points are not computed

#### Scenario: Auto strategy on code file

- **WHEN** a supported code file is chunked with `--chunk-strategy auto`
- **THEN** AST break points are computed and merged with regex break points

#### Scenario: Markdown ignores auto

- **WHEN** a `.md` file is chunked with `--chunk-strategy auto`
- **THEN** regex chunking is used (no AST parse attempted)

### Requirement: Language detection by extension

The system SHALL detect a supported language from the file extension and SHALL
return null (triggering regex chunking) for unsupported or unknown extensions.
Supported mappings: `.ts`/`.mts`/`.cts` → typescript, `.tsx`/`.jsx` → tsx,
`.js`/`.mjs`/`.cjs` → javascript, `.py` → python, `.go` → go, `.rs` → rust,
`.bsl`/`.osl` → bsl.

#### Scenario: BSL extension detected

- **WHEN** language detection runs on a `.bsl` or `.osl` file
- **THEN** the detected language is `bsl`

#### Scenario: Unknown extension falls back

- **WHEN** language detection runs on a `.md` or other unsupported file
- **THEN** detection returns null and regex chunking is used

### Requirement: AST break points at node boundaries

For a supported language, the system SHALL parse the file with web-tree-sitter
and emit a break point at the start byte of each matched node, scored by capture
kind on the same scale as markdown headings (class/interface/struct/trait/impl/
mod = 100, export/func/method = 90, type/enum = 80, import = 60) so
`findBestCutoff()` decay works unchanged. At each byte position the
highest-scoring capture SHALL be kept (outermost wrapper wins, e.g.
`export_statement` over the inner declaration). Break points SHALL be returned
sorted by position.

#### Scenario: Function not split mid-body

- **WHEN** a code file with two functions exceeding the chunk token budget is chunked with `auto`
- **THEN** chunk boundaries fall at function starts and neither function is cut mid-body

#### Scenario: Highest score wins per position

- **WHEN** an exported declaration produces captures at the same start position
- **THEN** a single break point with the highest score is kept for that position

### Requirement: BSL chunking via vendored wasm

The system SHALL support BSL (1C) and OneScript files using a repo-bundled
`tree-sitter-bsl.wasm` under `assets/grammars/`, because the `tree-sitter-bsl`
npm package does not ship a prebuilt wasm. BSL break points SHALL be emitted at
`procedure_definition` and `function_definition` (score 90) and `var_definition`
(score 80). SDBL (`.sdbl`) and 1C metadata XML SHALL NOT be parsed.

#### Scenario: BSL procedures become boundaries

- **WHEN** a `.bsl` file with two procedures over the token budget is chunked with `auto`
- **THEN** chunk boundaries fall at the procedure starts and neither procedure is split

#### Scenario: SDBL not parsed

- **WHEN** a `.sdbl` file is chunked with `auto`
- **THEN** no AST parse is attempted and regex chunking is used

### Requirement: Graceful fallback

AST break point extraction SHALL never throw. On unsupported language, missing
or unloadable grammar, parser init failure, or parse error, the system SHALL
return an empty break point array so chunking falls back to regex. Grammar load
failures SHALL be warned at most once per language per process.

#### Scenario: Missing grammar falls back

- **WHEN** the grammar for a detected language cannot be loaded
- **THEN** extraction returns an empty array and regex chunking is used, with a single warning

#### Scenario: Parse error falls back

- **WHEN** the parser fails on malformed source
- **THEN** extraction returns an empty array rather than throwing

### Requirement: AST status reporting

The system SHALL expose a status check reporting, per supported language,
whether its grammar loads and its query compiles, plus an overall `available`
flag true when at least one language is usable. `qmd status` SHALL surface this.

#### Scenario: BSL shown available

- **WHEN** the bundled BSL wasm loads and its query compiles
- **THEN** status reports `bsl` as available

#### Scenario: Unavailable language reported with error

- **WHEN** a language grammar fails to load
- **THEN** status reports that language as unavailable with an error message
