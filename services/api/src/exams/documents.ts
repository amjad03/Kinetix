import { PdfWriter } from '../common/pdf.js';

export interface StudentHeader {
  institution: string;
  name: string;
  rollNo: string;
  className: string;
  program: string;
}

const header = (pdf: PdfWriter, h: StudentHeader, title: string, sub?: string) => {
  pdf.text(h.institution, { size: 16, bold: true, align: 'center' });
  pdf.text(title, { size: 12, bold: true, align: 'center' });
  if (sub) pdf.text(sub, { size: 10, align: 'center' });
  pdf.rule();
  pdf.text(`Name: ${h.name}`, { bold: true });
  pdf.text(`Roll no: ${h.rollNo}      Class: ${h.className}      Programme: ${h.program}`);
  pdf.gap(4);
  pdf.rule();
};

export interface HallTicketData extends StudentHeader {
  sessionName: string;
  ticketNo: string;
  /** Signed link for the QR code; the page it opens shows only name, session and validity. */
  verifyUrl?: string;
  papers: { date: string; time: string; subject: string; room: string | null; seat: number | null }[];
}

export function hallTicketPdf(d: HallTicketData): Buffer {
  const pdf = new PdfWriter();
  header(pdf, d, 'HALL TICKET', d.sessionName);
  pdf.text(`Hall ticket no: ${d.ticketNo}`, { bold: true });
  pdf.gap();
  const xs = [0, 80, 150, 380, 460];
  pdf.row(['Date', 'Time', 'Subject', 'Hall', 'Seat'], xs, { bold: true });
  pdf.rule();
  for (const p of d.papers) pdf.row([p.date, p.time, p.subject, p.room ?? '-', p.seat === null ? '-' : String(p.seat)], xs);
  pdf.gap(20);
  pdf.paragraph('Bring this hall ticket and your institution ID card to every paper. Mobile phones and smart watches are not allowed in the examination hall.', { size: 9 });
  if (d.verifyUrl) {
    pdf.gap(8);
    pdf.qr(d.verifyUrl, 80);
    pdf.text('Scan the code to check that this hall ticket is genuine.', { size: 9, stay: true });
    pdf.gap(88);
  } else pdf.gap(24);
  pdf.text('Controller of Examinations', { align: 'right' });
  return pdf.build();
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

const lineRows = (pdf: PdfWriter, r: ResultData) => {
  const xs = [0, 70, 270, 320, 370, 420, 470];
  pdf.row(['Code', 'Subject', 'Credits', 'Marks %', 'Grade', 'Points', 'Result'], xs, { bold: true });
  pdf.rule();
  for (const l of r.lines) pdf.row([l.code, l.subject, String(l.credits), l.percent.toFixed(2), l.grade, l.gradePoint.toFixed(2), l.passed ? 'Pass' : 'Fail'], xs);
  pdf.rule();
};

export function marksCardPdf(h: StudentHeader, r: ResultData): Buffer {
  const pdf = new PdfWriter();
  header(pdf, h, 'STATEMENT OF MARKS / GRADE CARD', `${r.sessionName} - Semester ${r.term}`);
  lineRows(pdf, r);
  pdf.text(`Credits attempted: ${r.creditsAttempted}    Credits earned: ${r.creditsEarned}`);
  pdf.text(`SGPA: ${r.sgpa.toFixed(2)}    CGPA: ${r.cgpa.toFixed(2)}    Result: ${r.outcome === 'pass' ? 'PASS' : 'NOT PASSED'}`, { bold: true });
  pdf.gap(24);
  pdf.text('Controller of Examinations', { align: 'right' });
  return pdf.build();
}

export function transcriptPdf(h: StudentHeader, results: ResultData[]): Buffer {
  const pdf = new PdfWriter();
  header(pdf, h, 'ACADEMIC TRANSCRIPT');
  for (const r of results) {
    pdf.gap(6);
    pdf.text(`${r.sessionName} - Semester ${r.term}`, { bold: true });
    lineRows(pdf, r);
    pdf.text(`SGPA ${r.sgpa.toFixed(2)}    Credits earned ${r.creditsEarned}/${r.creditsAttempted}    Cumulative CGPA ${r.cgpa.toFixed(2)}`);
  }
  const last = results[results.length - 1];
  pdf.gap(10);
  if (last) pdf.text(`Overall CGPA: ${last.cgpa.toFixed(2)}`, { bold: true, size: 12 });
  pdf.gap(24);
  pdf.text('Controller of Examinations', { align: 'right' });
  return pdf.build();
}
