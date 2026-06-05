/**
 * Endpoint speed comparison: OpenRouter cloud vs local OpenAI-compatible server.
 *
 * Sends the SAME documents through both endpoints at each batch size and prints
 * a side-by-side table (ms/chunk, KB/s). Both must serve the same embedding model
 * for the comparison to be apples-to-apples (dimensions are not checked here).
 *
 * Endpoints:
 *   - Cloud  — OpenRouter (qwen/qwen3-embedding-8b). Needs OPENROUTER_API_KEY.
 *   - Local  — any OpenAI-compatible /v1 server (LMStudio, llama.cpp, vLLM).
 *              Configure via env:
 *                QMD_BENCH_LOCAL_URL    base (.../v1) or full (.../v1/embeddings)
 *                QMD_BENCH_LOCAL_MODEL  model id the local server expects
 *                                       (e.g. text-embedding-qwen3-embedding-8b)
 *                QMD_BENCH_LOCAL_KEY    optional; local servers ignore it
 *
 * Each side is skipped independently when its config is missing.
 *
 * Run:
 *   OPENROUTER_API_KEY=sk-or-... \
 *   QMD_BENCH_LOCAL_URL=http://localhost:1234/v1 \
 *   QMD_BENCH_LOCAL_MODEL=text-embedding-qwen3-embedding-8b \
 *   npx vitest run test/bench-endpoint.test.ts
 */

import { describe, test, beforeAll, afterAll } from "vitest";
import { homedir } from "os";
import { join } from "path";
import { openDatabase } from "../src/db.js";
import { OpenRouterEmbedding } from "../src/llm-openrouter.js";
import { loadConfigEnv } from "../src/collections.js";

loadConfigEnv();

const DOC_COUNT = 512;
const MIN_BYTES = 1000;
const MAX_BYTES = 4000;
const DB_PATH = join(homedir(), ".cache", "qmd", "index.sqlite");

const BATCH_SIZES = [2, 8, 32, 64, 128];
const CLOUD_MODEL = "qwen/qwen3-embedding-8b";

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

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`;
}

type ResultRow = {
  label: string;
  batchSize: number;
  chunks: number;
  totalMs: number;
  msPerChunk: number;
  kbps: number;
};

function printTable(rows: ResultRow[]) {
  // Sort by batch size, then label, so cloud/local lines pair up per batch.
  const sorted = [...rows].sort((a, b) => a.batchSize - b.batchSize || a.label.localeCompare(b.label));
  console.log("");
  console.log("┌──────────────────────────────────────┬───────────┬────────┬──────────┬────────────┬────────────┐");
  console.log("│ Endpoint                             │ BatchSize │ Chunks │ Total    │ ms/chunk   │ KB/s       │");
  console.log("├──────────────────────────────────────┼───────────┼────────┼──────────┼────────────┼────────────┤");
  for (const r of sorted) {
    console.log(
      `│ ${r.label.padEnd(36)} │ ${String(r.batchSize).padStart(9)} │ ${String(r.chunks).padStart(6)} │ ${formatMs(r.totalMs).padStart(8)} │ ${r.msPerChunk.toFixed(1).padStart(10)} │ ${r.kbps.toFixed(0).padStart(10)} │`
    );
  }
  console.log("└──────────────────────────────────────┴───────────┴────────┴──────────┴────────────┴────────────┘");
  console.log("");
}

// One embedBatch call sending exactly `batchSize` texts (single HTTP POST when
// the provider's batchSize matches). Returns a result row.
async function benchOne(
  llm: OpenRouterEmbedding,
  label: string,
  docs: DocRow[],
  batchSize: number,
): Promise<ResultRow> {
  const slice = docs.slice(0, batchSize);
  const kb = slice.reduce((s, d) => s + d.bytes, 0) / 1024;

  console.log(`\n[${label} batch=${batchSize}] ${slice.length} texts (~${kb.toFixed(0)} KB)...`);
  const t0 = performance.now();
  const embeddings = await llm.embedBatch(slice.map(d => d.body));
  const elapsed = performance.now() - t0;

  const ok = embeddings.filter(Boolean).length;
  console.log(`[${label} batch=${batchSize}] done: ${ok}/${slice.length} in ${formatMs(elapsed)}, ${(kb / (elapsed / 1000)).toFixed(0)} KB/s`);

  return {
    label,
    batchSize,
    chunks: ok,
    totalMs: elapsed,
    msPerChunk: elapsed / ok,
    kbps: kb / (elapsed / 1000),
  };
}

// ---------------------------------------------------------------------------

describe("Endpoint speed comparison (cloud vs local)", () => {
  const hasCloud = !!process.env.OPENROUTER_API_KEY;
  const localUrl = process.env.QMD_BENCH_LOCAL_URL;
  const localModel = process.env.QMD_BENCH_LOCAL_MODEL;
  const hasLocal = !!localUrl;
  let docs: DocRow[] = [];
  const results: ResultRow[] = [];

  beforeAll(() => {
    docs = loadDocs();
    if (docs.length === 0) {
      throw new Error(`No documents found (${MIN_BYTES}–${MAX_BYTES} bytes). Run 'qmd update' first.`);
    }
    const totalKb = docs.reduce((s, d) => s + d.bytes, 0) / 1024;
    console.log(`\nLoaded ${docs.length} documents (${MIN_BYTES}–${MAX_BYTES} bytes, ${totalKb.toFixed(0)} KB total)`);
    console.log(`Cloud: ${hasCloud ? "enabled" : "SKIP (no OPENROUTER_API_KEY)"} | Local: ${hasLocal ? localUrl : "SKIP (no QMD_BENCH_LOCAL_URL)"}`);
  }, 60_000); // sync SQLite ORDER BY RANDOM() + native sqlite-vec load can exceed vitest's 10s default

  afterAll(() => {
    if (results.length) printTable(results);
  });

  for (const batchSize of BATCH_SIZES) {
    // Cloud — OpenRouter primary. batchSize set so each call is one POST.
    test.skipIf(!hasCloud)(`cloud OpenRouter batch=${batchSize}`, async () => {
      const llm = new OpenRouterEmbedding(`openrouter:${CLOUD_MODEL}`, { batchSize });
      results.push(await benchOne(llm, "cloud (openrouter)", docs, batchSize));
      await llm.dispose();
    }, 3 * 60 * 1000);

    // Local — override forces the single local endpoint, no cloud/fallback. Model
    // id defaults to CLOUD_MODEL when QMD_BENCH_LOCAL_MODEL is unset.
    test.skipIf(!hasLocal)(`local endpoint batch=${batchSize}`, async () => {
      const llm = new OpenRouterEmbedding(`openrouter:${CLOUD_MODEL}`, {
        batchSize,
        override: {
          url: localUrl!,
          model: localModel,
          apiKey: process.env.QMD_BENCH_LOCAL_KEY,
        },
      });
      results.push(await benchOne(llm, "local (lmstudio)", docs, batchSize));
      await llm.dispose();
    }, 3 * 60 * 1000);
  }
});
