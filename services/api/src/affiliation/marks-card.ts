/**
 * The marks-card data contract: everything the university's or board's marks card (grade card) shows for one
 * student and one examination, laid out by the profile. The documents module renders it; nothing here draws.
 *
 * Marks are on the subject's own scale: component weights add up to 100, so internal marks are the weighted
 * internal components out of their total weight, external likewise, and the total is the subject percentage.
 */
import { round } from '../exams/grading.js';
import { classify, examPassed, percentEquivalent } from './maths.js';
import type { MarksCardField, ProfileRules, SubjectColumn, SummaryField } from './rules.js';

export interface MarksCardInput {
  profile: { code: string; name: string; shortName: string; scheme: string; schemeName: string; version: number };
  rules: ProfileRules;
  institution: { name: string; code: string | null; affiliationNo: string | null };
  student: { name: string; registerNo: string; programme: string; branch: string | null; className: string; parentName: string | null; medium: string | null };
  exam: { name: string; term: number; endsOn: string; kind: string };
  lines: {
    code: string;
    title: string;
    credits: number;
    percent: number;
    grade: string;
    gradePoint: number;
    passed: boolean;
    grace: number;
    absent: boolean;
    components: { kind: string; weight: number; weighted: number }[];
  }[];
  sgpa: number;
  cgpa: number;
  creditsRegistered: number;
  creditsEarned: number;
  creditPoints: number;
  /** False when the student needed more than one attempt in any subject so far. */
  firstAttempt: boolean;
  serialNo: string | null;
  issuedOn: string;
}

export interface MarksCardSubject {
  code: string;
  title: string;
  credits: number;
  internal: number | null;
  internalMax: number;
  external: number | null;
  externalMax: number;
  total: number;
  totalMax: number;
  grace: number;
  grade: string;
  gradePoint: number | null;
  creditPoints: number | null;
  result: 'pass' | 'fail' | 'absent';
}

export interface MarksCardData {
  title: string;
  profile: MarksCardInput['profile'];
  /** Which header fields the card prints, in order, with their values. */
  header: { field: MarksCardField; label: string; value: string | null }[];
  columns: { key: SubjectColumn; label: string }[];
  subjects: MarksCardSubject[];
  summary: { field: SummaryField; label: string; value: string | number | null }[];
  /** Grade legend for the back of the card. */
  legend: { grade: string; minPercent: number; gradePoint: number | null }[];
  footnotes: string[];
  result: { passed: boolean; classAwarded: string | null; percent: number; percentEquivalent: number | null; reasons: string[] };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "November 2026" from the exam's last day, as cards print the examination. */
export const examMonthYear = (isoDate: string) => `${MONTHS[Number(isoDate.slice(5, 7)) - 1]} ${isoDate.slice(0, 4)}`;

export function buildMarksCard(i: MarksCardInput): MarksCardData {
  const r = i.rules;
  const t = r.terminology;
  const gpaOn = r.gpa.enabled && r.grading.mode !== 'marks';
  const subjects: MarksCardSubject[] = i.lines.map((l) => {
    const ext = l.components.filter((c) => c.kind === 'external');
    const int = l.components.filter((c) => c.kind !== 'external');
    const sum = (cs: typeof ext, k: 'weight' | 'weighted') => round(cs.reduce((s, c) => s + c[k], 0), 2);
    return {
      code: l.code,
      title: l.title,
      credits: l.credits,
      internal: int.length ? sum(int, 'weighted') : null,
      internalMax: sum(int, 'weight'),
      external: ext.length ? (l.absent ? null : round(sum(ext, 'weighted') + l.grace, 2)) : null,
      externalMax: sum(ext, 'weight'),
      total: l.percent,
      totalMax: 100,
      grace: l.grace,
      grade: l.absent ? r.grading.absentGrade : l.grade,
      gradePoint: gpaOn ? l.gradePoint : null,
      creditPoints: gpaOn ? round(l.credits * (l.passed ? l.gradePoint : 0), 2) : null,
      result: l.absent ? 'absent' : l.passed ? 'pass' : 'fail',
    };
  });
  const exam = examPassed(r, i.lines);
  const marksPercent = exam.aggregate;
  const cgpa = gpaOn ? i.cgpa : null;
  const classAwarded = classify(r, { passed: exam.passed, cgpa, percent: marksPercent, firstAttempt: i.firstAttempt });
  const equivalent = percentEquivalent(r, { cgpa, marksPercent });

  const headerValue: Record<MarksCardField, string | null> = {
    universityName: i.profile.name,
    institutionName: i.institution.name,
    institutionCode: i.institution.code,
    programme: i.student.programme,
    branch: i.student.branch,
    scheme: i.profile.schemeName,
    term: `${t.termLabel} ${i.exam.term}`,
    examMonthYear: examMonthYear(i.exam.endsOn),
    studentName: i.student.name,
    registerNo: i.student.registerNo,
    parentName: i.student.parentName,
    photo: null,
    medium: i.student.medium,
    serialNo: i.serialNo,
    issuedOn: i.issuedOn,
  };
  const headerLabel: Record<MarksCardField, string> = {
    universityName: i.profile.code.startsWith('kseab') || i.profile.code === 'karnataka-puc' || i.profile.code === 'cbse' || i.profile.code === 'cisce' ? 'Board' : 'University',
    institutionName: 'College / School',
    institutionCode: 'College code',
    programme: 'Programme',
    branch: 'Branch',
    scheme: 'Scheme',
    term: t.termLabel,
    examMonthYear: 'Examination',
    studentName: 'Name of the candidate',
    registerNo: t.registerNo,
    parentName: "Father's / Mother's name",
    photo: 'Photo',
    medium: 'Medium',
    serialNo: 'Serial No.',
    issuedOn: 'Date of issue',
  };
  const columnLabel: Record<SubjectColumn, string> = {
    code: 'Code',
    title: 'Subject',
    credits: 'Credits',
    internal: t.internalShort,
    external: t.externalShort,
    total: 'Total',
    grace: 'Grace',
    grade: 'Grade',
    gradePoint: 'Grade point',
    creditPoints: 'Credit points',
    result: 'Result',
  };
  const totalMarks = round(subjects.reduce((s, x) => s + x.total, 0), 2);
  const summaryValue: Record<SummaryField, string | number | null> = {
    totalMarks: `${totalMarks} / ${subjects.length * 100}`,
    percent: marksPercent,
    sgpa: gpaOn ? i.sgpa : null,
    cgpa,
    creditsRegistered: i.creditsRegistered,
    creditsEarned: i.creditsEarned,
    creditPoints: gpaOn ? i.creditPoints : null,
    result: exam.passed ? 'Pass' : subjects.some((s) => s.result === 'absent') && subjects.every((s) => s.result !== 'fail') ? 'Absent' : 'Fail',
    class: classAwarded,
    percentEquivalent: equivalent,
  };
  const summaryLabel: Record<SummaryField, string> = {
    totalMarks: 'Total marks',
    percent: 'Percentage',
    sgpa: t.sgpa,
    cgpa: t.cgpa,
    creditsRegistered: 'Credits registered',
    creditsEarned: 'Credits earned',
    creditPoints: 'Credit points',
    result: 'Result',
    class: 'Class',
    percentEquivalent: 'Percentage equivalent',
  };
  return {
    title: r.marksCard.title,
    profile: i.profile,
    header: r.marksCard.fields.map((f) => ({ field: f, label: headerLabel[f], value: headerValue[f] })),
    columns: r.marksCard.subjectColumns.filter((c) => gpaOn || (c !== 'gradePoint' && c !== 'creditPoints')).map((c) => ({ key: c, label: columnLabel[c] })),
    subjects,
    summary: r.marksCard.summary.filter((f) => gpaOn || !['sgpa', 'cgpa', 'creditPoints'].includes(f)).map((f) => ({ field: f, label: summaryLabel[f], value: summaryValue[f] })),
    legend: [...r.grading.bands].sort((a, b) => b.minPercent - a.minPercent).map((b) => ({ grade: b.grade, minPercent: b.minPercent, gradePoint: gpaOn ? b.gradePoint : null })),
    footnotes: r.marksCard.footnotes,
    result: { passed: exam.passed, classAwarded, percent: marksPercent, percentEquivalent: equivalent, reasons: exam.reasons },
  };
}
