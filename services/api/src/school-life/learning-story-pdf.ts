import { A4, jpegSize, Pdf } from '../common/pdf-doc.js';
import { EY_DOMAIN_LABEL, EY_DOMAINS, type EyDomain, type EyStatus } from './early-years-framework.js';

export interface LearningStory {
  institution: string;
  student: string;
  section: string;
  term: string;
  from: string;
  to: string;
  milestones: { domain: EyDomain; title: string; status: EyStatus | null }[];
  observations: { date: string; domain: EyDomain; note: string; photo?: Buffer }[];
}

const MARGIN = 48;
const BOTTOM = A4.h - 48;
const STATUS_LABEL: Record<EyStatus, string> = { emerging: 'Emerging', developing: 'Developing', achieved: 'Achieved' };
const STATUS_COLOUR: Record<EyStatus, string> = { emerging: '#b45309', developing: '#1d4ed8', achieved: '#15803d' };
const PHOTO = { w: 120, h: 90 };

/** A child's learning story for one term: milestones by domain and the teacher's dated observations, with photos. */
export function learningStoryPdf(d: LearningStory): Buffer {
  const pdf = new Pdf(`Learning story ${d.student} ${d.term}`);
  let y = 0;
  const page = () => {
    pdf.addPage();
    y = MARGIN + 10;
  };
  const room = (h: number) => {
    if (y + h > BOTTOM) page();
  };
  page();
  pdf.text(d.institution, A4.w / 2, y, { size: 14, bold: true, align: 'center' });
  y += 20;
  pdf.text('Learning Story', A4.w / 2, y, { size: 12, bold: true, align: 'center' });
  y += 18;
  pdf.text(`${d.student}   |   ${d.section}`, MARGIN, y, { size: 11, bold: true });
  pdf.text(`${d.term} (${d.from} to ${d.to})`, A4.w - MARGIN, y, { size: 10, align: 'right' });
  y += 8;
  pdf.line(MARGIN, y, A4.w - MARGIN, y);
  y += 18;

  for (const domain of EY_DOMAINS) {
    const ms = d.milestones.filter((m) => m.domain === domain);
    const obs = d.observations.filter((o) => o.domain === domain);
    if (ms.length === 0 && obs.length === 0) continue;
    room(40);
    pdf.rect(MARGIN, y - 11, A4.w - 2 * MARGIN, 17, { fill: '#eef2ff' });
    pdf.text(EY_DOMAIN_LABEL[domain], MARGIN + 6, y + 1, { size: 11, bold: true, color: '#1e3a8a' });
    y += 20;
    for (const m of ms) {
      room(16);
      pdf.text(m.title, MARGIN + 6, y, { size: 10 });
      pdf.text(m.status ? STATUS_LABEL[m.status] : 'Not yet observed', A4.w - MARGIN - 6, y, { size: 10, bold: !!m.status, align: 'right', color: m.status ? STATUS_COLOUR[m.status] : '#6b7280' });
      y += 15;
    }
    for (const o of obs) {
      const photo = o.photo && jpegSize(o.photo) ? o.photo : undefined;
      const textWidthAvail = A4.w - 2 * MARGIN - 12 - (photo ? PHOTO.w + 10 : 0);
      const lines = Math.max(1, Math.ceil(o.note.length / (textWidthAvail / 5)));
      room(Math.max(photo ? PHOTO.h + 8 : 0, 14 + lines * 14) + 6);
      pdf.text(o.date, MARGIN + 6, y, { size: 9, bold: true, color: '#374151' });
      const end = pdf.paragraph(o.note, MARGIN + 6, y + 13, textWidthAvail, { size: 10, leading: 13 });
      if (photo) pdf.jpeg(photo, A4.w - MARGIN - PHOTO.w, y - 8, PHOTO.w, PHOTO.h);
      y = Math.max(end, photo ? y - 8 + PHOTO.h + 8 : 0) + 6;
    }
    y += 8;
  }
  if (d.observations.length === 0 && d.milestones.every((m) => !m.status)) {
    pdf.text('No observations were recorded in this term.', MARGIN, y, { size: 10, color: '#6b7280' });
  }
  return pdf.build();
}
