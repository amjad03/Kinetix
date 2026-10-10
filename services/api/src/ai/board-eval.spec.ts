import { describe, expect, it } from 'vitest';
import { BOARD_QUESTIONS } from './eval/board-questions.js';
import { cleanAnswerText, cleanOcrText, latexToUnicode, tidyList } from './math-format.js';
import { OpenAiCompatibleProvider, parseJsonReply } from './providers.js';
import { buildMessages, postProcess, PROMPT_VERSION, TaskInputs, TaskOutputs } from './tasks.js';
import type { Grounding } from './tasks.js';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

/** True when every required group has one of its spellings in the answer. */
export function scoreAnswer(answer: string, must: string[]): boolean {
  const a = norm(answer);
  return must.every((group) => group.split('|').some((w) => a.includes(norm(w))));
}

const g: Grounding = { institution: 'Demo School', institutionKind: 'school', className: 'Class 10 A', subjectName: 'Maths' };

describe('board answer prompts (v2)', () => {
  it('tell the model to work step by step, cite uncertainty, and not use LaTeX', () => {
    expect(PROMPT_VERSION).toBe('v2');
    const [system, user] = buildMessages('explain', TaskInputs.explain.parse({ question: 'Solve 2x+3=9', level: 'Class 8 CBSE Maths' }), g);
    const text = String(system.content);
    expect(text).toContain('Class 10 A');
    expect(text).toContain('step by step');
    expect(text).toContain('Not sure:');
    expect(text).toContain('Do not use LaTeX');
    expect(String(user.content)).toContain('Class 8 CBSE Maths');
  });

  it('asks in the chosen language', () => {
    const [system] = buildMessages('explain', TaskInputs.explain.parse({ question: 'प्रकाश संश्लेषण क्या है?', language: 'hi' }), g);
    expect(String(system.content)).toContain('Hindi');
  });

  it('asks the vision model for careful handwriting reading', () => {
    const png = 'A'.repeat(200);
    const [, user] = buildMessages('readBoard', TaskInputs.readBoard.parse({ image: png }), g);
    const parts = user.content as { type: string; text?: string }[];
    expect(parts[0].text).toContain('[?]');
    expect(parts[0].text).toContain('LaTeX');
  });
});

describe('answer post-processing', () => {
  it('turns LaTeX into readable Unicode maths', () => {
    expect(latexToUnicode('x^2 + \\frac{1}{2}')).toBe('x² + 1/2');
    expect(latexToUnicode('\\sqrt{x+1}')).toBe('√(x+1)');
    expect(latexToUnicode('90^\\circ \\times \\pi')).toBe('90° × π');
    expect(cleanAnswerText('The roots are $x = 2$ and $$x=3$$. **Answer:** done')).toBe('The roots are x = 2 and x=3. Answer: done');
    expect(cleanAnswerText('Price is $5 and $6')).toBe('Price is $5 and $6');
  });

  it('cleans the explain output and de-duplicates points', () => {
    const out = postProcess('explain', TaskInputs.explain.parse({ question: 'q?' }), TaskOutputs.explain.parse({ answer: '## Steps\n\\(x^2\\)', keyPoints: ['A point', 'a point.', 'Other'], followUps: [] }));
    expect(out.answer).toBe('Steps\nx²');
    expect(out.keyPoints).toEqual(['A point', 'Other']);
  });

  it('tidies handwriting text and its maths', () => {
    expect(cleanOcrText('x − 3 = 5\n\n\n\ny   = 8')).toBe('x - 3 = 5\n\ny = 8');
    const out = postProcess('readBoard', TaskInputs.readBoard.parse({ image: 'A'.repeat(200) }), { text: 'a  b', math: ['$x^2$', 'x^2', ''] });
    expect(out.math).toEqual(['x^2']);
    expect(tidyList(['', 'Same.', 'same'])).toEqual(['Same.']);
  });

  it('parses a fenced JSON reply', () => {
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe('board evaluation set', () => {
  it('has 40 distinct questions, each with an expected answer', () => {
    expect(BOARD_QUESTIONS).toHaveLength(40);
    expect(new Set(BOARD_QUESTIONS.map((x) => x.id)).size).toBe(40);
    for (const x of BOARD_QUESTIONS) {
      expect(x.question.length).toBeGreaterThan(5);
      expect(x.must.length).toBeGreaterThan(0);
    }
  });

  it('the scorer accepts a right answer and rejects a wrong one', () => {
    const m02 = BOARD_QUESTIONS.find((x) => x.id === 'm02')!;
    expect(scoreAnswer('Factorise: (x-2)(x-3)=0, so x = 2 or x = 3.', m02.must)).toBe(true);
    expect(scoreAnswer('x = 1 or x = 6', m02.must)).toBe(false);
  });
});

/**
 * Live accuracy check against the configured provider (AI_BASE_URL, AI_MODEL, AI_API_KEY).
 * Skipped when no provider is configured. Needs at least 80 % of the questions right.
 */
const baseUrl = process.env.AI_BASE_URL;
describe.skipIf(!baseUrl)('board accuracy (live provider)', () => {
  it('answers at least 80% of the evaluation questions correctly', async () => {
    const provider = new OpenAiCompatibleProvider(baseUrl!, process.env.AI_MODEL ?? 'kinetix-llm', process.env.AI_API_KEY, 60_000, false);
    let right = 0;
    const missed: string[] = [];
    for (const x of BOARD_QUESTIONS) {
      const input = TaskInputs.explain.parse({ question: x.question, level: x.level, language: /[ऀ-ॿ]/.test(x.question) ? 'hi' : 'en' });
      const reply = await provider.complete(buildMessages('explain', input, { ...g, className: x.level, subjectName: undefined }), { maxTokens: 800, temperature: 0.1 });
      const out = postProcess('explain', input, TaskOutputs.explain.parse(parseJsonReply(reply.text)));
      if (scoreAnswer(`${out.answer} ${out.keyPoints.join(' ')}`, x.must)) right++;
      else missed.push(x.id);
    }
    expect(right / BOARD_QUESTIONS.length, `missed: ${missed.join(', ')}`).toBeGreaterThanOrEqual(0.8);
  }, 600_000);
});
