import { findCodeFences, isInsideCodeFence } from "./store.js";

export type LinkRef = {
  kind: "wikilink" | "mdlink";
  rawTarget: string;
  anchor: string | null;
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

/**
 * Extract cross-document link refs from markdown body text.
 * Skips matches inside fenced code blocks.
 */
export function extractLinkRefs(body: string): LinkRef[] {
  const refs: LinkRef[] = [];
  const fences = findCodeFences(body);

  for (const match of body.matchAll(WIKILINK_RE)) {
    const pos = match.index ?? 0;
    if (isInsideCodeFence(pos, fences)) continue;
    const inner = match[1];
    if (!inner) continue;
    const { rawTarget, anchor } = parseWikilinkTarget(inner);
    if (!rawTarget) continue;
    refs.push({ kind: "wikilink", rawTarget, anchor });
  }

  for (const match of body.matchAll(MDLINK_RE)) {
    const pos = match.index ?? 0;
    if (isInsideCodeFence(pos, fences)) continue;
    const target = match[1];
    if (!target) continue;
    const parsed = parseMdlinkTarget(target);
    if (!parsed || !parsed.rawTarget) continue;
    refs.push({ kind: "mdlink", rawTarget: parsed.rawTarget, anchor: parsed.anchor });
  }

  return refs;
}
