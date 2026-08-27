/**
 * Dir-node L0 helpers — extractive summaries, contract files, 1C xml peek.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";

export type L0Source = "n" | "p" | "q";
export type DocumentKind = "file" | "dir";

const MAX_XML_BYTES = 64 * 1024;
const MAX_LISTED_NAMES = 32;
const MAX_L0_CHARS = 500;

export function resolveL0Source(raw: unknown): L0Source {
  if (raw === "n" || raw === "p" || raw === "q") return raw;
  if (raw !== undefined && raw !== null && raw !== "") {
    console.error(`Invalid l0_source value ${JSON.stringify(raw)}; defaulting to "n"`);
  }
  return "n";
}

/** CLI/MCP: require exactly file|dir. Throws on anything else. */
export function parseDocumentKind(raw: string): DocumentKind {
  const v = raw.trim().toLowerCase();
  if (v === "file" || v === "dir") return v;
  throw new Error(`Invalid --kind ${JSON.stringify(raw)}; expected file or dir`);
}

/** Collection-relative ancestor directories for an indexed file path (posix, no trailing slash). */
export function ancestorDirPaths(fileRelPath: string): string[] {
  const parts = fileRelPath.split("/").filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}

export function collectDirPathsFromFiles(filePaths: string[]): Set<string> {
  const dirs = new Set<string>();
  for (const fp of filePaths) {
    for (const d of ancestorDirPaths(fp)) {
      dirs.add(d);
    }
  }
  return dirs;
}

/** Sibling 1C metadata xml: Name + ru Synonym from the first 64KiB (header). */
export function peek1cXml(xmlPath: string): { name: string; synonym: string } | null {
  try {
    const stat = statSync(xmlPath);
    if (!stat.isFile() || stat.size === 0) return null;
    const buf = Buffer.alloc(Math.min(stat.size, MAX_XML_BYTES));
    const fd = openSync(xmlPath, "r");
    try {
      readSync(fd, buf, 0, buf.length, 0);
    } finally {
      closeSync(fd);
    }
    const text = buf.toString("utf-8");
    const nameMatch = text.match(/<Name[^>]*>([^<]+)<\/Name>/i);
    const name = nameMatch?.[1]?.trim();
    if (!name) return null;

    const ruSynonymMatch = text.match(
      /<v8:lang>\s*ru\s*<\/v8:lang>\s*<v8:content>([^<]*)<\/v8:content>/i,
    );
    const synonym = ruSynonymMatch?.[1]?.trim() ?? "";
    return { name, synonym };
  } catch {
    return null;
  }
}

export function xmlPathForDir(collectionRoot: string, dirRelPath: string): string {
  const segments = dirRelPath.split("/").filter(Boolean);
  const base = segments[segments.length - 1] ?? dirRelPath;
  const parent = segments.length > 1 ? segments.slice(0, -1).join("/") : "";
  const rel = parent ? `${parent}/${base}.xml` : `${base}.xml`;
  return join(collectionRoot, rel);
}

export type ExtractiveL0Input = {
  dirRelPath: string;
  pathContext?: string | null;
  xmlPeek?: { name: string; synonym: string } | null;
  childDirs: string[];
  childFiles: { basename: string; heading?: string }[];
  extFiles?: string[];
  formDirs?: string[];
  commandDirs?: string[];
  templateDirs?: string[];
};

function l0Fits(lines: string[], addition: string): boolean {
  const cur = lines.length === 0 ? 0 : lines.join("\n").length;
  const extra = cur === 0 ? addition.length : 1 + addition.length;
  return cur + extra <= MAX_L0_CHARS;
}

function l0PushLine(lines: string[], line: string): boolean {
  if (!l0Fits(lines, line)) return false;
  lines.push(line);
  return true;
}

/** Push `prefix + names` as one comma line. Returns how many names did not fit. */
function l0PushCommaLine(lines: string[], prefix: string, names: string[]): number {
  if (names.length === 0) return 0;
  const included: string[] = [];
  for (const name of names) {
    const candidate = `${prefix}${[...included, name].join(", ")}`;
    if (!l0Fits(lines, candidate)) break;
    included.push(name);
  }
  if (included.length === 0) return names.length;
  lines.push(`${prefix}${included.join(", ")}`);
  return names.length - included.length;
}

/** Deterministic L0: named-child expansion then leftover directs; 32 leftover names; 500 chars. */
export function buildExtractiveL0(input: ExtractiveL0Input): string {
  const lines: string[] = [];
  let overflow = 0;
  const extFiles = input.extFiles ?? [];
  const formDirs = input.formDirs ?? [];
  const commandDirs = input.commandDirs ?? [];
  const templateDirs = input.templateDirs ?? [];

  l0PushLine(lines, input.dirRelPath);
  if (input.pathContext?.trim()) {
    l0PushLine(lines, input.pathContext.trim());
  }
  if (input.xmlPeek) {
    const { name, synonym } = input.xmlPeek;
    l0PushLine(lines, synonym ? `${name} — ${synonym}` : name);
  }

  overflow += l0PushCommaLine(lines, "Ext: ", extFiles);
  overflow += l0PushCommaLine(lines, "Forms: ", formDirs);
  overflow += l0PushCommaLine(lines, "Commands: ", commandDirs);
  overflow += l0PushCommaLine(lines, "Templates: ", templateDirs);

  if (input.childFiles.length > 0) {
    const count = `${input.childFiles.length} file${input.childFiles.length === 1 ? "" : "s"}`;
    l0PushLine(lines, count);
  }

  let shown = 0;
  const dirIncluded: string[] = [];
  for (let i = 0; i < input.childDirs.length; i++) {
    if (shown >= MAX_LISTED_NAMES) {
      overflow += input.childDirs.length - i;
      break;
    }
    const candidate = `dirs: ${[...dirIncluded, input.childDirs[i]].join(", ")}`;
    if (!l0Fits(lines, candidate)) {
      overflow += input.childDirs.length - i;
      break;
    }
    dirIncluded.push(input.childDirs[i]!);
    shown++;
  }
  if (dirIncluded.length > 0) {
    lines.push(`dirs: ${dirIncluded.join(", ")}`);
  }

  for (let i = 0; i < input.childFiles.length; i++) {
    if (shown >= MAX_LISTED_NAMES) {
      overflow += input.childFiles.length - i;
      break;
    }
    const file = input.childFiles[i]!;
    const line = file.heading?.trim()
      ? `${file.basename} — ${file.heading.trim()}`
      : file.basename;
    if (!l0PushLine(lines, line)) {
      overflow += input.childFiles.length - i;
      break;
    }
    shown++;
  }

  if (overflow > 0) {
    l0PushLine(lines, `+${overflow} more`);
  }

  return lines.join("\n");
}

/** Indexed-path expansion: Ext files; Forms/Commands/Templates child dirs. */
export function namedChildExpansion(
  filePaths: string[],
  dirRelPath: string,
): { extFiles: string[]; formDirs: string[]; commandDirs: string[]; templateDirs: string[] } {
  const { childDirs } = getDirectChildren(filePaths, dirRelPath);
  const extFiles: string[] = [];
  const formDirs: string[] = [];
  const commandDirs: string[] = [];
  const templateDirs: string[] = [];
  if (childDirs.includes("Ext")) {
    const extPath = dirRelPath ? `${dirRelPath}/Ext` : "Ext";
    extFiles.push(...getDirectChildren(filePaths, extPath).childFiles.map(f => f.basename));
  }
  if (childDirs.includes("Forms")) {
    const formsPath = dirRelPath ? `${dirRelPath}/Forms` : "Forms";
    formDirs.push(...getDirectChildren(filePaths, formsPath).childDirs);
  }
  if (childDirs.includes("Commands")) {
    const commandsPath = dirRelPath ? `${dirRelPath}/Commands` : "Commands";
    commandDirs.push(...getDirectChildren(filePaths, commandsPath).childDirs);
  }
  if (childDirs.includes("Templates")) {
    const templatesPath = dirRelPath ? `${dirRelPath}/Templates` : "Templates";
    templateDirs.push(...getDirectChildren(filePaths, templatesPath).childDirs);
  }
  return { extFiles, formDirs, commandDirs, templateDirs };
}

function contractL0FullPath(collectionRoot: string, dirRelPath: string): string {
  const rel = join(".qmd", "l0", `${dirRelPath.replace(/\\/g, "/")}.md`);
  return join(collectionRoot, rel);
}

/** Same child/xml/heading assembly as dir-node rebuild (extractive only). */
export function buildExtractiveL0ForDir(
  collectionRoot: string,
  dirRelPath: string,
  filePaths: string[],
  pathContext: string | null,
): string {
  const { childDirs, childFiles } = getDirectChildren(filePaths, dirRelPath);
  const { extFiles, formDirs, commandDirs, templateDirs } = namedChildExpansion(filePaths, dirRelPath);
  return buildExtractiveL0({
    dirRelPath,
    pathContext,
    xmlPeek: peek1cXml(xmlPathForDir(collectionRoot, dirRelPath)),
    childDirs,
    childFiles: childFiles.map(f => ({
      basename: f.basename,
      heading: readFirstMarkdownHeading(collectionRoot, f.path),
    })),
    extFiles,
    formDirs,
    commandDirs,
    templateDirs,
  });
}

/** Dirs to seed: one named dir-node, or all dir-nodes from file paths. */
export function resolveSeedDirs(
  filePaths: string[],
  dirRelPath?: string,
): { dirs: string[] } | { error: string } {
  const known = collectDirPathsFromFiles(filePaths);
  if (dirRelPath === undefined) {
    return { dirs: [...known].sort() };
  }
  const rel = dirRelPath.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!rel) return { error: "directory path is empty" };
  if (!known.has(rel)) return { error: `Not a dir-node (no indexed files under it): ${rel}` };
  return { dirs: [rel] };
}

/** Shadow contract: `{collectionRoot}/.qmd/l0/{dirRelPath}.md` */
export function readContractL0(collectionRoot: string, dirRelPath: string): string | null {
  try {
    const text = readFileSync(contractL0FullPath(collectionRoot, dirRelPath), "utf-8");
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/** Write extractive L0 into a missing/empty contract. Skip non-empty. */
export function writeContractL0(
  collectionRoot: string,
  dirRelPath: string,
  text: string,
): "written" | "skipped" {
  if (readContractL0(collectionRoot, dirRelPath)) return "skipped";
  const full = contractL0FullPath(collectionRoot, dirRelPath);
  mkdirSync(dirname(full), { recursive: true });
  const body = text.endsWith("\n") ? text : `${text}\n`;
  writeFileSync(full, body, "utf-8");
  return "written";
}

export function chooseL0Text(opts: {
  source: L0Source;
  contract: string | null;
  extractive: string;
}): string {
  if (opts.source === "q") {
    console.error("l0_source=q: API generate not implemented; using contract or extractive L0");
  }
  if (opts.source === "p" || opts.source === "q") {
    if (opts.contract) return opts.contract;
  }
  return opts.extractive;
}

export function readFirstMarkdownHeading(collectionRoot: string, relPath: string): string | undefined {
  if (!relPath.toLowerCase().endsWith(".md")) return undefined;
  try {
    const content = readFileSync(join(collectionRoot, relPath), "utf-8");
    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function getDirectChildren(
  filePaths: string[],
  dirRelPath: string,
): { childDirs: string[]; childFiles: { path: string; basename: string }[] } {
  const childDirSet = new Set<string>();
  const childFiles: { path: string; basename: string }[] = [];

  if (!dirRelPath) {
    for (const fp of filePaths) {
      const slash = fp.indexOf("/");
      if (slash === -1) {
        childFiles.push({ path: fp, basename: fp });
      } else {
        childDirSet.add(fp.slice(0, slash));
      }
    }
  } else {
    const prefix = `${dirRelPath}/`;
    for (const fp of filePaths) {
      if (!fp.startsWith(prefix)) continue;
      const rel = fp.slice(prefix.length);
      const slash = rel.indexOf("/");
      if (slash === -1) {
        childFiles.push({ path: fp, basename: rel });
      } else {
        childDirSet.add(rel.slice(0, slash));
      }
    }
  }

  return {
    childDirs: [...childDirSet].sort(),
    childFiles: childFiles.sort((a, b) => a.basename.localeCompare(b.basename)),
  };
}

export const MAX_LS_CHILDREN = 200;

export type IndexedChildrenListing = {
  childDirs: string[];
  childFiles: { path: string; basename: string }[];
  truncated: boolean;
  omitted: number;
};

/** One-level indexed children; dirs first; cap MAX_LS_CHILDREN. */
export function listIndexedChildren(
  filePaths: string[],
  dirRelPath: string,
): IndexedChildrenListing {
  const { childDirs, childFiles } = getDirectChildren(filePaths, dirRelPath);
  const total = childDirs.length + childFiles.length;
  if (total <= MAX_LS_CHILDREN) {
    return { childDirs, childFiles, truncated: false, omitted: 0 };
  }
  const omitted = total - MAX_LS_CHILDREN;
  const dirsKeep = Math.min(childDirs.length, MAX_LS_CHILDREN);
  const filesKeep = MAX_LS_CHILDREN - dirsKeep;
  return {
    childDirs: childDirs.slice(0, dirsKeep),
    childFiles: childFiles.slice(0, filesKeep),
    truncated: true,
    omitted,
  };
}

export function dirHasIndexedFiles(filePaths: string[], dirRelPath: string): boolean {
  const prefix = `${dirRelPath}/`;
  return filePaths.some(fp => fp.startsWith(prefix));
}
