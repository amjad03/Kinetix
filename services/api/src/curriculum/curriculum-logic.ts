import { z } from 'zod';

/** The syllabus structure shared by versions, the AI proposal and the diff: subjects with units, topics and course outcomes. */
export const ContentSchema = z.object({
  subjects: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1).max(200),
        term: z.number().int().min(1).max(20).default(1),
        credits: z.number().min(0).max(40).default(0),
        hours: z.number().int().min(0).max(1000).default(0),
        units: z
          .array(z.object({ title: z.string().trim().min(1).max(300), hours: z.number().int().min(0).max(200).default(0), topics: z.array(z.string().trim().min(1).max(300)).max(60).default([]) }))
          .max(20)
          .default([]),
        cos: z.array(z.object({ code: z.string().trim().min(1).max(20), statement: z.string().trim().min(1).max(600), bloomLevel: z.string().trim().max(40).nullish() })).max(12).default([]),
      }),
    )
    .max(120),
});
export type CurriculumContent = z.infer<typeof ContentSchema>;

export interface ProposalFlag {
  /** "Subject CODE" or "Proposal". */
  where: string;
  code: 'duplicate_code' | 'credits_missing' | 'credits_unusual' | 'no_units' | 'unit_without_topics' | 'hours_mismatch' | 'no_outcomes';
  message: string;
}

/** Things in an imported syllabus that a person should look at before it becomes a draft: the importer is guessing, so it says where. */
export function proposalFlags(c: CurriculumContent): ProposalFlag[] {
  const flags: ProposalFlag[] = [];
  const seen = new Map<string, number>();
  for (const s of c.subjects) seen.set(s.code.toLowerCase(), (seen.get(s.code.toLowerCase()) ?? 0) + 1);
  for (const s of c.subjects) {
    const where = `Subject ${s.code}`;
    if ((seen.get(s.code.toLowerCase()) ?? 0) > 1) flags.push({ where, code: 'duplicate_code', message: 'The code appears more than once' });
    if (!s.credits) flags.push({ where, code: 'credits_missing', message: 'No credits were found' });
    else if (s.credits > 10 || Math.round(s.credits * 2) / 2 !== s.credits) flags.push({ where, code: 'credits_unusual', message: `${s.credits} credits looks unusual` });
    if (s.units.length === 0) flags.push({ where, code: 'no_units', message: 'No units were found' });
    for (const u of s.units) if (u.topics.length === 0) flags.push({ where, code: 'unit_without_topics', message: `Unit "${u.title}" has no topics` });
    const unitHours = s.units.reduce((n, u) => n + u.hours, 0);
    if (s.hours > 0 && unitHours > 0 && unitHours !== s.hours) flags.push({ where, code: 'hours_mismatch', message: `Units add up to ${unitHours} hours but the subject says ${s.hours}` });
    if (s.cos.length === 0) flags.push({ where, code: 'no_outcomes', message: 'No course outcomes were found' });
  }
  return flags;
}
type Subject = CurriculumContent['subjects'][number];

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const toNumber = (s: string) => (/^\d+$/.test(s) ? Number(s) : (ROMAN[s.toLowerCase()] ?? 1));

const SUBJECT_LINE = /^(?:course\s*(?:code|title)?\s*[:\-]\s*)?([A-Z]{2,8}[-\s]?\d{1,4}(?:\.\d+)?[A-Z]?)\s*[:\-–—]\s*(.{3,160})$/;
const SEMESTER_LINE = /^(?:semester|sem)\s*[-:]?\s*(\d{1,2}|[ivx]{1,4})\b/i;
const UNIT_LINE = /^unit\s*[-:]?\s*(\d{1,2}|[ivx]{1,4})\s*[:\-–—.]?\s*(.*)$/i;
const CO_LINE = /^CO\s*[-]?\s*(\d{1,2})\s*[:\-–—.)]\s*(.+)$/i;
const CREDITS = /(\d+(?:\.\d)?)\s*credits?\b|credits?\s*[:=\-]\s*(\d+(?:\.\d)?)/i;
const HOURS = /\(?\s*(\d{1,3})\s*(?:hours?|hrs?)\s*\)?/i;

/**
 * A rule-based reading of syllabus text: semester headings, "CODE: Title" lines, "Unit N: Title"
 * lines with their topics, and "CO1: ..." outcomes. It is the offline preview for the AI task and
 * is deliberately conservative; the reviewer fixes anything it misses.
 */
export function parseSyllabusText(text: string): CurriculumContent {
  const subjects: Subject[] = [];
  let term = 1;
  let subject: Subject | undefined;
  let unit: Subject['units'][number] | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const sem = SEMESTER_LINE.exec(line);
    if (sem && line.length < 60) {
      term = toNumber(sem[1]);
      subject = undefined;
      unit = undefined;
      continue;
    }
    const co = CO_LINE.exec(line);
    if (co && subject) {
      subject.cos.push({ code: `CO${co[1]}`, statement: co[2].trim().slice(0, 600), bloomLevel: null });
      continue;
    }
    const un = UNIT_LINE.exec(line);
    if (un && subject) {
      const hours = HOURS.exec(un[2]);
      unit = { title: (un[2].replace(HOURS, '').replace(/[:\-–—\s]+$/, '').trim() || `Unit ${toNumber(un[1])}`).slice(0, 300), hours: hours ? Number(hours[1]) : 0, topics: [] };
      if (subject.units.length < 20) subject.units.push(unit);
      continue;
    }
    const sub = SUBJECT_LINE.exec(line);
    if (sub && !/^unit/i.test(line)) {
      const credits = CREDITS.exec(sub[2]);
      subject = { code: sub[1].replace(/\s+/g, '-').toUpperCase(), name: sub[2].replace(CREDITS, '').replace(/[()\s,-]+$/g, '').replace(/\(\s*\)/g, '').trim().slice(0, 200), term, credits: credits ? Number(credits[1] ?? credits[2]) : 0, hours: 0, units: [], cos: [] };
      if (subjects.length < 120) subjects.push(subject);
      unit = undefined;
      continue;
    }
    if (subject) {
      const cr = CREDITS.exec(line);
      if (cr && line.length < 40 && !subject.credits) {
        subject.credits = Number(cr[1] ?? cr[2]);
        continue;
      }
      if (unit) {
        for (const t of line.split(/[;•·]|\s-\s|(?<=\w),\s+(?=[A-Z])/)) {
          const topic = t.replace(/^[\s\-–•·\d.)]+/, '').trim();
          if (topic.length > 1 && unit.topics.length < 60) unit.topics.push(topic.slice(0, 300));
        }
      }
    }
  }
  for (const s of subjects) s.hours = s.units.reduce((n, u) => n + u.hours, 0);
  return { subjects };
}

export interface SubjectChange {
  code: string;
  name: string;
  /** Plain-English lines such as "Credits 3 to 4" or "Unit 2 'Cost Sheet' added". */
  changes: string[];
}

export interface CurriculumDiff {
  added: { code: string; name: string; term: number; credits: number }[];
  removed: { code: string; name: string; term: number; credits: number }[];
  changed: SubjectChange[];
  unchanged: number;
}

const brief = (s: Subject) => ({ code: s.code, name: s.name, term: s.term, credits: s.credits });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What changed between two versions' content, subject by subject (matched on code). */
export function diffContent(from: CurriculumContent, to: CurriculumContent): CurriculumDiff {
  const before = new Map(from.subjects.map((s) => [s.code, s]));
  const after = new Map(to.subjects.map((s) => [s.code, s]));
  const diff: CurriculumDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  for (const [code, s] of after) if (!before.has(code)) diff.added.push(brief(s));
  for (const [code, s] of before) if (!after.has(code)) diff.removed.push(brief(s));
  for (const [code, a] of before) {
    const b = after.get(code);
    if (!b) continue;
    const changes: string[] = [];
    if (a.name !== b.name) changes.push(`Name "${a.name}" to "${b.name}"`);
    if (a.term !== b.term) changes.push(`Semester ${a.term} to ${b.term}`);
    if (a.credits !== b.credits) changes.push(`Credits ${a.credits} to ${b.credits}`);
    if (a.hours !== b.hours) changes.push(`Hours ${a.hours} to ${b.hours}`);
    const au = new Map(a.units.map((u) => [u.title.toLowerCase(), u]));
    const bu = new Map(b.units.map((u) => [u.title.toLowerCase(), u]));
    for (const [k, u] of bu) if (!au.has(k)) changes.push(`Unit "${u.title}" added`);
    for (const [k, u] of au) {
      const n = bu.get(k);
      if (!n) changes.push(`Unit "${u.title}" removed`);
      else if (!same(u.topics, n.topics)) {
        const add = n.topics.filter((t) => !u.topics.includes(t)).length;
        const drop = u.topics.filter((t) => !n.topics.includes(t)).length;
        changes.push(`Unit "${u.title}" topics changed (${add} added, ${drop} removed)`);
      } else if (u.hours !== n.hours) changes.push(`Unit "${u.title}" hours ${u.hours} to ${n.hours}`);
    }
    const ac = new Map(a.cos.map((c) => [c.code, c]));
    const bc = new Map(b.cos.map((c) => [c.code, c]));
    for (const [k, c] of bc) {
      if (!ac.has(k)) changes.push(`${k} added`);
      else if (ac.get(k)!.statement !== c.statement) changes.push(`${k} reworded`);
    }
    for (const k of ac.keys()) if (!bc.has(k)) changes.push(`${k} removed`);
    if (changes.length) diff.changed.push({ code, name: b.name, changes });
    else diff.unchanged += 1;
  }
  return diff;
}
