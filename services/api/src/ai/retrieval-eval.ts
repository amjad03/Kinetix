import { cosine, type EmbeddingProvider } from './embeddings.js';

export interface EvalDoc { id: string; text: string }
export interface EvalQuery { q: string; relevant: string[] }
export interface EvalScore { provider: string; recallAt1: number; recallAt3: number; mrr: number; queries: number }

/** Ranks the corpus for each query and scores recall@1, recall@3 and mean reciprocal rank against the labelled answers. */
export async function evaluateProvider(provider: EmbeddingProvider, docs: EvalDoc[], queries: EvalQuery[]): Promise<EvalScore> {
  const dv = await provider.embed(docs.map((d) => d.text));
  const qv = await provider.embed(queries.map((q) => q.q));
  let r1 = 0, r3 = 0, rr = 0;
  queries.forEach((q, i) => {
    const ranked = docs.map((d, j) => ({ id: d.id, s: cosine(qv[i], dv[j]) })).sort((a, b) => b.s - a.s).map((x) => x.id);
    const rank = ranked.findIndex((id) => q.relevant.includes(id));
    if (rank === 0) r1++;
    if (rank >= 0 && rank < 3) r3++;
    if (rank >= 0) rr += 1 / (rank + 1);
  });
  const n = queries.length || 1;
  return { provider: provider.id, recallAt1: r1 / n, recallAt3: r3 / n, mrr: rr / n, queries: queries.length };
}

/** A small labelled set of science and commerce topics, phrased the way students ask rather than the way titles read. */
export const SAMPLE_DOCS: EvalDoc[] = [
  { id: 'photosynthesis', text: 'Photosynthesis. Plants use sunlight, water and carbon dioxide to make glucose and release oxygen in the chloroplast.' },
  { id: 'respiration', text: 'Cellular respiration. Cells break down glucose with oxygen to release energy as ATP in the mitochondria.' },
  { id: 'newton', text: "Newton's laws of motion. A force changes the motion of an object; acceleration equals force divided by mass." },
  { id: 'ohm', text: "Ohm's law. Current through a conductor is proportional to the voltage across it; resistance is voltage divided by current." },
  { id: 'depreciation', text: 'Depreciation. The fall in value of a fixed asset over its useful life, charged as an expense each year.' },
  { id: 'trial-balance', text: 'Trial balance. A list of all ledger balances showing total debits equal total credits.' },
  { id: 'inflation', text: 'Inflation. A general rise in prices over time that reduces what money can buy.' },
  { id: 'demand', text: 'Law of demand. When the price of a good falls, buyers want to purchase more of it.' },
];
export const SAMPLE_QUERIES: EvalQuery[] = [
  { q: 'how do green leaves make food from light', relevant: ['photosynthesis'] },
  { q: 'where does the body get energy from sugar', relevant: ['respiration'] },
  { q: 'why does a heavier trolley speed up slower when pushed', relevant: ['newton'] },
  { q: 'relation between voltage and current in a wire', relevant: ['ohm'] },
  { q: 'machine loses value every year in the books', relevant: ['depreciation'] },
  { q: 'check that the debit side matches the credit side', relevant: ['trial-balance'] },
  { q: 'why things get costlier every year', relevant: ['inflation'] },
  { q: 'people buy more when it is cheaper', relevant: ['demand'] },
];
