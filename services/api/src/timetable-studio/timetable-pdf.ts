import { A4, Pdf, wrap } from '../common/pdf-doc.js';

export interface GridCell {
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  /** Lines shown in the cell: subject, then class / teacher / room as the view needs. */
  lines: string[];
}

export interface TimetableGrid {
  institution: string;
  title: string;
  subtitle: string;
  days: number[];
  periods: { startsAt: string; endsAt: string }[];
  cells: GridCell[];
  footer: string;
}

const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const W = A4.h;
const H = A4.w;
const L = 30;

/**
 * A printable week grid on landscape A4: days down the side, periods across, each cell with what meets then (two
 * periods at once, as lab batches or parallel electives are, share the cell). Signature lines for the principal.
 */
export function timetablePdf(g: TimetableGrid): Buffer {
  const pdf = new Pdf(g.title);
  pdf.addPage(W, H);
  pdf.text(g.institution, W / 2, 34, { size: 13, bold: true, align: 'center' });
  pdf.text(g.title, W / 2, 52, { size: 11, bold: true, align: 'center' });
  pdf.text(g.subtitle, W / 2, 67, { size: 8.5, color: '#555555', align: 'center' });
  const top = 82;
  const dayCol = 70;
  const cols = Math.max(1, g.periods.length);
  const colW = (W - 2 * L - dayCol) / cols;
  const rowH = Math.min(70, (H - top - 70) / Math.max(1, g.days.length + 1));
  const headH = 26;
  pdf.rect(L, top, W - 2 * L, headH, { fill: '#e8f3f1', stroke: '#9fb8b4' });
  pdf.text('Day', L + 6, top + 16, { size: 8.5, bold: true });
  g.periods.forEach((p, i) => {
    const x = L + dayCol + i * colW;
    pdf.text(`${i + 1}`, x + colW / 2, top + 11, { size: 8, bold: true, align: 'center' });
    pdf.text(`${p.startsAt}-${p.endsAt}`, x + colW / 2, top + 21, { size: 7, align: 'center', color: '#444444' });
    pdf.line(x, top, x, top + headH + rowH * g.days.length, { color: '#9fb8b4', width: 0.5 });
  });
  g.days.forEach((d, r) => {
    const y = top + headH + r * rowH;
    pdf.rect(L, y, W - 2 * L, rowH, { stroke: '#9fb8b4', lineWidth: 0.5 });
    pdf.text(DAY[d] ?? String(d), L + 6, y + rowH / 2 + 3, { size: 8.5, bold: true });
    g.periods.forEach((p, i) => {
      const here = g.cells.filter((c) => c.dayOfWeek === d && c.startsAt < p.endsAt && p.startsAt < c.endsAt);
      if (!here.length) return;
      const x = L + dayCol + i * colW + 3;
      let ty = y + 10;
      const size = here.length > 1 ? 6 : 7;
      for (const c of here) {
        for (const [k, line] of c.lines.entries()) {
          for (const part of wrap(line, colW - 6, size, k === 0).slice(0, 2)) {
            if (ty > y + rowH - 3) break;
            pdf.text(part, x, ty, { size, bold: k === 0, color: k === 0 ? '#111111' : '#444444' });
            ty += size + 1.5;
          }
        }
        ty += 2;
      }
    });
  });
  const sy = H - 40;
  pdf.text('Time-table in-charge', L + 40, sy, { size: 8 });
  pdf.text('Head of department', W / 2, sy, { size: 8, align: 'center' });
  pdf.text('Principal', W - L - 40, sy, { size: 8, align: 'right' });
  pdf.text(g.footer, L, H - 18, { size: 7, color: '#777777' });
  return pdf.build();
}
