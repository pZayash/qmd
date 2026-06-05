/**
 * Embedding speed benchmark.
 *
 * Local LlamaCpp: 128 medium-size docs, single embedBatch call.
 * OpenRouter (qwen/qwen3-embedding-8b): 1024 docs loaded, one embedBatch call
 *   per batch size (2..512). Measures ms/chunk at each batch size.
 *
 * Run:
 *   OPENROUTER_API_KEY=sk-or-... npx vitest run test/bench-embed.test.ts
 *
 * OpenRouter tests are skipped when OPENROUTER_API_KEY is not set.
 */

import { describe, test, beforeAll, afterAll } from "vitest";
import { homedir } from "os";
import { join } from "path";
import { openDatabase } from "../src/db.js";
import { LlamaCpp, formatDocForEmbedding, disposeDefaultLlamaCpp } from "../src/llm.js";
import { OpenRouterEmbedding } from "../src/llm-openrouter.js";
import { loadConfigEnv } from "../src/collections.js";

loadConfigEnv();

const DOC_COUNT = 1024;
const LLAMACPP_DOC_COUNT = 128;
const MIN_BYTES = 1000;
const MAX_BYTES = 4000;
const DB_PATH = join(homedir(), ".cache", "qmd", "index.sqlite");

const OPENROUTER_BATCH_SIZES = [2, 4, 8, 16, 32, 64, 128, 256, 512];
const OPENROUTER_MODEL = "qwen/qwen3-embedding-8b";

// ---------------------------------------------------------------------------

type DocRow = { path: string; body: string; bytes: number };

function loadDocs(): DocRow[] {
  const db = openDatabase(DB_PATH);
  try {
    return (db as any).prepare(`
      SELECT d.path, c.doc AS body, length(c.doc) AS bytes
      FROM documents d
      JOIN content c ON c.hash = d.hash
      WHERE d.active = 1
        AND length(c.doc) BETWEEN ${MIN_BYTES} AND ${MAX_BYTES}
      ORDER BY RANDOM()
      LIMIT ${DOC_COUNT}
    `).all() as DocRow[];
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`;
}

type ResultRow = {
  label: string;
  batchSize: number | "—";
  chunks: number;
  totalMs: number;
  msPerChunk: number;
  kbps: number;
};

function printTable(rows: ResultRow[]) {
  console.log("");
  console.log("┌──────────────────────────────────────┬───────────┬────────┬──────────┬────────────┬────────────┐");
  console.log("│ Backend                              │ BatchSize │ Chunks │ Total    │ ms/chunk   │ KB/s       │");
  console.log("├──────────────────────────────────────┼───────────┼────────┼──────────┼────────────┼────────────┤");
  for (const r of rows) {
    const bsStr = typeof r.batchSize === "number" ? String(r.batchSize) : r.batchSize;
    console.log(
      `│ ${r.label.padEnd(36)} │ ${bsStr.padStart(9)} │ ${String(r.chunks).padStart(6)} │ ${formatMs(r.totalMs).padStart(8)} │ ${r.msPerChunk.toFixed(1).padStart(10)} │ ${r.kbps.toFixed(0).padStart(10)} │`
    );
  }
  console.log("└──────────────────────────────────────┴───────────┴────────┴──────────┴────────────┴────────────┘");
  console.log("");
}

// ---------------------------------------------------------------------------

describe("Embedding speed benchmark", () => {
  const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;
  let docs: DocRow[] = [];
  const results: ResultRow[] = [];

  beforeAll(() => {
    docs = loadDocs();
    if (docs.length === 0) {
      throw new Error(`No documents found (${MIN_BYTES}–${MAX_BYTES} bytes). Run 'qmd update' first.`);
    }
    const totalKb = docs.reduce((s, d) => s + d.bytes, 0) / 1024;
    console.log(`\nLoaded ${docs.length} documents (${MIN_BYTES}–${MAX_BYTES} bytes, ${totalKb.toFixed(0)} KB total, avg ${(totalKb * 1024 / docs.length).toFixed(0)} bytes)`);
  }, 60_000); // sync SQLite ORDER BY RANDOM() + native sqlite-vec load can exceed vitest's 10s default

  afterAll(async () => {
    printTable(results);
    await disposeDefaultLlamaCpp();
  });

  // ─── Local LlamaCpp — 128 docs, one shot ─────────────────────────────────

  test("local LlamaCpp embedBatch (128 docs)", async () => {
    const llm = new LlamaCpp();
    const slice = docs.slice(0, LLAMACPP_DOC_COUNT);
    const texts = slice.map(d => formatDocForEmbedding(d.body, d.path, llm.embedModelName));
    const kb = slice.reduce((s, d) => s + d.bytes, 0) / 1024;

    console.log(`\n[LlamaCpp] embedding ${texts.length} texts (~${kb.toFixed(0)} KB)...`);
    const t0 = performance.now();
    const embeddings = await llm.embedBatch(texts);
    const elapsed = performance.now() - t0;

    const ok = embeddings.filter(Boolean).length;
    console.log(`[LlamaCpp] done: ${ok}/${texts.length} in ${formatMs(elapsed)}, dim=${embeddings[0]?.embedding.length ?? "?"}`);

    results.push({
      label: `LlamaCpp (${llm.embedModelName.split("/").pop()})`,
      batchSize: "—",
      chunks: ok,
      totalMs: elapsed,
      msPerChunk: elapsed / ok,
      kbps: kb / (elapsed / 1000),
    });
    await llm.dispose();
  }, 10 * 60 * 1000);

  // ─── OpenRouter — one embedBatch call per batch size ─────────────────────
  // Each test sends exactly one HTTP POST with `batchSize` texts.
  // This isolates the relationship between batch size and per-chunk cost.

  for (const batchSize of OPENROUTER_BATCH_SIZES) {
    test.skipIf(!hasOpenRouterKey)(`OpenRouter ${OPENROUTER_MODEL} batch_size=${batchSize}`, async () => {
      const llm = new OpenRouterEmbedding(`openrouter:${OPENROUTER_MODEL}`);
      const slice = docs.slice(0, batchSize);
      const kb = slice.reduce((s, d) => s + d.bytes, 0) / 1024;

      console.log(`\n[OpenRouter batch=${batchSize}] 1 POST with ${slice.length} texts (~${kb.toFixed(0)} KB)...`);
      const t0 = performance.now();
      const embeddings = await llm.embedBatch(slice.map(d => d.body));
      const elapsed = performance.now() - t0;

      const ok = embeddings.filter(Boolean).length;
      console.log(`[OpenRouter batch=${batchSize}] done: ${ok}/${slice.length} in ${formatMs(elapsed)}, ${(kb / (elapsed / 1000)).toFixed(0)} KB/s`);

      results.push({
        label: `OpenRouter ${OPENROUTER_MODEL}`,
        batchSize,
        chunks: ok,
        totalMs: elapsed,
        msPerChunk: elapsed / ok,
        kbps: kb / (elapsed / 1000),
      });

      await llm.dispose();
    }, 3 * 60 * 1000);
  }

  // ─── OpenRouter — full 1024 batch ────────────────────────────────────────

  test.skipIf(!hasOpenRouterKey)(`OpenRouter ${OPENROUTER_MODEL} batch_size=1024`, async () => {
    const llm = new OpenRouterEmbedding(`openrouter:${OPENROUTER_MODEL}`);
    const kb = docs.reduce((s, d) => s + d.bytes, 0) / 1024;

    console.log(`\n[OpenRouter batch=1024] 1 POST with ${docs.length} texts (~${kb.toFixed(0)} KB)...`);
    const t0 = performance.now();
    const embeddings = await llm.embedBatch(docs.map(d => d.body));
    const elapsed = performance.now() - t0;

    const ok = embeddings.filter(Boolean).length;
    console.log(`[OpenRouter batch=1024] done: ${ok}/${docs.length} in ${formatMs(elapsed)}, ${(kb / (elapsed / 1000)).toFixed(0)} KB/s`);

    results.push({
      label: `OpenRouter ${OPENROUTER_MODEL}`,
      batchSize: 1024,
      chunks: ok,
      totalMs: elapsed,
      msPerChunk: elapsed / ok,
      kbps: kb / (elapsed / 1000),
    });

    await llm.dispose();
  }, 5 * 60 * 1000);
});
