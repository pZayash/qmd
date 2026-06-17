import { describe, test, expect } from "vitest";
import { extractLinkRefs } from "../src/links.js";

describe("extractLinkRefs", () => {
  test("wikilink extracted", () => {
    const refs = extractLinkRefs("See [[Setup Guide]] for details.");
    expect(refs).toEqual([
      { kind: "wikilink", rawTarget: "Setup Guide", anchor: null, srcAnchor: null },
    ]);
  });

  test("wikilink with alias and anchor", () => {
    const refs = extractLinkRefs("[[Setup Guide#install|how to install]]");
    expect(refs).toEqual([
      { kind: "wikilink", rawTarget: "Setup Guide", anchor: "install", srcAnchor: null },
    ]);
  });

  test("relative markdown link with anchor", () => {
    const refs = extractLinkRefs("[install](./guide.md#step-1)");
    expect(refs).toEqual([
      { kind: "mdlink", rawTarget: "./guide.md", anchor: "step-1", srcAnchor: null },
    ]);
  });

  test("embed aliased to wikilink", () => {
    const refs = extractLinkRefs("![[Diagram]]");
    expect(refs).toEqual([
      { kind: "wikilink", rawTarget: "Diagram", anchor: null, srcAnchor: null },
    ]);
  });

  test("external and anchor-only links ignored", () => {
    const refs = extractLinkRefs("[site](https://example.com) and [top](#intro)");
    expect(refs).toEqual([]);
  });

  test("fenced code ignored", () => {
    const body = [
      "",
      "```md",
      "[[Not A Link]]",
      "[also](./skip.md)",
      "```",
      "Real [[Link]]",
    ].join("\n");
    const refs = extractLinkRefs(body);
    expect(refs).toEqual([
      { kind: "wikilink", rawTarget: "Link", anchor: null, srcAnchor: null },
    ]);
  });
});
