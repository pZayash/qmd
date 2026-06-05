/**
 * env-cascade.test.ts — loadConfigEnv precedence cascade.
 *
 * Verifies the load order (highest wins):
 *   shell env  >  <cwd>/.env  (project)  >  ~/.config/qmd/.env  (global)
 * plus parsing of `export ` prefixes, inline comments, and quoted values.
 *
 * Run: npx vitest run test/env-cascade.test.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfigEnv } from "../src/collections.js";

const TEST_KEYS = [
  "QMD_CASCADE_A",
  "QMD_CASCADE_B",
  "QMD_CASCADE_C",
  "QMD_CASCADE_EXPORT",
  "QMD_CASCADE_COMMENT",
] as const;

describe("loadConfigEnv cascade", () => {
  let projectDir: string;
  let globalDir: string;
  let savedConfigDir: string | undefined;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "qmd-proj-"));
    globalDir = mkdtempSync(join(tmpdir(), "qmd-glob-"));
    savedConfigDir = process.env.QMD_CONFIG_DIR;
    process.env.QMD_CONFIG_DIR = globalDir; // getConfigDir() honors this
    for (const k of TEST_KEYS) delete process.env[k];
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(globalDir, { recursive: true, force: true });
    if (savedConfigDir === undefined) delete process.env.QMD_CONFIG_DIR;
    else process.env.QMD_CONFIG_DIR = savedConfigDir;
    for (const k of TEST_KEYS) delete process.env[k];
  });

  function writeProjectEnv(body: string): void {
    writeFileSync(join(projectDir, ".env"), body);
  }
  function writeGlobalEnv(body: string): void {
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, ".env"), body);
  }

  test("project .env overrides global .env", () => {
    writeGlobalEnv("QMD_CASCADE_A=global\nQMD_CASCADE_C=global-only\n");
    writeProjectEnv("QMD_CASCADE_A=project\nQMD_CASCADE_B=project-only\n");
    loadConfigEnv(projectDir);
    expect(process.env.QMD_CASCADE_A).toBe("project");      // project wins
    expect(process.env.QMD_CASCADE_B).toBe("project-only");  // project-only
    expect(process.env.QMD_CASCADE_C).toBe("global-only");   // global fills gap
  });

  test("shell env beats both files", () => {
    process.env.QMD_CASCADE_A = "shell";
    writeGlobalEnv("QMD_CASCADE_A=global\n");
    writeProjectEnv("QMD_CASCADE_A=project\n");
    loadConfigEnv(projectDir);
    expect(process.env.QMD_CASCADE_A).toBe("shell");
  });

  test("parses export prefix, quotes, and inline comments", () => {
    writeProjectEnv([
      "# a comment line",
      "export QMD_CASCADE_EXPORT=\"hello\" # trailing comment",
      "QMD_CASCADE_COMMENT='world'",
    ].join("\n"));
    loadConfigEnv(projectDir);
    expect(process.env.QMD_CASCADE_EXPORT).toBe("hello");
    expect(process.env.QMD_CASCADE_COMMENT).toBe("world");
  });

  test("missing files are a no-op (no throw)", () => {
    expect(() => loadConfigEnv(projectDir)).not.toThrow();
    expect(process.env.QMD_CASCADE_A).toBeUndefined();
  });
});
