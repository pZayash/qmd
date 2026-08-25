/**
 * Dir-node L0 helpers — extractive summaries, contract files, 1C xml peek.
 */

import { readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";

export type L0Source = "n" | "p" | "q";
export type DocumentKind = "file" | "dir";

const MAX_XML_BYTES = 64 * 1024;
const MAX_LISTED_NAMES = 32;

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
};

/** Deterministic L0 from direct children only; cap 32 names with "+N more". */
export function buildExtractiveL0(input: ExtractiveL0Input): string {
  const lines: string[] = [input.dirRelPath];

  if (input.pathContext?.trim()) {
    lines.push(input.pathContext.trim());
  }

  if (input.xmlPeek) {
    const { name, synonym } = input.xmlPeek;
    lines.push(synonym ? `${name} — ${synonym}` : name);
  }

  const totalNames = input.childDirs.length + input.childFiles.length;
  if (input.childFiles.length > 0) {
    lines.push(`${input.childFiles.length} file${input.childFiles.length === 1 ? "" : "s"}`);
  }

  let shown = 0;
  let overflow = 0;

  if (input.childDirs.length > 0) {
    const slice = input.childDirs.slice(0, MAX_LISTED_NAMES - shown);
    shown += slice.length;
    overflow += input.childDirs.length - slice.length;
    lines.push(`dirs: ${slice.join(", ")}`);
  }

  for (const file of input.childFiles) {
    if (shown >= MAX_LISTED_NAMES) {
      overflow++;
      continue;
    }
    const line = file.heading?.trim()
      ? `${file.basename} — ${file.heading.trim()}`
      : file.basename;
    lines.push(line);
    shown++;
  }

  if (overflow > 0) {
    lines.push(`+${overflow} more`);
  } else if (totalNames > MAX_LISTED_NAMES) {
    lines.push(`+${totalNames - MAX_LISTED_NAMES} more`);
  }

  let text = lines.join("\n");
  if (text.length > 500) {
    text = text.slice(0, 497) + "...";
  }
  return text;
}

/** Shadow contract: `{collectionRoot}/.qmd/l0/{dirRelPath}.md` */
export function readContractL0(collectionRoot: string, dirRelPath: string): string | null {
  const rel = join(".qmd", "l0", `${dirRelPath.replace(/\\/g, "/")}.md`);
  const full = join(collectionRoot, rel);
  try {
    const text = readFileSync(full, "utf-8");
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
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

export function dirHasIndexedFiles(filePaths: string[], dirRelPath: string): boolean {
  const prefix = `${dirRelPath}/`;
  return filePaths.some(fp => fp.startsWith(prefix));
}
