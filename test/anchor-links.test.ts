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
  insertDocAnchors,
  resolveDocEdges,
  getBacklinks,
  getOutEdges,
  getDanglingEdges,
  backfillLinkRefs,
  hasDocAnchorsForDoc,
  type Store,
} from "../src/store.js";
import { extractLinkRefs, extractHeadingAnchors, slugifyAnchor } from "../src/links.js";

let testDir: string;
let store: Store;

async function addDoc(
  collection: string,
  relativePath: string,
  body: string,
  title: string,
): Promise<number> {
  const hash = await hashContent(body);
  const now = new Date().toISOString();
  insertContent(store.db, hash, body, now);
  insertDocument(store.db, collection, relativePath, title, hash, now, now);
  insertLinkRefs(store.db, hash, extractLinkRefs(body));
  const headings = extractHeadingAnchors(body);
  const row = store.db.prepare(`SELECT id FROM documents WHERE collection = ? AND path = ?`).get(collection, relativePath) as { id: number };
  insertDocAnchors(store.db, row.id, collection, headings);
  return row.id;
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "qmd-anchor-links-"));
  store = createStore(join(testDir, "index.sqlite"));
});

afterEach(async () => {
  store.close();
  await rm(testDir, { recursive: true, force: true });
});

describe("slugifyAnchor", () => {
  test("cyrillic heading with spaces", () => {
    expect(slugifyAnchor("## При Записи")).toBe("при-записи");
  });

  test("case-insensitive cyrillic", () => {
    expect(slugifyAnchor("ПриЗаписи")).toBe(slugifyAnchor("приЗаписи"));
  });

  test("collapses whitespace", () => {
    expect(slugifyAnchor("  Foo   Bar  ")).toBe("foo-bar");
  });
});

describe("extractHeadingAnchors", () => {
  test("ATX headings with ord and offsets", () => {
    const body = "# Top\n\n## ПроцА\n\n### Nested\n";
    const anchors = extractHeadingAnchors(body);
    expect(anchors.map(a => a.slug)).toEqual(["top", "проца", "nested"]);
    expect(anchors.map(a => a.ord)).toEqual([0, 1, 2]);
    expect(anchors[1]!.offset).toBe(body.indexOf("## ПроцА"));
  });

  test("star-title form", () => {
    const body = "* ПроцБ\n\nBody\n";
    const anchors = extractHeadingAnchors(body);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.slug).toBe("процб");
  });
});

describe("anchor link graph", () => {
  test("anchor edge resolves and backlinks match slug", async () => {
    const moduleId = await addDoc(
      "notes",
      "module.md",
      "## ПроцB\n\nBody.\n",
      "Module",
    );
    await addDoc(
      "notes",
      "caller.md",
      "## Caller\n\nSee [[Module#ПроцB]]\n",
      "Caller",
    );
    resolveDocEdges(store.db, "notes");

    const slug = slugifyAnchor("ПроцB");
    const edge = store.db.prepare(`
      SELECT anchor, dst_doc_id FROM doc_edges e
      JOIN documents s ON e.src_doc_id = s.id
      WHERE s.path = 'caller.md'
    `).get() as { anchor: string; dst_doc_id: number };
    expect(edge.dst_doc_id).toBe(moduleId);
    expect(edge.anchor).toBe(slug);

    const backlinks = getBacklinks(store.db, moduleId, slug);
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0]!.srcPath).toBe("caller.md");
  });

  test("unresolved anchor is anchor-dangling", async () => {
    await addDoc("notes", "module.md", "## ПроцB\n", "Module");
    await addDoc("notes", "caller.md", "[[Module#Missing]]\n", "Caller");
    resolveDocEdges(store.db, "notes");

    const dangling = getDanglingEdges(store.db, "notes");
    const anchorDangling = dangling.filter(d => d.danglingKind === "anchor");
    expect(anchorDangling).toHaveLength(1);
    expect(anchorDangling[0]!.rawTarget).toBe("Module");
    expect(anchorDangling[0]!.anchor).toBe(slugifyAnchor("Missing"));
  });

  test("out-links scoped by source heading", async () => {
    const moduleId = await addDoc(
      "notes",
      "module.md",
      "## ПроцA\n\n[[Other#ПроцX]]\n\n## ПроцB\n\nNo links.\n",
      "Module",
    );
    await addDoc("notes", "other.md", "## ПроцX\n", "Other");
    resolveDocEdges(store.db, "notes");

    const slugA = slugifyAnchor("ПроцA");
    const calls = getOutEdges(store.db, moduleId, slugA);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.dstPath).toBe("other.md");
    expect(calls[0]!.anchor).toBe(slugifyAnchor("ПроцX"));

    const slugB = slugifyAnchor("ПроцB");
    expect(getOutEdges(store.db, moduleId, slugB)).toHaveLength(0);
  });

  test("link without anchor unchanged", async () => {
    const setupId = await addDoc("notes", "setup.md", "# Setup\n", "Setup");
    await addDoc("notes", "index.md", "[[Setup]]\n", "Index");
    resolveDocEdges(store.db, "notes");

    const edge = store.db.prepare(`
      SELECT anchor FROM doc_edges e
      JOIN documents s ON e.src_doc_id = s.id
      WHERE s.path = 'index.md'
    `).get() as { anchor: string | null };
    expect(edge.anchor).toBeNull();
    expect(getBacklinks(store.db, setupId)).toHaveLength(1);
  });
});

describe("anchor backfill", () => {
  test("populates doc_anchors without re-embed", async () => {
    const body = "## ПроцA\n\n[[Other#ПроцX]]\n";
    const hash = await hashContent(body);
    const now = new Date().toISOString();
    insertContent(store.db, hash, body, now);
    insertDocument(store.db, "notes", "module.md", "Module", hash, now, now);
    insertLinkRefs(store.db, hash, extractLinkRefs(body));
    const row = store.db.prepare(`SELECT id FROM documents WHERE path = 'module.md'`).get() as { id: number };
    expect(hasDocAnchorsForDoc(store.db, row.id)).toBe(false);

    await addDoc("notes", "other.md", "## ПроцX\n", "Other");
    resolveDocEdges(store.db, "notes");

    const result = await backfillLinkRefs(store.db, "notes");
    expect(result.anchorsWritten).toBeGreaterThan(0);
    expect(hasDocAnchorsForDoc(store.db, row.id)).toBe(true);

    resolveDocEdges(store.db, "notes");
    const slug = slugifyAnchor("ПроцX");
    const otherId = (store.db.prepare(`SELECT id FROM documents WHERE path = 'other.md'`).get() as { id: number }).id;
    expect(getBacklinks(store.db, otherId, slug)).toHaveLength(1);
  });
});
