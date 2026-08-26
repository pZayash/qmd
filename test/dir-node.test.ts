import { describe, test, expect, vi, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  ancestorDirPaths,
  buildExtractiveL0,
  chooseL0Text,
  peek1cXml,
  readContractL0,
  resolveL0Source,
  parseDocumentKind,
  namedChildExpansion,
  listIndexedChildren,
  MAX_LS_CHILDREN,
} from "../src/dir-node.js";

describe("dir-node helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("ancestorDirPaths returns posix ancestors without trailing slash", () => {
    expect(ancestorDirPaths("docs/ai/search.md")).toEqual(["docs", "docs/ai"]);
    expect(ancestorDirPaths("readme.md")).toEqual([]);
  });

  test("buildExtractiveL0 lists direct children and caps at 32 with +N more", () => {
    const childFiles = Array.from({ length: 40 }, (_, i) => ({
      basename: `file-${i}.md`,
    }));
    const text = buildExtractiveL0({
      dirRelPath: "docs/ai",
      childDirs: ["sub"],
      childFiles,
    });
    expect(text.startsWith("docs/ai\n")).toBe(true);
    expect(text).toContain("40 files");
    expect(text).toContain("dirs: sub");
    expect(text).toContain("+9 more");
  });

  test("buildExtractiveL0 lists Ext files and Forms dirs for 1C-shaped input", () => {
    const text = buildExtractiveL0({
      dirRelPath: "conf/Documents/ЗаказПокупателя",
      xmlPeek: { name: "Document.ЗаказПокупателя", synonym: "Заказ покупателя" },
      childDirs: ["Commands", "Ext", "Forms", "Templates"],
      childFiles: [],
      extFiles: ["ManagerModule.bsl", "ObjectModule.bsl"],
      formDirs: ["ФормаДокумента", "ФормаСписка"],
    });
    expect(text).toContain("Ext: ManagerModule.bsl, ObjectModule.bsl");
    expect(text).toContain("Forms: ФормаДокумента, ФормаСписка");
    expect(text).toContain("dirs: Commands, Ext, Forms, Templates");
  });

  test("buildExtractiveL0 omits Ext/Forms lines for markdown-only folders", () => {
    const text = buildExtractiveL0({
      dirRelPath: "docs/ai",
      childDirs: ["sub"],
      childFiles: [{ basename: "readme.md", heading: "Readme" }],
    });
    expect(text).toContain("readme.md — Readme");
    expect(text).not.toMatch(/^Ext:/m);
    expect(text).not.toContain("Ext:");
    expect(text).not.toContain("Forms:");
  });

  test("buildExtractiveL0 drops whole form names under 500 chars", () => {
    const formDirs = Array.from({ length: 40 }, (_, i) =>
      `ФормаОченьДлинноеИмяДляПроверкиБюджета${String(i).padStart(3, "0")}`,
    );
    const naive = `obj\nForms: ${formDirs.join(", ")}`;
    expect(naive.length).toBeGreaterThan(500);
    const text = buildExtractiveL0({
      dirRelPath: "obj",
      childDirs: [],
      childFiles: [],
      formDirs,
    });
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).toContain("+");
    expect(text).toMatch(/\+\d+ more$/);
    expect(text.endsWith("...")).toBe(false);
  });

  test("namedChildExpansion reads Ext files and Forms dirs, not Commands", () => {
    const files = [
      "obj/Ext/ManagerModule.bsl",
      "obj/Ext/ObjectModule.bsl",
      "obj/Forms/ФормаДокумента/Module.bsl",
      "obj/Commands/X/Ext/CommandModule.bsl",
    ];
    expect(namedChildExpansion(files, "obj")).toEqual({
      extFiles: ["ManagerModule.bsl", "ObjectModule.bsl"],
      formDirs: ["ФормаДокумента"],
    });
  });

  test("listIndexedChildren is one level: file plus child dir, not grandchild", () => {
    const files = ["docs/ai/one.md", "docs/ai/sub/two.md"];
    const listing = listIndexedChildren(files, "docs/ai");
    expect(listing.childFiles.map(f => f.basename)).toEqual(["one.md"]);
    expect(listing.childDirs).toEqual(["sub"]);
    expect(listing.truncated).toBe(false);
    expect(listing.omitted).toBe(0);
  });

  test("listIndexedChildren caps at 200 with omitted count", () => {
    const files = [
      ...Array.from({ length: 150 }, (_, i) => `root/dir-${String(i).padStart(3, "0")}/x.md`),
      ...Array.from({ length: 80 }, (_, i) => `root/file-${String(i).padStart(3, "0")}.md`),
    ];
    const listing = listIndexedChildren(files, "root");
    expect(listing.childDirs.length + listing.childFiles.length).toBe(MAX_LS_CHILDREN);
    expect(listing.truncated).toBe(true);
    expect(listing.omitted).toBe(30);
    expect(listing.childDirs.length).toBe(150);
    expect(listing.childFiles.length).toBe(50);
  });

  test("peek1cXml reads Name and ru Synonym", () => {
    const xmlPath = join(process.cwd(), "test/fixtures/1c-order.xml");
    const peek = peek1cXml(xmlPath);
    expect(peek).toEqual({
      name: "Document.ЗаказПокупателя",
      synonym: "Заказ покупателя",
    });
  });

  test("peek1cXml reads header of xml larger than 64KiB", async () => {
    const root = await mkdtemp(join(tmpdir(), "qmd-xml-"));
    const xmlPath = join(root, "fat.xml");
    const header = `<?xml version="1.0"?><MetaDataObject xmlns:v8="http://v8.1c.ru/8.1/data/core"><Name>FatDoc</Name><Synonym><v8:item><v8:lang>ru</v8:lang><v8:content>Жирный документ</v8:content></v8:item></Synonym>`;
    await writeFile(xmlPath, header + "x".repeat(70 * 1024));
    expect(peek1cXml(xmlPath)).toEqual({ name: "FatDoc", synonym: "Жирный документ" });
  });

  test("readContractL0 reads shadow tree file", async () => {
    const root = await mkdtemp(join(tmpdir(), "qmd-contract-"));
    await mkdir(join(root, ".qmd", "l0", "docs"), { recursive: true });
    await writeFile(join(root, ".qmd", "l0", "docs", "ai.md"), "Contract L0 text\n");
    expect(readContractL0(root, "docs/ai")).toBe("Contract L0 text");
  });

  test("chooseL0Text respects n/p/q modes", () => {
    const extractive = "extractive body";
    expect(chooseL0Text({ source: "n", contract: "contract", extractive })).toBe(extractive);
    expect(chooseL0Text({ source: "p", contract: "contract", extractive })).toBe("contract");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(chooseL0Text({ source: "q", contract: null, extractive })).toBe(extractive);
    expect(err).toHaveBeenCalled();
  });

  test("resolveL0Source coerces invalid values to n", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveL0Source("p")).toBe("p");
    expect(resolveL0Source("bogus")).toBe("n");
    expect(err).toHaveBeenCalled();
  });

  test("parseDocumentKind accepts file|dir and rejects other values", () => {
    expect(parseDocumentKind("file")).toBe("file");
    expect(parseDocumentKind("DIR")).toBe("dir");
    expect(() => parseDocumentKind("both")).toThrow(/expected file or dir/);
    expect(() => parseDocumentKind("")).toThrow(/expected file or dir/);
  });
});
