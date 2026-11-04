/**
 * Pure rules of the placements pass: AICTE internship credits, the NATS stipend share, the round results import, the
 * NAAC 5.2 averages and the resume drafted from the student's record. Kept free of the database so each is tested
 * on its own (placement-pass.logic.spec.ts).
 */

/** AICTE internship policy (2019): one credit for every 45 hours of internship; 14 credits (630 hours) for a B.E./B.Tech. */
export const AICTE_HOURS_PER_CREDIT = 45;

/** Whole credits for the hours worked (a part credit is not given). */
export function aicteCredits(hours: number | null | undefined, hoursPerCredit = AICTE_HOURS_PER_CREDIT): number {
  if (!hours || hours <= 0 || hoursPerCredit <= 0) return 0;
  return Math.floor(hours / hoursPerCredit + 1e-9);
}

/** Where a student stands against the internship credits the programme asks for. */
export function creditStanding(earned: number, required: number): { earned: number; required: number; short: number; met: boolean } {
  const short = Math.max(0, Math.round((required - earned) * 10) / 10);
  return { earned, required, short, met: short === 0 };
}

export type ApprenticeCategory = 'graduate' | 'diploma' | 'vocational';
export interface NatsRates {
  /** Statutory minimum monthly stipend, in rupees, by category (from 1 April 2026: graduate 12,300, diploma 10,900). */
  minGraduate: number;
  minDiploma: number;
  minVocational: number;
  /** Share of the statutory minimum the Government of India pays the apprentice by DBT. */
  govtSharePct: number;
}
export const NATS_DEFAULTS: NatsRates = { minGraduate: 12_300, minDiploma: 10_900, minVocational: 10_900, govtSharePct: 50 };

/** The statutory minimum stipend for the category, in paise. */
export const natsMinimumPaise = (category: ApprenticeCategory, r: NatsRates) => Math.round((category === 'graduate' ? r.minGraduate : category === 'diploma' ? r.minDiploma : r.minVocational) * 100);

/**
 * The Government of India's monthly share, in paise: the share of the statutory minimum (never more than half the
 * stipend actually paid), rounded down to the rupee.
 */
export function natsGovtSharePaise(category: ApprenticeCategory, stipendPaise: number, r: NatsRates): number {
  const share = Math.floor((natsMinimumPaise(category, r) * r.govtSharePct) / 100 / 100) * 100;
  return Math.min(share, Math.floor(stipendPaise / 2 / 100) * 100);
}

/** The first days of every month an apprenticeship runs through, both ends included. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Splits CSV text into rows of cells (RFC 4180 quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export type RoundResult = 'pass' | 'fail' | 'absent';
const RESULT_WORDS: Record<string, RoundResult> = {
  pass: 'pass', passed: 'pass', cleared: 'pass', qualified: 'pass', shortlisted: 'pass', selected: 'pass', yes: 'pass', y: 'pass', p: 'pass',
  fail: 'fail', failed: 'fail', rejected: 'fail', 'not selected': 'fail', 'not shortlisted': 'fail', no: 'fail', n: 'fail', f: 'fail',
  absent: 'absent', ab: 'absent', 'no show': 'absent', 'did not appear': 'absent', a: 'absent',
};

export interface ImportLine {
  line: number;
  rollNo: string;
  result: RoundResult | null;
  note: string;
  error: string | null;
}

/**
 * A recruiter's shortlist or a round's results as CSV: a header row naming the roll number column ("roll", "roll no",
 * "usn", "register no") and, optionally, a result column ("result", "status") and a note column. With no result
 * column every listed student passed (a shortlist). Each line says what it found or what is wrong with it.
 */
export function parseResultsCsv(text: string): { lines: ImportLine[]; error: string | null } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { lines: [], error: 'The file needs a header row and at least one student' };
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' '));
  const find = (names: string[]) => head.findIndex((h) => names.includes(h));
  const roll = find(['roll', 'roll no', 'roll number', 'rollno', 'usn', 'register no', 'register number', 'registration no', 'reg no']);
  if (roll < 0) return { lines: [], error: 'No roll number column: name it "Roll no"' };
  const res = find(['result', 'status', 'outcome', 'decision']);
  const note = find(['note', 'notes', 'remarks', 'comment', 'comments']);
  const seen = new Set<string>();
  const lines = rows.slice(1).map((r, i): ImportLine => {
    const rollNo = (r[roll] ?? '').trim();
    const word = res >= 0 ? (r[res] ?? '').trim().toLowerCase() : 'pass';
    const result = RESULT_WORDS[word] ?? null;
    const line = i + 2;
    const out = { line, rollNo, result, note: note >= 0 ? (r[note] ?? '').trim().slice(0, 300) : '', error: null as string | null };
    if (!rollNo) out.error = 'No roll number';
    else if (!result) out.error = `Unknown result "${(r[res] ?? '').trim()}": use pass, fail or absent`;
    else if (seen.has(rollNo.toLowerCase())) out.error = 'This roll number is listed twice';
    seen.add(rollNo.toLowerCase());
    return out;
  });
  return { lines, error: lines.length ? null : 'No students in the file' };
}

/** One year of the NAAC 5.2 table. */
export interface NaacYear {
  year: number;
  outgoing: number;
  placed: number;
  higherStudies: number;
  qualified: number;
}
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10000) / 100 : 0);

/**
 * NAAC metrics 5.2.1 (placement of outgoing students), 5.2.2 (progression to higher education) and 5.2.3 (students
 * qualifying in state, national or international examinations): each year's percentage of the outgoing batch, and
 * the average of the yearly percentages over the years given (NAAC asks for the last five).
 */
export function naac52(years: NaacYear[]) {
  const rows = years.map((y) => ({ ...y, placedPct: pct(y.placed, y.outgoing), higherStudiesPct: pct(y.higherStudies, y.outgoing), qualifiedPct: pct(y.qualified, y.outgoing) }));
  const avg = (k: 'placedPct' | 'higherStudiesPct' | 'qualifiedPct') => (rows.length ? Math.round((rows.reduce((s, r) => s + r[k], 0) / rows.length) * 100) / 100 : 0);
  return { rows, averages: { m521: avg('placedPct'), m522: avg('higherStudiesPct'), m523: avg('qualifiedPct') } };
}

export interface ResumeSource {
  programme: string;
  institution: string;
  batchYear: number | null;
  cgpa: number | null;
  prior: { level: string; institution: string; board: string | null; passingYear: number | null; percentage: number | null }[];
  internships: { orgName: string; title: string; startsOn: string; endsOn: string; status: string }[];
  apprenticeships: { establishment: string; role: string; startsOn: string; endsOn: string }[];
  projects: { title: string; summary: string }[];
  skills: string[];
  trainings: { title: string; kind: string }[];
}

const LEVEL_NAME: Record<string, string> = { secondary: 'Class 10', puc: 'Class 12 / PUC', ug: 'Undergraduate degree', pg: 'Postgraduate degree', other: 'Diploma' };
const year = (d: string) => d.slice(0, 4);
const span = (a: string, b: string) => (year(a) === year(b) ? year(a) : `${year(a)}–${year(b)}`);

/** A resume drafted from the student's record: education with marks, internships and apprenticeships, projects, skills and training. */
export function draftResume(s: ResumeSource) {
  const education = [
    { institution: s.institution, degree: s.programme, years: s.batchYear ? `Graduating ${s.batchYear}` : '', score: s.cgpa != null ? `CGPA ${s.cgpa.toFixed(2)}` : undefined },
    ...[...s.prior].filter((p) => p.level !== 'primary').sort((a, b) => (b.passingYear ?? 0) - (a.passingYear ?? 0)).map((p) => ({ institution: p.institution, degree: `${LEVEL_NAME[p.level] ?? p.level}${p.board ? ` (${p.board})` : ''}`, years: p.passingYear ? String(p.passingYear) : '', score: p.percentage != null ? `${p.percentage}%` : undefined })),
  ].slice(0, 8);
  const experience = [
    ...s.internships.filter((i) => ['ongoing', 'completed', 'approved'].includes(i.status)).map((i) => ({ org: i.orgName, role: `${i.title} (internship)`, years: span(i.startsOn, i.endsOn) })),
    ...s.apprenticeships.map((a) => ({ org: a.establishment, role: `${a.role} (apprentice)`, years: span(a.startsOn, a.endsOn) })),
  ].slice(0, 10);
  const projects = s.projects.slice(0, 10).map((p) => ({ title: p.title.slice(0, 160), detail: p.summary ? p.summary.slice(0, 600) : undefined }));
  const skills = [...new Set([...s.skills, ...s.trainings.filter((t) => t.kind === 'technical').map((t) => t.title)])].map((x) => x.slice(0, 40)).slice(0, 40);
  const headline = `${s.programme} student${s.batchYear ? `, class of ${s.batchYear}` : ''}`;
  return { headline, education, experience, projects, skills };
}
