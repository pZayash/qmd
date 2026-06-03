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

const DEFAULT_BATCH_SIZE = 1024;

export class OpenRouterEmbedding implements LLM {
  private readonly model: string;
  private readonly uri: string;
  private readonly apiKey: string;
  private readonly batchSize: number;

  constructor(uri: string, options?: { apiKey?: string; batchSize?: number }) {
    if (!uri.startsWith("openrouter:")) {
      throw new Error(`OpenRouterEmbedding: URI must start with 'openrouter:' (got: ${uri})`);
    }
    this.uri = uri;
    this.model = uri.slice("openrouter:".length);
    this.apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    if (!this.apiKey) {
      throw new Error("OpenRouterEmbedding: OPENROUTER_API_KEY env var not set");
    }
    this.batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  }

  get embedModelName(): string {
    return this.uri;
  }

  get preferredEmbedBatchSize(): number {
    return this.batchSize;
  }

  private async callEmbeddings(input: string | string[]): Promise<OpenRouterEmbeddingResponse> {
    const resp = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, input }),
    });

    if (!resp.ok) {
      let msg = `OpenRouter embeddings API error: ${resp.status} ${resp.statusText}`;
      try {
        const body = await resp.json() as { error?: { message?: string } };
        if (body.error?.message) msg += ` — ${body.error.message}`;
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(msg);
    }

    return resp.json() as Promise<OpenRouterEmbeddingResponse>;
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
