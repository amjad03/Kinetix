import type { DocData } from '@kinetix/shared';
import { PdfWriter } from '../common/pdf.js';

export interface StudentHeader {
  institution: string;
  name: string;
  rollNo: string;
  className: string;
  program: string;
}

export interface HallTicketData extends StudentHeader {
  sessionName: string;
  ticketNo: string;
  /** Signed link for the QR code; the page it opens shows only name, session and validity. */
  verifyUrl?: string;
  /** The student's profile photo (a JPEG); printed beside the ticket number when present. */
  photo?: Buffer | null;
  papers: { date: string; time: string; subject: string; room: string | null; seat: number | null }[];
}

/** The seating chart of one hall for one sitting: row by row, bench by bench, who sits where. */
export interface SeatingChartData {
  institution: string;
  sessionName: string;
  room: string;
  sitting: string;
  rows: number;
  benchesPerRow: number;
  seatsPerBench: number;
  /** Placed candidates; the chart fills the other seats with "-". */
  seats: { seatNo: number; rollNo: string; name: string; subject: string }[];
}

export function seatingChartPdf(d: SeatingChartData): Buffer {
  const pdf = new PdfWriter();
  pdf.text(d.institution, { size: 16, bold: true, align: 'center' });
  pdf.text(`Seating chart: ${d.room}`, { size: 12, bold: true, align: 'center' });
  pdf.text(`${d.sessionName}  |  ${d.sitting}`, { size: 10, align: 'center' });
  pdf.rule();
  const perRow = d.benchesPerRow * d.seatsPerBench;
  const bySeat = new Map(d.seats.map((s) => [s.seatNo, s]));
  const colW = Math.floor(515 / (d.seatsPerBench + 1));
  const xs = Array.from({ length: d.seatsPerBench + 1 }, (_, i) => i * colW);
  for (let r = 0; r < d.rows; r++) {
    pdf.text(`Row ${r + 1}  (front is row 1)`, { bold: true });
    for (let b = 0; b < d.benchesPerRow; b++) {
      const cells = [`Bench ${b + 1}`];
      for (let k = 0; k < d.seatsPerBench; k++) {
        const s = bySeat.get(r * perRow + b * d.seatsPerBench + k + 1);
        cells.push(s ? `${s.rollNo} ${s.subject}` : '-');
      }
      pdf.row(cells, xs, { size: 8 });
    }
    pdf.gap(2);
  }
  pdf.rule();
  pdf.text(`Seated: ${d.seats.length}    Seats: ${d.rows * perRow}`);
  return pdf.build();
}

export interface ResultData {
  sessionName: string;
  term: number;
  sgpa: number;
  cgpa: number;
  creditsAttempted: number;
  creditsEarned: number;
  outcome: string;
  lines: { code: string; subject: string; credits: number; percent: number; grade: string; gradePoint: number; passed: boolean }[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const long = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const CLASSES = [{ label: 'First Class with Distinction', min: 7.5 }, { label: 'First Class', min: 6 }, { label: 'Second Class', min: 5 }, { label: 'Pass Class', min: 4 }];

/** The class a CGPA (10-point scale) is placed in, read as 10 x CGPA percent. */
export const classification = (cgpa: number, passed: boolean) => (passed ? (CLASSES.find((c) => cgpa >= c.min)?.label ?? '') : 'Not yet complete');

/** `exam` and `marks` blocks of a marks card (document engine data, packages/shared doc-samples.ts). */
export function marksCardData(r: ResultData): DocData {
  const credits = r.lines.reduce((a, l) => a + l.credits, 0);
  const pct = credits ? r.lines.reduce((a, l) => a + l.percent * l.credits, 0) / credits : 0;
  const total = Math.round(r.lines.reduce((a, l) => a + l.percent, 0));
  return {
    exam: { session: r.sessionName, term: String(r.term), semester: `Semester ${r.term}`, monthYear: '', sgpa: r.sgpa.toFixed(2), cgpa: r.cgpa.toFixed(2), creditsAttempted: r.creditsAttempted, creditsEarned: r.creditsEarned, totalMarks: total, maxMarks: r.lines.length * 100, percentage: pct.toFixed(2), result: r.outcome === 'pass' ? 'PASS' : 'NOT PASSED', classification: classification(r.cgpa, r.outcome === 'pass') },
    marks: { rows: r.lines.map((l) => ({ code: l.code, subject: l.subject, credits: l.credits, internal: '—', external: '—', total: Math.round(l.percent), max: 100, percent: l.percent.toFixed(2), grade: l.grade, gradePoint: l.gradePoint.toFixed(2), result: l.passed ? 'Pass' : 'Fail' })) },
  };
}

/** The `transcript` block: every course of every term, term SGPAs and the final CGPA. */
export function transcriptData(results: ResultData[]): DocData {
  const last = results[results.length - 1];
  const passed = results.every((r) => r.outcome === 'pass');
  const earned = results.reduce((a, r) => a + r.creditsEarned, 0);
  const attempted = results.reduce((a, r) => a + r.creditsAttempted, 0);
  return {
    transcript: {
      cgpa: (last?.cgpa ?? 0).toFixed(2), creditsEarned: earned, creditsAttempted: attempted, result: passed ? 'PASSED' : 'IN PROGRESS', classification: classification(last?.cgpa ?? 0, passed), percentage: ((last?.cgpa ?? 0) * 10).toFixed(2), completedOn: last?.sessionName ?? '',
      terms: results.map((r) => ({ label: `Semester ${r.term} (${r.sessionName})`, sgpa: r.sgpa.toFixed(2), creditsEarned: r.creditsEarned, creditsAttempted: r.creditsAttempted, result: r.outcome === 'pass' ? 'Pass' : 'Not passed' })),
      rows: results.flatMap((r) => r.lines.map((l) => ({ term: `Semester ${r.term}`, code: l.code, subject: l.subject, credits: l.credits, grade: l.grade, gradePoint: l.gradePoint.toFixed(2), result: l.passed ? 'Pass' : 'Fail' }))),
    },
  };
}

/** The `exam` and `papers` blocks of a hall ticket. */
export function hallTicketData(d: { sessionName: string; ticketNo: string; papers: { date: string; time: string; subject: string; code?: string; room: string | null; seat: number | null }[] }): DocData {
  return {
    exam: { session: d.sessionName, ticketNo: d.ticketNo, centre: 'As allotted below', reportingTime: '30 minutes before each paper', instructions: 'Bring this hall ticket and your institution ID card to every paper. Mobile phones, smart watches and other electronic devices are not allowed in the examination hall. Candidates will not be admitted more than 30 minutes after the paper starts.' },
    papers: d.papers.map((p) => ({ date: long(p.date), day: DAYS[new Date(`${p.date}T00:00:00Z`).getUTCDay()], time: p.time, code: p.code ?? '', subject: p.subject, room: p.room ?? '—', seat: p.seat === null ? '—' : String(p.seat) })),
  };
}
