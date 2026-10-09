// Types and pure helpers for the projects, impact, careers and research-office desks
// (what v1/projects, v1/impact, v1/careers, v1/research and the placements extras send and expect).

// ---- projects ---------------------------------------------------------------------------------

export interface ProjectRow { id: string; code: string; title: string; kind: string; status: string; showcase: boolean; recruiting: boolean }
export interface ShowcaseRow { id: string; title: string; kind: string; pi: string; summary: string; outcomeSummary: string | null; reviewAverage: number | null }
export interface ImpactIndicator { code: string; name: string; unit: string }
export interface ImpactFramework { id: string; code: string; name: string; description: string; active: boolean; indicators: ImpactIndicator[] }
export interface ImpactDashboard { framework: { id: string; code: string; name: string }; indicators: (ImpactIndicator & { total: number; records: number; bySource: Record<string, number> })[] }
export const IMPACT_SOURCES = ['project', 'event', 'internship', 'club_activity', 'other'] as const;

export interface WorkspaceMember { id: string; role: string; name: string }
export interface WorkspaceMilestone { id: string; title: string; dueOn: string; completedOn: string | null }
export interface WorkspaceFile { id: string; title: string; kind: string; url: string | null; contentType: string | null; sizeBytes: number | null; createdAt: string }
export interface WorkspaceHub { showcase: boolean; summary: string; recruiting: boolean; lookingFor: string[]; openings: number }
export interface WorkspaceViva { id: string; scheduledAt: string; venue: string; panel: { userId?: string; name: string }[]; status: string; outcome: string | null; score: number | string | null; remarks: string | null }
export interface Workspace {
  project: { id: string; code: string; title: string; kind: string; status: string; outcomeSummary: string | null; pi: string };
  myRole: string;
  members: WorkspaceMember[];
  milestones: WorkspaceMilestone[];
  files: WorkspaceFile[];
  hub: WorkspaceHub;
  vivas: WorkspaceViva[];
  reviews: { count: number; average: number | null };
}
export interface ProjectComment { id: string; parentId: string | null; body: string; author: string; createdAt: string }
export interface ProjectReview { id: string; kind: string; rubric: Record<string, number>; maxPerCriterion: number; total: number; percent: number; comment: string; reviewer: string; createdAt: string }
export interface JoinRequest { id: string; studentId: string; fullName: string; message: string; status: string; createdAt: string }
export interface TeamMatch { studentId: string; fullName: string; rollNo: string; fit: number; matched: string[] }

/** File types the project and dataset uploads accept (the API refuses anything else). */
export const UPLOAD_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4',
};
/** Largest upload sent inside a JSON body (the API takes 4 MB). */
export const MAX_UPLOAD_BYTES = 4_000_000;

/** The content type to send for a chosen file, or null when the API would not take it. */
export function uploadType(name: string, browserType: string): string | null {
  const known = Object.values(UPLOAD_TYPES);
  if (known.includes(browserType)) return browserType;
  const ext = name.toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1];
  return (ext && UPLOAD_TYPES[ext]) || null;
}

// ---- text formats typed into a box ------------------------------------------------------------

export type ParseError = { ok: false; code: 'empty' | 'line' | 'range' | 'many' | 'dup'; line: number };
export type Parsed<T> = { ok: true; value: T } | ParseError;
const fail = (code: ParseError['code'], line = 0): ParseError => ({ ok: false, code, line });
const lines = (text: string) => text.split(/\r?\n/).map((l, i) => ({ text: l.trim(), n: i + 1 })).filter((l) => l.text);

/** `a, b, c` to a clean list (empty parts dropped, duplicates removed). */
export function splitList(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
}

/**
 * Aptitude questions, one per line: `Question? | option A ; option B ; option C | answer number | topic`.
 * The answer number counts from 1; the topic is optional.
 */
export function parseQuestions(text: string): Parsed<{ prompt: string; options: string[]; answerIndex: number; topic: string }[]> {
  const rows = lines(text);
  if (rows.length === 0) return fail('empty');
  if (rows.length > 100) return fail('many');
  const out: { prompt: string; options: string[]; answerIndex: number; topic: string }[] = [];
  for (const row of rows) {
    const parts = row.text.split('|').map((s) => s.trim());
    if (parts.length < 3 || parts[0].length < 3) return fail('line', row.n);
    const options = parts[1].split(';').map((s) => s.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 6) return fail('line', row.n);
    if (!/^\d+$/.test(parts[2])) return fail('line', row.n);
    const answer = Number(parts[2]);
    if (answer < 1 || answer > options.length) return fail('range', row.n);
    out.push({ prompt: parts[0], options, answerIndex: answer - 1, topic: parts[3] || 'General' });
  }
  return { ok: true, value: out };
}

/** A project rubric, one criterion per line: `Criterion = score`. Scores run from 0 to the maximum per criterion. */
export function parseRubric(text: string, max: number): Parsed<Record<string, number>> {
  const rows = lines(text);
  if (rows.length === 0) return fail('empty');
  if (rows.length > 12) return fail('many');
  const out: Record<string, number> = {};
  for (const row of rows) {
    const m = row.text.match(/^(.+?)\s*[=:]\s*(\d+(?:\.\d+)?)$/);
    if (!m) return fail('line', row.n);
    const score = Number(m[2]);
    if (score < 0 || score > max) return fail('range', row.n);
    const name = m[1].trim().slice(0, 60);
    if (name in out) return fail('dup', row.n);
    out[name] = score;
  }
  return { ok: true, value: out };
}

/** Impact indicators, one per line: `CODE | Name | unit` (the unit is optional). */
export function parseIndicators(text: string): Parsed<{ code: string; name: string; unit: string }[]> {
  const rows = lines(text);
  if (rows.length === 0) return fail('empty');
  if (rows.length > 30) return fail('many');
  const out: { code: string; name: string; unit: string }[] = [];
  for (const row of rows) {
    const parts = row.text.split('|').map((s) => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1] || parts[0].length > 20) return fail('line', row.n);
    const code = parts[0].toUpperCase();
    if (out.some((i) => i.code === code)) return fail('dup', row.n);
    out.push({ code, name: parts[1], unit: parts[2] ?? '' });
  }
  return { ok: true, value: out };
}

/** The same indicators as typed text, for editing. */
export const indicatorsText = (list: ImpactIndicator[]) => list.map((i) => `${i.code} | ${i.name} | ${i.unit}`).join('\n');

/** Career path steps, one per line: `Title | detail` (the detail is optional). */
export function parseSteps(text: string): Parsed<{ title: string; detail: string }[]> {
  const rows = lines(text);
  if (rows.length > 10) return fail('many');
  const out: { title: string; detail: string }[] = [];
  for (const row of rows) {
    const [title, ...rest] = row.text.split('|').map((s) => s.trim());
    if (!title) return fail('line', row.n);
    out.push({ title: title.slice(0, 120), detail: rest.join(' | ').slice(0, 400) });
  }
  return { ok: true, value: out };
}
export const stepsText = (list: { title: string; detail: string }[]) => list.map((s) => (s.detail ? `${s.title} | ${s.detail}` : s.title)).join('\n');

/** Viva panel names, comma or line separated. */
export const parsePanel = (text: string): { name: string }[] => splitList(text).slice(0, 8).map((name) => ({ name: name.slice(0, 120) }));

// ---- careers ----------------------------------------------------------------------------------

export interface ResumeRow { studentId: string; fullName: string; rollNo: string; className: string; headline: string; skills: string[]; updatedAt: string }
export const TEST_CATEGORIES = ['quant', 'logical', 'verbal', 'technical', 'mixed'] as const;
export interface AptitudeTest { id: string; title: string; category: string; durationMin: number; passPercent: number; questionCount: number; driveId: string | null; active: boolean }
export interface TestResults { test: { id: string; title: string; passPercent: number }; attempts: number; passed: number; averagePercent: number; rows: { studentId: string; fullName: string; rollNo: string; percent: number; passed: boolean; submittedAt: string | null }[] }
export interface CareerPath { id: string; title: string; family: string; description: string; requiredSkills: string[]; roles: string[]; steps: { title: string; detail: string }[]; active: boolean }

// ---- research office --------------------------------------------------------------------------

export interface OfficeSummary {
  totals: { projects: number; active: number; sanctionedPaise: number; spentPaise: number; utilisationPercent: number; publications: number; patents: number; datasets: number; ethics_pending: number; scholars: number };
  byDepartment: { department: string; projects: number; publications: number; sanctioned: number }[];
  publicationsByYear: { year: number; n: number }[];
  scholarsByStatus: { status: string; n: number }[];
  thesesByStage: { stage: string; n: number }[];
  supervisorLoad: { fullName: string; load: number; maxScholars: number }[];
}
export interface SupervisorRow { userId: string; fullName: string; maxScholars: number; areas: string[]; load: number; available: number }
export interface ScholarRow { id: string; fullName: string; programme: string; supervisorUserId: string; status: string; thesisTitle: string | null }
export interface ThesisRow { id: string; title: string; stage: string; scholar: string; programme: string; supervisor: string; submittedOn: string | null }
export const THESIS_STAGES = ['synopsis', 'draft', 'submitted', 'examination', 'viva', 'awarded'] as const;
/** The stages a thesis may move to from `from` (one forward; an examiner's or viva panel's "revise" sends it back to draft). */
export function nextThesisStages(from: string): string[] {
  const i = THESIS_STAGES.findIndex((s) => s === from);
  if (i < 0) return [];
  const out: string[] = i + 1 < THESIS_STAGES.length ? [THESIS_STAGES[i + 1]] : [];
  if (from === 'examination' || from === 'viva') out.push('draft');
  return out;
}
export interface ThesisDetail {
  id: string;
  title: string;
  stage: string;
  abstract: string;
  hasText: boolean;
  examiners: { name: string; affiliation: string; verdict?: string }[];
  scholar: { id: string; fullName: string; programme: string; supervisorUserId: string };
  events: { id: string; stage: string; note: string; createdAt: string }[];
  vivas: { id: string; kind: string; scheduledAt: string; venue: string; panel: { name: string; role: string }[]; status: string; outcome: string | null; remarks: string | null }[];
  similarity: { scorePercent: number | string; matches: { thesisId: string; title: string; percent: number }[]; createdAt: string } | null;
  similarityLimitPercent: number;
}
export interface DatasetRow { id: string; title: string; description: string; owner: string; license: string; access: string; embargoUntil: string | null; doi: string | null; keywords: string[]; projectId: string | null; files: { index: number; name: string; sizeBytes: number }[]; canOpen: boolean }

/** Examiners typed one per line: `Name | Affiliation`. */
export function parseExaminers(text: string): Parsed<{ name: string; affiliation: string }[]> {
  const rows = lines(text);
  if (rows.length > 6) return fail('many');
  const out: { name: string; affiliation: string }[] = [];
  for (const row of rows) {
    const [name, affiliation] = row.text.split('|').map((s) => s.trim());
    if (!name) return fail('line', row.n);
    out.push({ name: name.slice(0, 120), affiliation: (affiliation ?? '').slice(0, 160) });
  }
  return { ok: true, value: out };
}
export const examinersText = (list: { name: string; affiliation: string }[]) => list.map((e) => (e.affiliation ? `${e.name} | ${e.affiliation}` : e.name)).join('\n');

// ---- success stories and internships -----------------------------------------------------------

export interface StoryRow { id: string; title: string; body: string; status: string; featured: boolean; reviewNote: string | null; alumnus: string; graduationYear: number; createdAt: string }
export interface AttendanceSummary { workingDays: number; presentDays: number; absentDays: number; hours: number; percent: number; eligible: boolean }
export interface InternshipAttendance { summary: AttendanceSummary; rows: { id: string; onDate: string; present: boolean; hours: number | string; note: string }[] }
export interface InternshipLink { id: string; kind: string; label: string; note: string }
export interface InternshipCertificate { certificateId: string | null; serialNo: string | null; status: string | null }
export interface InternshipRow { id: string; title: string; orgName: string; startsOn: string; endsOn: string; status: string; evaluationScore: number | string | null; fullName: string; rollNo: string; mentorUserId: string | null }
export const INTERNSHIP_MOVES: Record<string, string[]> = { proposed: ['approved', 'cancelled'], approved: ['ongoing', 'cancelled'], ongoing: ['completed', 'cancelled'] };
export const LINK_KINDS = ['skill', 'course', 'course_outcome'] as const;

// ---- skill passport ------------------------------------------------------------------------------

/** Knowledge, skill, attitude and related categories of a student's passport: how many skills sit in each and their average level. */
export interface KsaRow { category: string; skills: number; averageLevel: number | null }
