import { z } from 'zod';

/**
 * The AI task catalogue. Apps ask for a task with structured input; they never send a raw
 * prompt. Each task owns its prompt template (versioned), the JSON shape the model must
 * return, and an offline preview used when no model server is configured.
 */

export const Language = z.enum(['en', 'hi', 'kn']);
export type Language = z.infer<typeof Language>;

const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', hi: 'Hindi', kn: 'Kannada' };

/** What the model is told about the class, so answers match the syllabus and level. */
export interface Grounding {
  institution: string;
  /** school, college or university. Schools get the stricter rules for under-18 users. */
  institutionKind: 'school' | 'college' | 'university';
  className?: string;
  subjectName?: string;
  /** Notes from the content library for this topic, when available. */
  notes?: string[];
  /** From the topic's lesson in the library, when written. */
  lesson?: { terms?: string[]; example?: string; hook?: string; activity?: string };
}

const Topic = z.string().trim().min(2).max(300);
const Difficulty = z.enum(['easy', 'medium', 'hard']).default('medium');

export const TaskInputs = {
  explain: z.object({ question: z.string().trim().min(2).max(1000), language: Language.default('en') }),
  quiz: z.object({
    topic: Topic,
    count: z.number().int().min(1).max(20).default(5),
    difficulty: Difficulty,
    language: Language.default('en'),
  }),
  homework: z.object({
    topic: Topic,
    count: z.number().int().min(1).max(15).default(5),
    difficulty: Difficulty,
    language: Language.default('en'),
  }),
  lessonPlan: z.object({
    topic: Topic,
    minutes: z.number().int().min(10).max(180).default(55),
    language: Language.default('en'),
  }),
  summarize: z.object({ transcript: z.string().trim().min(20).max(60_000), language: Language.default('en') }),
  /** A board page as a PNG (base64, no data: prefix), for reading handwriting. Needs a vision model. */
  readBoard: z.object({ image: z.string().min(100).max(6_000_000).regex(/^[A-Za-z0-9+/=]+$/, 'Send the PNG as base64'), language: Language.default('en') }),
} as const;

const Text = (max: number) => z.string().trim().min(1).max(max);

export const TaskOutputs = {
  explain: z.object({
    answer: Text(6000),
    keyPoints: z.array(Text(400)).max(8).default([]),
    followUps: z.array(Text(300)).max(5).default([]),
  }),
  quiz: z.object({
    questions: z
      .array(
        z
          .object({
            question: Text(600),
            options: z.array(Text(300)).length(4),
            answer: z.number().int().min(0).max(3),
            explanation: Text(800),
          })
          .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, 'The four options must differ'),
      )
      .min(1)
      .max(20),
  }),
  homework: z.object({
    title: Text(200),
    instructions: Text(1500),
    questions: z.array(z.object({ question: Text(800), marks: z.number().int().min(1).max(20) })).min(1).max(15),
  }),
  lessonPlan: z.object({
    objectives: z.array(Text(300)).min(1).max(6),
    steps: z.array(z.object({ minutes: z.number().int().min(1).max(120), activity: Text(600) })).min(2).max(12),
    materials: z.array(Text(200)).max(10).default([]),
    assessment: Text(800),
  }),
  summarize: z.object({ summary: Text(3000), keyPoints: z.array(Text(400)).min(1).max(10) }),
  readBoard: z.object({
    /** The writing on the board as plain text, line by line. */
    text: z.string().max(6000),
    /** Mathematics found, as LaTeX, one expression per item. */
    math: z.array(Text(500)).max(30).default([]),
  }),
} as const;

export type TaskName = keyof typeof TaskInputs;
export type TaskInput<T extends TaskName> = z.infer<(typeof TaskInputs)[T]>;
export type TaskOutput<T extends TaskName> = z.infer<(typeof TaskOutputs)[T]>;

/** Bump when a template changes; it is logged with every output and part of the cache key. */
export const PROMPT_VERSION = 'v1';

export type ChatContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  /** Text, or text and images in the OpenAI-compatible multi-part form (vision models). */
  content: ChatContent;
}

function systemPrompt(g: Grounding, language: Language): string {
  const audience =
    g.institutionKind === 'school'
      ? 'Students are under 18. Keep every example age-appropriate. Never include violence, sexual content, self-harm, drugs, gambling, hate or politics.'
      : 'Students are adults at an Indian college. Keep content professional and suitable for a classroom.';
  const lines = [
    'You are KINETIX AI, a teaching assistant for Indian classrooms.',
    `Institution: ${g.institution}.`,
    g.className ? `Class: ${g.className}.` : null,
    g.subjectName ? `Subject: ${g.subjectName}.` : null,
    'Follow the Indian syllabus for this class and level. Use Indian examples, names and rupees (₹) where examples help.',
    audience,
    `Write in ${LANGUAGE_NAMES[language]}${language === 'en' ? '' : ' (use the native script)'}.`,
    'If you are not sure a fact is correct, say so rather than guessing.',
    'Reply with one JSON object only, no markdown fences, matching the shape described by the user.',
  ];
  if (g.notes?.length) lines.push('Base the answer on these syllabus notes:', ...g.notes.map((n) => `- ${n}`));
  const l = g.lesson;
  if (l?.terms?.length) lines.push(`Key terms of the syllabus lesson: ${l.terms.join(', ')}.`);
  if (l?.example) lines.push(`Worked example from the syllabus lesson: ${l.example}`);
  if (l?.hook) lines.push(`The syllabus lesson opens with: ${l.hook}`);
  if (l?.activity) lines.push(`Its class activity: ${l.activity}`);
  return lines.filter(Boolean).join('\n');
}

const SHAPES: Record<TaskName, string> = {
  explain: '{"answer": string (clear explanation, short paragraphs), "keyPoints": string[] (3-5), "followUps": string[] (2-3 questions a student might ask next)}',
  quiz: '{"questions": [{"question": string, "options": [4 distinct strings], "answer": index 0-3 of the correct option, "explanation": string}]}',
  homework: '{"title": string, "instructions": string, "questions": [{"question": string, "marks": integer}]}',
  lessonPlan: '{"objectives": string[], "steps": [{"minutes": integer, "activity": string}], "materials": string[], "assessment": string}',
  summarize: '{"summary": string (one paragraph for a student who missed class), "keyPoints": string[]}',
  readBoard: '{"text": string (the handwriting, line by line, as written), "math": string[] (each mathematical expression in LaTeX)}',
};

function userPrompt<T extends TaskName>(task: T, input: TaskInput<T>): string {
  const i = input as Record<string, unknown>;
  const ask = (() => {
    switch (task) {
      case 'explain':
        return `Explain for the class: ${i.question}`;
      case 'quiz':
        return `Write ${i.count} multiple-choice questions (${i.difficulty}) on: ${i.topic}. Exactly one option is correct; vary its position.`;
      case 'homework':
        return `Write a homework assignment of ${i.count} questions (${i.difficulty}) on: ${i.topic}. Mix short and long answers; marks reflect effort.`;
      case 'lessonPlan':
        return `Plan a ${i.minutes}-minute lesson on: ${i.topic}. Step minutes must add up to ${i.minutes}.`;
      case 'summarize':
        return `Summarise this classroom lesson transcript for students who were absent:\n"""\n${i.transcript}\n"""`;
      case 'readBoard':
        return 'Read the handwriting on this classroom whiteboard exactly as written. Do not solve or correct anything.';
    }
  })();
  return `${ask}\n\nReturn JSON shaped like: ${SHAPES[task]}`;
}

export function buildMessages<T extends TaskName>(task: T, input: TaskInput<T>, g: Grounding): ChatMessage[] {
  const language = (input as { language: Language }).language;
  const user: ChatContent =
    task === 'readBoard'
      ? [
          { type: 'text', text: userPrompt(task, input) },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${(input as TaskInput<'readBoard'>).image}` } },
        ]
      : userPrompt(task, input);
  return [
    { role: 'system', content: systemPrompt(g, language) },
    { role: 'user', content: user },
  ];
}

/** The words in a request, for grounding and safety checks (never the image data). */
export function requestText(input: unknown): string {
  const { image: _image, ...rest } = input as Record<string, unknown>;
  return JSON.stringify(rest);
}

/** Rejects outputs that are well-formed JSON but wrong for the request. */
export function checkOutput<T extends TaskName>(task: T, input: TaskInput<T>, out: TaskOutput<T>): string | null {
  if (task === 'lessonPlan') {
    const total = (out as TaskOutput<'lessonPlan'>).steps.reduce((s, x) => s + x.minutes, 0);
    const want = (input as TaskInput<'lessonPlan'>).minutes;
    if (Math.abs(total - want) > 5) return `The step minutes add up to ${total}, not ${want}.`;
  }
  return null;
}

/**
 * Step minutes scaled to add up to exactly [total]: each rounded to whole minutes, at least 2
 * (fewer only when the lesson is too short for that), and the rounding remainder added to (or
 * taken from) the longest step.
 */
export function fitMinutes(minutes: number[], total: number): number[] {
  const n = minutes.length;
  if (n === 0 || total <= 0) return minutes;
  const floor = Math.max(1, Math.min(2, Math.floor(total / n)));
  const sum = minutes.reduce((s, m) => s + Math.max(0, m), 0);
  const out = minutes.map((m) => Math.max(floor, Math.round(sum > 0 ? (Math.max(0, m) * total) / sum : total / n)));
  let diff = total - out.reduce((s, m) => s + m, 0);
  // Longest first (the earlier step on a tie), so the main part of the lesson absorbs the change.
  const order = out.map((_, i) => i).sort((a, b) => out[b] - out[a] || a - b);
  if (diff > 0) out[order[0]] += diff;
  for (const i of order) {
    if (diff >= 0) break;
    const take = Math.min(-diff, out[i] - floor);
    out[i] -= take;
    diff += take;
  }
  return out;
}

/** Fixes what a model reliably gets slightly wrong: lesson-plan steps always add up to the chosen length. */
export function postProcess<T extends TaskName>(task: T, input: TaskInput<T>, out: TaskOutput<T>): TaskOutput<T> {
  if (task !== 'lessonPlan') return out;
  const plan = out as TaskOutput<'lessonPlan'>;
  const fitted = fitMinutes(plan.steps.map((s) => s.minutes), (input as TaskInput<'lessonPlan'>).minutes);
  return { ...plan, steps: plan.steps.map((s, i) => ({ ...s, minutes: fitted[i] })) } as TaskOutput<T>;
}

/**
 * Offline preview: a fixed, clearly labelled response with the right shape. Used in
 * development and tests, and on installs that have not connected an AI server yet.
 * It never pretends to know the subject.
 */
export function previewOutput<T extends TaskName>(task: T, input: TaskInput<T>): TaskOutput<T> {
  const i = input as Record<string, any>;
  const topic: string = i.topic ?? i.question ?? 'this lesson';
  const result = (() => {
    switch (task) {
      case 'explain':
        return {
          answer: `Preview answer about "${topic}". Connect the KINETIX AI server to get a real explanation that follows your syllabus.`,
          keyPoints: ['Start from what the class already knows', 'Define the key terms', 'Work through one example together'],
          followUps: ['Where is this used in real life?', 'Can you show another example?'],
        };
      case 'quiz':
        return {
          questions: Array.from({ length: i.count }, (_, n) => ({
            question: `Preview question ${n + 1} on ${topic}`,
            options: ['First option', 'Second option', 'Third option', 'Fourth option'],
            answer: n % 4,
            explanation: 'Preview only. Real questions need the KINETIX AI server.',
          })),
        };
      case 'homework':
        return {
          title: `Homework: ${topic}`,
          instructions: 'Answer all questions in your notebook. Show your working.',
          questions: Array.from({ length: i.count }, (_, n) => ({ question: `Preview question ${n + 1} on ${topic}`, marks: n % 2 === 0 ? 2 : 5 })),
        };
      case 'lessonPlan': {
        const m: number = i.minutes;
        const intro = Math.round(m * 0.15);
        const practice = Math.round(m * 0.3);
        const wrap = Math.max(1, Math.round(m * 0.1));
        return {
          objectives: [`Understand the main ideas of ${topic}`, `Apply ${topic} to a worked example`],
          steps: [
            { minutes: intro, activity: 'Recall what the class knows; pose a question to explore.' },
            { minutes: m - intro - practice - wrap, activity: `Teach ${topic} with one worked example on the board.` },
            { minutes: practice, activity: 'Students practise in pairs; check two answers on the board.' },
            { minutes: wrap, activity: 'Quick quiz and summary.' },
          ],
          materials: ['KINETIX Board'],
          assessment: 'A 5-question quick quiz at the end of class.',
        };
      }
      case 'readBoard':
        return { text: 'Preview: connect a KINETIX AI server with a vision model to read the handwriting on the board.', math: [] };
      case 'summarize':
        return {
          summary: `Preview summary. The lesson transcript has ${String(i.transcript).split(/\s+/).length} words; connect the KINETIX AI server for a real summary.`,
          keyPoints: ['Watch the recording to catch up'],
        };
    }
  })();
  return postProcess(task, input, result as TaskOutput<T>);
}
