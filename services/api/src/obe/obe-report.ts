// OBE reports as one model rendered two ways: a PDF body (A4, portrait or landscape, in the institution's colours; the
// document engine puts the branded cover in front) and an Excel workbook (each table its own sheet). The course file,
// attainment reports, NBA SAR tables and NAAC 2.6 data all use it.
import { writeWorkbook, type WorkbookSheet } from '../common/xlsx.js';
import { A4, Pdf, textWidth, wrap } from '../common/pdf-doc.js';

export type Cell = string | number | null;
export interface Column {
  title: string;
  /** Relative width. */
  w?: number;
  align?: 'left' | 'right' | 'center';
  /** Cells hold an attainment level (0 to `max`) and are shaded by how close they are to the target. */
  level?: { max: number; target: number };
  /** Cells hold a CO-PO strength (1 to 3) and are shaded by it. */
  strength?: boolean;
}
export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'sub'; text: string }
  | { kind: 'para'; text: string; muted?: boolean }
  | { kind: 'facts'; items: [string, string][] }
  | { kind: 'table'; caption: string; sheet?: string; columns: Column[]; rows: Cell[][]; empty?: string };

export interface ReportDoc {
  title: string;
  subtitle: string;
  institution: string;
  /** For the cover: the academic year or span covered, and who the document is for. */
  period?: string;
  preparedFor?: string;
  landscape?: boolean;
  blocks: Block[];
}

const fmt = (v: Cell) => (v === null || v === undefined ? '-' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : v);

/** Mixes a colour with white: `t` = 0 white, 1 the colour. */
function tint(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(255 - (255 - x) * t));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

const LEVEL_FILL = { met: '#d7f0e0', near: '#fbecc8', short: '#f7d4d1' };
const STRENGTH_FILL = ['#ffffff', '#e3eef7', '#bcd6ec', '#8db8de'];

/** The report as a PDF body. `primary` is the institution's primary colour (#rrggbb). */
export function reportPdf(doc: ReportDoc, primary = '#0f766e'): Buffer {
  const W = doc.landscape ? A4.h : A4.w;
  const H = doc.landscape ? A4.w : A4.h;
  const L = 36;
  const R = W - 36;
  const BOTTOM = H - 46;
  const pdf = new Pdf(doc.title);
  let y = 0;
  let page = 0;
  const footer = `${doc.institution}  |  ${doc.title}`;
  const newPage = () => {
    pdf.addPage(W, H);
    page++;
    pdf.rect(0, 0, W, 6, { fill: primary });
    pdf.text(footer.length > 110 ? footer.slice(0, 107) + '...' : footer, L, H - 24, { size: 7.5, color: '#777777' });
    pdf.text(`Page ${page}`, R, H - 24, { size: 7.5, color: '#777777', align: 'right' });
    y = 40;
  };
  const need = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };
  newPage();
  pdf.text(doc.institution, L, y, { size: 10, color: '#555555' });
  y += 20;
  for (const line of wrap(doc.title, R - L, 17, true)) {
    pdf.text(line, L, y, { size: 17, bold: true, color: primary });
    y += 21;
  }
  for (const line of wrap(doc.subtitle, R - L, 10)) {
    pdf.text(line, L, y, { size: 10, color: '#444444' });
    y += 14;
  }
  pdf.line(L, y, R, y, { color: primary, width: 1 });
  y += 16;

  const table = (b: Extract<Block, { kind: 'table' }>) => {
    need(40);
    pdf.text(b.caption, L, y, { size: 10, bold: true });
    y += 12;
    if (!b.rows.length) {
      pdf.text(b.empty ?? 'Nothing recorded.', L, y + 4, { size: 8.5, color: '#777777' });
      y += 18;
      return;
    }
    const total = b.columns.reduce((s, c) => s + (c.w ?? 1), 0);
    const widths = b.columns.map((c) => ((c.w ?? 1) / total) * (R - L));
    const size = b.columns.length > 12 ? 6.5 : b.columns.length > 8 ? 7.5 : 8.5;
    const lineH = size * 1.3;
    const drawHeader = () => {
      const lines = b.columns.map((c, i) => wrap(c.title, widths[i] - 6, size, true));
      const h = Math.max(...lines.map((l) => l.length)) * lineH + 6;
      need(h + lineH + 6);
      pdf.rect(L, y, R - L, h, { fill: tint(primary, 0.14) });
      let x = L;
      lines.forEach((ls, i) => {
        ls.forEach((t, k) => pdf.text(t, b.columns[i].align === 'right' ? x + widths[i] - 3 : b.columns[i].align === 'center' ? x + widths[i] / 2 : x + 3, y + 3 + size + k * lineH, { size, bold: true, align: b.columns[i].align ?? 'left' }));
        x += widths[i];
      });
      y += h;
    };
    drawHeader();
    for (const [ri, row] of b.rows.entries()) {
      const lines = row.map((v, i) => wrap(fmt(v), widths[i] - 6, size));
      const h = Math.max(...lines.map((l) => l.length)) * lineH + 5;
      if (y + h > BOTTOM) {
        newPage();
        drawHeader();
      }
      if (ri % 2 === 1) pdf.rect(L, y, R - L, h, { fill: '#f7f8fa' });
      let x = L;
      row.forEach((v, i) => {
        const c = b.columns[i];
        if (typeof v === 'number' && c.level) {
          const fill = v >= c.level.target ? LEVEL_FILL.met : v >= c.level.target * 0.8 ? LEVEL_FILL.near : LEVEL_FILL.short;
          pdf.rect(x + 1, y + 1, widths[i] - 2, h - 2, { fill });
        } else if (typeof v === 'number' && c.strength && v > 0) {
          pdf.rect(x + 1, y + 1, widths[i] - 2, h - 2, { fill: STRENGTH_FILL[Math.min(3, Math.round(v))] });
        }
        lines[i].forEach((t, k) => pdf.text(t, c.align === 'right' ? x + widths[i] - 3 : c.align === 'center' ? x + widths[i] / 2 : x + 3, y + 3 + size + k * lineH, { size, align: c.align ?? 'left' }));
        x += widths[i];
      });
      pdf.line(L, y + h, R, y + h, { color: '#e2e5ea', width: 0.4 });
      y += h;
    }
    y += 12;
  };

  for (const b of doc.blocks) {
    if (b.kind === 'heading') {
      need(50);
      y += 6;
      pdf.rect(L, y - 12, R - L, 20, { fill: tint(primary, 0.1) });
      pdf.rect(L, y - 12, 3, 20, { fill: primary });
      pdf.text(b.text, L + 9, y + 2, { size: 11.5, bold: true });
      y += 22;
    } else if (b.kind === 'sub') {
      need(30);
      pdf.text(b.text, L, y, { size: 10, bold: true, color: primary });
      y += 15;
    } else if (b.kind === 'para') {
      for (const line of wrap(b.text, R - L, 9)) {
        need(13);
        pdf.text(line, L, y, { size: 9, color: b.muted ? '#666666' : '#222222' });
        y += 13;
      }
      y += 4;
    } else if (b.kind === 'facts') {
      const colW = (R - L) / 2;
      for (let i = 0; i < b.items.length; i += 2) {
        need(15);
        for (const [j, [k, v]] of b.items.slice(i, i + 2).entries()) {
          const x = L + j * colW;
          pdf.text(k, x, y, { size: 8.5, color: '#666666' });
          const kw = Math.max(textWidth(k, 8.5) + 8, 95);
          pdf.text(wrap(v, colW - kw - 8, 8.5, true)[0] ?? '', x + kw, y, { size: 8.5, bold: true });
        }
        y += 14;
      }
      y += 6;
    } else table(b);
  }
  return pdf.build();
}

/** The report as a workbook: a summary sheet with the text, then one sheet per table. */
export function reportXlsx(doc: ReportDoc): Buffer {
  const used = new Set<string>();
  const nameOf = (s: string) => {
    let base = s.replace(/[[\]:*?/\\]/g, ' ').slice(0, 28).trim() || 'Sheet';
    let n = base;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 25)} ${i}`;
    used.add(n.toLowerCase());
    base = n;
    return base;
  };
  const summary: (string | number | null)[][] = [[doc.title], [doc.subtitle], [doc.institution], []];
  const sheets: WorkbookSheet[] = [];
  for (const b of doc.blocks) {
    if (b.kind === 'heading' || b.kind === 'sub') summary.push([b.text]);
    else if (b.kind === 'para') summary.push([b.text]);
    else if (b.kind === 'facts') for (const [k, v] of b.items) summary.push([k, v]);
    else {
      summary.push([`${b.caption}: see the sheet "${b.sheet ?? b.caption}"`]);
      sheets.push({ name: nameOf(b.sheet ?? b.caption), header: true, rows: [b.columns.map((c) => c.title), ...b.rows.map((r) => r.map((v) => (v === undefined ? null : v)))], widths: b.columns.map((c) => Math.max(8, Math.min(60, (c.w ?? 1) * 12))) });
    }
  }
  return writeWorkbook([{ name: nameOf('Summary'), rows: summary, widths: [60, 40] }, ...sheets]);
}
