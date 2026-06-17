import { findCodeFences, isInsideCodeFence } from "./store.js";

export type LinkRef = {
  kind: "wikilink" | "mdlink";
  rawTarget: string;
  anchor: string | null;
  srcAnchor: string | null;
};

export type HeadingAnchor = {
  slug: string;
  kind: "heading";
  ord: number;
  offset: number;
};

const WIKILINK_RE = /!?\[\[([^\]]+)\]\]/g;
const MDLINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

function parseWikilinkTarget(inner: string): { rawTarget: string; anchor: string | null } {
  const withoutAlias = inner.split("|")[0] ?? inner;
  const hashIdx = withoutAlias.indexOf("#");
  if (hashIdx === -1) {
    return { rawTarget: withoutAlias.trim(), anchor: null };
  }
  return {
    rawTarget: withoutAlias.slice(0, hashIdx).trim(),
    anchor: withoutAlias.slice(hashIdx + 1).trim() || null,
  };
}

function parseMdlinkTarget(target: string): { rawTarget: string; anchor: string | null } | null {
  const trimmed = target.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("#")) {
    return null;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return null;
  }
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx === -1) {
    return { rawTarget: trimmed, anchor: null };
  }
  return {
    rawTarget: trimmed.slice(0, hashIdx).trim(),
    anchor: trimmed.slice(hashIdx + 1).trim() || null,
  };
}

/** Normalize heading or link `#anchor` text to a shared slug for matching. */
export function slugifyAnchor(text: string): string {
  let s = text.trim();
  s = s.replace(/^#+\s*/, "");
  s = s.replace(/^\*+\s*/, "");
  s = s.toLocaleLowerCase();
  s = s.replace(/\s+/g, "-");
  return s;
}

const ATX_HEADING_RE = /^#{1,6}\s+(.+)$/gm;
const STAR_HEADING_RE = /^\*+\s+(.+)$/gm;

/** Extract markdown headings as doc anchors (ATX and `*`-title forms). */
export function extractHeadingAnchors(content: string): HeadingAnchor[] {
  const anchors: HeadingAnchor[] = [];
  let ord = 0;

  for (const match of content.matchAll(ATX_HEADING_RE)) {
    const title = (match[1] ?? "").trim();
    if (!title) continue;
    anchors.push({
      slug: slugifyAnchor(title),
      kind: "heading",
      ord: ord++,
      offset: match.index ?? 0,
    });
  }

  for (const match of content.matchAll(STAR_HEADING_RE)) {
    const title = (match[1] ?? "").trim();
    if (!title) continue;
    anchors.push({
      slug: slugifyAnchor(title),
      kind: "heading",
      ord: ord++,
      offset: match.index ?? 0,
    });
  }

  anchors.sort((a, b) => a.offset - b.offset || a.ord - b.ord);
  for (let i = 0; i < anchors.length; i++) {
    anchors[i]!.ord = i;
  }

  return anchors;
}

function sourceAnchorForOffset(offset: number, headings: HeadingAnchor[]): string | null {
  let last: string | null = null;
  for (const h of headings) {
    if (h.offset <= offset) last = h.slug;
    else break;
  }
  return last;
}

/**
 * Extract cross-document link refs from markdown body text.
 * Skips matches inside fenced code blocks.
 */
export function extractLinkRefs(body: string): LinkRef[] {
  const refs: { kind: LinkRef["kind"]; rawTarget: string; anchor: string | null; offset: number }[] = [];
  const fences = findCodeFences(body);

  for (const match of body.matchAll(WIKILINK_RE)) {
    const pos = match.index ?? 0;
    if (isInsideCodeFence(pos, fences)) continue;
    const inner = match[1];
    if (!inner) continue;
    const { rawTarget, anchor } = parseWikilinkTarget(inner);
    if (!rawTarget) continue;
    refs.push({ kind: "wikilink", rawTarget, anchor, offset: pos });
  }

  for (const match of body.matchAll(MDLINK_RE)) {
    const pos = match.index ?? 0;
    if (isInsideCodeFence(pos, fences)) continue;
    const target = match[1];
    if (!target) continue;
    const parsed = parseMdlinkTarget(target);
    if (!parsed || !parsed.rawTarget) continue;
    refs.push({ kind: "mdlink", rawTarget: parsed.rawTarget, anchor: parsed.anchor, offset: pos });
  }

  const headings = extractHeadingAnchors(body);
  return refs.map(ref => ({
    kind: ref.kind,
    rawTarget: ref.rawTarget,
    anchor: ref.anchor,
    srcAnchor: sourceAnchorForOffset(ref.offset, headings),
  }));
}
