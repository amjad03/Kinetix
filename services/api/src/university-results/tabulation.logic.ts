/**
 * Tabulation register maths for affiliating-university result formats. Pure functions: internal-mark
 * normalisation and moderation, grace marks, pass rules and class, then the register as a grid in the
 * university's column layout. Every number a university may change is configuration (TemplateConfig).
 */

export interface SubjectMark {
  code: string;
  name: string;
  credits: number;
  internal: number | null;
  maxInternal: number;
  external: number | null;
  maxExternal: number;
  /** Absent in the external paper: fails and cannot be given grace. */
  absent?: boolean;
}

export interface StudentInput {
  rollNo: string;
  name: string;
  subjects: SubjectMark[];
}

export type SubjectCell = 'internal' | 'external' | 'total' | 'result';
export type SummaryCell = 'total' | 'percent' | 'result' | 'class' | 'grace';
export type IdentityCell = 'slNo' | 'regNo' | 'name';

export interface PassRulesConfig {
  minInternalPercent: number | null;
  minExternalPercent: number | null;
  minTotalPercent: number;
}

export interface TemplateConfig {
  title: string;
  subtitle: string;
  /** Wording the university prints at the foot of the register. */
  footnote: string;
  internal: {
    /** Scale internal marks to this maximum (null keeps the source maximum). */
    normaliseTo: number | null;
    moderation: { mode: 'none' | 'cap' | 'bring_to_mean'; capPercent?: number; targetMeanPercent?: number };
  };
  grace: { enabled: boolean; maxPerSubject: number; maxTotal: number; allOrNothing: boolean };
  pass: PassRulesConfig;
  /** Class by overall percentage, highest first; a failed student gets no class. */
  classes: { label: string; minPercent: number }[];
  labels: { pass: string; fail: string; absent: string };
  layout: { identity: IdentityCell[]; subjectCells: SubjectCell[]; summary: SummaryCell[] };
}

export interface SubjectOutcome {
  code: string;
  name: string;
  internal: number | null;
  maxInternal: number;
  external: number | null;
  maxExternal: number;
  grace: number;
  total: number;
  maxTotal: number;
  passed: boolean;
  absent: boolean;
}

export interface RegisterRow {
  slNo: number;
  rollNo: string;
  name: string;
  subjects: SubjectOutcome[];
  total: number;
  maxTotal: number;
  percent: number;
  passed: boolean;
  graceTotal: number;
  classLabel: string;
}

export interface Register {
  subjects: { code: string; name: string }[];
  rows: RegisterRow[];
  summary: { students: number; passed: number; failed: number; passPercent: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const half = (n: number) => Math.floor(n + 0.5);

/** Marks needed in the external paper (given the other components) to meet every minimum; Infinity when internal minimum fails. */
function shortfall(s: Pick<SubjectOutcome, 'internal' | 'maxInternal' | 'external' | 'maxExternal' | 'maxTotal' | 'total'>, pass: PassRulesConfig): number {
  if (pass.minInternalPercent !== null && s.maxInternal > 0 && (s.internal ?? 0) < Math.ceil((pass.minInternalPercent / 100) * s.maxInternal - 1e-9)) return Infinity;
  let need = 0;
  if (pass.minExternalPercent !== null && s.maxExternal > 0) need = Math.max(need, Math.ceil((pass.minExternalPercent / 100) * s.maxExternal - 1e-9) - (s.external ?? 0));
  if (s.maxTotal > 0) need = Math.max(need, Math.ceil((pass.minTotalPercent / 100) * s.maxTotal - 1e-9) - s.total);
  return Math.max(0, need);
}

/** Normalises and moderates internal marks across the batch, subject by subject. */
export function moderateInternals(config: TemplateConfig, students: StudentInput[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const bySubject = new Map<string, { s: StudentInput; m: SubjectMark }[]>();
  for (const s of students) for (const m of s.subjects) (bySubject.get(m.code) ?? bySubject.set(m.code, []).get(m.code)!).push({ s, m });
  for (const [code, list] of bySubject) {
    const norm = config.internal.normaliseTo;
    const values = list.map(({ s, m }) => {
      if (m.internal === null) return { key: `${s.rollNo}|${code}`, v: null as number | null, max: norm ?? m.maxInternal };
      const max = norm ?? m.maxInternal;
      const v = norm !== null && m.maxInternal > 0 ? half((m.internal / m.maxInternal) * norm) : m.internal;
      return { key: `${s.rollNo}|${code}`, v, max };
    });
    const mod = config.internal.moderation;
    if (mod.mode === 'cap' && mod.capPercent !== undefined) for (const x of values) if (x.v !== null) x.v = Math.min(x.v, Math.floor((mod.capPercent / 100) * x.max));
    if (mod.mode === 'bring_to_mean' && mod.targetMeanPercent !== undefined) {
      const present = values.filter((x) => x.v !== null && x.max > 0);
      const mean = present.length ? present.reduce((a, x) => a + (x.v! / x.max) * 100, 0) / present.length : 0;
      if (mean > mod.targetMeanPercent) for (const x of present) x.v = Math.min(x.max, half(x.v! * (mod.targetMeanPercent / mean)));
    }
    for (const x of values) out.set(x.key, x.v);
  }
  return out;
}

export function computeRegister(config: TemplateConfig, students: StudentInput[]): Register {
  const internals = moderateInternals(config, students);
  const subjects = new Map<string, string>();
  const rows: RegisterRow[] = [];
  const sorted = [...students].sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
  sorted.forEach((st, i) => {
    const outs: SubjectOutcome[] = st.subjects.map((m) => {
      subjects.set(m.code, m.name);
      const internal = internals.get(`${st.rollNo}|${m.code}`) ?? null;
      const maxInternal = config.internal.normaliseTo ?? m.maxInternal;
      const external = m.absent ? null : m.external;
      const maxTotal = maxInternal + m.maxExternal;
      const total = (internal ?? 0) + (external ?? 0);
      return { code: m.code, name: m.name, internal, maxInternal, external, maxExternal: m.maxExternal, grace: 0, total, maxTotal, passed: false, absent: !!m.absent };
    });
    const meets = (o: SubjectOutcome) => !o.absent && shortfall(o, config.pass) === 0;
    for (const o of outs) o.passed = meets(o);
    // Grace marks go to the external paper of failed subjects, within the per-subject and total limits.
    if (config.grace.enabled) {
      const failing = outs.filter((o) => !o.passed && !o.absent).map((o) => ({ o, need: shortfall(o, config.pass) })).filter((x) => Number.isFinite(x.need)).sort((a, b) => a.need - b.need);
      const eligible = failing.filter((x) => x.need <= config.grace.maxPerSubject);
      const everyFailureGraceable = outs.filter((o) => !o.passed).length === eligible.length;
      if (!config.grace.allOrNothing || (everyFailureGraceable && eligible.reduce((a, x) => a + x.need, 0) <= config.grace.maxTotal)) {
        let left = config.grace.maxTotal;
        for (const x of eligible) {
          if (x.need > left) continue;
          left -= x.need;
          x.o.grace = x.need;
          x.o.external = (x.o.external ?? 0) + x.need;
          x.o.total += x.need;
          x.o.passed = true;
        }
      }
    }
    const total = outs.reduce((a, o) => a + o.total, 0);
    const maxTotal = outs.reduce((a, o) => a + o.maxTotal, 0);
    const passed = outs.length > 0 && outs.every((o) => o.passed);
    const percent = maxTotal > 0 ? r2((total / maxTotal) * 100) : 0;
    const classLabel = passed ? (config.classes.find((c) => percent >= c.minPercent)?.label ?? '') : '';
    rows.push({ slNo: i + 1, rollNo: st.rollNo, name: st.name, subjects: outs, total, maxTotal, percent, passed, graceTotal: outs.reduce((a, o) => a + o.grace, 0), classLabel });
  });
  const passedCount = rows.filter((r) => r.passed).length;
  return {
    subjects: [...subjects].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code)),
    rows,
    summary: { students: rows.length, passed: passedCount, failed: rows.length - passedCount, passPercent: rows.length ? r2((passedCount / rows.length) * 100) : 0 },
  };
}

const IDENT_LABEL: Record<IdentityCell, string> = { slNo: 'Sl. No.', regNo: 'Register No.', name: 'Name of Candidate' };
const SUBJECT_LABEL: Record<SubjectCell, string> = { internal: 'Internal', external: 'External', total: 'Total', result: 'Result' };
const SUMMARY_LABEL: Record<SummaryCell, string> = { total: 'Grand Total', percent: 'Percentage', result: 'Result', class: 'Class', grace: 'Grace Marks' };

/** The register as rows of cells in the template's column order: heading lines, two header rows, then one row per student. */
export function registerGrid(config: TemplateConfig, label: string, reg: Register): (string | number)[][] {
  const cells = config.layout.subjectCells;
  const grid: (string | number)[][] = [[config.title], [config.subtitle || ''], [label], []];
  const top: (string | number)[] = config.layout.identity.map(() => '');
  const sub: (string | number)[] = config.layout.identity.map((k) => IDENT_LABEL[k]);
  for (const s of reg.subjects) {
    cells.forEach((c, i) => {
      top.push(i === 0 ? `${s.code} ${s.name}` : '');
      sub.push(SUBJECT_LABEL[c]);
    });
  }
  for (const k of config.layout.summary) {
    top.push('');
    sub.push(SUMMARY_LABEL[k]);
  }
  grid.push(top, sub);
  for (const r of reg.rows) {
    const row: (string | number)[] = config.layout.identity.map((k) => (k === 'slNo' ? r.slNo : k === 'regNo' ? r.rollNo : r.name));
    for (const s of reg.subjects) {
      const o = r.subjects.find((x) => x.code === s.code);
      for (const c of cells) {
        if (!o) row.push('');
        else if (c === 'internal') row.push(o.internal ?? '');
        else if (c === 'external') row.push(o.absent ? config.labels.absent : `${o.external ?? ''}${o.grace ? `*` : ''}`.replace(/^$/, ''));
        else if (c === 'total') row.push(o.total);
        else row.push(o.passed ? config.labels.pass : o.absent ? config.labels.absent : config.labels.fail);
      }
    }
    for (const k of config.layout.summary) {
      row.push(k === 'total' ? `${r.total}/${r.maxTotal}` : k === 'percent' ? r.percent : k === 'result' ? (r.passed ? config.labels.pass : config.labels.fail) : k === 'class' ? r.classLabel : r.graceTotal || '');
    }
    grid.push(row);
  }
  grid.push([], [`Appeared ${reg.summary.students}, ${config.labels.pass} ${reg.summary.passed}, ${config.labels.fail} ${reg.summary.failed}, pass percentage ${reg.summary.passPercent}`]);
  if (config.footnote) grid.push([config.footnote]);
  if (reg.rows.some((r) => r.graceTotal)) grid.push(['* Grace marks added to the external mark.']);
  return grid;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const gridToCsv = (grid: (string | number)[][]) => '﻿' + grid.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

// ---- the two sample templates -------------------------------------------------------------

/** Sample layouts written in our own words. Ordinances change: each college confirms the numbers against the university's current rules before use. */
export const SAMPLE_TEMPLATES: { code: string; name: string; university: string; config: TemplateConfig }[] = [
  {
    code: 'kerala-cbcss-sample',
    name: 'Kerala-style semester mark list (sample)',
    university: 'Kerala-style affiliating university',
    config: {
      title: 'Consolidated Mark List - Semester Examination',
      subtitle: 'Credit and semester system: continuous evaluation (20) and end-semester examination (80)',
      footnote: 'Prepared by the college examination cell. Sample layout; confirm against the university ordinance.',
      internal: { normaliseTo: 20, moderation: { mode: 'cap', capPercent: 95 } },
      grace: { enabled: true, maxPerSubject: 3, maxTotal: 6, allOrNothing: true },
      pass: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40 },
      classes: [
        { label: 'First Class with Distinction', minPercent: 75 },
        { label: 'First Class', minPercent: 60 },
        { label: 'Second Class', minPercent: 50 },
        { label: 'Pass', minPercent: 40 },
      ],
      labels: { pass: 'P', fail: 'F', absent: 'AB' },
      layout: { identity: ['slNo', 'regNo', 'name'], subjectCells: ['internal', 'external', 'total'], summary: ['total', 'percent', 'class', 'result'] },
    },
  },
  {
    code: 'vtu-style-sample',
    name: 'VTU / Karnataka-style tabulation register (sample)',
    university: 'Karnataka technological-university style',
    config: {
      title: 'Semester Result Tabulation Register',
      subtitle: 'Continuous internal evaluation (50) and semester end examination (50, scaled from 100)',
      footnote: 'Prepared by the college examination cell. Sample layout; confirm against the university regulations.',
      internal: { normaliseTo: 50, moderation: { mode: 'bring_to_mean', targetMeanPercent: 85 } },
      grace: { enabled: true, maxPerSubject: 5, maxTotal: 10, allOrNothing: false },
      pass: { minInternalPercent: 40, minExternalPercent: 35, minTotalPercent: 40 },
      classes: [
        { label: 'First Class with Distinction', minPercent: 70 },
        { label: 'First Class', minPercent: 60 },
        { label: 'Second Class', minPercent: 50 },
        { label: 'Pass Class', minPercent: 40 },
      ],
      labels: { pass: 'PASS', fail: 'FAIL', absent: 'ABSENT' },
      layout: { identity: ['slNo', 'regNo', 'name'], subjectCells: ['internal', 'external', 'total', 'result'], summary: ['total', 'percent', 'grace', 'class', 'result'] },
    },
  },
];
