/**
 * collection-set-path + MCP listen host (OpenSpec collection-set-path-http-bind)
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { readFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";
import { createStore, type QMDStore } from "../src/index.js";
import {
  setCollectionPath,
  setConfigSource,
  loadConfig,
} from "../src/collections.js";
import { getStoreCollection, syncConfigToDb } from "../src/store.js";
import {
  resolveMcpListenHost,
  isLoopbackMcpHost,
} from "../src/mcp/server.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const cliPath = join(repoRoot, "src", "cli", "qmd.ts");
const tsxLoader = join(repoRoot, "node_modules", "tsx", "dist", "esm", "index.mjs");

function docSnapshot(store: QMDStore) {
  return store.internal.db.prepare(
    `SELECT collection, path, hash FROM documents WHERE active = 1 ORDER BY collection, path`,
  ).all() as { collection: string; path: string; hash: string }[];
}

describe("setCollectionPath (YAML)", () => {
  let tmp: string;
  let oldRoot: string;
  let newRoot: string;
  let configPath: string;
  let dbPath: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "qmd-set-path-"));
    oldRoot = join(tmp, "old");
    newRoot = join(tmp, "new");
    await mkdir(oldRoot);
    await mkdir(newRoot);
    await writeFile(join(oldRoot, "note.md"), "# Hello\n\nIndexed once.\n");
    configPath = join(tmp, "index.yml");
    dbPath = join(tmp, "index.sqlite");
    await writeFile(configPath, YAML.stringify({
      collections: {
        notes: { path: oldRoot, pattern: "**/*.md" },
      },
    }));
  });

  afterEach(async () => {
    setConfigSource();
    await rm(tmp, { recursive: true, force: true });
  });

  test("remaps YAML + sqlite path and keeps documents", async () => {
    const store = await createStore({ dbPath, configPath });
    await store.update();
    const before = docSnapshot(store);
    expect(before.length).toBeGreaterThan(0);

    expect(setCollectionPath("notes", newRoot)).toBe(true);
    syncConfigToDb(store.internal.db, loadConfig());

    const yaml = loadConfig();
    expect(yaml.collections.notes.path).toBe(resolve(newRoot));
    expect(getStoreCollection(store.internal.db, "notes")?.path).toBe(resolve(newRoot));
    expect(docSnapshot(store)).toEqual(before);
    await store.close();
  });

  test("unknown collection returns false and does not rewrite YAML", () => {
    setConfigSource({ configPath });
    const before = readFileSync(configPath, "utf-8");
    expect(setCollectionPath("missing", newRoot)).toBe(false);
    expect(readFileSync(configPath, "utf-8")).toBe(before);
  });

  test("SDK setCollectionPath updates store_collections.path only", async () => {
    const store = await createStore({ dbPath, configPath });
    await store.update();
    const before = docSnapshot(store);

    expect(await store.setCollectionPath("notes", newRoot)).toBe(true);
    expect(getStoreCollection(store.internal.db, "notes")?.path).toBe(resolve(newRoot));
    expect(docSnapshot(store)).toEqual(before);
    expect(await store.setCollectionPath("nope", newRoot)).toBe(false);
    await store.close();
  });
});

describe("collection set-path CLI", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "qmd-set-path-cli-"));
    mkdirSync(join(tmp, "tree"));
    await writeFile(join(tmp, "index.yml"), YAML.stringify({
      collections: {
        notes: { path: join(tmp, "tree"), pattern: "**/*.md" },
      },
    }));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  function run(args: string[]) {
    return spawnSync(process.execPath, ["--import", pathToFileURL(tsxLoader).href, cliPath, ...args], {
      encoding: "utf-8",
      env: {
        ...process.env,
        QMD_CONFIG_DIR: tmp,
        INDEX_PATH: join(tmp, "index.sqlite"),
        XDG_CACHE_HOME: join(tmp, "cache"),
      },
      timeout: 30_000,
    });
  }

  test("unknown name exits non-zero and leaves YAML", () => {
    const before = readFileSync(join(tmp, "index.yml"), "utf-8");
    const r = run(["collection", "set-path", "nope", join(tmp, "tree")]);
    expect(r.status).not.toBe(0);
    expect(readFileSync(join(tmp, "index.yml"), "utf-8")).toBe(before);
  });

  test("missing destination exits non-zero and leaves YAML", () => {
    const before = readFileSync(join(tmp, "index.yml"), "utf-8");
    const r = run(["collection", "set-path", "notes", join(tmp, "does-not-exist")]);
    expect(r.status).not.toBe(0);
    expect(readFileSync(join(tmp, "index.yml"), "utf-8")).toBe(before);
  });
});

describe("MCP listen host", () => {
  const prev = process.env.QMD_HOST;

  afterEach(() => {
    if (prev === undefined) delete process.env.QMD_HOST;
    else process.env.QMD_HOST = prev;
  });

  test("default is loopback when flag and env omitted", () => {
    delete process.env.QMD_HOST;
    expect(resolveMcpListenHost()).toBe("127.0.0.1");
  });

  test("env used when flag omitted", () => {
    expect(resolveMcpListenHost(undefined, "0.0.0.0")).toBe("0.0.0.0");
  });

  test("CLI host wins over env", () => {
    expect(resolveMcpListenHost("127.0.0.1", "0.0.0.0")).toBe("127.0.0.1");
  });

  test("loopback predicate matches warning rule", () => {
    expect(isLoopbackMcpHost("127.0.0.1")).toBe(true);
    expect(isLoopbackMcpHost("LOCALHOST")).toBe(true);
    expect(isLoopbackMcpHost("::1")).toBe(true);
    expect(isLoopbackMcpHost("0.0.0.0")).toBe(false);
  });
});
