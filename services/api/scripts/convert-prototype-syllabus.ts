/**
 * Converts the KINETIX prototype's syllabus (187 books, a lesson for each of their 2,573
 * chapters) into content-library files for `pnpm content:import`.
 *
 *   pnpm content:convert-prototype /path/to/kinetix_old_local
 *
 * Reads what the prototype app reads, which its tools/syllabus/build.py writes:
 * assets/syllabus/index.json (books and chapter titles, from the NCERT/KTBS contents pages),
 * assets/syllabus/lessons/<book>.json (a lesson per chapter, some with a Kannada version),
 * assets/viewer3d/models/index.json (3D model titles) and assets/labs/labs.json (virtual labs and
 * the keywords the prototype matched them by). Writes content/<curriculum>.json, one file per
 * curriculum, replacing what is there.
 *
 * Each chapter becomes one topic: its title is the chapter's, its notes the lesson's key ideas,
 * its outcomes the objectives, and the rest of the lesson goes in `lesson`. The prototype's
 * simulations ("sims") have no counterpart in the board yet and are left out.
 *
 * No imports outside Node, so it runs with --experimental-strip-types and no build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---- the prototype's files ------------------------------------------------------------------

export type OldChapter = string | { title: string; kn?: string };

export interface OldBook {
  id: string;
  board: string;
  grade: number;
  subject: string;
  book: string;
  language: string;
  chapters: OldChapter[];
  ready?: number[];
}

export interface OldLessonText {
  objectives: string[];
  hook: string;
  keyIdeas: string[];
  terms: string[];
  example: string;
  exampleTex?: string;
  activity: string;
  questions: { q: string; a: string }[];
  homework: string;
  models?: string[];
  sims?: string[];
}

export interface OldLesson extends OldLessonText {
  kn?: OldLessonText;
}

type Words = string | Record<string, string>;

export interface OldLab {
  id: string;
  title: Words;
  keywords?: string[];
}

export interface OldModel {
  id: string;
  title: Words;
}

// ---- the library format (services/api/src/content/import.ts) --------------------------------

interface LessonText {
  hook: string;
  example: string;
  exampleTex?: string;
  activity: string;
  questions: { q: string; a: string }[];
  homework: string;
  terms: string[];
}

interface LessonVariant extends Partial<LessonText> {
  title?: string;
  notes?: string[];
  outcomes?: string[];
}

export interface LibTopic {
  title: string;
  summary: string;
  notes: string[];
  outcomes: string[];
  resources: { kind: 'model3d' | 'lab'; id: string; title: string }[];
  lesson: LessonText & { kn?: LessonVariant };
}

export interface LibCourse {
  curriculum: string;
  code: string;
  title: string;
  term: number;
  language: 'en' | 'hi' | 'kn';
  source: string;
  reviewed: false;
  chapters: { title: string; topics: LibTopic[] }[];
}

export interface Library {
  curricula: { code: string; name: string; level: 'k12' }[];
  courses: LibCourse[];
}

export const SOURCE = 'kinetix-curriculum-team (prototype import)';

/** The prototype's boards as library curricula. LKG and UKG are K-12 classes -1 and 0. */
export const CURRICULA: Record<string, { code: string; name: string }> = {
  cbse: { code: 'cbse', name: 'CBSE (NCERT textbooks)' },
  icse: { code: 'icse', name: 'ICSE (CISCE)' },
  karnataka: { code: 'ka-state', name: 'Karnataka State Board (KTBS textbooks)' },
  early: { code: 'early-years', name: 'Early years (LKG, UKG)' },
};

/** Course languages are en, hi and kn; Sanskrit books are written in Devanagari, as Hindi. */
const LANGUAGES: Record<string, LibCourse['language']> = { en: 'en', hi: 'hi', kn: 'kn', sa: 'hi' };

/** How many labs a chapter links at most (the prototype's lesson dock showed three). */
const MAX_LABS = 3;

/**
 * Subjects whose chapters get labs. The prototype matched every chapter, which linked a prism
 * to poems about rainbows and Ohm's law to ocean currents.
 */
const LAB_SUBJECTS = new Set(['Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'EVS', 'Environmental Science']);

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function classLabel(grade: number): string {
  return grade === -1 ? 'LKG' : grade === 0 ? 'UKG' : `Class ${grade}`;
}

function english(w: Words): string {
  return typeof w === 'string' ? w : (w.en ?? Object.values(w)[0] ?? '');
}

/** Text as the prototype's lab matcher cleaned it: lower case, words only (Indic scripts kept). */
function plain(s: string): string {
  return s
    .toLowerCase()
    .replaceAll('’', "'")
    .replace(/[^a-z0-9'ऀ-෿]+/g, ' ')
    .trim();
}

/**
 * The prototype's lab matcher (lib/labs/lab.dart, VirtualLab.matches): each of the lab's English
 * title and keywords found in the text as whole words (or with an s) scores 3 for a phrase and 2
 * for a word. It matched against "<chapter title> <subject>".
 */
export function labScore(lab: OldLab, text: string): number {
  const t = ` ${plain(text)} `;
  let score = 0;
  for (const k of [english(lab.title), ...(lab.keywords ?? [])]) {
    const w = plain(k);
    if (!w) continue;
    if (t.includes(` ${w} `) || t.includes(` ${w}s `)) score += w.includes(' ') ? 3 : 2;
  }
  return score;
}

/** Labs that fit the text, best first (ties keep library order), as the prototype listed them. */
export function matchLabs(labs: OldLab[], text: string, limit = MAX_LABS): OldLab[] {
  return labs
    .map((lab) => ({ lab, score: labScore(lab, text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.lab);
}

function lessonText(l: OldLessonText): LessonText {
  return {
    hook: l.hook ?? '',
    example: l.example ?? '',
    ...(l.exampleTex ? { exampleTex: l.exampleTex } : {}),
    activity: l.activity ?? '',
    questions: l.questions ?? [],
    homework: l.homework ?? '',
    terms: l.terms ?? [],
  };
}

export interface Catalogues {
  models: Map<string, string>;
  labs: OldLab[];
}

export interface Dropped {
  sims: number;
  unknownModels: string[];
}

/** One chapter's lesson as a topic. */
export function lessonTopic(book: OldBook, chapter: OldChapter, lesson: OldLesson, cat: Catalogues, dropped: Dropped): LibTopic {
  const title = typeof chapter === 'string' ? chapter : chapter.title;
  const knTitle = typeof chapter === 'string' ? undefined : chapter.kn;
  const resources: LibTopic['resources'] = [];
  for (const id of lesson.models ?? []) {
    const name = cat.models.get(id);
    if (name) resources.push({ kind: 'model3d', id, title: name });
    else dropped.unknownModels.push(`${book.id}: ${id}`);
  }
  if (LAB_SUBJECTS.has(book.subject)) for (const lab of matchLabs(cat.labs, `${title} ${book.subject}`)) resources.push({ kind: 'lab', id: lab.id, title: english(lab.title) });
  dropped.sims += lesson.sims?.length ?? 0;

  const kn: LessonVariant | undefined = lesson.kn
    ? { ...(knTitle ? { title: knTitle } : {}), notes: lesson.kn.keyIdeas ?? [], outcomes: lesson.kn.objectives ?? [], ...lessonText(lesson.kn) }
    : knTitle
      ? { title: knTitle }
      : undefined;
  return {
    title,
    summary: lesson.keyIdeas?.[0] ?? '',
    notes: lesson.keyIdeas ?? [],
    outcomes: lesson.objectives ?? [],
    resources,
    lesson: { ...lessonText(lesson), ...(kn ? { kn } : {}) },
  };
}

/**
 * Course codes follow the library's 'class-10-science' (and 'lkg-english'); when a class has
 * more than one book for a subject, the book is added: 'class-10-english-first-flight'.
 */
export function courseCode(book: OldBook, shared: boolean): string {
  const base = `${book.grade === -1 ? 'lkg' : book.grade === 0 ? 'ukg' : `class-${book.grade}`}-${slug(book.subject)}`;
  if (!shared) return base;
  const prefix = `${book.board}-${book.grade}-${slug(book.subject)}-`;
  return `${base}-${book.id.startsWith(prefix) ? book.id.slice(prefix.length) : slug(book.book) || book.id}`;
}

/** "Mathematics, Class 10"; the book's name is added when it says more than the subject. */
export function courseTitle(book: OldBook, shared: boolean): string {
  const first = book.subject.split(/[\s(]/)[0].toLowerCase();
  const named = shared || !book.book.toLowerCase().startsWith(first);
  return `${book.subject}${named ? `: ${book.book}` : ''}, ${classLabel(book.grade)}`;
}

export function convertBooks(books: OldBook[], lessons: (bookId: string) => Record<string, OldLesson>, cat: Catalogues, dropped: Dropped): Map<string, Library> {
  const out = new Map<string, Library>();
  const count = new Map<string, number>();
  const key = (b: OldBook) => `${b.board}/${b.grade}/${b.subject}`;
  for (const b of books) count.set(key(b), (count.get(key(b)) ?? 0) + 1);
  for (const b of books) {
    const cur = CURRICULA[b.board];
    if (!cur) throw new Error(`${b.id}: unknown board ${b.board}`);
    const language = LANGUAGES[b.language];
    if (!language) throw new Error(`${b.id}: unknown language ${b.language}`);
    let lib = out.get(cur.code);
    if (!lib) out.set(cur.code, (lib = { curricula: [{ code: cur.code, name: cur.name, level: 'k12' }], courses: [] }));
    const written = b.ready?.length ? lessons(b.id) : {};
    const shared = count.get(key(b))! > 1;
    lib.courses.push({
      curriculum: cur.code,
      code: courseCode(b, shared),
      title: courseTitle(b, shared),
      term: b.grade,
      language,
      source: SOURCE,
      reviewed: false,
      chapters: b.chapters.map((ch, i) => {
        const lesson = written[String(i + 1)];
        return { title: typeof ch === 'string' ? ch : ch.title, topics: lesson ? [lessonTopic(b, ch, lesson, cat, dropped)] : [] };
      }),
    });
  }
  for (const lib of out.values()) {
    const codes = lib.courses.map((c) => c.code);
    const dup = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dup) throw new Error(`Two books map to course ${dup}`);
  }
  return out;
}

/** Reads the prototype's assets and converts them. */
export function convertPrototype(root: string): { libraries: Map<string, Library>; dropped: Dropped } {
  const read = <T>(...p: string[]): T => JSON.parse(readFileSync(join(root, ...p), 'utf8')) as T;
  const index = read<{ books: OldBook[] }>('assets', 'syllabus', 'index.json');
  const models = read<{ models: OldModel[] }>('assets', 'viewer3d', 'models', 'index.json').models;
  const labs = read<{ labs: OldLab[] }>('assets', 'labs', 'labs.json').labs;
  const cat: Catalogues = { models: new Map(models.map((m) => [m.id, english(m.title)])), labs };
  const dropped: Dropped = { sims: 0, unknownModels: [] };
  const libraries = convertBooks(index.books, (id) => read<Record<string, OldLesson>>('assets', 'syllabus', 'lessons', `${id}.json`), cat, dropped);
  return { libraries, dropped };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.env.KINETIX_PROTOTYPE_DIR;
  if (!root) {
    console.error('Usage: pnpm content:convert-prototype /path/to/kinetix_old_local');
    process.exit(2);
  }
  const outDir = new URL('../content/', import.meta.url).pathname;
  const { libraries, dropped } = convertPrototype(root);
  for (const [code, lib] of libraries) {
    writeFileSync(join(outDir, `${code}.json`), `${JSON.stringify(lib, null, 1)}\n`);
    const topics = lib.courses.flatMap((c) => c.chapters.flatMap((ch) => ch.topics));
    const links = (kind: string) => topics.filter((t) => t.resources.some((r) => r.kind === kind)).length;
    console.log(`${code}.json: ${lib.courses.length} courses, ${topics.length} topics (${links('model3d')} with a 3D model, ${links('lab')} with a lab, ${topics.filter((t) => t.lesson.kn?.notes).length} in Kannada too)`);
  }
  console.log(`Left out: ${dropped.sims} simulation links${dropped.unknownModels.length ? `, unknown 3D models ${dropped.unknownModels.join(', ')}` : ''}`);
}
