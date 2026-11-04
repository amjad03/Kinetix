import { A4, Pdf } from '../common/pdf-doc.js';

interface MinutesData {
  institution: string;
  meeting: {
    title: string;
    meetingOn: string;
    startsAt: string;
    venue: string;
    minutes: string;
    minutesStatus: string;
    minutesHash: string | null;
    committee: { name: string } | null;
    agenda: { seq: number; title: string; presenter: string; discussion: string; resolution: string; outcome: string }[];
    attendance: { name: string; role: string; status: string | null }[];
    quorum: { members: number; needed: number; present: number; met: boolean | null };
    signoffs: { name: string; decision: string; comment: string; signedAt: Date; signature: string; current: boolean; valid: boolean }[];
    actions: { title: string; ownerName: string; dueOn: string; status: string; actionTaken: string }[];
  };
}

const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');

/** The minutes of one meeting, with the members' signatures and the hash of the text they approved. */
export function minutesPdf({ institution, meeting: m }: MinutesData): Buffer {
  const pdf = new Pdf(`Minutes: ${m.title}`);
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
  pdf.text(institution, left, y, { size: 12, color: '#444444' });
  y += 22;
  pdf.text(m.committee?.name ?? 'Committee', left, y, { size: 16, bold: true });
  y += 20;
  para(`Minutes of ${m.title}, held on ${m.meetingOn}${m.startsAt ? ` at ${m.startsAt}` : ''}${m.venue ? `, ${m.venue}` : ''}.`, 11);
  pdf.line(left, y, left + width, y);
  y += 8;
  heading(`Attendance: ${m.quorum.present} of ${m.quorum.members} present (quorum ${m.quorum.needed}) ${m.quorum.met ? '- quorum met' : '- quorum not met'}`);
  for (const a of m.attendance) para(`${a.name} (${a.role}): ${a.status ?? 'not recorded'}`, 9.5);
  heading('Proceedings');
  if (m.minutes) para(m.minutes);
  for (const a of m.agenda) {
    need(40);
    pdf.text(`${a.seq}. ${a.title}${a.presenter ? ` (${a.presenter})` : ''}  [${a.outcome}]`, left, y, { size: 10.5, bold: true });
    y += 14;
    if (a.discussion) para(`Discussion: ${a.discussion}`, 9.5, 10);
    if (a.resolution) para(`Resolved: ${a.resolution}`, 9.5, 10);
  }
  heading(`Action items (${m.actions.length})`);
  for (const a of m.actions) para(`${a.title}. ${a.ownerName}, by ${a.dueOn}: ${a.status}${a.actionTaken ? `. Action taken: ${a.actionTaken}` : ''}`, 9.5);
  const current = m.signoffs.filter((s) => s.current);
  heading(`Approval: ${m.minutesStatus}`);
  if (m.minutesHash) para(`Text fingerprint (SHA-256): ${m.minutesHash}`, 8.5);
  for (const s of current) para(`${s.name}: ${s.decision === 'approve' ? 'approved' : `objected (${s.comment})`} on ${ist(s.signedAt)} IST. Signature ${s.signature.slice(0, 24)}...${s.valid ? '' : ' (DOES NOT VERIFY)'}`, 9);
  if (!current.length) para('No signatures yet.', 9);
  return pdf.build();
}
