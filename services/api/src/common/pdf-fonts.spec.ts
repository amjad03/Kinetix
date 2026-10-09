import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PdfWriter } from './pdf.js';
import { A4, Pdf, textWidth, wrap } from './pdf-doc.js';
import { splitRuns } from './pdf-fonts.js';

const KN = 'ಸೌಂದರ್ಯ';
const HI = 'प्रधानाचार्य';

const latin = (b: Buffer) => b.toString('latin1');
const utf16 = (h: string) => Buffer.from(h, 'hex').swap16().toString('utf16le');

/** ActualText strings, drawn glyph ids and the ToUnicode map, read back out of the PDF. */
function extract(pdf: Buffer) {
  const s = latin(pdf);
  const actual = [...s.matchAll(/\/ActualText <FEFF([0-9a-f]+)>/g)].map((m) => utf16(m[1]));
  const gids = [...s.matchAll(/ <([0-9a-f]{4})> Tj/g)].map((m) => m[1]);
  const cmap = new Map<string, string>();
  for (const m of s.matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>/g)) cmap.set(m[1], utf16(m[2]));
  return { s, actual, gids, cmap };
}

describe('Hindi and Kannada in PDFs', () => {
  it('embeds Noto fonts, draws no notdef glyphs and keeps the text copyable', () => {
    const pdf = new Pdf('Test').addPage();
    pdf.text(KN, 50, 80, { size: 24 });
    pdf.text(HI, 50, 130, { size: 24, bold: true });
    pdf.text('Soundarya', 50, 180, { size: 24 });
    pdf.text(`Name: ${KN} / ${HI} - Rs. 500`, 50, 230, { size: 14 });
    const buf = pdf.build();
    if (process.env.PDF_SAMPLE_OUT) writeFileSync(process.env.PDF_SAMPLE_OUT, buf);
    const { s, actual, gids, cmap } = extract(buf);
    expect(s).toContain('/BaseFont /NotoSansKannada-Regular');
    expect(s).toContain('/BaseFont /NotoSansDevanagari-Bold');
    expect(s).toContain('/FontFile2');
    expect(s).toContain('/ToUnicode');
    expect(s).toContain('(Soundarya) Tj');
    expect(/\(\?+\) Tj/.test(s)).toBe(false);
    expect(actual).toContain(KN);
    expect(actual).toContain(HI);
    expect(gids.length).toBeGreaterThan(8);
    expect(gids.every((g) => g !== '0000')).toBe(true);
    // The consonants round-trip through ToUnicode.
    const mapped = [...cmap.values()].join('');
    for (const ch of ['ಸ', 'ದ', 'ರ', 'प', 'ध', 'न', 'च']) expect(mapped).toContain(ch);
    expect(buf.subarray(0, 8).toString()).toBe('%PDF-1.4');
  });

  it('measures shaped text and wraps it without losing characters', () => {
    expect(textWidth(HI, 12)).toBeGreaterThan(20);
    const text = `${HI} ${KN} ${HI} ${KN} ${HI}`;
    const lines = wrap(text, 90, 12);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(text);
    expect(wrap('plain ASCII ₹5', 200, 10)).toEqual(['plain ASCII Rs.5']);
    expect(splitRuns(`a ${HI} 12 ${KN}`).map((r) => r.script)).toEqual([null, 'dev', null, 'kn']);
  });

  it('keeps Latin-only output free of embedded fonts', () => {
    const buf = new Pdf('Plain').addPage().text('Hello', 10, 20).build();
    expect(latin(buf)).not.toContain('FontFile2');
    expect(A4.w).toBeGreaterThan(500);
  });

  it('the line-based writer embeds fonts too', () => {
    const w = new PdfWriter();
    w.text(`Student: ${KN}`);
    w.row([HI, 'x'], [0, 200]);
    const { s, actual, gids } = extract(w.build());
    expect(s).toContain('NotoSansKannada-Regular');
    expect(actual).toContain(KN);
    expect(actual).toContain(HI);
    expect(gids.every((g) => g !== '0000')).toBe(true);
  });
});
