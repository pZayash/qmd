/**
 * embed-concurrency.test.ts — OpenRouterEmbedding parallel dispatch.
 *
 * Mocks global fetch. Verifies bounded concurrency, order preservation,
 * 429 backoff, failover after cap, per-slice isolation, abort, serial parity.
 *
 * Run: npx vitest run test/embed-concurrency.test.ts
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { OpenRouterEmbedding, MAX_RATE_LIMIT_RETRIES } from "../src/llm-openrouter.js";

const PRIMARY_URL = "https://openrouter.ai/api/v1/embeddings";
const FALLBACK_BASE = "http://localhost:1234/v1";
const FALLBACK_URL = "http://localhost:1234/v1/embeddings";
const MODEL_URI = "openrouter:test-model";

type PendingRequest = {
  resolve: (resp: Response) => void;
  inputs: string[];
};

function batchOkResponse(texts: string[]): Response {
  return new Response(JSON.stringify({
    data: texts.map((t, i) => ({ embedding: [t.charCodeAt(0)], index: i, object: "embedding" })),
    model: "m",
    object: "list",
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errResponse(status: number, message = "boom", headers?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function parseInputs(init?: RequestInit): string[] {
  const body = JSON.parse(String(init?.body));
  return Array.isArray(body.input) ? body.input as string[] : [body.input as string];
}

describe("OpenRouterEmbedding concurrency", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const savedKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.QMD_EMBED_ENDPOINT;
    delete process.env.QMD_EMBED_FALLBACK_URL;
    delete process.env.QMD_EMBED_CONCURRENCY;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = savedKey;
  });

  function makeLlm(opts?: { batchSize?: number; concurrency?: number; fallback?: { url: string } }) {
    return new OpenRouterEmbedding(MODEL_URI, {
      apiKey: "k",
      batchSize: 2,
      concurrency: 3,
      ...opts,
    });
  }

  test("bounded in-flight count never exceeds concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const inputs = parseInputs(init);
      await Promise.resolve(); // yield so concurrent workers enter fetch before decrement
      inFlight--;
      return batchOkResponse(inputs);
    });

    const llm = makeLlm();
    const texts = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const out = await llm.embedBatch(texts);

    expect(out).toHaveLength(10);
    expect(out.every((r, i) => r?.embedding?.[0] === texts[i]!.charCodeAt(0))).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  test("order preserved when POSTs complete out of order", async () => {
    const pending: PendingRequest[] = [];

    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const inputs = parseInputs(init);
      return new Promise<Response>((resolve) => {
        pending.push({ resolve, inputs });
      });
    });

    const llm = makeLlm();
    const texts = ["a", "b", "c", "d", "e", "f"];
    const resultPromise = llm.embedBatch(texts);

    await vi.waitFor(() => expect(pending.length).toBe(3));

    // Resolve last slice first, then middle, then first
    const reversed = [...pending].reverse();
    for (const req of reversed) {
      req.resolve(batchOkResponse(req.inputs));
    }

    const out = await resultPromise;
    expect(out.map((r, i) => r?.embedding?.[0])).toEqual(texts.map(t => t.charCodeAt(0)));
  });

  test("429 honors Retry-After before retrying same endpoint", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(errResponse(429, "rate limited", { "Retry-After": "1" }))
      .mockResolvedValueOnce(batchOkResponse(["only"]));

    const llm = new OpenRouterEmbedding(MODEL_URI, { apiKey: "k", batchSize: 10, concurrency: 1 });
    const resultPromise = llm.embedBatch(["only"]);

    await vi.advanceTimersByTimeAsync(1500);
    const out = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(c => String(c[0]) === PRIMARY_URL)).toBe(true);
    expect(out[0]?.embedding).toEqual(["only".charCodeAt(0)]);
  });

  test("429 failover after retry cap exhausted", async () => {
    vi.useFakeTimers();
    let primaryCalls = 0;

    fetchMock.mockImplementation((url: string) => {
      if (String(url) === PRIMARY_URL) {
        primaryCalls++;
        return Promise.resolve(errResponse(429, "rate limited"));
      }
      return Promise.resolve(batchOkResponse(["x"]));
    });

    const llm = new OpenRouterEmbedding(MODEL_URI, {
      apiKey: "k",
      batchSize: 10,
      concurrency: 1,
      fallback: { url: FALLBACK_BASE },
    });

    const resultPromise = llm.embedBatch(["x"]);

    for (let i = 0; i < MAX_RATE_LIMIT_RETRIES + 2; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
    }

    const out = await resultPromise;
    expect(primaryCalls).toBe(MAX_RATE_LIMIT_RETRIES + 1);
    expect(fetchMock.mock.calls.some(c => String(c[0]) === FALLBACK_URL)).toBe(true);
    expect(out[0]?.embedding).toEqual(["x".charCodeAt(0)]);
  });

  test("per-slice isolation — one slice 400, siblings succeed", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const inputs = parseInputs(init);
      if (inputs[0] === "bad1") {
        return Promise.resolve(errResponse(400, "bad input"));
      }
      return Promise.resolve(batchOkResponse(inputs));
    });

    const llm = makeLlm({ concurrency: 3 });
    const texts = ["ok1", "ok2", "bad1", "bad2", "ok3", "ok4"];
    const out = await llm.embedBatch(texts);

    expect(out).toHaveLength(6);
    expect(out[0]?.embedding).toEqual(["ok1".charCodeAt(0)]);
    expect(out[1]?.embedding).toEqual(["ok2".charCodeAt(0)]);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
    expect(out[4]?.embedding).toEqual(["ok3".charCodeAt(0)]);
    expect(out[5]?.embedding).toEqual(["ok4".charCodeAt(0)]);
  });

  test("abort interrupts network-retry sleep in fetchWithRetry", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError("network reset"));

    const ac = new AbortController();
    const llm = new OpenRouterEmbedding(MODEL_URI, { apiKey: "k", batchSize: 10, concurrency: 1 });
    const resultPromise = llm.embedBatch(["only"], { signal: ac.signal });

    await Promise.resolve();
    ac.abort();
    await vi.advanceTimersByTimeAsync(0);

    const out = await resultPromise;
    expect(out).toEqual([null]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("abort cancels in-flight work and interrupts backoff", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(errResponse(429, "slow down", { "Retry-After": "60" }));

    const ac = new AbortController();
    const llm = new OpenRouterEmbedding(MODEL_URI, { apiKey: "k", batchSize: 10, concurrency: 1 });
    const resultPromise = llm.embedBatch(["only"], { signal: ac.signal });

    await Promise.resolve();
    ac.abort();
    await vi.advanceTimersByTimeAsync(0);

    const out = await resultPromise;
    expect(out).toEqual([null]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("concurrency=1 issues strictly sequential fetch calls", async () => {
    let inFlight = 0;
    let overlapping = false;

    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (inFlight > 0) overlapping = true;
      inFlight++;
      const inputs = parseInputs(init);
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          inFlight--;
          resolve(batchOkResponse(inputs));
        }, 5);
      });
    });

    const llm = makeLlm({ concurrency: 1 });
    const texts = ["a", "b", "c", "d", "e", "f"];
    await llm.embedBatch(texts);

    expect(overlapping).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
