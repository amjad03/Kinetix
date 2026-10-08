import { A4, Pdf } from '../common/pdf-doc.js';
import type { BlueprintSection } from '../db/schema.js';

export interface PaperPdfData {
  institution: string;
  title: string;
  subject: string;
  durationMinutes: number;
  totalMarks: number;
  sections: BlueprintSection[];
  items: { section: number; position: number; marks: number; snapshot: { text?: string; options?: { text: string; correct: boolean }[]; answer?: string; type?: string; coCode?: string | null; bloom?: string } }[];
}

const MARGIN = 48;
const WIDTH = A4.w - 2 * MARGIN;
const BOTTOM = A4.h - 56;

/** The question paper (no answers) or the answer key (answers, marks and outcome per question). */
export function paperPdf(d: PaperPdfData, key: boolean): Buffer {
  const pdf = new Pdf(`${d.title}${key ? ' - answer key' : ''}`);
  let y = 0;
  const page = () => {
    pdf.addPage();
    y = MARGIN + 10;
  };
  const room = (h: number) => {
    if (y + h > BOTTOM) page();
  };
  page();
  pdf.text(d.institution, A4.w / 2, y, { size: 13, bold: true, align: 'center' });
  y += 18;
  pdf.text(key ? `${d.title} - ANSWER KEY (CONFIDENTIAL)` : d.title, A4.w / 2, y, { size: 12, bold: true, align: 'center' });
  y += 16;
  pdf.text(`Subject: ${d.subject}`, MARGIN, y, { size: 10 });
  pdf.text(`Time: ${d.durationMinutes} minutes     Maximum marks: ${d.totalMarks}`, A4.w - MARGIN, y, { size: 10, align: 'right' });
  y += 8;
  pdf.line(MARGIN, y, A4.w - MARGIN, y);
  y += 16;
  d.sections.forEach((sec, si) => {
    const rows = d.items.filter((i) => i.section === si).sort((a, b) => a.position - b.position);
    room(40);
    pdf.text(`${sec.name}`, MARGIN, y, { size: 11, bold: true });
    pdf.text(`${sec.count} x ${sec.questionMarks} = ${sec.count * sec.questionMarks} marks`, A4.w - MARGIN, y, { size: 10, align: 'right' });
    y += 16;
    rows.forEach((it, qi) => {
      const q = it.snapshot;
      const lines = (q.text ?? '').length / 85 + 1;
      room(lines * 14 + (key ? 40 : (q.options?.length ?? 0) * 13 + 14));
      const top = y;
      pdf.text(`${qi + 1}.`, MARGIN, y, { size: 10, bold: true });
      y = pdf.paragraph(q.text ?? '', MARGIN + 22, y, WIDTH - 70, { size: 10 });
      pdf.text(`[${it.marks}]`, A4.w - MARGIN, top, { size: 10, align: 'right' });
      (q.options ?? []).forEach((o, oi) => {
        const mark = key && o.correct ? '*' : ' ';
        y = pdf.paragraph(`${mark}(${String.fromCharCode(97 + oi)}) ${o.text}`, MARGIN + 30, y, WIDTH - 80, { size: 9.5, bold: key && o.correct, leading: 13 });
      });
      if (key) {
        if (q.answer) y = pdf.paragraph(`Answer: ${q.answer}`, MARGIN + 22, y + 2, WIDTH - 40, { size: 9.5, color: '#1a4d8f' });
        pdf.text(`CO ${q.coCode ?? '-'}   Bloom: ${q.bloom ?? '-'}   Marks: ${it.marks}`, MARGIN + 22, y + 2, { size: 8.5, color: '#666666' });
        y += 12;
      }
      y += 8;
    });
    y += 6;
  });
  room(30);
  pdf.text(key ? 'End of answer key' : '*** End of question paper ***', A4.w / 2, y + 8, { size: 9, align: 'center', color: '#666666' });
  return pdf.build();
}
