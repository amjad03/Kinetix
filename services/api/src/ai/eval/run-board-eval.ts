import { parseJsonReply, withBackoff, type LlmProvider } from '../providers.js';
import { buildMessages, maxTokensFor, normaliseReply, parseTaskOutput, postProcess, TaskInputs, temperatureFor, type Grounding, type TaskOutput } from '../tasks.js';
import { BOARD_QUESTIONS, type BoardQuestion } from './board-questions.js';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

/** True when every required group has one of its spellings in the answer. */
export function scoreAnswer(answer: string, must: string[]): boolean {
  const a = norm(answer);
  return must.every((group) => group.split('|').some((w) => a.includes(norm(w))));
}

export interface BoardEvalMiss {
  id: string;
  /** "wrong", "invalid" (the reply was not the explain shape) or the error message. */
  reason: string;
  /** The start of the cleaned answer, for a wrong one. */
  answer?: string;
}

export interface BoardEvalResult {
  right: number;
  total: number;
  missed: BoardEvalMiss[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks each board question the way the board's Ask does (the explain prompt, the JSON check and
 * the answer clean-up, but no syllabus notes) and scores the answers. `paceMs` spaces the
 * requests for free tiers (Gemini's allows about 10 a minute); busy replies are waited out.
 */
export async function runBoardEval(
  provider: LlmProvider,
  opts: { paceMs?: number; questions?: BoardQuestion[]; onResult?: (x: BoardQuestion, ok: boolean, miss?: BoardEvalMiss) => void } = {},
): Promise<BoardEvalResult> {
  const questions = opts.questions ?? BOARD_QUESTIONS;
  const g: Grounding = { institution: 'Demo School', institutionKind: 'school' };
  const missed: BoardEvalMiss[] = [];
  let right = 0;
  for (const [n, x] of questions.entries()) {
    if (n > 0 && opts.paceMs) await sleep(opts.paceMs);
    const input = TaskInputs.explain.parse({ question: x.question, level: x.level, language: /[ऀ-ॿ]/.test(x.question) ? 'hi' : 'en' });
    let miss: BoardEvalMiss | undefined;
    try {
      const reply = await withBackoff(
        () => provider.complete(buildMessages('explain', input, { ...g, className: x.level }), { maxTokens: maxTokensFor('explain', input), temperature: temperatureFor('explain') }),
        { retries: 4, baseMs: 5000, maxWaitMs: 65_000 },
      );
      const parsed = parseTaskOutput('explain', normaliseReply('explain', parseJsonReply(reply.text)));
      if (!parsed.success) {
        miss = { id: x.id, reason: 'invalid' };
      } else {
        const out = postProcess('explain', input, parsed.data as TaskOutput<'explain'>);
        if (!scoreAnswer(`${out.answer} ${out.keyPoints.join(' ')}`, x.must)) miss = { id: x.id, reason: 'wrong', answer: out.answer.replace(/\s+/g, ' ').slice(0, 160) };
      }
    } catch (e) {
      miss = { id: x.id, reason: (e as Error).message.slice(0, 200) };
    }
    if (miss) missed.push(miss);
    else right++;
    opts.onResult?.(x, !miss, miss);
  }
  return { right, total: questions.length, missed };
}
