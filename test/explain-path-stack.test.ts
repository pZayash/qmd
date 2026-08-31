import { describe, expect, test } from "vitest";
import { appliedDirRrfWeight, buildExplainPathStack } from "../src/store";

describe("buildExplainPathStack", () => {
  const dirs = new Set(["docs", "docs/ai"]);
  const ranks = new Map<string, number>([["qmd://col/docs/ai", 3]]);

  test("file hit lists ancestor dir-nodes", () => {
    const stack = buildExplainPathStack("qmd://col/docs/ai/one.md", dirs, ranks);
    expect(stack.map(e => e.path)).toEqual(["docs", "docs/ai"]);
    expect(stack[0]).toEqual({ path: "docs", kind: "dir", inCandidates: false });
    expect(stack[1]).toEqual({ path: "docs/ai", kind: "dir", inCandidates: true, rrfRank: 3 });
  });

  test("dir hit omits self", () => {
    const stack = buildExplainPathStack("qmd://col/docs/ai", dirs, ranks);
    expect(stack.map(e => e.path)).toEqual(["docs"]);
  });

  test("missing dir-node is omitted", () => {
    const stack = buildExplainPathStack("qmd://col/docs/ai/one.md", new Set(["docs/ai"]), ranks);
    expect(stack.map(e => e.path)).toEqual(["docs/ai"]);
  });

  test("root file has empty stack", () => {
    expect(buildExplainPathStack("qmd://col/readme.md", dirs, ranks)).toEqual([]);
  });
});

describe("appliedDirRrfWeight", () => {
  test("kind filter is identity", () => {
    expect(appliedDirRrfWeight("dir")).toBe(1);
    expect(appliedDirRrfWeight("file")).toBe(1);
  });

  test("mix uses resolveDirRrfWeight default", () => {
    const prev = process.env.QMD_DIR_RRF_WEIGHT;
    delete process.env.QMD_DIR_RRF_WEIGHT;
    try {
      expect(appliedDirRrfWeight(undefined)).toBe(0.5);
    } finally {
      if (prev === undefined) delete process.env.QMD_DIR_RRF_WEIGHT;
      else process.env.QMD_DIR_RRF_WEIGHT = prev;
    }
  });
});
