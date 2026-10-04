import { z } from 'zod';
/**
 * The AI task catalogue. Apps ask for a task with structured input; they never send a raw
 * prompt. Each task owns its prompt template (versioned), the JSON shape the model must
 * return, and an offline preview used when no model server is configured.
 */
export const Language = z.enum(['en', 'hi', 'kn']);
const LANGUAGE_NAMES = { en: 'English', hi: 'Hindi', kn: 'Kannada' };
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
};
const Text = (max) => z.string().trim().min(1).max(max);
export const TaskOutputs = {
    explain: z.object({
        answer: Text(6000),
        keyPoints: z.array(Text(400)).max(8).default([]),
        followUps: z.array(Text(300)).max(5).default([]),
    }),
    quiz: z.object({
        questions: z
            .array(z
            .object({
            question: Text(600),
            options: z.array(Text(300)).length(4),
            answer: z.number().int().min(0).max(3),
            explanation: Text(800),
        })
            .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === 4, 'The four options must differ'))
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
};
/** Bump when a template changes; it is logged with every output and part of the cache key. */
export const PROMPT_VERSION = 'v1';
function systemPrompt(g, language) {
    const audience = g.institutionKind === 'school'
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
    if (g.notes?.length)
        lines.push('Base the answer on these syllabus notes:', ...g.notes.map((n) => `- ${n}`));
    return lines.filter(Boolean).join('\n');
}
const SHAPES = {
    explain: '{"answer": string (clear explanation, short paragraphs), "keyPoints": string[] (3-5), "followUps": string[] (2-3 questions a student might ask next)}',
    quiz: '{"questions": [{"question": string, "options": [4 distinct strings], "answer": index 0-3 of the correct option, "explanation": string}]}',
    homework: '{"title": string, "instructions": string, "questions": [{"question": string, "marks": integer}]}',
    lessonPlan: '{"objectives": string[], "steps": [{"minutes": integer, "activity": string}], "materials": string[], "assessment": string}',
    summarize: '{"summary": string (one paragraph for a student who missed class), "keyPoints": string[]}',
};
function userPrompt(task, input) {
    const i = input;
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
        }
    })();
    return `${ask}\n\nReturn JSON shaped like: ${SHAPES[task]}`;
}
export function buildMessages(task, input, g) {
    const language = input.language;
    return [
        { role: 'system', content: systemPrompt(g, language) },
        { role: 'user', content: userPrompt(task, input) },
    ];
}
/** Rejects outputs that are well-formed JSON but wrong for the request. */
export function checkOutput(task, input, out) {
    if (task === 'lessonPlan') {
        const total = out.steps.reduce((s, x) => s + x.minutes, 0);
        const want = input.minutes;
        if (Math.abs(total - want) > 5)
            return `The step minutes add up to ${total}, not ${want}.`;
    }
    return null;
}
/**
 * Offline preview: a fixed, clearly labelled response with the right shape. Used in
 * development and tests, and on installs that have not connected an AI server yet.
 * It never pretends to know the subject.
 */
export function previewOutput(task, input) {
    const i = input;
    const topic = i.topic ?? i.question ?? 'this lesson';
    const result = (() => {
        switch (task) {
            case 'explain':
                return {
                    answer: `Preview answer about "${topic}". Connect the KINETIX AI server to get a real explanation that follows your syllabus.`,
                    keyPoints: ['Start from what the class already knows', 'Define the key terms', 'Work through one example together'],
                    followUps: [`Where is ${topic} used in real life?`, 'Can you show another example?'],
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
                const m = i.minutes;
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
            case 'summarize':
                return {
                    summary: `Preview summary. The lesson transcript has ${String(i.transcript).split(/\s+/).length} words; connect the KINETIX AI server for a real summary.`,
                    keyPoints: ['Watch the recording to catch up'],
                };
        }
    })();
    return result;
}
//# sourceMappingURL=tasks.js.map