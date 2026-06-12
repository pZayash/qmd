import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import {
  createStore,
  findDocument,
  getDocumentId,
  getOutEdges,
  getBacklinks,
  getDanglingEdges,
  reindexCollection,
  getDocid,
  hashContent,
  insertContent,
  insertDocument,
  type Store,
} from "../src/store.js";
import type { CollectionConfig } from "../src/collections.js";

let testDir: string;
let store: Store;
let collectionPath: string;

async function setup(): Promise<void> {
  testDir = await mkdtemp(join(tmpdir(), "qmd-cli-links-"));
  collectionPath = join(testDir, "vault");
  const configDir = join(testDir, "config");
  await mkdir(collectionPath, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(join(collectionPath, "setup.md"), "# Setup\n\nTarget.\n");
  await writeFile(join(collectionPath, "index.md"), "# Index\n\nSee [[Setup]]\n");
  await writeFile(join(collectionPath, "broken.md"), "# Broken\n\n[[Missing]]\n");
  await writeFile(join(configDir, "index.yml"), YAML.stringify({
    collections: {
      notes: { path: collectionPath, pattern: "**/*.md" },
    },
  } satisfies CollectionConfig));
  process.env.QMD_CONFIG_DIR = configDir;
  store = createStore(join(testDir, "index.sqlite"));
}

function collectionRelativePath(collectionName: string, displayPath: string): string {
  const prefix = `${collectionName}/`;
  return displayPath.startsWith(prefix) ? displayPath.slice(prefix.length) : displayPath;
}

function linksPayload(docArg: string) {
  const doc = findDocument(store.db, docArg);
  if ("error" in doc) throw new Error(`not found: ${docArg}`);
  const relPath = collectionRelativePath(doc.collectionName, doc.displayPath);
  const docId = getDocumentId(store.db, doc.collectionName, relPath);
  if (docId === null) throw new Error(`no id: ${docArg}`);
  const out = getOutEdges(store.db, docId);
  const backlinks = getBacklinks(store.db, docId);
  const dangling = out.filter(e => e.dstDocId === null);
  return { out, backlinks, dangling, doc };
}

beforeEach(async () => {
  await setup();
});

afterEach(async () => {
  store?.close();
  delete process.env.QMD_CONFIG_DIR;
  if (testDir) await rm(testDir, { recursive: true, force: true });
});

describe("qmd links CLI scenarios", () => {
  test("links before reindex returns empty without crash", async () => {
    const now = new Date().toISOString();
    const body = "# Index\n\nSee [[Setup]]\n";
    const hash = await hashContent(body);
    insertContent(store.db, hash, body, now);
    insertDocument(store.db, "notes", "index.md", "Index", hash, now, now);

    const payload = linksPayload("index.md");
    expect(payload.out).toHaveLength(0);
    expect(payload.backlinks).toHaveLength(0);
    expect(payload.dangling).toHaveLength(0);
  });

  test("links for a document after update", async () => {
    await reindexCollection(store, collectionPath, "**/*.md", "notes");
    const payload = linksPayload("index.md");
    expect(payload.out.some(e => e.dstPath === "setup.md")).toBe(true);
    expect(payload.backlinks).toHaveLength(0);
  });

  test("document by docid", async () => {
    await reindexCollection(store, collectionPath, "**/*.md", "notes");
    const setup = findDocument(store.db, "setup.md");
    if ("error" in setup) throw new Error("setup missing");
    const docid = getDocid(setup.hash);
    const payload = linksPayload(`#${docid}`);
    expect(payload.backlinks.some(b => b.srcPath === "index.md")).toBe(true);
  });

  test("collection-wide dangling", async () => {
    await reindexCollection(store, collectionPath, "**/*.md", "notes");
    const dangling = getDanglingEdges(store.db, "notes");
    expect(dangling.length).toBeGreaterThan(0);
    expect(dangling.every(e => e.collection === "notes")).toBe(true);
    expect(dangling.some(e => e.rawTarget === "Missing")).toBe(true);
  });

  test("json output shape", async () => {
    await reindexCollection(store, collectionPath, "**/*.md", "notes");
    const payload = linksPayload("index.md");
    const json = JSON.stringify({ out: payload.out, backlinks: payload.backlinks, dangling: payload.dangling });
    const parsed = JSON.parse(json) as { out: unknown[]; backlinks: unknown[]; dangling: unknown[] };
    expect(Array.isArray(parsed.out)).toBe(true);
    expect(Array.isArray(parsed.backlinks)).toBe(true);
    expect(Array.isArray(parsed.dangling)).toBe(true);
  });
});
