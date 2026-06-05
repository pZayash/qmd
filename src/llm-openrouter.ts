import type {
  LLM,
  EmbedOptions,
  EmbeddingResult,
  GenerateOptions,
  GenerateResult,
  ModelInfo,
  Queryable,
  RerankDocument,
  RerankOptions,
  RerankResult,
} from "./llm.js";

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

type OpenRouterEmbeddingResponse = {
  data: { embedding: number[]; index: number; object: string }[];
  model: string;
  object: string;
};

// A concrete HTTP endpoint that speaks the OpenAI /v1/embeddings protocol.
// Both OpenRouter and a local LMStudio/llama.cpp server expose this shape.
type Endpoint = {
  label: string;   // for error/diagnostic messages (e.g. "primary", "fallback")
  url: string;     // full .../v1/embeddings URL
  model: string;   // model id sent in the request body
  apiKey: string;  // "" allowed (local servers ignore Authorization)
};

// Fallback endpoint config. Lets a primary cloud provider fail over to a local
// OpenAI-compatible server (LMStudio) when the network is down. The local server
// MUST serve the SAME embedding model (same dimensions) — vectors live in one
// shared vec table and are not filtered by model tag.
export type EmbeddingFallback = {
  url: string;      // base (.../v1) or full (.../v1/embeddings) URL
  model?: string;   // defaults to the primary model id
  apiKey?: string;  // optional; LMStudio ignores it
};

// Hard endpoint override. When set, ALL embedding requests go to this single
// OpenAI-compatible endpoint — the cloud primary and the fallback chain are
// bypassed entirely (no failover). For debugging, tests, and emergency switches.
// The logical model URI (DB tag + query format) is unchanged; only the transport
// target changes, so the endpoint MUST serve the SAME model/dimensions.
export type EmbeddingOverride = {
  url: string;      // base (.../v1) or full (.../v1/embeddings) URL
  model?: string;   // defaults to the primary model id
  apiKey?: string;  // optional
};

// OpenRouter rejects large input arrays (observed: batches ≥128 return HTTP 200
// with no `data` for qwen3-embedding-8b). 64 embeds reliably; override via
// config models.embedBatchSize.
const DEFAULT_BATCH_SIZE = 64;
const MAX_NETWORK_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

// Normalize a configured URL to a full embeddings endpoint. Accepts a bare base
// (".../v1") and appends "/embeddings"; passes a full URL through unchanged.
function normalizeEmbeddingsUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  if (/\/embeddings$/.test(trimmed)) return trimmed;
  return `${trimmed}/embeddings`;
}

// Read fallback config from env when not passed explicitly. Lets every provider
// construction site (CLI, SDK, store fallback) pick up a local endpoint with no
// extra wiring.
function fallbackFromEnv(): EmbeddingFallback | undefined {
  const url = process.env.QMD_EMBED_FALLBACK_URL;
  if (!url) return undefined;
  return {
    url,
    model: process.env.QMD_EMBED_FALLBACK_MODEL,
    apiKey: process.env.QMD_EMBED_FALLBACK_API_KEY,
  };
}

// Read the hard endpoint override from env. Highest precedence — wins over both
// the configured override option and the primary/fallback chain.
function overrideFromEnv(): EmbeddingOverride | undefined {
  const url = process.env.QMD_EMBED_ENDPOINT;
  if (!url) return undefined;
  return {
    url,
    model: process.env.QMD_EMBED_ENDPOINT_MODEL,
    apiKey: process.env.QMD_EMBED_ENDPOINT_API_KEY,
  };
}

// Marks a transport-level failure (network error or HTTP 5xx/429) that warrants
// failing over to the next endpoint. Terminal errors (4xx, malformed body) are
// thrown as plain Error and stop the chain.
class EndpointTransportError extends Error {}

// Diagnostic logging of the embedding endpoint actually hit. Off by default to
// keep CLI/MCP output clean; set QMD_EMBED_DEBUG=1 to trace which URL/model each
// request targets and to see failover hops. Logs to stderr only.
// Read at call time, not module load: env may be populated by loadConfigEnv()
// (~/.config/qmd/.env) AFTER this module is imported.
function embedDebug(msg: string): void {
  if (process.env.QMD_EMBED_DEBUG) console.error(`[qmd embed] ${msg}`);
}

/**
 * fetch with retry on transient network-level failures (connection reset, DNS,
 * TLS). Does NOT retry HTTP error responses — those are returned to the caller.
 * Throws the last error (with .cause intact) after exhausting retries.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_NETWORK_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

export class OpenRouterEmbedding implements LLM {
  private readonly uri: string;
  private readonly batchSize: number;
  // Ordered list tried in sequence: failover advances to the next endpoint only
  // on a transport-level failure (network error or HTTP 5xx/429), never on a 4xx
  // (those are config/auth bugs the fallback can't fix).
  private readonly endpoints: Endpoint[];

  constructor(
    uri: string,
    options?: { apiKey?: string; batchSize?: number; fallback?: EmbeddingFallback; override?: EmbeddingOverride },
  ) {
    if (!uri.startsWith("openrouter:")) {
      throw new Error(`OpenRouterEmbedding: URI must start with 'openrouter:' (got: ${uri})`);
    }
    this.uri = uri;
    const model = uri.slice("openrouter:".length);
    this.batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

    // Hard override (env wins over option) — sole endpoint, no primary/fallback.
    const override = overrideFromEnv() ?? options?.override;
    if (override) {
      this.endpoints = [{
        label: "override",
        url: normalizeEmbeddingsUrl(override.url),
        model: override.model ?? model,
        apiKey: override.apiKey ?? "",
      }];
      embedDebug(`endpoints: ${this.endpoints.map(e => `${e.label}=${e.url}(${e.model})`).join(", ")}`);
      return;
    }

    const apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    const fallback = options?.fallback ?? fallbackFromEnv();

    const endpoints: Endpoint[] = [];
    // Primary (OpenRouter cloud). Skipped entirely if no key AND a fallback exists
    // — supports a "local only" setup without forcing an unused cloud key.
    if (apiKey || !fallback) {
      if (!apiKey) {
        throw new Error("OpenRouterEmbedding: OPENROUTER_API_KEY env var not set");
      }
      endpoints.push({ label: "primary (openrouter)", url: OPENROUTER_EMBEDDINGS_URL, model, apiKey });
    }
    // Secondary (local OpenAI-compatible server, e.g. LMStudio). Must serve the
    // same model/dimensions as the primary — see EmbeddingFallback docs.
    if (fallback) {
      endpoints.push({
        label: "fallback (local)",
        url: normalizeEmbeddingsUrl(fallback.url),
        model: fallback.model ?? model,
        apiKey: fallback.apiKey ?? "",
      });
    }

    this.endpoints = endpoints;
    embedDebug(`endpoints: ${this.endpoints.map(e => `${e.label}=${e.url}(${e.model})`).join(", ")}`);
  }

  get embedModelName(): string {
    return this.uri;
  }

  get preferredEmbedBatchSize(): number {
    return this.batchSize;
  }

  // POST to one endpoint. Throws on transport failure (network error / 5xx / 429)
  // so the caller can fail over; throws a terminal error on 4xx or a malformed
  // 200 body (failing over won't help those).
  private async callEndpoint(ep: Endpoint, input: string | string[]): Promise<OpenRouterEmbeddingResponse> {
    const n = Array.isArray(input) ? input.length : 1;
    embedDebug(`→ ${ep.label}: POST ${ep.url} (model=${ep.model}, inputs=${n})`);
    let resp: Response;
    try {
      resp = await fetchWithRetry(ep.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ep.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: ep.model, input }),
      });
    } catch (err) {
      // Network-level failure (DNS/TLS/proxy/connection reset). undici masks the
      // real reason as a bare "fetch failed" — surface error.cause so it's diagnosable.
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      const detail = cause?.code
        ? `${cause.code}${cause.message ? ` — ${cause.message}` : ""}`
        : cause?.message ?? (err as Error).message;
      throw new EndpointTransportError(`${ep.label} embeddings request failed (network): ${detail} [POST ${ep.url}]`);
    }

    if (!resp.ok) {
      let msg = `${ep.label} embeddings API error: ${resp.status} ${resp.statusText}`;
      try {
        const body = await resp.json() as { error?: { message?: string } };
        if (body.error?.message) msg += ` — ${body.error.message}`;
      } catch {
        // ignore JSON parse failure
      }
      // 5xx / 429 are transient (provider overload/outage) — allow failover.
      // 4xx are terminal (auth/model/input) — failover can't fix them.
      if (resp.status >= 500 || resp.status === 429) throw new EndpointTransportError(msg);
      throw new Error(msg);
    }

    const body = await resp.json() as OpenRouterEmbeddingResponse & { error?: { message?: string } };
    // Some models/batch-sizes return HTTP 200 with no `data` array (e.g. an error
    // payload or a too-large input batch). Catch it here so callers get an
    // actionable message instead of a downstream "data is not iterable".
    if (!Array.isArray(body.data)) {
      const n = Array.isArray(input) ? input.length : 1;
      const hint = body.error?.message ?? JSON.stringify(body).slice(0, 200);
      throw new Error(`${ep.label} embeddings: response missing 'data' array (model=${ep.model}, inputs=${n}): ${hint}`);
    }
    return body;
  }

  private async callEmbeddings(input: string | string[]): Promise<OpenRouterEmbeddingResponse> {
    let lastTransportErr: unknown;
    for (let i = 0; i < this.endpoints.length; i++) {
      const ep = this.endpoints[i]!;
      try {
        return await this.callEndpoint(ep, input);
      } catch (err) {
        if (err instanceof EndpointTransportError) {
          // Transport failure — try the next endpoint (if any).
          lastTransportErr = err;
          const next = this.endpoints[i + 1];
          embedDebug(`✗ ${ep.label} transport error${next ? ` → failing over to ${next.label}` : " (no more endpoints)"}: ${err.message}`);
          continue;
        }
        throw err; // terminal (4xx / malformed body) — don't fail over
      }
    }
    // All endpoints exhausted on transport failures.
    throw lastTransportErr ?? new Error("OpenRouterEmbedding: no embedding endpoints configured");
  }

  async embed(text: string, _options?: EmbedOptions): Promise<EmbeddingResult | null> {
    const result = await this.callEmbeddings(text);
    const item = result.data[0];
    if (!item) return null;
    return { embedding: item.embedding, model: this.uri };
  }

  async embedBatch(texts: string[], _options?: EmbedOptions): Promise<(EmbeddingResult | null)[]> {
    if (texts.length === 0) return [];

    // Split into chunks of batchSize and POST each chunk sequentially
    const out: (EmbeddingResult | null)[] = new Array(texts.length).fill(null);
    for (let offset = 0; offset < texts.length; offset += this.batchSize) {
      const chunk = texts.slice(offset, offset + this.batchSize);
      const result = await this.callEmbeddings(chunk);
      for (const item of result.data) {
        const idx = offset + item.index;
        if (idx >= 0 && idx < texts.length) {
          out[idx] = { embedding: item.embedding, model: this.uri };
        }
      }
    }
    return out;
  }

  async tokenize(text: string): Promise<number[]> {
    // Rough approximation: ~4 chars per token (sufficient for chunk-size gating)
    return new Array(Math.ceil(text.length / 4)).fill(0);
  }

  async expandQuery(query: string, _options?: { context?: string; includeLexical?: boolean; intent?: string }): Promise<Queryable[]> {
    // No cloud-based query expansion — pass through as lexical query
    return [{ type: "lex", text: query }];
  }

  async rerank(_query: string, documents: RerankDocument[], _options?: RerankOptions): Promise<RerankResult> {
    // No reranking support — return documents in original order with equal scores
    return {
      results: documents.map((doc, i) => ({ file: doc.file, score: 1, index: i })),
      model: this.uri,
    };
  }

  async generate(_prompt: string, _options?: GenerateOptions): Promise<GenerateResult | null> {
    throw new Error("OpenRouterEmbedding does not support text generation");
  }

  async modelExists(model: string): Promise<ModelInfo> {
    return { name: model, exists: true };
  }

  async dispose(): Promise<void> {
    // No local resources to release
  }
}
