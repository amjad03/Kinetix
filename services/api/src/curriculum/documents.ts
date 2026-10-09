import { A4, Pdf } from '../common/pdf-doc.js';

export interface ReportCardData {
  institution: string;
  student: string;
  rollNo: string;
  className: string;
  yearLabel: string;
  termLabel: string;
  lines: { subject: string; marks: number; maxMarks: number; grade: string; remark: string }[];
  coCurricular: { activity: string; grade: string; remark: string }[];
  attendance: { percent: number | null; present: number; total: number };
  behaviourGrade: string | null;
  remarks: string;
  promotionStatus: 'pending' | 'promoted' | 'promoted_with_grace' | 'detained';
  promotedTo: string | null;
}

/** Percentage to a letter grade on the common 10-point school scale. */
export function gradeFor(percent: number): string {
  if (percent >= 91) return 'A1';
  if (percent >= 81) return 'A2';
  if (percent >= 71) return 'B1';
  if (percent >= 61) return 'B2';
  if (percent >= 51) return 'C1';
  if (percent >= 41) return 'C2';
  if (percent >= 33) return 'D';
  return 'E';
}

export const PROMOTION_LABEL: Record<ReportCardData['promotionStatus'], string> = { pending: 'Result awaited', promoted: 'Promoted', promoted_with_grace: 'Promoted with grace marks', detained: 'Detained' };

const MARGIN = 48;

/** A school report card: marks by subject, co-curricular grades, attendance, the class teacher's remarks and promotion status. */
export function reportCardPdf(d: ReportCardData): Buffer {
  const pdf = new Pdf(`Report card ${d.student} ${d.termLabel}`);
  pdf.addPage();
  let y = MARGIN + 10;
  pdf.text(d.institution, A4.w / 2, y, { size: 15, bold: true, align: 'center' });
  y += 20;
  pdf.text(`Report Card - ${d.termLabel} (${d.yearLabel})`, A4.w / 2, y, { size: 12, bold: true, align: 'center' });
  y += 22;
  pdf.text(d.student, MARGIN, y, { size: 11, bold: true });
  pdf.text(`${d.className}   Roll ${d.rollNo}`, A4.w - MARGIN, y, { size: 10, align: 'right' });
  y += 8;
  pdf.line(MARGIN, y, A4.w - MARGIN, y);
  y += 16;

  const cols = [MARGIN, 280, 350, 410, 470];
  pdf.rect(MARGIN, y - 11, A4.w - 2 * MARGIN, 16, { fill: '#e5e7eb' });
  ['Subject', 'Marks', 'Out of', 'Grade', 'Remark'].forEach((h, i) => pdf.text(h, cols[i] + 2, y, { size: 9, bold: true }));
  y += 16;
  let got = 0;
  let out = 0;
  for (const l of d.lines) {
    pdf.text(l.subject, cols[0] + 2, y, { size: 9 });
    pdf.text(String(l.marks), cols[1] + 2, y, { size: 9 });
    pdf.text(String(l.maxMarks), cols[2] + 2, y, { size: 9 });
    pdf.text(l.grade, cols[3] + 2, y, { size: 9, bold: true });
    pdf.text(l.remark.slice(0, 22), cols[4] + 2, y, { size: 8 });
    got += l.marks;
    out += l.maxMarks;
    y += 14;
  }
  pdf.line(MARGIN, y - 6, A4.w - MARGIN, y - 6);
  const pct = out ? Math.round((got / out) * 1000) / 10 : 0;
  pdf.text(`Total ${got} / ${out}   (${pct}%)${out ? `   Grade ${gradeFor(pct)}` : ''}`, MARGIN + 2, y + 6, { size: 10, bold: true });
  y += 30;

  if (d.coCurricular.length) {
    pdf.text('Co-curricular activities', MARGIN, y, { size: 10, bold: true });
    y += 14;
    for (const c of d.coCurricular) {
      pdf.text(`${c.activity}`, MARGIN + 2, y, { size: 9 });
      pdf.text(c.grade, 280, y, { size: 9, bold: true });
      pdf.text(c.remark.slice(0, 40), 350, y, { size: 8 });
      y += 13;
    }
    y += 8;
  }

  pdf.text('Attendance', MARGIN, y, { size: 10, bold: true });
  pdf.text(d.attendance.percent === null ? 'Not recorded' : `${d.attendance.percent}%  (${d.attendance.present} of ${d.attendance.total} days)`, 280, y, { size: 9 });
  y += 14;
  if (d.behaviourGrade) {
    pdf.text('Conduct', MARGIN, y, { size: 10, bold: true });
    pdf.text(d.behaviourGrade, 280, y, { size: 9 });
    y += 14;
  }
  y += 6;
  pdf.text("Class teacher's remarks", MARGIN, y, { size: 10, bold: true });
  y += 14;
  y = pdf.paragraph(d.remarks || 'No remarks.', MARGIN + 2, y, A4.w - 2 * MARGIN - 4, { size: 9 }) + 10;
  pdf.text('Promotion status', MARGIN, y, { size: 10, bold: true });
  pdf.text(`${PROMOTION_LABEL[d.promotionStatus]}${d.promotedTo && d.promotionStatus.startsWith('promoted') ? ` to ${d.promotedTo}` : ''}`, 280, y, { size: 10, bold: true });
  y += 60;
  pdf.line(MARGIN, y, MARGIN + 130, y);
  pdf.line(A4.w - MARGIN - 130, y, A4.w - MARGIN, y);
  pdf.text('Class teacher', MARGIN, y + 12, { size: 9 });
  pdf.text('Principal', A4.w - MARGIN, y + 12, { size: 9, align: 'right' });
  return pdf.build();
}

export interface DegreeData {
  institution: string;
  student: string;
  degree: string;
  cgpa: number | null;
  certificateNo: string;
  conferredOn: string;
  convocation: string;
  verifyUrl: string;
}

/** A degree certificate (landscape) with a QR that opens the public check. */
export function degreeCertificatePdf(d: DegreeData): Buffer {
  const W = A4.h;
  const H = A4.w;
  const pdf = new Pdf(`Degree certificate ${d.certificateNo}`);
  pdf.addPage(W, H);
  pdf.rect(24, 24, W - 48, H - 48, { stroke: '#1e3a8a', lineWidth: 3 });
  pdf.rect(32, 32, W - 64, H - 64, { stroke: '#1e3a8a', lineWidth: 0.8 });
  pdf.text(d.institution, W / 2, 90, { size: 24, bold: true, align: 'center', color: '#1e3a8a' });
  pdf.text('DEGREE CERTIFICATE', W / 2, 125, { size: 14, bold: true, align: 'center' });
  pdf.text('This is to certify that', W / 2, 175, { size: 12, align: 'center' });
  pdf.text(d.student, W / 2, 210, { size: 24, bold: true, align: 'center' });
  pdf.text('has been admitted to the degree of', W / 2, 245, { size: 12, align: 'center' });
  pdf.text(d.degree, W / 2, 275, { size: 18, bold: true, align: 'center' });
  if (d.cgpa !== null) pdf.text(`with a Cumulative Grade Point Average of ${d.cgpa.toFixed(2)}`, W / 2, 300, { size: 12, align: 'center' });
  pdf.text(`Conferred at ${d.convocation} on ${d.conferredOn}`, W / 2, 330, { size: 11, align: 'center' });
  pdf.text(`Certificate no. ${d.certificateNo}`, 60, H - 70, { size: 10 });
  pdf.line(W / 2 - 80, H - 90, W / 2 + 80, H - 90);
  pdf.text('Registrar', W / 2, H - 76, { size: 10, align: 'center' });
  pdf.qr(d.verifyUrl, W - 150, H - 150, 90);
  pdf.text('Scan to verify', W - 105, H - 52, { size: 8, align: 'center' });
  return pdf.build();
}
