#!/usr/bin/env node
/**
 * Build tree-sitter-bsl wasm into assets/grammars/ for web-tree-sitter.
 * Requires Docker (emscripten image) on first run; tree-sitter-cli 0.25.x.
 *
 * Usage: pnpm run build:bsl-wasm
 * Upstream: https://github.com/alkoleft/tree-sitter-bsl
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const bslRoot = dirname(require.resolve("tree-sitter-bsl/package.json"));
const outDir = join(root, "assets", "grammars");
const wasmName = "tree-sitter-bsl.wasm";
const builtWasm = join(bslRoot, "grammars", "bsl", wasmName);
const destWasm = join(outDir, wasmName);

mkdirSync(outDir, { recursive: true });

execFileSync(
  "npx",
  ["--yes", "tree-sitter-cli@0.25.10", "build", "--wasm", "grammars/bsl", "-o", `grammars/bsl/${wasmName}`],
  { cwd: bslRoot, stdio: "inherit", shell: true },
);

copyFileSync(builtWasm, destWasm);
console.log(`Wrote ${destWasm}`);
