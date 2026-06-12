import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import {
  createStore,
  hashContent,
  insertContent,
  insertDocument,
  insertLinkRefs,
  resolveDocEdges,
  reindexCollection,
  type Store,
} from "../src/store.js";
import type { CollectionConfig } from "../src/collections.js";

let testDir: string;
let store: Store;
let collectionPath: string;

async function setupCollection(): Promise<void> {
  testDir = await mkdtemp(join(tmpdir(), "qmd-link-resolve-"));
  collectionPath = join(testDir, "vault");
  const configDir = join(testDir, "config");
  await mkdir(configDir, { recursive: true });
  await mkdir(collectionPath, { recursive: true });
  await writeFile(join(configDir, "index.yml"), YAML.stringify({
    collections: {
      notes: { path: collectionPath, pattern: "**/*.md" },
    },
  } satisfies CollectionConfig));
  process.env.QMD_CONFIG_DIR = configDir;

  store = createStore(join(testDir, "index.sqlite"));
}

async function addDoc(relativePath: string, body: string, title?: string): Promise<number> {
  const hash = await hashContent(body);
  const now = new Date().toISOString();
  insertContent(store.db, hash, body, now);
  insertDocument(store.db, "notes", relativePath, title ?? relativePath, hash, now, now);
  insertLinkRefs(store.db, hash, (await import("../src/links.js")).extractLinkRefs(body));
  const row = store.db.prepare(`SELECT id FROM documents WHERE collection = 'notes' AND path = ?`).get(relativePath) as { id: number };
  return row.id;
}

afterEach(async () => {
  store?.close();
  delete process.env.QMD_CONFIG_DIR;
  if (testDir) await rm(testDir, { recursive: true, force: true });
});

describe("resolveDocEdges", () => {
  beforeEach(async () => {
    await setupCollection();
  });

  test("wikilink resolves to a document", async () => {
    await addDoc("setup-guide.md", "# Setup Guide\n\nBody.", "Setup Guide");
    await addDoc("index.md", "See [[Setup Guide]]", "Index");
    resolveDocEdges(store.db, "notes");

    const edge = store.db.prepare(`
      SELECT dst_doc_id FROM doc_edges e
      JOIN documents s ON e.src_doc_id = s.id
      WHERE s.path = 'index.md'
    `).get() as { dst_doc_id: number };
    const dst = store.db.prepare(`SELECT path FROM documents WHERE id = ?`).get(edge.dst_doc_id) as { path: string };
    expect(dst.path).toBe("setup-guide.md");
  });

  test("ambiguous wikilink uses shortest path", async () => {
    await addDoc("a/setup.md", "# setup\n", "setup");
    await addDoc("a/b/setup.md", "# setup\n", "setup");
    await addDoc("index.md", "[[setup]]", "Index");
    resolveDocEdges(store.db, "notes");

    const edge = store.db.prepare(`
      SELECT d.path AS dst_path
      FROM doc_edges e
      JOIN documents s ON e.src_doc_id = s.id
      JOIN documents d ON e.dst_doc_id = d.id
      WHERE s.path = 'index.md'
    `).get() as { dst_path: string };
    expect(edge.dst_path).toBe("a/setup.md");
  });

  test("relative markdown link resolves", async () => {
    await addDoc("docs/guide.md", "# Guide\n", "Guide");
    await addDoc("docs/intro.md", "[g](./guide.md)", "Intro");
    resolveDocEdges(store.db, "notes");

    const edge = store.db.prepare(`
      SELECT d.path AS dst_path
      FROM doc_edges e
      JOIN documents s ON e.src_doc_id = s.id AND s.path = 'docs/intro.md'
      JOIN documents d ON e.dst_doc_id = d.id
    `).get() as { dst_path: string };
    expect(edge.dst_path).toBe("docs/guide.md");
  });

  test("mdlink from dotfile path does not throw on resolve", async () => {
    await addDoc(".gitignore", "[cfg](./README.md)", ".gitignore");
    await addDoc("README.md", "# Readme\n", "Readme");
    expect(() => resolveDocEdges(store.db, "notes")).not.toThrow();
  });

  test("unresolved target is dangling", async () => {
    await addDoc("index.md", "[[Missing Note]]", "Index");
    resolveDocEdges(store.db, "notes");

    const edge = store.db.prepare(`
      SELECT dst_doc_id, raw_target FROM doc_edges e
      JOIN documents s ON e.src_doc_id = s.id
      WHERE s.path = 'index.md'
    `).get() as { dst_doc_id: number | null; raw_target: string };
    expect(edge.dst_doc_id).toBeNull();
    expect(edge.raw_target).toBe("Missing Note");
  });

  test("edges rebuilt dangling after rename", async () => {
    const { mkdir, writeFile: wf } = await import("node:fs/promises");
    await mkdir(join(collectionPath, "docs"), { recursive: true });
    await wf(join(collectionPath, "docs", "guide.md"), "# Guide\n");
    await wf(join(collectionPath, "docs", "intro.md"), "[g](./guide.md)\n");

    await reindexCollection(store, collectionPath, "**/*.md", "notes");
    let edge = store.db.prepare(`
      SELECT dst_doc_id IS NOT NULL AS resolved
      FROM doc_edges e
      JOIN documents s ON e.src_doc_id = s.id
      WHERE s.path = 'docs/intro.md'
    `).get() as { resolved: number };
    expect(edge.resolved).toBe(1);

    await rm(join(collectionPath, "docs", "guide.md"));
    await reindexCollection(store, collectionPath, "**/*.md", "notes");
    edge = store.db.prepare(`
      SELECT dst_doc_id IS NULL AS dangling
      FROM doc_edges e
      JOIN documents s ON e.src_doc_id = s.id
      WHERE s.path = 'docs/intro.md'
    `).get() as { dangling: number };
    expect(edge.dangling).toBe(1);
  });
});
