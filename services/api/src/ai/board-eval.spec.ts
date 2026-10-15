import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeGemini } from '../../test/fake-ai-servers.js';
import { BOARD_QUESTIONS } from './eval/board-questions.js';
import { runBoardEval, scoreAnswer } from './eval/run-board-eval.js';
import { cleanAnswerText, cleanOcrText, latexToUnicode, tidyList } from './math-format.js';
import { isGemini, OpenAiCompatibleProvider, parseJsonReply, type ReasoningEffort } from './providers.js';
import { buildMessages, maxTokensFor, normaliseReply, parseTaskOutput, postProcess, PROMPT_VERSION, TaskInputs, TaskOutputs } from './tasks.js';
import type { Grounding } from './tasks.js';

const g: Grounding = { institution: 'Demo School', institutionKind: 'school', className: 'Class 10 A', subjectName: 'Maths' };

describe('board answer prompts (v4)', () => {
  it('tell the model to work step by step, cite uncertainty, and not use LaTeX or markdown', () => {
    expect(PROMPT_VERSION).toBe('v4');
    const [system, user] = buildMessages('explain', TaskInputs.explain.parse({ question: 'Solve 2x+3=9', level: 'Class 8 CBSE Maths' }), g);
    const text = String(system.content);
    expect(text).toContain('Class 10 A');
    expect(text).toContain('step by step');
    expect(text).toContain('Not sure:');
    expect(text).toContain('Do not use LaTeX');
    expect(text).toContain('no **, # or * bullets');
    // Gemini opened answers with "Hello Class 8 A!" and named the school inside lesson steps.
    expect(text).toContain('no greeting or sign-off');
    expect(String(user.content)).toContain('Class 8 CBSE Maths');
    expect(String(user.content)).toContain('in the first sentence');
  });

  it('asks for flash cards with the answer on each card, and a lesson for the interactive board', () => {
    const [, cards] = buildMessages('selectAsk', TaskInputs.selectAsk.parse({ action: 'quiz', content: 'The nucleus controls the cell.' }), g);
    expect(String(cards.content)).toContain('" Answer: "');
    const [, plan] = buildMessages('lessonPlan', TaskInputs.lessonPlan.parse({ topic: 'Fractions', minutes: 40 }), g);
    expect(String(plan.content)).toContain('ZYNETIX interactive board');
  });

  it('asks in the chosen language', () => {
    const [system] = buildMessages('explain', TaskInputs.explain.parse({ question: 'प्रकाश संश्लेषण क्या है?', language: 'hi' }), g);
    expect(String(system.content)).toContain('Hindi');
  });

  it('asks the vision model for careful handwriting reading, with LaTeX only in the maths list', () => {
    const png = 'A'.repeat(200);
    const [system, user] = buildMessages('readBoard', TaskInputs.readBoard.parse({ image: png }), g);
    const parts = user.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(parts[0].text).toContain('[?]');
    expect(parts[0].text).toContain('LaTeX');
    expect(parts[1].image_url!.url).toBe(`data:image/png;base64,${png}`);
    expect(String(system.content)).not.toContain('Do not use LaTeX');
    expect(String(system.content)).toContain('In "math", write each expression in LaTeX');
  });

  it('gives quizzes and homework room for every question, and Hindi and Kannada more', () => {
    expect(maxTokensFor('explain', { language: 'en' })).toBe(1500);
    expect(maxTokensFor('quiz', { count: 5, language: 'en' })).toBe(2500);
    expect(maxTokensFor('quiz', { count: 20, language: 'en' })).toBe(5600);
    expect(maxTokensFor('homework', { count: 15, language: 'kn' })).toBe(8700);
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

  it('cleans LaTeX written without dollar signs and markdown the way Gemini writes it', () => {
    expect(cleanAnswerText('Area = \\frac{1}{2} \\times 10 \\times 6 = 30 cm^2.')).toBe('Area = 1/2 × 10 × 6 = 30 cm².');
    expect(cleanAnswerText('2H_2 + O_2 \\rightarrow 2H_2O')).toBe('2H₂ + O₂ → 2H₂O');
    expect(cleanAnswerText('*   First step\n*   Then *divide* by `3`\n- Last')).toBe('• First step\n• Then divide by 3\n• Last');
    expect(cleanAnswerText('Step 1\\nStep 2')).toBe('Step 1\nStep 2');
    expect(cleanAnswerText('2 * 3 * 4 = 24 and C:\\Windows')).toBe('2 * 3 * 4 = 24 and C:\\Windows');
    expect(cleanAnswerText('Use \\theta and x^{-1}')).toBe('Use θ and x⁻¹');
  });

  it('cleans the explain output and de-duplicates points', () => {
    const out = postProcess('explain', TaskInputs.explain.parse({ question: 'q?' }), TaskOutputs.explain.parse({ answer: '## Steps\n\\(x^2\\)', keyPoints: ['A point', 'a point.', 'Other'], followUps: [] }));
    expect(out.answer).toBe('Steps\nx²');
    expect(out.keyPoints).toEqual(['A point', 'Other']);
  });

  it('cleans every text of a quiz, homework, summary and lesson plan', () => {
    const quiz = postProcess('quiz', TaskInputs.quiz.parse({ topic: 'Areas' }), TaskOutputs.quiz.parse({ questions: [{ question: 'Area of a square of side $a$?', options: ['$a^2$', '$2a$', '$4a$', '$a^3$'], answer: 0, explanation: '**Side × side**' }] }));
    expect(quiz.questions[0]).toMatchObject({ question: 'Area of a square of side a?', options: ['a²', '2a', '4a', 'a³'], explanation: 'Side × side' });
    const summary = postProcess('boardSummary', TaskInputs.boardSummary.parse({ topic: 'Motion' }), TaskOutputs.boardSummary.parse({ keyConcepts: ['Speed'], formulas: ['$v = \\frac{d}{t}$', 'v^2 = u^2 + 2as'] }));
    expect(summary.formulas).toEqual(['v = d/t', 'v² = u² + 2as']);
    const plan = postProcess('lessonPlan', TaskInputs.lessonPlan.parse({ topic: 'Motion', minutes: 40 }), TaskOutputs.lessonPlan.parse({ objectives: ['**Know** $v = u + at$'], steps: [{ minutes: 20, activity: 'Teach' }, { minutes: 20, activity: 'Practise' }], assessment: 'Quiz' }));
    expect(plan.objectives).toEqual(['Know v = u + at']);
  });

  it('tidies handwriting text and keeps its maths as LaTeX', () => {
    expect(cleanOcrText('x − 3 = 5\n\n\n\ny   = 8')).toBe('x - 3 = 5\n\ny = 8');
    const out = postProcess('readBoard', TaskInputs.readBoard.parse({ image: 'A'.repeat(200) }), { text: 'a  b', math: ['$x^2$', 'x^2', '', '\\(\\frac{1}{2}\\)'] });
    expect(out.math).toEqual(['x^2', '\\frac{1}{2}']);
    expect(tidyList(['', 'Same.', 'same'])).toEqual(['Same.']);
  });

  it('parses a fenced JSON reply, and LaTeX the model did not escape', () => {
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    // "\frac" would be a form feed and "\times" a tab; "\sqrt" is no escape at all.
    expect(parseJsonReply('{"answer": "\\frac{1}{2} \\times \\sqrt{4}", "keyPoints": ["\\alpha",],}')).toEqual({ answer: '\\frac{1}{2} \\times \\sqrt{4}', keyPoints: ['\\alpha'] });
    expect(parseJsonReply('{"answer": "a\\nb\\\\frac"}')).toEqual({ answer: 'a\nb\\frac' });
  });

  it('fixes JSON-mode slips before the shape check: nulls, numbers as text, answer letters', () => {
    const quiz = normaliseReply('quiz', {
      questions: [
        { question: 'Q1', options: ['a', 'b', 'c', 'd'], answer: 'C', explanation: 'x', misconception: null },
        { type: 'trueFalse', question: 'Q2', options: ['True', 'False'], answer: false, explanation: 'x' },
        { question: 'Q3', options: ['Red', 'Blue', 'Green', 'Pink'], answer: 'Blue', explanation: 'x' },
        { type: 'fillBlank', question: 'Q4 ___', options: [], answer: 'seven', explanation: 'x' },
      ],
    });
    const parsed = parseTaskOutput('quiz', quiz);
    expect(parsed.success).toBe(true);
    const qs = (parsed.data as { questions: { answer?: number; answerText?: string }[] }).questions;
    expect(qs.map((q) => q.answer)).toEqual([2, 1, 1, undefined]);
    expect(qs[3].answerText).toBe('seven');

    const hw = parseTaskOutput('homework', normaliseReply('homework', { title: 'T', instructions: 'I', questions: [{ question: 'Q', marks: '2 marks', answer: null }] }));
    expect(hw.success && (hw.data as { questions: { marks: number }[] }).questions[0].marks).toBe(2);
    const plan = parseTaskOutput('lessonPlan', normaliseReply('lessonPlan', { objectives: ['O'], steps: [{ minutes: '10 min', activity: 'A' }, { minutes: '30', activity: 'B' }], assessment: 'Q' }));
    expect(plan.success).toBe(true);
  });

  it('drops extra list items instead of refusing the reply', () => {
    const out = parseTaskOutput('explain', { answer: 'A', keyPoints: Array.from({ length: 11 }, (_, i) => `P${i}`), followUps: ['1', '2', '3', '4', '5', '6', '7'] });
    expect(out.success).toBe(true);
    expect((out.data as { keyPoints: string[]; followUps: string[] }).keyPoints).toHaveLength(8);
    expect((out.data as { followUps: string[] }).followUps).toHaveLength(5);
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

  it('knows Google Gemini by its address', () => {
    expect(isGemini('https://generativelanguage.googleapis.com/v1beta/openai')).toBe(true);
    expect(isGemini('http://10.0.0.12:8000/v1')).toBe(false);
  });
});

/**
 * Answers as Gemini writes them (LaTeX with and without dollar signs, markdown, nulls, fences),
 * so the evaluation runs end to end without a key: it checks the pipeline and the scorer, not the model.
 */
const GEMINI_STYLE: Record<string, string> = {
  m01: 'Subtract 7 from both sides: $3x = 15$. Divide by 3.\nAnswer: **x = 5**',
  m02: 'Factorise: $(x-2)(x-3) = 0$\nAnswer: x = 2 or x = 3',
  m03: 'Use \\frac{n(n+1)}{2} with n = 20: \\frac{20 \\times 21}{2} = 210\nAnswer: 210',
  m04: '$a_n = a + (n-1)d$ with a = 2, d = 3: $a_{10} = 2 + 9 \\times 3 = 29$\nAnswer: 29',
  m05: 'Area = $\\frac{1}{2} \\times b \\times h = \\frac{1}{2} \\times 10 \\times 6 = 30$ cm^2\nAnswer: 30 cm²',
  m06: 'sin 30° = $\\frac{1}{2}$\nAnswer: 1/2',
  m08: '15% of 240 = $\\frac{15}{100} \\times 240 = 36$\nAnswer: 36',
  m09: 'C = 2πr = $2 \\times \\frac{22}{7} \\times 7 = 44$ cm\nAnswer: 44 cm',
  m10: 'By the power rule, $\\frac{d}{dx}(x^3) = 3x^2$\nAnswer: 3x^2',
  m11: '$\\int 2x \\, dx = x^2 + C$, where C is the constant of integration.',
  m12: '12 = 2² × 3 and 18 = 2 × 3², so the HCF is 2 × 3 = 6.\nAnswer: 6',
  m13: 'Multiples of 4: 4, 8, 12; of 6: 6, 12. The LCM is 12.',
  m14: '$(a+b)^2 = a^2 + 2ab + b^2$',
  m15: 'd = $\\sqrt{(3-0)^2 + (4-0)^2} = \\sqrt{25} = 5$\nAnswer: 5 units',
  p01: "**Newton's second law:** force equals mass times acceleration, F = ma.",
  p02: 'a = (v − u)/t = (20 − 0)/5 = 4 m/s²\nAnswer: 4 m/s²',
  p03: "Ohm's law: the current through a conductor is proportional to the potential difference across it; V = IR, where R is the resistance.",
  p04: 'V = IR = 2 × 5 = 10 V\nAnswer: 10 V',
  p05: 'The SI unit of force is the newton (N).',
  p06: 'g ≈ $9.8 \\text{ m/s}^2$ near the surface of the Earth.',
  c01: 'Common salt is sodium chloride, NaCl.',
  c02: 'A neutral solution has a pH of 7 at 25°C.',
  c03: 'Carbon has atomic number 6.',
  c04: '$2H_2 + O_2 \\rightarrow 2H_2O$',
  c05: 'H₂O: 2 × 1 + 16 = 18\nAnswer: 18 g/mol',
  b01: 'Plants take in carbon dioxide (CO_2) for photosynthesis.',
  b02: 'The mitochondria are the powerhouse of the cell.',
  b03: '*Chlorophyll* gives leaves their green colour.',
  b04: 'The human heart has four chambers: two atria and two ventricles.',
  s01: 'Jawaharlal Nehru was the first Prime Minister of independent India.',
  s02: 'India became independent on 15 August 1947.',
  s03: 'Bengaluru is the capital of Karnataka.',
  s04: 'The Ganga is the longest river in India.',
  s05: 'Dr B. R. Ambedkar is known as the Father of the Indian Constitution.',
  e01: 'The past tense of "go" is "went".',
  e02: 'The plural of "child" is "children".',
  e03: 'A synonym of "happy" is "joyful".',
  h01: '"सूर्य" के पर्यायवाची शब्द: रवि, भानु, दिनकर।',
  h02: '"पुस्तक" का बहुवचन "पुस्तकें" है।',
  k01: 'One byte has 8 bits.',
};

describe('board evaluation, mocked Gemini (no key needed)', () => {
  const gemini = new FakeGemini();
  beforeAll(() => gemini.start());
  afterAll(() => gemini.stop());

  it('runs all 40 questions through the Gemini request format and scores the cleaned answers', async () => {
    gemini.answer = (body) => {
      const asked = FakeGemini.userText(body);
      const x = BOARD_QUESTIONS.find((q) => asked.includes(q.question))!;
      const reply = JSON.stringify({ answer: GEMINI_STYLE[x.id], keyPoints: ['Check the working'], followUps: null });
      // Some replies come fenced, as Gemini does without JSON mode.
      return x.id.startsWith('s') ? '```json\n' + reply + '\n```' : reply;
    };
    gemini.failures = [429]; // the first question meets the per-minute limit and is asked again after 1 s
    const provider = new OpenAiCompatibleProvider(gemini.url, 'gemini-3.8-flash', FakeGemini.KEY, 5000, true, { reasoningEffort: 'low' });
    const result = await runBoardEval(provider);
    expect(result.missed).toEqual([]);
    expect(result.right).toBe(40);
    expect(gemini.requests).toHaveLength(41);
    const sent = gemini.requests[0].body;
    expect(sent).toMatchObject({ model: 'gemini-3.8-flash', response_format: { type: 'json_object' }, reasoning_effort: 'low', max_tokens: 1500 + 1024, temperature: 0.3 });
    expect(gemini.requests[0].headers.authorization).toBe(`Bearer ${FakeGemini.KEY}`);
  }, 30_000);
});

/**
 * Live accuracy check against the configured provider (AI_BASE_URL, AI_MODEL, AI_API_KEY), e.g.
 * Gemini's free tier. Runs only with AI_LIVE_EVAL=1 (40 requests: two days of one Gemini model's
 * free allowance). Needs at least 80 % right. Spaced for free tiers by AI_EVAL_PACE_MS (13 s for
 * Gemini). `pnpm ai:eval` prints each answer instead, and uses AI_FALLBACK_MODELS.
 */
const baseUrl = process.env.AI_BASE_URL;
describe.skipIf(!baseUrl || process.env.AI_LIVE_EVAL !== '1')('board accuracy (live provider)', () => {
  it('answers at least 80% of the evaluation questions correctly', async () => {
    const provider = new OpenAiCompatibleProvider(baseUrl!, process.env.AI_MODEL ?? 'zynetix-llm', process.env.AI_API_KEY || undefined, 60_000, false, {
      reasoningEffort: process.env.AI_REASONING_EFFORT as ReasoningEffort | undefined,
    });
    const pace = Number(process.env.AI_EVAL_PACE_MS ?? (isGemini(baseUrl!) ? 13_000 : 0));
    const result = await runBoardEval(provider, { paceMs: pace });
    console.log(`Board evaluation: ${result.right}/${result.total}; missed ${result.missed.map((m) => `${m.id} (${m.reason}${m.answer ? `: ${m.answer}` : ''})`).join('; ') || 'none'}`);
    expect(result.right / result.total, `missed: ${result.missed.map((m) => m.id).join(', ')}`).toBeGreaterThanOrEqual(0.8);
  }, 900_000);
});
