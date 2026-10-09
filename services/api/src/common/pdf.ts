/**
 * A tiny dependency-free PDF writer (A4, Helvetica / Helvetica-Bold, text and rules) for the
 * documents the ERP prints: hall tickets, marks cards, transcripts and accreditation reports.
 * Latin text uses Helvetica; Hindi and Kannada use embedded Noto fonts (see pdf-fonts.ts); other scripts show as '?'.
 */

import { qrMatrix } from './qr.js';
import { hasIndic, IndicFonts } from './pdf-fonts.js';

const W = 595;
const H = 842;
const M = 40;

const latin = (s: string) =>
  [...s.normalize('NFKD').replace(/[̀-ͯ]/g, '')].map((c) => (c.charCodeAt(0) < 256 ? c : '?')).join('').replace(/[\\()]/g, (m) => `\\${m}`);

/** Approximate Helvetica width in points (average glyph 0.52 em), enough for aligning columns; exact for Hindi and Kannada. */
export const textWidth = (s: string, size: number) => (hasIndic(s) ? IndicFonts.width(s, size, false, (t) => t.length * size * 0.52) : s.length * size * 0.52);

/** Width, height and colour components of a JPEG, or null when the bytes are not one. */
export function jpegInfo(b: Buffer): { w: number; h: number; comps: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xc2) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), comps: b[i + 9] };
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) i += 2;
    else i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

export class PdfWriter {
  private pages: string[][] = [[]];
  private readonly images: { data: Buffer; w: number; h: number; comps: number }[] = [];
  private readonly fonts = new IndicFonts();
  y = H - M;

  private get page() {
    return this.pages[this.pages.length - 1];
  }

  newPage(): void {
    this.pages.push([]);
    this.y = H - M;
  }

  private ensure(h: number) {
    if (this.y - h < M) this.newPage();
  }

  /** One line of text; `x` is from the left margin. Moves the cursor down unless `stay`. */
  text(s: string, o: { x?: number; size?: number; bold?: boolean; stay?: boolean; align?: 'left' | 'right' | 'center' } = {}): void {
    const size = o.size ?? 10;
    if (!o.stay) this.ensure(size + 4);
    let x = M + (o.x ?? 0);
    if (o.align === 'center') x = W / 2 - textWidth(s, size) / 2;
    if (o.align === 'right') x = W - M - textWidth(s, size);
    if (hasIndic(s)) {
      const raw = (t: string) => [...t.normalize('NFKD').replace(/[̀-ͯ]/g, '')].map((c) => (c.charCodeAt(0) < 256 ? c : '?')).join('');
      this.page.push(this.fonts.draw(s, x, this.y, size, o.bold ?? false, o.bold ? 'F2' : 'F1', { clean: raw, width: (t) => t.length * size * 0.52, escape: (t) => t.replace(/[\\()]/g, (m) => `\\${m}`) }));
    } else this.page.push(`BT /${o.bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${this.y.toFixed(1)} Td (${latin(s)}) Tj ET`);
    if (!o.stay) this.y -= size + 4;
  }

  /** A table row: cells at the given x offsets (right-aligned cells end at the next column's start - 6). */
  row(cells: string[], xs: number[], o: { size?: number; bold?: boolean } = {}): void {
    const size = o.size ?? 9;
    this.ensure(size + 4);
    cells.forEach((c, i) => this.text(c.slice(0, Math.max(4, Math.floor(((xs[i + 1] ?? W - 2 * M) - xs[i] - 4) / (size * 0.52)))), { x: xs[i], size, bold: o.bold, stay: true }));
    this.y -= size + 4;
  }

  /** A QR code of `text`, `size` points square, with its top-right corner at the right margin and its top at the cursor; the cursor does not move. */
  qr(text: string, size = 80): void {
    const m = qrMatrix(text);
    const quiet = 2;
    const n = m.length + 2 * quiet;
    const unit = size / n;
    const left = W - M - size;
    const bottom = this.y - size;
    this.page.push(`q 1 g ${left.toFixed(2)} ${bottom.toFixed(2)} ${size} ${size} re f 0 g`);
    m.forEach((row, r) => row.forEach((dark, c) => {
      if (dark) this.page.push(`${(left + (c + quiet) * unit).toFixed(2)} ${(bottom + size - (r + quiet + 1) * unit).toFixed(2)} ${unit.toFixed(2)} ${unit.toFixed(2)} re f`);
    }));
    this.page.push('Q');
  }

  /** A JPEG photo `width` x `height` points with its top-left at the cursor (`x` from the left margin); the cursor does not move. False when the bytes are not a JPEG. */
  image(jpeg: Buffer, o: { x?: number; width: number; height: number }): boolean {
    const info = jpegInfo(jpeg);
    if (!info || (info.comps !== 1 && info.comps !== 3)) return false;
    this.ensure(o.height);
    const n = this.images.push({ data: jpeg, ...info });
    this.page.push(`q ${o.width} 0 0 ${o.height} ${(M + (o.x ?? 0)).toFixed(1)} ${(this.y - o.height).toFixed(1)} cm /Im${n} Do Q`);
    return true;
  }

  rule(): void {
    this.ensure(8);
    this.page.push(`0.5 w ${M} ${(this.y + 2).toFixed(1)} m ${W - M} ${(this.y + 2).toFixed(1)} l S`);
    this.y -= 6;
  }

  gap(n = 8): void {
    this.y -= n;
  }

  /** Wraps a paragraph to the page width. */
  paragraph(s: string, o: { size?: number; bold?: boolean } = {}): void {
    const size = o.size ?? 10;
    const max = Math.floor((W - 2 * M) / (size * 0.52));
    let line = '';
    for (const word of s.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > max) {
        this.text(line, { size, bold: o.bold });
        line = word;
      } else line = (line + ' ' + word).trim();
    }
    if (line) this.text(line, { size, bold: o.bold });
  }

  build(): Buffer {
    const objs: Buffer[] = [];
    const add = (body: string) => objs.push(Buffer.from(body, 'latin1'));
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(`<< /Type /Pages /Kids [${this.pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const indic = this.fonts.objects(5 + this.pages.length * 2);
    const fontRes = Object.entries(indic.refs).map(([k, v]) => ` /${k} ${v} 0 R`).join('');
    const imgBase = 5 + this.pages.length * 2 + indic.objs.length;
    const xobjects = this.images.length ? ` /XObject << ${this.images.map((_, k) => `/Im${k + 1} ${imgBase + k} 0 R`).join(' ')} >>` : '';
    this.pages.forEach((p, i) => {
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R${fontRes} >>${xobjects} >> /Contents ${6 + i * 2} 0 R >>`);
      const stream = p.join('\n');
      add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    });
    objs.push(...indic.objs);
    for (const im of this.images) {
      objs.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /${im.comps === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`, 'latin1'), im.data, Buffer.from('\nendstream', 'latin1')]));
    }
    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
    const offsets: number[] = [];
    let pos = parts[0].length;
    objs.forEach((o, i) => {
      offsets.push(pos);
      const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')]);
      parts.push(b);
      pos += b.length;
    });
    parts.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(parts);
  }
}

/** Quotes one CSV cell (RFC 4180) and neutralises spreadsheet formulas. */
export const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
