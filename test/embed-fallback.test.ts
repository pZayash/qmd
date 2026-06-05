/**
 * embed-fallback.test.ts — OpenRouterEmbedding primary→fallback failover.
 *
 * Mocks global fetch to drive the endpoint chain without network. Verifies:
 *  - primary OK → fallback never called
 *  - primary network error → fallback used
 *  - primary 5xx → fallback used
 *  - primary 4xx → terminal, fallback NOT used
 *  - no primary key + fallback → fallback-only (no cloud key required)
 *
 * Run: npx vitest run test/embed-fallback.test.ts
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { OpenRouterEmbedding } from "../src/llm-openrouter.js";

const PRIMARY_URL = "https://openrouter.ai/api/v1/embeddings";
const FALLBACK_BASE = "http://localhost:1234/v1";
const FALLBACK_URL = "http://localhost:1234/v1/embeddings";

function okResponse(vec: number[]): Response {
  return new Response(JSON.stringify({ data: [{ embedding: vec, index: 0, object: "embedding" }], model: "m", object: "list" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errResponse(status: number, message = "boom"): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenRouterEmbedding failover", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const savedKey = process.env.OPENROUTER_API_KEY;
  const savedFbUrl = process.env.QMD_EMBED_FALLBACK_URL;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.QMD_EMBED_FALLBACK_URL; // avoid env leakage into tests
    delete process.env.QMD_EMBED_ENDPOINT;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = savedKey;
    if (savedFbUrl === undefined) delete process.env.QMD_EMBED_FALLBACK_URL;
    else process.env.QMD_EMBED_FALLBACK_URL = savedFbUrl;
  });

  function urlOf(call: unknown[]): string {
    return String(call[0]);
  }

  test("primary OK → fallback not called", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([1, 2, 3]));
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      fallback: { url: FALLBACK_BASE },
    });
    const r = await llm.embed("hi");
    expect(r?.embedding).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlOf(fetchMock.mock.calls[0]!)).toBe(PRIMARY_URL);
  });

  test("primary network error → fallback used", async () => {
    // Primary rejects on every retry (fetchWithRetry → 3 attempts); fallback OK.
    fetchMock.mockImplementation((url: string) => {
      if (String(url) === PRIMARY_URL) {
        return Promise.reject(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }));
      }
      return Promise.resolve(okResponse([4, 5, 6]));
    });
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      fallback: { url: FALLBACK_BASE },
    });
    const r = await llm.embed("hi");
    expect(r?.embedding).toEqual([4, 5, 6]);
    const urls = fetchMock.mock.calls.map(urlOf);
    expect(urls.at(-1)).toBe(FALLBACK_URL);
    expect(urls.filter(u => u === PRIMARY_URL).length).toBeGreaterThanOrEqual(1);
  });

  test("primary 5xx → fallback used", async () => {
    fetchMock
      .mockResolvedValueOnce(errResponse(503, "overloaded"))
      .mockResolvedValueOnce(okResponse([7, 8, 9]));
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      fallback: { url: FALLBACK_BASE },
    });
    const r = await llm.embed("hi");
    expect(r?.embedding).toEqual([7, 8, 9]);
    expect(urlOf(fetchMock.mock.calls.at(-1)!)).toBe(FALLBACK_URL);
  });

  test("primary 4xx → terminal, fallback NOT used", async () => {
    fetchMock.mockResolvedValueOnce(errResponse(401, "bad key"));
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      fallback: { url: FALLBACK_BASE },
    });
    await expect(llm.embed("hi")).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlOf(fetchMock.mock.calls[0]!)).toBe(PRIMARY_URL);
  });

  test("no primary key + fallback → fallback-only", async () => {
    delete process.env.OPENROUTER_API_KEY;
    fetchMock.mockResolvedValueOnce(okResponse([1, 1, 1]));
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      fallback: { url: FALLBACK_BASE },
    });
    const r = await llm.embed("hi");
    expect(r?.embedding).toEqual([1, 1, 1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlOf(fetchMock.mock.calls[0]!)).toBe(FALLBACK_URL);
  });

  test("no primary key + no fallback → throws", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(() => new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b")).toThrow(/OPENROUTER_API_KEY/);
  });

  test("fallback model id overrides primary in request body", async () => {
    delete process.env.OPENROUTER_API_KEY;
    fetchMock.mockResolvedValueOnce(okResponse([0]));
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      fallback: { url: FALLBACK_URL, model: "local-qwen3" },
    });
    await llm.embed("hi");
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.model).toBe("local-qwen3");
  });

  test("embedModelName stays the primary URI (stable DB tag/format)", () => {
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      fallback: { url: FALLBACK_BASE },
    });
    expect(llm.embedModelName).toBe("openrouter:qwen/qwen3-embedding-8b");
  });

  test("override → sole endpoint, bypasses primary + fallback", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([2, 2, 2]));
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      fallback: { url: FALLBACK_BASE },
      override: { url: "http://localhost:9999/v1" },
    });
    const r = await llm.embed("hi");
    expect(r?.embedding).toEqual([2, 2, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urlOf(fetchMock.mock.calls[0]!)).toBe("http://localhost:9999/v1/embeddings");
    // tag/format unchanged
    expect(llm.embedModelName).toBe("openrouter:qwen/qwen3-embedding-8b");
  });

  test("override has no failover (4xx-style error propagates)", async () => {
    fetchMock.mockResolvedValueOnce(errResponse(500, "down"));
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      fallback: { url: FALLBACK_BASE },
      override: { url: "http://localhost:9999/v1" },
    });
    // 500 is transport-class but there is no next endpoint → rejects
    await expect(llm.embed("hi")).rejects.toThrow(/500|down/);
    const urls = fetchMock.mock.calls.map(urlOf);
    expect(urls.every(u => u.startsWith("http://localhost:9999"))).toBe(true);
  });

  test("env QMD_EMBED_ENDPOINT wins over override option and needs no cloud key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.QMD_EMBED_ENDPOINT = "http://localhost:7777/v1";
    try {
      fetchMock.mockResolvedValueOnce(okResponse([3]));
      const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
        override: { url: "http://localhost:9999/v1" }, // env should win
      });
      await llm.embed("hi");
      expect(urlOf(fetchMock.mock.calls[0]!)).toBe("http://localhost:7777/v1/embeddings");
    } finally {
      delete process.env.QMD_EMBED_ENDPOINT;
    }
  });

  test("override model id sent in request body", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([0]));
    const llm = new OpenRouterEmbedding("openrouter:qwen/qwen3-embedding-8b", {
      override: { url: "http://localhost:9999/v1", model: "dbg-model" },
    });
    await llm.embed("hi");
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.model).toBe("dbg-model");
  });
});
