/**
 * The 40-question board evaluation against the models in .env (AI_BASE_URL, AI_MODEL,
 * AI_FALLBACK_MODELS, AI_API_KEY):
 *   pnpm ai:eval
 * Prints each result (and which model answered) and the score. Requests are spaced for free tiers:
 * AI_EVAL_PACE_MS, by default 13 s for Google Gemini (its free tier allows about 5 requests a
 * minute) and none for other servers. Gemini's free tier also allows only about 20 requests a day
 * per model, so a full run needs AI_FALLBACK_MODELS, and it uses the day's allowance: do not run it
 * on a demo day. To ask again only the questions that missed: AI_EVAL_ONLY=m03,p02 pnpm ai:eval.
 */
import { CircuitBreaker, FallbackProvider, isGemini, OpenAiCompatibleProvider, type ReasoningEffort } from '../providers.js';
import { BOARD_QUESTIONS } from './board-questions.js';
import { runBoardEval } from './run-board-eval.js';

const baseUrl = process.env.AI_BASE_URL;
if (!baseUrl) {
  console.error('Set AI_BASE_URL, AI_MODEL and AI_API_KEY (services/api/.env) to run the board evaluation.');
  process.exit(1);
}
// The main model, then AI_FALLBACK_MODELS as the API uses them (each has its own free daily allowance on Gemini).
const models = [...new Set([process.env.AI_MODEL ?? 'kinetix-llm', ...(process.env.AI_FALLBACK_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean)])];
const pace = Number(process.env.AI_EVAL_PACE_MS ?? (isGemini(baseUrl) ? 13_000 : 0));
const only = process.env.AI_EVAL_ONLY?.split(',').map((id) => id.trim()).filter(Boolean);
const questions = only?.length ? BOARD_QUESTIONS.filter((x) => only.includes(x.id)) : BOARD_QUESTIONS;
const links = models.map(
  (model) =>
    new OpenAiCompatibleProvider(baseUrl, model, process.env.AI_API_KEY || undefined, Number(process.env.AI_TIMEOUT_MS ?? 60_000), false, {
      reasoningEffort: process.env.AI_REASONING_EFFORT as ReasoningEffort | undefined,
    }),
);
const provider = links.length === 1 ? links[0] : new FallbackProvider(links.map((p) => ({ provider: p, breaker: new CircuitBreaker(3, 60_000) })));

console.log(`Board evaluation: ${models.join(', then ')} at ${new URL(baseUrl).host}${pace ? `, one question every ${pace / 1000} s` : ''}`);
const result = await runBoardEval(provider, {
  paceMs: pace,
  questions,
  onWait: (x, reason, ms) => console.log(`wait ${x.id.padEnd(4)} ${(ms / 1000).toFixed(0)} s: ${reason.slice(0, 120)}`),
  onResult: (x, ok, miss, model) =>
    console.log(`${ok ? 'ok  ' : 'MISS'} ${x.id.padEnd(4)} ${x.question.slice(0, 60)}${links.length > 1 && model ? ` (${model})` : ''}${miss ? `  [${miss.reason}${miss.answer ? `: ${miss.answer}` : ''}]` : ''}`),
});
console.log(`\nScore: ${result.right}/${result.total} (${Math.round((100 * result.right) / result.total)}%), target 80%`);
process.exit(result.right / result.total >= 0.8 ? 0 : 2);
