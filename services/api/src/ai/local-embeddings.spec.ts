import { describe, expect, it } from 'vitest';
import { HashedProvider, LocalProvider } from './embeddings.js';
import { evaluateProvider, SAMPLE_DOCS, SAMPLE_QUERIES } from './retrieval-eval.js';

/** Runs the real small model against the hashed baseline. Opt in with KINETIX_EVAL_LOCAL=1 (it downloads about 22 MB once). */
describe.skipIf(!process.env.KINETIX_EVAL_LOCAL)('local embedding model', () => {
  it('beats the hashed baseline on the labelled set', async () => {
    const base = await evaluateProvider(new HashedProvider(), SAMPLE_DOCS, SAMPLE_QUERIES);
    const local = await evaluateProvider(new LocalProvider(), SAMPLE_DOCS, SAMPLE_QUERIES);
    console.log(JSON.stringify({ base, local }));
    expect(local.mrr).toBeGreaterThan(base.mrr);
  }, 300_000);
});
