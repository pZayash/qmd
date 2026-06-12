import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createStore,
  hashContent,
  insertContent,
  insertDocument,
  insertLinkRefs,
  resolveDocEdges,
  getOutEdges,
  getBacklinks,
  getDanglingEdges,
  type Store,
} from "../src/store.js";
import { extractLinkRefs } from "../src/links.js";

let testDir: string;
let store: Store;

async function addDoc(collection: string, relativePath: string, body: string, title: string): Promise<number> {
  const hash = await hashContent(body);
  const now = new Date().toISOString();
  insertContent(store.db, hash, body, now);
  insertDocument(store.db, collection, relativePath, title, hash, now, now);
  insertLinkRefs(store.db, hash, extractLinkRefs(body));
  const row = store.db.prepare(`SELECT id FROM documents WHERE collection = ? AND path = ?`).get(collection, relativePath) as { id: number };
  return row.id;
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "qmd-link-read-"));
  store = createStore(join(testDir, "index.sqlite"));
});

afterEach(async () => {
  store.close();
  await rm(testDir, { recursive: true, force: true });
});

describe("link graph read API", () => {
  test("out edges include dangling", async () => {
    const srcId = await addDoc("notes", "index.md", "[[Good]] and [[Bad]]", "Index");
    await addDoc("notes", "good.md", "# Good\n", "Good");
    resolveDocEdges(store.db, "notes");

    const out = getOutEdges(store.db, srcId);
    expect(out).toHaveLength(2);
    expect(out.filter(e => e.dstDocId !== null)).toHaveLength(1);
    expect(out.filter(e => e.dstDocId === null)).toHaveLength(1);
    expect(out.find(e => e.rawTarget === "Bad")?.dstPath).toBeNull();
  });

  test("backlinks from two docs", async () => {
    const setupId = await addDoc("notes", "setup.md", "# Setup\n", "Setup");
    await addDoc("notes", "index.md", "[[Setup]]", "Index");
    await addDoc("notes", "readme.md", "[[Setup]]", "Readme");
    resolveDocEdges(store.db, "notes");

    const backlinks = getBacklinks(store.db, setupId);
    expect(backlinks.map(b => b.srcPath).sort()).toEqual(["index.md", "readme.md"]);
  });

  test("dangling scoped to collection", async () => {
    await addDoc("notes", "a.md", "[[missing]]", "A");
    await addDoc("other", "b.md", "[[also-missing]]", "B");
    resolveDocEdges(store.db, "notes");
    resolveDocEdges(store.db, "other");

    const notesOnly = getDanglingEdges(store.db, "notes");
    expect(notesOnly).toHaveLength(1);
    expect(notesOnly[0]!.collection).toBe("notes");
    expect(notesOnly[0]!.srcPath).toBe("a.md");
  });
});
