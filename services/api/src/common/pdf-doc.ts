import { qrMatrix } from './qr.js';

/**
 * A small PDF writer for payslips, certificates, ID cards and receipts: Helvetica (regular and
 * bold, English only), rectangles, lines and QR codes. Coordinates are in points from the top-left
 * of the page, as a designer would think of them. No dependencies.
 */

export const A4 = { w: 595.28, h: 841.89 };

// Helvetica advance widths for ASCII 32–126, per 1000 em.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

/** Text as the PDF will show it: Latin-1 only (the rupee sign becomes "Rs."). */
export const latin1 = (s: string) => s.replace(/₹/g, 'Rs.').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x09\x0a\x20-\x7e\xa0-\xff]/g, '?');

export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of latin1(s)) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? W[c - 32] : 556;
  }
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

/** Breaks text into lines no wider than `width` points (explicit newlines kept). */
export function wrap(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of latin1(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, bold) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const hex = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) throw new Error(`Bad colour ${c}`);
  return [0, 2, 4].map((i) => num(parseInt(m[1].slice(i, i + 2), 16) / 255)).join(' ');
};

interface Page {
  w: number;
  h: number;
  ops: string[];
}

/** Width and height of a baseline or progressive JPEG, or undefined when `b` is not one. */
export function jpegSize(b: Buffer): { w: number; h: number } | undefined {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return undefined;
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return undefined;
}

export class Pdf {
  private readonly pages: Page[] = [];
  private readonly images: { data: Buffer; w: number; h: number; gray: boolean }[] = [];

  constructor(private readonly title = 'Document') {}

  get page(): Page {
    return this.pages[this.pages.length - 1];
  }

  addPage(w = A4.w, h = A4.h): this {
    this.pages.push({ w, h, ops: [] });
    return this;
  }

  /** Draws one line of text; `align` is relative to x (left, centre or right edge). */
  text(s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'center' | 'right' } = {}): this {
    const size = o.size ?? 10;
    const w = textWidth(s, size, o.bold);
    const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    const esc = latin1(s).replace(/[\\()]/g, '\\$&');
    this.page.ops.push(`BT /${o.bold ? 'F2' : 'F1'} ${num(size)} Tf ${hex(o.color ?? '#000000')} rg ${num(left)} ${num(this.page.h - y)} Td (${esc}) Tj ET`);
    return this;
  }

  /** Wrapped paragraph; returns the y below it. */
  paragraph(s: string, x: number, y: number, width: number, o: { size?: number; bold?: boolean; color?: string; leading?: number; align?: 'left' | 'center' } = {}): number {
    const size = o.size ?? 10;
    const lead = o.leading ?? size * 1.4;
    for (const line of wrap(s, width, size, o.bold)) {
      this.text(line, o.align === 'center' ? x + width / 2 : x, y, { ...o, size });
      y += lead;
    }
    return y;
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; lineWidth?: number } = {}): this {
    const ops: string[] = [];
    if (o.fill) ops.push(`${hex(o.fill)} rg`);
    if (o.stroke) ops.push(`${hex(o.stroke)} RG ${num(o.lineWidth ?? 0.5)} w`);
    ops.push(`${num(x)} ${num(this.page.h - y - h)} ${num(w)} ${num(h)} re ${o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'}`);
    this.page.ops.push(ops.join(' '));
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, o: { color?: string; width?: number } = {}): this {
    this.page.ops.push(`${hex(o.color ?? '#000000')} RG ${num(o.width ?? 0.5)} w ${num(x1)} ${num(this.page.h - y1)} m ${num(x2)} ${num(this.page.h - y2)} l S`);
    return this;
  }

  /** A QR code of `text`, `size` points square, with the quiet zone inside that square. */
  qr(text: string, x: number, y: number, size: number): this {
    const m = qrMatrix(text);
    const quiet = 2;
    const cell = size / (m.length + 2 * quiet);
    const ops = ['0 0 0 rg'];
    m.forEach((row, r) => row.forEach((dark, c) => {
      if (dark) ops.push(`${num(x + (c + quiet) * cell)} ${num(this.page.h - y - (r + quiet + 1) * cell)} ${num(cell + 0.05)} ${num(cell + 0.05)} re f`);
    }));
    this.page.ops.push(ops.join('\n'));
    return this;
  }

  /** Draws a JPEG scaled into the box (top-left origin, like the rest). Throws on anything but a JPEG. */
  jpeg(data: Buffer, x: number, y: number, w: number, h: number): this {
    const size = jpegSize(data);
    if (!size) throw new Error('Not a JPEG image');
    // Components: SOF byte 9 after the marker; 1 = greyscale.
    let gray = false;
    for (let i = 2; i + 9 < data.length; ) {
      const m = data[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        gray = data[i + 9] === 1;
        break;
      }
      i += 2 + data.readUInt16BE(i + 2);
    }
    const id = this.images.push({ data, w: size.w, h: size.h, gray }) - 1;
    this.page.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.page.h - y - h)} cm /Im${id} Do Q`);
    return this;
  }

  build(): Buffer {
    if (this.pages.length === 0) this.addPage();
    const objs: Buffer[] = [];
    const add = (body: string | Buffer) => objs.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
    // 1 catalog, 2 pages, 3-4 fonts, 5 info, then per page: page and content.
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(`<< /Type /Pages /Kids [${this.pages.map((_, i) => `${6 + i * 2} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    add(`<< /Title (${latin1(this.title).replace(/[\\()]/g, '\\$&')}) /Producer (KINETIX) >>`);
    const firstImage = 6 + this.pages.length * 2;
    const xobjects = this.images.length ? ` /XObject << ${this.images.map((_, k) => `/Im${k} ${firstImage + k} 0 R`).join(' ')} >>` : '';
    this.pages.forEach((p, i) => {
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects} >> /Contents ${7 + i * 2} 0 R >>`);
      const content = Buffer.from(p.ops.join('\n'), 'latin1');
      add(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream', 'latin1')]));
    });
    for (const im of this.images) {
      const head = `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /${im.gray ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`;
      add(Buffer.concat([Buffer.from(head, 'latin1'), im.data, Buffer.from('\nendstream', 'latin1')]));
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
    const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(parts);
  }
}
