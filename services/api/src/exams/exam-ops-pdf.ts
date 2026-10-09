import { PdfWriter } from '../common/pdf.js';
import type { StudentHeader } from './documents.js';

export interface ProgressSession {
  name: string;
  sgpa: number;
  cgpa: number;
  outcome: string;
  percent: number | null;
  className: string;
  lines: { subject: string; percent: number; grade: string; passed: boolean }[];
}

/** A student's progress across published sessions: each session's result and subject-wise marks. */
export function progressReportPdf(h: StudentHeader, sessions: ProgressSession[]): Buffer {
  const pdf = new PdfWriter();
  pdf.text(h.institution, { size: 16, bold: true, align: 'center' });
  pdf.text('PROGRESS REPORT', { size: 12, bold: true, align: 'center' });
  pdf.rule();
  pdf.text(`Name: ${h.name}`, { bold: true });
  pdf.text(`Roll no: ${h.rollNo}      Class: ${h.className}      Programme: ${h.program}`);
  pdf.gap(4);
  pdf.rule();
  if (sessions.length === 0) pdf.text('No results have been published yet.');
  for (const s of sessions) {
    pdf.gap(4);
    pdf.text(`${s.name}   |   SGPA ${s.sgpa.toFixed(2)}   CGPA ${s.cgpa.toFixed(2)}   ${s.outcome === 'pass' ? 'Pass' : 'Fail'}   ${s.className}`, { bold: true });
    const xs = [0, 300, 380, 450];
    pdf.row(['Subject', 'Percent', 'Grade', 'Result'], xs, { bold: true });
    for (const l of s.lines) pdf.row([l.subject, l.percent.toFixed(1), l.grade, l.passed ? 'Pass' : 'Fail'], xs);
  }
  pdf.gap(24);
  pdf.text('Controller of Examinations', { align: 'right' });
  return pdf.build();
}

export interface RankRow {
  rank: number | null;
  rollNo: string;
  name: string;
  section: string;
  sgpa: number;
  percent: number | null;
  className: string;
}

/** The consolidated result sheet of a session: every candidate with rank, SGPA and class. */
export function rankListPdf(institution: string, session: string, rows: RankRow[]): Buffer {
  const pdf = new PdfWriter();
  pdf.text(institution, { size: 16, bold: true, align: 'center' });
  pdf.text(`Consolidated result and rank list: ${session}`, { size: 12, bold: true, align: 'center' });
  pdf.rule();
  const xs = [0, 34, 86, 226, 330, 372, 410];
  pdf.row(['Rank', 'Roll no', 'Name', 'Section', 'SGPA', '%', 'Class'], xs, { bold: true });
  pdf.rule();
  for (const r of rows) pdf.row([r.rank === null ? '-' : String(r.rank), r.rollNo, r.name, r.section, r.sgpa.toFixed(2), r.percent === null ? '-' : r.percent.toFixed(1), r.className], xs);
  pdf.gap(20);
  pdf.text('Controller of Examinations', { align: 'right' });
  return pdf.build();
}
