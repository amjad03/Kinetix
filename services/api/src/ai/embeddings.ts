import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cosine, embed, EMBED_DIMS } from './embed.js';

/** Turns text into unit vectors. Callers rank by cosine; the id names the model so vectors from different models never mix. */
export interface EmbeddingProvider {
  readonly id: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export interface EmbeddingSettings {
  provider?: 'hashed' | 'http' | 'local';
  /** Base URL of an OpenAI-compatible server (`POST {url}/embeddings`). */
  url?: string;
  model?: string;
  apiKey?: string;
}

const unit = (v: number[]): Float32Array => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return Float32Array.from(v, (x) => x / n);
};

/** The built-in baseline: hashed words and character trigrams. No model, no network. */
export class HashedProvider implements EmbeddingProvider {
  readonly id = `hashed-${EMBED_DIMS}`;
  async embed(texts: string[]) {
    return texts.map((t) => embed(t));
  }
}

/** Any server speaking the OpenAI embeddings API (a hosted model, or a local one behind llama.cpp, vLLM, TEI or Ollama's /v1). */
export class HttpProvider implements EmbeddingProvider {
  readonly id: string;
  constructor(private readonly url: string, private readonly model: string, private readonly apiKey?: string) {
    this.id = `http:${model}`;
  }
  async embed(texts: string[]) {
    const res = await fetch(`${this.url.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`The embedding server answered ${res.status}`);
    const body = (await res.json()) as { data?: { embedding: number[]; index?: number }[] };
    const rows = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (rows.length !== texts.length) throw new Error('The embedding server returned the wrong number of vectors');
    return rows.map((r) => unit(r.embedding));
  }
}

/**
 * A model that runs in this process through transformers.js (ONNX, `@huggingface/transformers`). The default is all-MiniLM-L6-v2
 * (22 MB quantised, English). It is downloaded on first use into EMBEDDINGS_CACHE_DIR (default: the system temp folder) and reused after that.
 * If the package or the download is not available the provider throws a plain message and callers keep the hashed baseline.
 * EMBEDDINGS_MODULE_DIR may name a folder whose node_modules holds the package when it is installed outside this project.
 */
export class LocalProvider implements EmbeddingProvider {
  readonly id: string;
  private pipe?: Promise<(t: string[], o: object) => Promise<{ tolist(): number[][] }>>;
  constructor(private readonly model = 'Xenova/all-MiniLM-L6-v2') {
    this.id = `local:${model}`;
  }
  private load() {
    return (async () => {
      const name = '@huggingface/transformers';
      const dir = process.env.EMBEDDINGS_MODULE_DIR;
      const spec = dir ? pathToFileURL(createRequire(join(dir, 'x.js')).resolve(name)).href : name;
      const m = (await import(/* @vite-ignore */ spec)) as { pipeline: (task: string, model: string, o: object) => Promise<never>; env: { cacheDir: string } };
      m.env.cacheDir = process.env.EMBEDDINGS_CACHE_DIR ?? join(tmpdir(), 'kinetix-models');
      return m.pipeline('feature-extraction', this.model, { dtype: 'q8' });
    })().catch((e) => {
      this.pipe = undefined;
      throw new Error(`The local embedding model is not available (${(e as Error).message.slice(0, 120)}). Install @huggingface/transformers and allow the first download.`);
    });
  }
  async embed(texts: string[]) {
    this.pipe ??= this.load();
    const out = await (await this.pipe)(texts, { pooling: 'mean', normalize: true });
    return out.tolist().map(unit);
  }
}

/** Picks the provider from tenant settings, falling back to the environment, then to the hashed baseline. */
export function resolveProvider(s: EmbeddingSettings = {}): EmbeddingProvider {
  const kind = s.provider ?? (process.env.EMBEDDINGS_PROVIDER as EmbeddingSettings['provider']) ?? 'hashed';
  const url = s.url ?? process.env.EMBEDDINGS_URL;
  const model = s.model ?? process.env.EMBEDDINGS_MODEL;
  if (kind === 'http' && url) return new HttpProvider(url, model ?? 'text-embedding', s.apiKey ?? process.env.EMBEDDINGS_API_KEY);
  if (kind === 'local') return new LocalProvider(model);
  return new HashedProvider();
}

export { cosine };
