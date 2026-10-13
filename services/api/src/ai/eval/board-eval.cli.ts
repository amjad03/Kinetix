/**
 * The 40-question board evaluation against the model in .env (AI_BASE_URL, AI_MODEL, AI_API_KEY):
 *   pnpm ai:eval
 * Prints each result and the score. Requests are spaced for free tiers: AI_EVAL_PACE_MS, by default
 * 7 s for Google Gemini (about 10 requests a minute on its free tier) and none for other servers.
 * The 40 requests count against the day's free-tier allowance: do not run it just before a demo.
 */
import { isGemini, OpenAiCompatibleProvider, type ReasoningEffort } from '../providers.js';
import { runBoardEval } from './run-board-eval.js';

const baseUrl = process.env.AI_BASE_URL;
if (!baseUrl) {
  console.error('Set AI_BASE_URL, AI_MODEL and AI_API_KEY (services/api/.env) to run the board evaluation.');
  process.exit(1);
}
const model = process.env.AI_MODEL ?? 'kinetix-llm';
const pace = Number(process.env.AI_EVAL_PACE_MS ?? (isGemini(baseUrl) ? 7000 : 0));
const provider = new OpenAiCompatibleProvider(baseUrl, model, process.env.AI_API_KEY || undefined, Number(process.env.AI_TIMEOUT_MS ?? 60_000), false, {
  reasoningEffort: process.env.AI_REASONING_EFFORT as ReasoningEffort | undefined,
});

console.log(`Board evaluation: ${model} at ${new URL(baseUrl).host}${pace ? `, one question every ${pace / 1000} s` : ''}`);
const result = await runBoardEval(provider, {
  paceMs: pace,
  onResult: (x, ok, miss) => console.log(`${ok ? 'ok  ' : 'MISS'} ${x.id.padEnd(4)} ${x.question.slice(0, 60)}${miss ? `  [${miss.reason}${miss.answer ? `: ${miss.answer}` : ''}]` : ''}`),
});
console.log(`\nScore: ${result.right}/${result.total} (${Math.round((100 * result.right) / result.total)}%), target 80%`);
process.exit(result.right / result.total >= 0.8 ? 0 : 2);
