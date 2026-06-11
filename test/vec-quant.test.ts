/**
 * vec-quant.test.ts — quantized vector search (bit coarse + int8 rescore).
 *
 * Covers the quantization helpers plus the end-to-end two-pass search path
 * against a real sqlite-vec index. Skips DB tests when sqlite-vec is unavailable
 * (e.g. Bun's bun:sqlite without loadExtension).
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, loadSqliteVec } from "../src/db.js";
import {
  createStore,
  truncRenorm,
  quantizeInt8,
  effectiveCutDim,
  getVecQuantConfig,
  type Store,
} from "../src/store.js";

function detectSqliteVec(): boolean {
  try {
    const d = openDatabase(":memory:");
    loadSqliteVec(d);
    const r = d.prepare(`SELECT vec_version() AS v`).get() as { v?: string } | undefined;
    d.close();
    return !!r?.v;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Unit: quantization helpers (no DB)
// ---------------------------------------------------------------------------

describe("quantization helpers", () => {
  test("truncRenorm truncates to cutDim and L2-normalizes", () => {
    const full = new Float32Array([3, 4, 100, 200]); // first 2 dims → 3,4 (norm 5)
    const out = truncRenorm(full, 2);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0.6, 5);
    expect(out[1]).toBeCloseTo(0.8, 5);
    const norm = Math.hypot(out[0]!, out[1]!);
    expect(norm).toBeCloseTo(1, 5);
  });

  test("truncRenorm with cutDim >= length keeps all dims", () => {
    const full = new Float32Array([0.6, 0.8]);
    const out = truncRenorm(full, 16);
    expect(out.length).toBe(2);
    expect(Math.hypot(out[0]!, out[1]!)).toBeCloseTo(1, 5);
  });

  test("quantizeInt8 scales by 127 and clamps", () => {
    const buf = quantizeInt8(new Float32Array([0, 1, -1, 2, -2, 0.5]));
    const i8 = new Int8Array(buf.buffer, buf.byteOffset, buf.length);
    expect(Array.from(i8)).toEqual([0, 127, -127, 127, -128, 64]);
  });

  test("effectiveCutDim floors to a multiple of 8 and caps at full dim", () => {
    expect(effectiveCutDim(4096, 1024)).toBe(1024);
    expect(effectiveCutDim(4096, 1000)).toBe(1000); // 1000 % 8 == 0
    expect(effectiveCutDim(4096, 1023)).toBe(1016); // 1023 -> 1016
    expect(effectiveCutDim(10, 1024)).toBe(8);      // capped to full, floored to 8
    expect(effectiveCutDim(4, 1024)).toBe(0);       // < 8 → no quantization
  });
});

describe("getVecQuantConfig", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.QMD_VEC_QUANT = saved.QMD_VEC_QUANT;
    process.env.QMD_VEC_CUT_DIM = saved.QMD_VEC_CUT_DIM;
    process.env.QMD_VEC_OVERSAMPLE = saved.QMD_VEC_OVERSAMPLE;
  });

  test("defaults: enabled, cut 1024, oversample 8", () => {
    delete process.env.QMD_VEC_QUANT;
    delete process.env.QMD_VEC_CUT_DIM;
    delete process.env.QMD_VEC_OVERSAMPLE;
    expect(getVecQuantConfig()).toEqual({ enabled: true, cutDim: 1024, oversample: 8 });
  });

  test("QMD_VEC_QUANT=0 disables", () => {
    process.env.QMD_VEC_QUANT = "0";
    expect(getVecQuantConfig().enabled).toBe(false);
  });

  test("custom cut dim and oversample", () => {
    process.env.QMD_VEC_CUT_DIM = "512";
    process.env.QMD_VEC_OVERSAMPLE = "12";
    const cfg = getVecQuantConfig();
    expect(cfg.cutDim).toBe(512);
    expect(cfg.oversample).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Integration: two-pass search against a real index
// ---------------------------------------------------------------------------

const hasVec = detectSqliteVec();
const DIM = 64;
const CUT = "16";

function unit(vec: number[]): Float32Array {
  const f = new Float32Array(vec);
  let s = 0;
  for (const x of f) s += x * x;
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < f.length; i++) f[i] = f[i]! / s;
  return f;
}

/** A DIM-length vector that is mostly along basis axis `axis`, lightly noised. */
function axisVec(axis: number, noise = 0.05): Float32Array {
  const v = new Array(DIM).fill(0).map((_, i) => (i === axis ? 1 : (Math.sin(i * 7.1 + axis) * noise)));
  return unit(v);
}

describe.skipIf(!hasVec)("quantized searchVec (integration)", () => {
  let store: Store;
  let dir: string;
  const savedEnv = { ...process.env };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "qmd-vecquant-"));
    process.env.QMD_VEC_QUANT = "1";
    process.env.QMD_VEC_CUT_DIM = CUT;
    process.env.QMD_VEC_OVERSAMPLE = "8";
    store = createStore(join(dir, "idx.sqlite"));

    const now = new Date().toISOString();
    store.ensureVecTable(DIM);
    // Plant 5 docs each aligned to a distinct axis.
    for (let i = 0; i < 5; i++) {
      const hash = `hash${i}`.padEnd(8, "0");
      store.insertContent(hash, `document number ${i}`, now);
      store.insertDocument("testcoll", `doc${i}.md`, `Doc ${i}`, hash, now, now);
      store.insertEmbedding(hash, 0, 0, axisVec(i), "test-model", now);
    }
  });

  afterEach(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
    process.env.QMD_VEC_QUANT = savedEnv.QMD_VEC_QUANT;
    process.env.QMD_VEC_CUT_DIM = savedEnv.QMD_VEC_CUT_DIM;
    process.env.QMD_VEC_OVERSAMPLE = savedEnv.QMD_VEC_OVERSAMPLE;
  });

  test("insertEmbedding populates bit + rescore tables", () => {
    const bit = store.db.prepare(`SELECT COUNT(*) AS c FROM vectors_bit`).get() as { c: number };
    const rsc = store.db.prepare(`SELECT COUNT(*) AS c FROM vectors_rescore`).get() as { c: number };
    const flt = store.db.prepare(`SELECT COUNT(*) AS c FROM vectors_vec`).get() as { c: number };
    expect(bit.c).toBe(5);
    expect(rsc.c).toBe(5);
    expect(flt.c).toBe(5); // original float vectors kept
    const bitSql = store.db.prepare(`SELECT sql FROM sqlite_master WHERE name='vectors_bit'`).get() as { sql: string };
    expect(bitSql.sql).toContain("bit[16]");
  });

  test("quantized search returns the nearest planted axis", async () => {
    for (let axis = 0; axis < 5; axis++) {
      const q = Array.from(axisVec(axis, 0)); // exact axis query
      const res = await store.searchVec("q", "test-model", 3, undefined, undefined, q);
      expect(res.length).toBeGreaterThan(0);
      expect(res[0]!.filepath).toBe(`qmd://testcoll/doc${axis}.md`);
    }
  });

  test("requantizeFromFloat rebuilds quant tables from float-only index", () => {
    // Wipe quant tables, leaving only the float vectors.
    store.db.exec(`DROP TABLE IF EXISTS vectors_bit`);
    store.db.exec(`DELETE FROM vectors_rescore`);

    const { count, total } = store.requantizeFromFloat();
    expect(total).toBe(5);
    expect(count).toBe(5);
    const bit = store.db.prepare(`SELECT COUNT(*) AS c FROM vectors_bit`).get() as { c: number };
    const rsc = store.db.prepare(`SELECT COUNT(*) AS c FROM vectors_rescore`).get() as { c: number };
    expect(bit.c).toBe(5);
    expect(rsc.c).toBe(5);
  });

  test("exact-mode fallback (QMD_VEC_QUANT=0) still searches via float", async () => {
    process.env.QMD_VEC_QUANT = "0";
    const q = Array.from(axisVec(2, 0));
    const res = await store.searchVec("q", "test-model", 3, undefined, undefined, q);
    expect(res[0]!.filepath).toBe(`qmd://testcoll/doc2.md`);
  });

  test("auto-fallback to exact when quant tables are empty", async () => {
    store.db.exec(`DELETE FROM vectors_bit`);
    store.db.exec(`DELETE FROM vectors_rescore`);
    const q = Array.from(axisVec(3, 0));
    const res = await store.searchVec("q", "test-model", 3, undefined, undefined, q);
    expect(res[0]!.filepath).toBe(`qmd://testcoll/doc3.md`);
  });
});
