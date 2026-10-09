import { A4, Pdf } from '../common/pdf-doc.js';

export interface ReportPackData {
  institution: string;
  committee: string;
  statutory: boolean;
  from: string;
  to: string;
  members: { name: string; role: string; tenure: string }[];
  meetings: { title: string; on: string; status: string; agenda: string; minutes: string }[];
  actions: { title: string; owner: string; dueOn: string; status: string }[];
  evidence: { title: string; kind: string; on: string }[];
}

/** The committee's report pack: members, meetings with minutes, action items and the evidence on file, as one PDF. */
export function reportPackPdf(d: ReportPackData): Buffer {
  const pdf = new Pdf(`${d.committee} report pack`);
  const left = 50;
  const width = A4.w - 100;
  let y = 0;
  const page = () => {
    pdf.addPage();
    y = 60;
  };
  const need = (h: number) => {
    if (y + h > A4.h - 60) page();
  };
  const heading = (s: string) => {
    need(40);
    y += 8;
    pdf.text(s.toUpperCase(), left, y, { size: 10, bold: true, color: '#1a5fb4' });
    y += 16;
  };
  const para = (s: string, size = 10, indent = 0) => {
    need(30);
    y = pdf.paragraph(s || '-', left + indent, y, width - indent, { size }) + 4;
  };
  page();
  pdf.text(d.institution, left, y, { size: 12, color: '#444444' });
  y += 24;
  pdf.text(`${d.committee}${d.statutory ? ' (statutory)' : ''}`, left, y, { size: 18, bold: true });
  y += 20;
  pdf.text(`Report pack for ${d.from} to ${d.to}`, left, y, { size: 11 });
  y += 8;
  pdf.line(left, y, left + width, y);
  y += 10;
  heading(`Members (${d.members.length})`);
  for (const m of d.members) para(`${m.name}, ${m.role}. ${m.tenure}`);
  heading(`Meetings (${d.meetings.length})`);
  for (const m of d.meetings) {
    need(40);
    pdf.text(`${m.on}  ${m.title}  [${m.status}]`, left, y, { size: 10.5, bold: true });
    y += 14;
    if (m.agenda) para(`Agenda: ${m.agenda}`, 9.5, 8);
    if (m.minutes) para(`Minutes: ${m.minutes}`, 9.5, 8);
  }
  heading(`Action items (${d.actions.length})`);
  for (const a of d.actions) para(`${a.title}. Owner ${a.owner}, due ${a.dueOn}, ${a.status}.`);
  heading(`Evidence on file (${d.evidence.length})`);
  for (const e of d.evidence) para(`${e.on}  ${e.title} (${e.kind})`);
  return pdf.build();
}
