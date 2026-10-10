/**
 * Compares the configured embedding provider with the hashed baseline on the sample set:
 *   EMBEDDINGS_PROVIDER=http EMBEDDINGS_URL=http://localhost:8080/v1 EMBEDDINGS_MODEL=bge-m3 node dist/ai/retrieval-eval.cli.js
 * With no provider configured it prints the baseline alone.
 */
import { HashedProvider, resolveProvider } from './embeddings.js';
import { evaluateProvider, SAMPLE_DOCS, SAMPLE_QUERIES } from './retrieval-eval.js';

const baseline = await evaluateProvider(new HashedProvider(), SAMPLE_DOCS, SAMPLE_QUERIES);
const candidate = resolveProvider();
const scores = candidate.id === baseline.provider ? [baseline] : [baseline, await evaluateProvider(candidate, SAMPLE_DOCS, SAMPLE_QUERIES)];
for (const s of scores) console.log(`${s.provider.padEnd(36)} recall@1 ${s.recallAt1.toFixed(2)}  recall@3 ${s.recallAt3.toFixed(2)}  MRR ${s.mrr.toFixed(2)}  (${s.queries} queries)`);
if (scores.length === 2) console.log(scores[1].mrr > scores[0].mrr ? 'The candidate beats the baseline.' : 'The candidate does not beat the baseline.');
