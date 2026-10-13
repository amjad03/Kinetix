// Report files: values normalised for JSON, an XLSX workbook and a landscape A4 PDF table.
import { xlsx } from '../accreditation/xlsx.js';
import { Pdf, textWidth } from '../common/pdf-doc.js';
import type { FactKind } from './records.catalogue.js';

const pad = (n: number) => String(n).padStart(2, '0');

/** One cell as JSON: dates as YYYY-MM-DD, timestamps as ISO, numbers as numbers. */
export function normalise(v: unknown, kind: FactKind): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return kind === 'date' ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : v.toISOString();
  if (kind === 'number' || kind === 'lpa' || kind === 'paise') return typeof v === 'number' ? v : Number(v);
  if (kind === 'bool') return Boolean(v);
  return String(v);
}

/** How a cell reads in a file: rupees for paise, LPA for packages, Yes/No for flags. */
export function cellText(v: string | number | boolean | null, kind: FactKind): string {
  if (v === null) return '';
  if (kind === 'paise') return `Rs. ${(Number(v) / 100).toLocaleString('en-IN')}`;
  if (kind === 'lpa') return `${v} LPA`;
  if (kind === 'bool') return v ? 'Yes' : 'No';
  if (kind === 'datetime' && typeof v === 'string') return v.slice(0, 16).replace('T', ' ');
  return String(v);
}

export const headerOf = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function reportXlsx(title: string, columns: [string, FactKind][], rows: Record<string, string | number | boolean | null>[]): Buffer {
  const body = rows.map((r) => columns.map(([k, kind]) => (kind === 'number' || kind === 'lpa' ? (r[k] as number | null) : cellText(r[k], kind))));
  return xlsx([{ name: title.slice(0, 31), rows: [columns.map(([k]) => headerOf(k)), ...body] }]);
}

/** A printable table: title, the institution and filters, then the rows across as many pages as needed. */
export function reportPdf(o: { title: string; institution: string; filters: string; criterion?: string; columns: [string, FactKind][]; rows: Record<string, string | number | boolean | null>[] }): Buffer {
  const W = 841.89;
  const H = 595.28;
  const left = 36;
  const width = W - left * 2;
  const colW = width / Math.max(1, o.columns.length);
  const pdf = new Pdf(o.title);
  const clip = (s: string) => {
    if (textWidth(s, 8) <= colW - 6) return s;
    let n = s.length;
    while (n > 1 && textWidth(s.slice(0, n) + '...', 8) > colW - 6) n--;
    return s.slice(0, n) + '...';
  };
  let y = 0;
  const header = () => {
    pdf.addPage(W, H);
    pdf.text(o.institution, left, 40, { size: 10, color: '#555555' });
    pdf.text(o.title, left, 60, { size: 15, bold: true });
    pdf.text([o.criterion, o.filters].filter(Boolean).join('  ·  '), left, 78, { size: 9, color: '#555555' });
    y = 100;
    o.columns.forEach(([k], i) => pdf.text(clip(headerOf(k)), left + i * colW, y, { size: 8, bold: true }));
    pdf.line(left, y + 5, left + width, y + 5, { color: '#999999' });
    y += 18;
  };
  header();
  if (!o.rows.length) pdf.text('No records for these filters.', left, y, { size: 9 });
  for (const r of o.rows) {
    if (y > H - 40) header();
    o.columns.forEach(([k, kind], i) => pdf.text(clip(cellText(r[k], kind)), left + i * colW, y, { size: 8 }));
    y += 14;
  }
  return pdf.build();
}
