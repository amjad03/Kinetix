// The evidence pack a peer team or DVV partner receives: a ZIP with a folder per criterion and metric holding every
// evidence file by year, and an index PDF (plus a CSV of the same list) naming each document, link and file.
import { A4, Pdf, wrap } from '../common/pdf-doc.js';
import { toCsv } from '../common/pdf.js';

export interface PackItem {
  criterion: string;
  criterionTitle: string;
  metric: string;
  metricTitle: string;
  year: string;
  title: string;
  url: string | null;
  note: string | null;
  fileName: string | null;
  /** Path inside the ZIP, when the file is included. */
  path: string | null;
}

const L = 40;
const R = A4.w - 40;
const BOTTOM = A4.h - 50;

/** A safe file or folder name for a ZIP entry. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';

/** The index PDF: cover details, then each criterion's metrics with their documents. */
export function packIndexPdf(o: { inst: string; framework: string; cycle: string; generatedOn: string; completeness: string; items: PackItem[]; skipped: number }): Buffer {
  const pdf = new Pdf(`Evidence index ${o.framework} ${o.cycle}`);
  let y = 0;
  let page = 0;
  const footer = `${o.inst}  |  ${o.framework}  |  Evidence index ${o.cycle}`;
  const newPage = () => {
    pdf.addPage();
    page++;
    pdf.text(footer, L, A4.h - 28, { size: 8, color: '#777777' });
    pdf.text(`Page ${page}`, R, A4.h - 28, { size: 8, color: '#777777', align: 'right' });
    y = 50;
  };
  const need = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };
  const line = (s: string, opt: { bold?: boolean; size?: number; indent?: number; color?: string } = {}) => {
    const size = opt.size ?? 9;
    const x = L + (opt.indent ?? 0);
    for (const l of wrap(s, R - x, size, opt.bold)) {
      need(size * 1.5);
      pdf.text(l, x, y, { size, bold: opt.bold, color: opt.color });
      y += size * 1.5;
    }
  };
  newPage();
  pdf.text(o.inst, A4.w / 2, y, { size: 16, bold: true, align: 'center' });
  y += 22;
  pdf.text(`${o.framework}: evidence index`, A4.w / 2, y, { size: 12, align: 'center', color: '#444444' });
  y += 12;
  pdf.line(L, y, R, y, { width: 1 });
  y += 20;
  for (const [k, v] of [
    ['Period', o.cycle],
    ['Generated on', o.generatedOn],
    ['Documents', `${o.items.length} (${o.items.filter((i) => i.path).length} files in this pack, ${o.items.filter((i) => !i.path && i.url).length} links)`],
    ['Data completeness', o.completeness],
  ] as const) {
    pdf.text(k, L, y, { size: 9.5, color: '#666666' }).text(v, L + 110, y, { size: 9.5, bold: true });
    y += 15;
  }
  if (o.skipped) line(`${o.skipped} files were left out because the pack reached its size limit; download them from the metric pages.`, { color: '#a33' });
  const criteria = [...new Set(o.items.map((i) => i.criterion))];
  if (!criteria.length) line('No evidence has been uploaded yet.', { color: '#777777' });
  for (const c of criteria) {
    const mine = o.items.filter((i) => i.criterion === c);
    need(46);
    y += 10;
    pdf.rect(L, y - 12, R - L, 20, { fill: '#eef2f7' });
    pdf.text(`Criterion ${c}: ${mine[0].criterionTitle}`, L + 6, y + 2, { size: 11, bold: true });
    y += 26;
    for (const m of [...new Set(mine.map((i) => i.metric))]) {
      const docs = mine.filter((i) => i.metric === m);
      line(`${m}  ${docs[0].metricTitle}`, { bold: true, size: 9.5 });
      for (const d of docs) {
        line(`${d.year}  ${d.title}`, { indent: 12 });
        line(d.path ? `File: ${d.path}` : d.url ? `Link: ${d.url}` : 'Note only', { indent: 24, size: 8, color: '#555555' });
        if (d.note) line(d.note, { indent: 24, size: 8, color: '#555555' });
      }
      y += 4;
    }
  }
  return pdf.build();
}

export const packIndexCsv = (items: PackItem[]) => Buffer.from(toCsv([['Criterion', 'Metric', 'Year', 'Document', 'File in pack', 'Link', 'Note'], ...items.map((i) => [i.criterion, i.metric, i.year, i.title, i.path ?? '', i.url ?? '', i.note ?? ''])]), 'utf8');
