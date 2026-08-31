import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import {
  createStore,
  syncConfigToDb,
  reindexCollection,
  reindexFiles,
  searchFTS,
  findDocument,
  dirNodesDisabled,
  upsertStoreCollection,
  structuredSearch,
  type Store,
} from "../src/store.js";

let testDir = "";
let store: Store;
let collectionRoot = "";
let collectionName = "docs";

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "qmd-dir-node-store-"));
  collectionRoot = join(testDir, "collection");
  await mkdir(join(collectionRoot, "docs", "ai"), { recursive: true });
  await writeFile(join(collectionRoot, "docs", "ai", "one.md"), "# uniqueDirToken\n\nalpha");
  await writeFile(join(collectionRoot, "docs", "ai", "two.md"), "# Two\n\nbeta");

  const configPath = join(testDir, "config", "index.yml");
  await mkdir(join(testDir, "config"), { recursive: true });
  await writeFile(configPath, YAML.stringify({
    collections: {
      [collectionName]: {
        path: collectionRoot,
        pattern: "**/*.md",
      },
    },
  }));

  process.env.QMD_CONFIG_DIR = join(testDir, "config");
  store = createStore(join(testDir, "index.sqlite"));
  syncConfigToDb(store.db, {
    collections: {
      [collectionName]: {
        path: collectionRoot,
        pattern: "**/*.md",
      },
    },
  });
  upsertStoreCollection(store.db, collectionName, {
    path: collectionRoot,
    pattern: "**/*.md",
  });
});

afterAll(async () => {
  store.close();
  delete process.env.QMD_CONFIG_DIR;
  delete process.env.QMD_DIR_NODES;
  await rm(testDir, { recursive: true, force: true });
});

describe("dir-node store integration", () => {
  test("reindexCollection creates dir-node for parent directory", async () => {
    await reindexCollection(store, collectionRoot, "**/*.md", collectionName, {
      l0Source: "n",
    });

    const dirDoc = findDocument(store.db, `qmd://${collectionName}/docs/ai`, { includeBody: true });
    expect("error" in dirDoc).toBe(false);
    if ("error" in dirDoc) return;
    expect(dirDoc.kind).toBe("dir");
    expect(dirDoc.body).toContain("docs/ai");
    expect(dirDoc.body).toContain("one.md — uniqueDirToken");
  });

  test("FTS returns kind dir for L0 content", async () => {
    const hits = searchFTS(store.db, "uniqueDirToken", 10, collectionName);
    const dirHit = hits.find(h => h.kind === "dir");
    expect(dirHit).toBeDefined();
    expect(dirHit!.displayPath).toBe(`${collectionName}/docs/ai`);
  });

  test("QMD_DIR_NODES=0 hides dir hits in FTS", async () => {
    process.env.QMD_DIR_NODES = "0";
    const hits = searchFTS(store.db, "uniqueDirToken", 10, collectionName);
    expect(hits.every(h => h.kind !== "dir")).toBe(true);
    delete process.env.QMD_DIR_NODES;
  });

  test("kind dir returns only dir hits", () => {
    const hits = searchFTS(store.db, "uniqueDirToken", 10, collectionName, undefined, "dir");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => h.kind === "dir")).toBe(true);
    expect(hits.some(h => h.displayPath === `${collectionName}/docs/ai`)).toBe(true);
  });

  test("kind file excludes dir hits", () => {
    const hits = searchFTS(store.db, "uniqueDirToken", 10, collectionName, undefined, "file");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => h.kind === "file")).toBe(true);
    expect(hits.some(h => h.displayPath === `${collectionName}/docs/ai`)).toBe(false);
  });

  test("omit kind can mix file and dir", () => {
    const hits = searchFTS(store.db, "uniqueDirToken", 10, collectionName);
    expect(hits.some(h => h.kind === "file")).toBe(true);
    expect(hits.some(h => h.kind === "dir")).toBe(true);
  });

  test("query explain path-stack for file and dir hits", async () => {
    const prev = process.env.QMD_DIR_RRF_WEIGHT;
    delete process.env.QMD_DIR_RRF_WEIGHT;
    try {
      const results = await structuredSearch(store, [{ type: "lex", query: "uniqueDirToken" }], {
        collections: [collectionName],
        skipRerank: true,
        explain: true,
      });
      expect(results.length).toBeGreaterThan(0);

      const fileHit = results.find(r => r.kind === "file" && r.file.endsWith("/docs/ai/one.md"));
      expect(fileHit?.explain?.pathStack.map(e => e.path)).toEqual(["docs", "docs/ai"]);
      expect(fileHit?.explain?.dirWeight).toBeUndefined();
      const ai = fileHit?.explain?.pathStack.find(e => e.path === "docs/ai");
      expect(ai?.kind).toBe("dir");
      expect(typeof ai?.inCandidates).toBe("boolean");
      if (ai?.inCandidates) expect(ai.rrfRank).toBeGreaterThan(0);
      else expect(ai?.rrfRank).toBeUndefined();

      const dirHit = results.find(r => r.kind === "dir" && r.file.endsWith("/docs/ai"));
      expect(dirHit).toBeDefined();
      expect(dirHit!.explain!.pathStack.map(e => e.path)).toEqual(["docs"]);
      expect(dirHit!.explain!.dirWeight).toBe(0.5);
      expect(typeof dirHit!.explain!.scoreAfterDirWeight).toBe("number");
    } finally {
      if (prev === undefined) delete process.env.QMD_DIR_RRF_WEIGHT;
      else process.env.QMD_DIR_RRF_WEIGHT = prev;
    }
  });

  test("query explain kind dir reports identity dirWeight", async () => {
    const results = await structuredSearch(store, [{ type: "lex", query: "uniqueDirToken" }], {
      collections: [collectionName],
      kind: "dir",
      skipRerank: true,
      explain: true,
    });
    const dirHit = results.find(r => r.kind === "dir");
    expect(dirHit?.explain?.dirWeight).toBe(1);
    expect(dirHit?.explain?.pathStack.map(e => e.path)).toEqual(["docs"]);
  });

  test("reindexCollection onProgress reports file then dir phase", async () => {
    const events: { phase?: string; current: number; total: number }[] = [];
    await reindexCollection(store, collectionRoot, "**/*.md", collectionName, {
      l0Source: "n",
      onProgress: (info) => events.push({
        phase: info.phase,
        current: info.current,
        total: info.total,
      }),
    });

    const fileEvents = events.filter(e => (e.phase ?? "file") === "file");
    const dirEvents = events.filter(e => e.phase === "dir");
    expect(fileEvents.length).toBeGreaterThan(0);
    expect(fileEvents[fileEvents.length - 1]!.current).toBe(fileEvents[fileEvents.length - 1]!.total);
    expect(dirEvents.length).toBeGreaterThan(0);
    expect(dirEvents[dirEvents.length - 1]!.current).toBe(dirEvents[dirEvents.length - 1]!.total);
    expect(dirEvents.every(e => e.total === dirEvents[0]!.total)).toBe(true);
  });

  test("QMD_DIR_NODES=0 with kind dir returns empty", () => {
    process.env.QMD_DIR_NODES = "0";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const hits = searchFTS(store.db, "uniqueDirToken", 10, collectionName, undefined, "dir");
    expect(hits).toEqual([]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
    delete process.env.QMD_DIR_NODES;
  });

  test("removing last file deactivates dir-node", async () => {
    await rm(join(collectionRoot, "docs", "ai", "one.md"));
    await rm(join(collectionRoot, "docs", "ai", "two.md"));
    await reindexCollection(store, collectionRoot, "**/*.md", collectionName, {
      l0Source: "n",
    });

    const dirDoc = findDocument(store.db, `qmd://${collectionName}/docs/ai`, { includeBody: false });
    expect("error" in dirDoc).toBe(true);
  });

  test("reindexFiles rebuilds ancestor dir only", async () => {
    await mkdir(join(collectionRoot, "docs", "ai"), { recursive: true });
    await writeFile(join(collectionRoot, "docs", "ai", "three.md"), "# Three\n\npartial update token gamma");

    await reindexFiles(store, [{
      collectionName,
      collectionPath: collectionRoot,
      relativePath: "docs/ai/three.md",
      globPattern: "**/*.md",
    }], {
      resolveL0Source: () => "n",
    });

    const dirDoc = findDocument(store.db, `qmd://${collectionName}/docs/ai`, { includeBody: true });
    expect("error" in dirDoc).toBe(false);
    if ("error" in dirDoc) return;
    expect(dirDoc.kind).toBe("dir");
    expect(dirDoc.body).toContain("three.md");
  });

  test("dirNodesDisabled reflects env", () => {
    delete process.env.QMD_DIR_NODES;
    expect(dirNodesDisabled()).toBe(false);
    process.env.QMD_DIR_NODES = "0";
    expect(dirNodesDisabled()).toBe(true);
    delete process.env.QMD_DIR_NODES;
  });
});
