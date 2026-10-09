import { z } from 'zod';
import { ContentSchema, parseSyllabusText } from '../curriculum/curriculum-logic.js';

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
const BoardText = z.string().trim().max(20_000).optional();
const Level = z.string().trim().max(120).optional();
export const QuizType = z.enum(['mcq', 'trueFalse', 'fillBlank', 'shortAnswer']);
export const HomeworkType = z.enum(['qa', 'fillBlank', 'mcq', 'trueFalse', 'twoMark', 'threeMark', 'fiveMark', 'diagram']);
const Difficulty = z.enum(['easy', 'medium', 'hard']).default('medium');

/** Aggregated figures only (counts, rupees, percentages, department or class names). */
const Facts = z.record(z.string(), z.unknown());

export const TaskInputs = {
  explain: z.object({ question: z.string().trim().min(2).max(1000), language: Language.default('en') }),
  quiz: z.object({
    topic: Topic,
    count: z.number().int().min(1).max(20).default(5),
    difficulty: Difficulty,
    language: Language.default('en'),
    /** Question types to mix (spec §43); multiple choice when not given. */
    types: z.array(QuizType).min(1).max(4).default(['mcq']),
    /** Scan Board: the text read from the chosen board pages; questions come from it. */
    boardText: BoardText,
    /** Class, board and stream as the teacher put it, e.g. "Class 11 CBSE Science". */
    level: Level,
  }),
  homework: z.object({
    topic: Topic,
    count: z.number().int().min(1).max(15).default(5),
    difficulty: Difficulty,
    language: Language.default('en'),
    /** Formats to include (spec §44). */
    types: z.array(HomeworkType).min(1).max(8).default(['qa']),
    boardText: BoardText,
    level: Level,
  }),
  /** Summary AI (spec §41): the lesson's key concepts, definitions, formulas, examples, points and questions. */
  boardSummary: z.object({
    topic: Topic.optional(),
    boardText: BoardText,
    format: z.enum(['teacher', 'student', 'revision', 'recap']).default('student'),
    language: Language.default('en'),
    level: Level,
  }),
  /** Lecture AI (spec §42). */
  lecture: z.object({
    topic: Topic,
    minutes: z.number().int().min(10).max(180).default(40),
    language: Language.default('en'),
    level: Level,
  }),
  /** Select & Ask (spec §39): an action on what the teacher selected on the board. */
  selectAsk: z.object({
    action: z.enum(['explain', 'simplify', 'expand', 'solve', 'translate', 'example', 'quiz', 'homework', 'diagram', 'boardReady', 'remedial', 'activity']),
    content: z.string().trim().min(1).max(6000),
    /** For translate. */
    targetLanguage: Language.optional(),
    language: Language.default('en'),
    level: Level,
  }),
  lessonPlan: z.object({
    topic: Topic,
    minutes: z.number().int().min(10).max(180).default(55),
    language: Language.default('en'),
  }),
  summarize: z.object({ transcript: z.string().trim().min(20).max(60_000), language: Language.default('en') }),
  /** Marking help for one descriptive answer against a rubric. The reply is only a draft for the examiner. */
  gradeAssist: z.object({
    question: z.string().trim().min(3).max(2000),
    answerText: z.string().trim().min(1).max(8000),
    rubric: z.array(z.object({ criterion: z.string().trim().min(2).max(300), marks: z.number().positive().max(100) })).min(1).max(10),
    maxMarks: z.number().positive().max(100),
    language: Language.default('en'),
  }),
  /** A board page as a PNG (base64, no data: prefix), for reading handwriting. Needs a vision model. */
  /** Domain assistants (PRD §64): the API computes the figures; the model only explains them. No names are ever sent. */
  financeInsight: z.object({ facts: Facts, language: Language.default('en') }),
  admissionsInsight: z.object({ facts: Facts, language: Language.default('en') }),
  hrInsight: z.object({ facts: Facts, language: Language.default('en') }),
  /** Career guidance for one student: the API computes the skills, interests and matching paths; the model advises. No names are sent. */
  careerCoach: z.object({ question: z.string().trim().min(3).max(600), facts: Facts, language: Language.default('en') }),
  /** Curriculum importer: text read from an uploaded syllabus PDF or Word file; the model proposes subjects, units, topics and outcomes for a person to review. */
  syllabusImport: z.object({ text: z.string().trim().min(20).max(60_000), programName: z.string().trim().max(200).optional(), language: Language.default('en') }),
  readBoard: z.object({ image: z.string().min(100).max(6_000_000).regex(/^[A-Za-z0-9+/=]+$/, 'Send the PNG as base64'), language: Language.default('en') }),
} as const;

const Text = (max: number) => z.string().trim().min(1).max(max);

/** What every domain insight returns: a one-line headline, what stands out, what to watch and what to do. */
const Insight = z.object({
  headline: Text(300),
  highlights: z.array(Text(400)).min(1).max(6),
  risks: z.array(Text(400)).max(5).default([]),
  suggestions: z.array(Text(400)).max(5).default([]),
});

export const TaskOutputs = {
  financeInsight: Insight,
  admissionsInsight: Insight,
  hrInsight: Insight,
  careerCoach: z.object({ answer: Text(3000), suggestions: z.array(Text(300)).max(6).default([]), pathways: z.array(Text(120)).max(5).default([]) }),
  syllabusImport: ContentSchema,
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
            type: QuizType.default('mcq'),
            question: Text(600),
            /** Four for multiple choice, two (True, False) for true/false, none otherwise. */
            options: z.array(Text(300)).max(4).default([]),
            /** The correct option's index (multiple choice, true/false). */
            answer: z.number().int().min(0).max(3).optional(),
            /** The expected answer (fill in the blank, short answer). */
            answerText: Text(400).optional(),
            explanation: Text(800),
            /** The usual wrong idea behind the likely wrong answer. */
            misconception: Text(400).optional(),
          })
          .refine((q) => {
            if (q.type === 'mcq') return q.options.length === 4 && q.answer !== undefined;
            if (q.type === 'trueFalse') return q.options.length === 2 && (q.answer === 0 || q.answer === 1);
            return !!q.answerText;
          }, 'Each question needs the options and answer its type requires')
          .refine((q) => q.type !== 'mcq' || new Set(q.options.map((o) => o.toLowerCase())).size === 4, 'The four options must differ'),
      )
      .min(1)
      .max(20),
  }),
  homework: z.object({
    title: Text(200),
    instructions: Text(1500),
    questions: z
      .array(
        z.object({
          question: Text(800),
          marks: z.number().int().min(1).max(20),
          type: HomeworkType.default('qa'),
          options: z.array(Text(300)).max(4).default([]),
          /** A model answer for the teacher to check against. */
          answer: Text(1500).optional(),
          /** What earns the marks. */
          rubric: Text(800).optional(),
          /** For diagram questions: what the diagram must show. */
          diagram: Text(600).optional(),
        }),
      )
      .min(1)
      .max(15),
  }),
  boardSummary: z.object({
    keyConcepts: z.array(Text(400)).min(1).max(10),
    definitions: z.array(z.object({ term: Text(120), meaning: Text(500) })).max(10).default([]),
    formulas: z.array(Text(300)).max(10).default([]),
    examples: z.array(Text(500)).max(6).default([]),
    importantPoints: z.array(Text(400)).max(10).default([]),
    questions: z.array(Text(400)).max(8).default([]),
  }),
  lecture: z.object({
    outline: z.array(Text(300)).min(2).max(12),
    explanation: Text(4000),
    examples: z.array(Text(600)).max(6).default([]),
    analogies: z.array(Text(400)).max(4).default([]),
    boardPlan: z.array(Text(300)).max(10).default([]),
    activities: z.array(Text(400)).max(5).default([]),
    recap: Text(800),
  }),
  selectAsk: z.object({
    title: Text(200),
    answer: Text(5000),
    /** Questions, steps or examples, when the action produces a list. */
    items: z.array(Text(600)).max(12).default([]),
  }),
  lessonPlan: z.object({
    objectives: z.array(Text(300)).min(1).max(6),
    steps: z.array(z.object({ minutes: z.number().int().min(1).max(120), activity: Text(600) })).min(2).max(12),
    materials: z.array(Text(200)).max(10).default([]),
    assessment: Text(800),
  }),
  summarize: z.object({ summary: Text(3000), keyPoints: z.array(Text(400)).min(1).max(10) }),
  gradeAssist: z.object({
    criteria: z.array(z.object({ criterion: Text(300), awarded: z.number().min(0).max(100), comment: z.string().trim().max(500).default('') })).min(1).max(10),
    total: z.number().min(0).max(100),
    rationale: Text(1200),
  }),
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

const INSIGHT_SHAPE = '{"headline": string (one sentence), "highlights": string[] (2-5 findings that quote the figures), "risks": string[] (what to watch), "suggestions": string[] (practical next steps)}';

const SHAPES: Record<TaskName, string> = {
  explain: '{"answer": string (clear explanation, short paragraphs), "keyPoints": string[] (3-5), "followUps": string[] (2-3 questions a student might ask next)}',
  quiz: '{"questions": [{"question": string, "options": [4 distinct strings], "answer": index 0-3 of the correct option, "explanation": string}]}',
  homework: '{"title": string, "instructions": string, "questions": [{"question": string, "marks": integer}]}',
  lessonPlan: '{"objectives": string[], "steps": [{"minutes": integer, "activity": string}], "materials": string[], "assessment": string}',
  gradeAssist: '{"criteria": [{"criterion": string (copied from the rubric, in order), "awarded": number (0 up to that criterion\'s marks), "comment": string (one sentence quoting what the answer did or missed)}], "total": number (sum of awarded), "rationale": string (two sentences for the examiner)}',
  summarize: '{"summary": string (one paragraph for a student who missed class), "keyPoints": string[]}',
  readBoard: '{"text": string (the handwriting, line by line, as written), "math": string[] (each mathematical expression in LaTeX)}',
  boardSummary:
    '{"keyConcepts": string[], "definitions": [{"term": string, "meaning": string}], "formulas": string[], "examples": string[], "importantPoints": string[], "questions": string[]}',
  lecture: '{"outline": string[], "explanation": string, "examples": string[], "analogies": string[], "boardPlan": string[] (what to write on the board, in order), "activities": string[], "recap": string}',
  selectAsk: '{"title": string, "answer": string, "items": string[]}',
  financeInsight: INSIGHT_SHAPE,
  careerCoach: '{"answer": string (practical advice in a few short paragraphs), "suggestions": string[] (3-5 concrete next steps), "pathways": string[] (up to 3 career path names taken from the facts)}',
  admissionsInsight: INSIGHT_SHAPE,
  hrInsight: INSIGHT_SHAPE,
  syllabusImport:
    '{"subjects": [{"code": string, "name": string, "term": integer (semester or class), "credits": number, "hours": integer, "units": [{"title": string, "hours": integer, "topics": string[]}], "cos": [{"code": "CO1", "statement": string, "bloomLevel": string or null}]}]}',
};

const QUIZ_TYPE_SHAPE =
  '{"questions": [{"type": "mcq"|"trueFalse"|"fillBlank"|"shortAnswer", "question": string, "options": string[] (4 for mcq, ["True","False"] for trueFalse, [] otherwise), "answer": index of the correct option (mcq, trueFalse), "answerText": string (fillBlank, shortAnswer), "explanation": string (why it is right), "misconception": string (the usual wrong idea)}]}';
const HOMEWORK_TYPE_SHAPE =
  '{"title": string, "instructions": string, "questions": [{"type": string, "question": string, "marks": integer, "options": string[] (mcq: 4, trueFalse: 2), "answer": string (model answer), "rubric": string (what earns the marks), "diagram": string (diagram questions: what to draw)}]}';

const HOMEWORK_TYPE_NAMES: Record<z.infer<typeof HomeworkType>, string> = {
  qa: 'question and answer',
  fillBlank: 'fill in the blanks',
  mcq: 'multiple choice',
  trueFalse: 'true or false',
  twoMark: '2-mark',
  threeMark: '3-mark',
  fiveMark: '5-mark',
  diagram: 'diagram-based',
};

const SELECT_ASK: Record<TaskInput<'selectAsk'>['action'], string> = {
  explain: 'Explain this for the class',
  simplify: 'Explain this more simply, for students who found it hard',
  expand: 'Expand on this with more detail and depth',
  solve: 'Solve this step by step; put each step in "items"',
  translate: 'Translate this',
  example: 'Give worked examples of this; one per item',
  quiz: 'Write quick check questions on this; one per item, each with its answer',
  homework: 'Write homework questions on this; one per item, with marks',
  diagram: 'Describe a clear diagram to draw on the board for this; one drawing step per item',
  boardReady: 'Rewrite this as short board-ready notes (headings and bullet points); one line per item',
  remedial: 'Suggest remedial steps for students who did not understand this: the likely misconception, then a simpler re-teach and a quick check; one step per item',
  activity: 'Plan a short classroom activity (5 to 10 minutes) on this: materials, then what the teacher and students do; one step per item',
};

function scanned(i: Record<string, unknown>): string {
  return i.boardText ? `\nUse only what is on the class's board (read from the chosen pages):\n\"\"\"\n${i.boardText}\n\"\"\"` : '';
}

function insightAsk(what: string, facts: unknown): string {
  return `${what}, for a principal or office head. Use only these figures (amounts in paise unless a name says rupees; divide by 100 for rupees). Do not invent numbers or mention individuals.\n\"\"\"\n${JSON.stringify(facts)}\n\"\"\"`;
}

function userPrompt<T extends TaskName>(task: T, input: TaskInput<T>): string {
  const i = input as Record<string, unknown>;
  const ask = (() => {
    switch (task) {
      case 'explain':
        return `Explain for the class: ${i.question}`;
      case 'quiz': {
        const types = i.types as string[];
        const kinds = types.length === 1 && types[0] === 'mcq' ? 'multiple-choice questions' : `questions mixing these types: ${types.join(', ')}`;
        return `Write ${i.count} ${kinds} (${i.difficulty}) on: ${i.topic}${i.level ? ` for ${i.level}` : ''}. Ask about concepts examinations test, not trivia. In multiple choice exactly one option is correct; vary its position.${scanned(i)}`;
      }
      case 'homework': {
        const kinds = (i.types as (keyof typeof HOMEWORK_TYPE_NAMES)[]).map((t) => HOMEWORK_TYPE_NAMES[t]).join(', ');
        return `Write a homework assignment of ${i.count} questions (${i.difficulty}) on: ${i.topic}${i.level ? ` for ${i.level}` : ''}. Include: ${kinds}. 2-, 3- and 5-mark questions carry those marks; give each a model answer and a short rubric.${scanned(i)}`;
      }
      case 'boardSummary':
        return `Summarise ${i.topic ? `the lesson on ${i.topic}` : 'this lesson'}${i.level ? ` (${i.level})` : ''} as ${i.format === 'teacher' ? 'a summary for the teacher' : i.format === 'revision' ? 'a revision sheet' : i.format === 'recap' ? 'a short class recap' : 'student notes'}: key concepts, definitions, formulas, examples, important points and questions to check understanding.${scanned(i)}`;
      case 'lecture':
        return `Prepare a ${i.minutes}-minute lecture on: ${i.topic}${i.level ? ` for ${i.level}` : ''}: an outline, the explanation, examples, analogies, what to write on the board, activities and a recap.`;
      case 'selectAsk':
        return `${SELECT_ASK[i.action as keyof typeof SELECT_ASK]}${i.action === 'translate' ? ` into ${LANGUAGE_NAMES[(i.targetLanguage as Language) ?? 'hi']}` : ''}${i.level ? ` (${i.level})` : ''}. The teacher selected on the board:\n\"\"\"\n${i.content}\n\"\"\"`;
      case 'lessonPlan':
        return `Plan a ${i.minutes}-minute lesson on: ${i.topic}. Step minutes must add up to ${i.minutes}.`;
      case 'gradeAssist': {
        const rubric = (i.rubric as { criterion: string; marks: number }[]).map((r, n) => `${n + 1}. ${r.criterion} (${r.marks} marks)`).join('\n');
        return `Suggest marks out of ${i.maxMarks} for a student's answer, strictly by this rubric. Award marks only for what the answer actually says; do not give credit for what it might have meant. You are drafting for an examiner who will decide.\nQuestion: ${i.question}\nRubric:\n${rubric}\nStudent answer:\n"""\n${i.answerText}\n"""`;
      }
      case 'summarize':
        return `Summarise this classroom lesson transcript for students who were absent:\n"""\n${i.transcript}\n"""`;
      case 'financeInsight':
        return insightAsk('Explain fee collection, overdue dues and budget variance for the accounts office', i.facts);
      case 'admissionsInsight':
        return insightAsk('Summarise the admissions funnel and how each campaign converts', i.facts);
      case 'hrInsight':
        return insightAsk('Summarise leave, attendance and payroll for the HR office', i.facts);
      case 'careerCoach':
        return `Answer this student's career question: "${i.question}". Ground the advice in these facts about their skills, interests and the career paths on offer; never invent employers, salaries or openings.\nFacts: ${JSON.stringify(i.facts)}`;
      case 'syllabusImport':
        return `Read this syllabus${i.programName ? ` for ${i.programName}` : ''} and list every subject with its code, semester, credits, units (with hours and topics) and course outcomes. Copy what the document says; leave a value empty or zero when it is not stated.\n"""\n${i.text}\n"""`;
      case 'readBoard':
        return 'Read the handwriting on this classroom whiteboard exactly as written. Do not solve or correct anything.';
    }
  })();
  const shape = task === 'quiz' && JSON.stringify(i.types) !== '["mcq"]' ? QUIZ_TYPE_SHAPE : task === 'homework' ? HOMEWORK_TYPE_SHAPE : SHAPES[task];
  return `${ask}\n\nReturn JSON shaped like: ${shape}`;
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

/**
 * Keeps a marking draft inside the rubric: one line per criterion in rubric order, each between 0 and that criterion's marks
 * (in half marks), and a total that is their sum, never above the question's marks.
 */
export function fitGrade(input: TaskInput<'gradeAssist'>, out: TaskOutput<'gradeAssist'>): TaskOutput<'gradeAssist'> {
  const half = (n: number) => Math.round(n * 2) / 2;
  const criteria = input.rubric.map((r, n) => {
    const got = out.criteria.find((c) => c.criterion.trim().toLowerCase() === r.criterion.trim().toLowerCase()) ?? out.criteria[n];
    return { criterion: r.criterion, awarded: Math.min(r.marks, Math.max(0, half(got?.awarded ?? 0))), comment: got?.comment ?? '' };
  });
  const total = Math.min(input.maxMarks, criteria.reduce((a, c) => a + c.awarded, 0));
  return { criteria, total, rationale: out.rationale };
}

/** Fixes what a model reliably gets slightly wrong: lesson-plan steps always add up to the chosen length. */
export function postProcess<T extends TaskName>(task: T, input: TaskInput<T>, out: TaskOutput<T>): TaskOutput<T> {
  if (task === 'gradeAssist') return fitGrade(input as TaskInput<'gradeAssist'>, out as TaskOutput<'gradeAssist'>) as TaskOutput<T>;
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
          questions: Array.from({ length: i.count }, (_, n) => {
            const type = (i.types as string[])[n % (i.types as string[]).length];
            const base = { type, question: `Preview question ${n + 1} on ${topic}`, explanation: 'Preview only. Real questions need the KINETIX AI server.' };
            if (type === 'trueFalse') return { ...base, options: ['True', 'False'], answer: n % 2 };
            if (type === 'fillBlank' || type === 'shortAnswer') return { ...base, options: [], answerText: 'Preview answer' };
            return { ...base, options: ['First option', 'Second option', 'Third option', 'Fourth option'], answer: n % 4 };
          }),
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
      case 'boardSummary':
        return {
          keyConcepts: [`Preview: the main idea of ${i.topic ?? 'this lesson'}`],
          definitions: [],
          formulas: [],
          examples: [],
          importantPoints: ['Preview only. Connect the KINETIX AI server for a real summary of the board.'],
          questions: [],
        };
      case 'lecture':
        return {
          outline: ['Recall', `Introduce ${topic}`, 'Worked example', 'Practice', 'Recap'],
          explanation: `Preview lecture on ${topic}. Connect the KINETIX AI server for a real one that follows your syllabus.`,
          examples: [],
          analogies: [],
          boardPlan: [`Title: ${topic}`],
          activities: [],
          recap: 'Preview only.',
        };
      case 'financeInsight':
      case 'admissionsInsight':
      case 'hrInsight': {
        const figures = Object.entries(i.facts as Record<string, unknown>)
          .filter(([, v]) => typeof v === 'number')
          .slice(0, 4)
          .map(([k, v]) => `${k}: ${v}`);
        return {
          headline: 'Preview only. Connect the KINETIX AI server for a written summary of these figures.',
          highlights: figures.length ? figures : ['No figures yet'],
          risks: [],
          suggestions: [],
        };
      }
      case 'careerCoach':
        return { answer: 'Preview only. Connect the KINETIX AI server for personal career advice.', suggestions: [], pathways: [] };
      case 'syllabusImport':
        return parseSyllabusText(String(i.text));
      case 'gradeAssist':
        return {
          criteria: (i.rubric as { criterion: string }[]).map((r) => ({ criterion: r.criterion, awarded: 0, comment: 'Preview only: nothing was read.' })),
          total: 0,
          rationale: 'Preview only. Connect the KINETIX AI server to get a marking draft. Mark this answer yourself.',
        };
      case 'selectAsk':
        return { title: `Preview: ${i.action}`, answer: 'Preview only. Connect the KINETIX AI server to act on the selection.', items: [] };
      case 'summarize':
        return {
          summary: `Preview summary. The lesson transcript has ${String(i.transcript).split(/\s+/).length} words; connect the KINETIX AI server for a real summary.`,
          keyPoints: ['Watch the recording to catch up'],
        };
    }
  })();
  return postProcess(task, input, result as TaskOutput<T>);
}
