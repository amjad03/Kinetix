/**
 * Local text embeddings: words and character trigrams hashed into a fixed-size vector (feature hashing). It needs no
 * model and no network, and it ranks "photosynthesise" near "photosynthesis" where exact keywords fail. A neural
 * embedding model, when one is hosted, replaces `embed` without changing callers.
 */
export const EMBED_DIMS = 256;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function embed(text: string): Float32Array {
  const v = new Float32Array(EMBED_DIMS);
  const add = (feature: string, weight: number) => {
    const h = fnv1a(feature);
    v[h % EMBED_DIMS] += (h & 0x80000000 ? -1 : 1) * weight;
  };
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    add(`w:${w}`, 2);
    const padded = `^${w}$`;
    for (let i = 0; i + 3 <= padded.length; i++) add(`t:${padded.slice(i, i + 3)}`, 1);
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

/** Cosine similarity of two unit vectors, so just the dot product. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

/** Entries of `docs` whose text is closest in meaning to `query`, best first, above `min`. */
export function rankBySimilarity<T>(query: string, docs: { item: T; text: string }[], min = 0.3): { item: T; score: number }[] {
  const q = embed(query);
  return docs
    .map((d) => ({ item: d.item, score: cosine(q, embed(d.text)) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score);
}
