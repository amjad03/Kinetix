/**
 * Builds content-library files from the hand-written syllabus sources in content/sources/*.txt
 * (university programmes: Bangalore University UG/PG, KSLU law), and content/sources/REVIEW.md
 * from their review flags.
 *
 *   pnpm --filter @kinetix/api content:build-syllabus
 *
 * Source format, one item per line (blank lines and lines starting with // are ignored):
 *
 *   file: bu-bca                                 output content/bu-bca.json
 *   curriculum: bu-ug | Bangalore University (UG) | ug
 *   programme: BCA                               course titles end ", BCA Semester <n>"
 *   scheme: SEP 2024 | 2024-25                   default scheme and academic year
 *   # <code> | <semester> | <title> [| ucode=…; scheme=NEP 2021; year=2023-24; reviewed=yes]
 *   ! <what faculty should check>               review flag (file-level before the first #)
 *   ## <unit title>                              a chapter
 *   ### <topic title>                            a topic, then its lines:
 *   = summary      - note      > outcome      @lab <id>      @3d <id>
 *   hook: …   ex: … (repeat for more lines)   act: …   q: question || answer   hw: …   terms: a; b
 *
 * Lab and 3D ids are checked against packages/kinetix_labs and packages/kinetix_3d, which also
 * give their titles. No imports outside Node, so it runs with --experimental-strip-types.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCES = new URL('../content/sources/', import.meta.url).pathname;
const REPO = new URL('../../../', import.meta.url).pathname;

interface Resource {
  kind: 'model3d' | 'lab';
  id: string;
  title: string;
}
interface Lesson {
  hook: string;
  example: string;
  activity: string;
  questions: { q: string; a: string }[];
  homework: string;
  terms: string[];
}
interface Topic {
  title: string;
  summary: string;
  notes: string[];
  outcomes: string[];
  resources: Resource[];
  lesson?: Lesson;
}
interface Course {
  curriculum: string;
  code: string;
  title: string;
  term: number;
  language: 'en';
  source: string;
  reviewed: boolean;
  chapters: { title: string; topics: Topic[] }[];
}
export interface Library {
  curricula: { code: string; name: string; level: string }[];
  courses: Course[];
}
export interface Built {
  libraries: Map<string, Library>;
  /** Per source file: programme, scheme and the review flags (file-level and per course). */
  reviews: { file: string; programme: string; curriculum: string; scheme: string; general: string[]; courses: { title: string; flags: string[] }[] }[];
}

/** The ids and English titles of every lab and 3D model the board can open. */
export function catalogues(repo = REPO): { labs: Map<string, string>; models: Map<string, string> } {
  const labsDart = readFileSync(join(repo, 'packages/kinetix_labs/lib/src/content/labs_data.g.dart'), 'utf8');
  const json = /r'''([\s\S]*?)'''/.exec(labsDart)![1];
  const labs = new Map<string, string>((JSON.parse(json) as { labs: { id: string; title: { en: string } }[] }).labs.map((l) => [l.id, l.title.en]));
  const models = new Map<string, string>();
  const data = readFileSync(join(repo, 'packages/kinetix_3d/lib/src/viewer/catalogue_data.dart'), 'utf8');
  for (const m of data.matchAll(/id: '([^']+)',\s*subject: '[^']+',\s*title: LocalText\(\{?'?en'?:? ?'([^']+)'/g)) models.set(m[1], m[2]);
  return { labs, models };
}

export function buildSyllabus(dir = SOURCES, repo = REPO): Built {
  const cat = catalogues(repo);
  const libraries = new Map<string, Library>();
  const reviews: Built['reviews'] = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    const where = (n: number) => `${name}:${n + 1}`;
    let out = '';
    let programme = '';
    let scheme = '';
    let year = '';
    let curriculum = '';
    let course: Course | undefined;
    let topic: Topic | undefined;
    const review: Built['reviews'][number] = { file: name, programme: '', curriculum: '', scheme: '', general: [], courses: [] };
    const lesson = () => (topic!.lesson ??= { hook: '', example: '', activity: '', questions: [], homework: '', terms: [] });
    const lines = readFileSync(join(dir, name), 'utf8').split('\n');
    for (const [n, raw] of lines.entries()) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      const fail = (msg: string): never => {
        throw new Error(`${where(n)}: ${msg}: ${line}`);
      };
      const lib = () => libraries.get(out) ?? fail('no "file:" line yet');
      const kv = /^(file|curriculum|programme|scheme|hook|ex|act|q|hw|terms):\s*(.*)$/.exec(line);
      if (kv) {
        const [, key, value] = kv;
        if (key === 'file') {
          out = value;
          if (!libraries.has(out)) libraries.set(out, { curricula: [], courses: [] });
        } else if (key === 'curriculum') {
          const [code, cname, level] = value.split('|').map((x) => x.trim());
          if (!level) fail('expected code | name | level');
          if (!lib().curricula.some((c) => c.code === code)) lib().curricula.push({ code, name: cname, level });
          curriculum = code;
        } else if (key === 'programme') programme = value;
        else if (key === 'scheme') [scheme, year] = value.split('|').map((x) => x.trim());
        else {
          if (!topic) fail('lesson line outside a topic');
          const l = lesson();
          if (key === 'hook') l.hook = value;
          else if (key === 'ex') l.example = l.example ? `${l.example}\n${value}` : value;
          else if (key === 'act') l.activity = value;
          else if (key === 'hw') l.homework = value;
          else if (key === 'terms') l.terms = value.split(';').map((x) => x.trim()).filter(Boolean);
          else {
            const [q, a] = value.split('||').map((x) => x.trim());
            if (!a) fail('expected question || answer');
            l.questions.push({ q, a });
          }
        }
        continue;
      }
      const head = /^(#{1,3}) (.*)$/.exec(line);
      if (head) {
        const level = head[1].length;
        if (level === 1) {
          const [code, sem, title, extra = ''] = head[2].split('|').map((x) => x.trim());
          const opts = Object.fromEntries(extra.split(';').filter(Boolean).map((p) => p.split('=').map((x) => x.trim())));
          if (!/^[a-z0-9-]+$/.test(code) || !Number.isInteger(+sem) || !title) fail('expected # code | semester | title');
          if (!curriculum || !programme || !scheme) fail('curriculum, programme and scheme come before the first course');
          const sch = opts.scheme ?? scheme;
          const yr = opts.year ?? year;
          course = {
            curriculum,
            code,
            title: `${title}, ${programme} Semester ${+sem}`,
            term: +sem,
            language: 'en',
            source: `kinetix-curriculum-team from public BU syllabus (${sch}, ${yr})${opts.ucode ? `; university code ${opts.ucode}` : ''}`,
            reviewed: opts.reviewed === 'yes',
            chapters: [],
          };
          if (curriculum.startsWith('kslu')) course.source = course.source.replace('public BU syllabus', 'public KSLU syllabus');
          lib().courses.push(course);
          review.courses.push({ title: course.title, flags: [] });
          topic = undefined;
        } else if (level === 2) {
          if (!course) fail('unit outside a course');
          course!.chapters.push({ title: head[2], topics: [] });
          topic = undefined;
        } else {
          const ch = course?.chapters.at(-1) ?? fail('topic outside a unit');
          topic = { title: head[2], summary: '', notes: [], outcomes: [], resources: [] };
          ch.topics.push(topic);
        }
        continue;
      }
      const [mark, rest] = [line[0], line.slice(1).trim()];
      if (mark === '!') {
        if (course) review.courses.at(-1)!.flags.push(rest);
        else review.general.push(rest);
        continue;
      }
      if (!topic) fail('content outside a topic');
      const t = topic!;
      if (mark === '=') t.summary = rest;
      else if (mark === '-') t.notes.push(rest);
      else if (mark === '>') t.outcomes.push(rest);
      else if (mark === '@') {
        const [kind, id] = rest.split(/\s+/);
        const title = (kind === 'lab' ? cat.labs : kind === '3d' ? cat.models : undefined)?.get(id) ?? fail(`unknown ${kind} id`);
        t.resources.push({ kind: kind === 'lab' ? 'lab' : 'model3d', id, title });
      } else fail('unrecognised line');
    }
    review.programme = programme;
    review.curriculum = curriculum;
    review.scheme = `${scheme} (${year})`;
    reviews.push(review);
  }
  return { libraries, reviews };
}

export function reviewMarkdown(b: Built): string {
  const lines = [
    '# Faculty review: university syllabus content',
    '',
    'GENERATED by `scripts/build-syllabus.ts` from the `!` lines in `content/sources/*.txt`; edit those.',
    '',
    'Every course here was written by the KINETIX curriculum team from public syllabi and the team’s',
    'knowledge of them (university websites could not be reached), and is marked `reviewed: false`.',
    'For each course, a subject teacher should check:',
    '',
    '1. the course list and semester placement against the university’s current scheme document;',
    '2. unit titles and order against the syllabus;',
    '3. every note (definitions, formulas, section numbers, rates and limits) for correctness;',
    '4. the items flagged below.',
    '',
    'When a course is checked, add `reviewed=yes` to its `#` line in the source and rebuild.',
    '',
  ];
  for (const r of b.reviews) {
    lines.push(`## ${r.programme} (${r.file}, curriculum \`${r.curriculum}\`, ${r.scheme})`, '');
    for (const g of r.general) lines.push(`- ${g}`);
    if (r.general.length) lines.push('');
    for (const c of r.courses.filter((x) => x.flags.length)) {
      lines.push(`- **${c.title}**`);
      for (const f of c.flags) lines.push(`  - ${f}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The JSON text written for a library (as checked by the content tests). */
export const libraryJson = (lib: Library) => `${JSON.stringify(lib, null, 1)}\n`;

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const built = buildSyllabus();
  const outDir = new URL('../content/', import.meta.url).pathname;
  for (const [file, lib] of built.libraries) {
    writeFileSync(join(outDir, `${file}.json`), libraryJson(lib));
    const topics = lib.courses.flatMap((c) => c.chapters.flatMap((ch) => ch.topics));
    console.log(`${file}.json: ${lib.courses.length} courses, ${topics.length} topics (${topics.filter((t) => t.lesson).length} with a lesson, ${topics.filter((t) => t.resources.length).length} with a lab or 3D model)`);
  }
  writeFileSync(join(SOURCES, 'REVIEW.md'), reviewMarkdown(built));
}
