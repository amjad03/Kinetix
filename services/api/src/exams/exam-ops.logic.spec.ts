import { describe, expect, it } from 'vitest';
import { PdfWriter, jpegInfo } from '../common/pdf.js';
import { classOf, DEFAULT_BANDS, distinctionCount, normalise, overlaps } from './exam-ops.logic.js';

const rows = [
  { studentId: 'a', marks: 32 },
  { studentId: 'b', marks: 20 },
  { studentId: 'c', marks: 40 },
];

describe('normalise', () => {
  it('scales and caps at the maximum, returning only the marks that change', () => {
    const out = normalise('scale', 1.1, 40, rows);
    expect(out.map((c) => [c.studentId, c.after])).toEqual([['a', 35.2], ['b', 22]]);
  });
  it('adds a flat amount, never below zero or above the maximum', () => {
    expect(normalise('add', 5, 40, rows).map((c) => c.after)).toEqual([37, 25]);
    expect(normalise('add', -25, 40, rows).map((c) => c.after)).toEqual([7, 0, 15]);
  });
  it('shifts the class so its average becomes the target', () => {
    const out = normalise('target_mean', 36, 40, [{ studentId: 'a', marks: 20 }, { studentId: 'b', marks: 30 }]);
    expect(out.map((c) => c.after)).toEqual([31, 40]);
  });
  it('does nothing for an empty class', () => {
    expect(normalise('scale', 2, 40, [])).toEqual([]);
  });
});

describe('result classes', () => {
  it('picks the highest band reached, and fails a student who failed a subject', () => {
    expect(classOf(DEFAULT_BANDS, 80.2, true)).toBe('Distinction');
    expect(classOf(DEFAULT_BANDS, 75, true)).toBe('Distinction');
    expect(classOf(DEFAULT_BANDS, 61, true)).toBe('First class');
    expect(classOf(DEFAULT_BANDS, 41, true)).toBe('Pass class');
    expect(classOf(DEFAULT_BANDS, 38, true)).toBe('Pass');
    expect(classOf(DEFAULT_BANDS, 90, false)).toBe('Fail');
  });
  it('counts subject distinctions against the top band', () => {
    expect(distinctionCount(DEFAULT_BANDS, [80, 74, 91])).toBe(2);
    expect(distinctionCount([], [80])).toBe(0);
  });
});

it('treats back-to-back sittings as not overlapping', () => {
  expect(overlaps('10:00', '12:00', '12:00', '13:00')).toBe(false);
  expect(overlaps('10:00', '12:00', '11:59', '13:00')).toBe(true);
});

describe('PDF photo', () => {
  // A 1x1 baseline JPEG header is enough: the writer reads the frame size and embeds the bytes untouched.
  const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffc0000b080001000101011100ffd9', 'hex');
  it('reads the size of a JPEG and refuses anything else', () => {
    expect(jpegInfo(jpeg)).toEqual({ w: 1, h: 1, comps: 1 });
    expect(jpegInfo(Buffer.from('%PDF-1.4'))).toBeNull();
  });
  it('embeds the photo as an image object the page can draw', () => {
    const pdf = new PdfWriter();
    expect(pdf.image(jpeg, { x: 400, width: 70, height: 85 })).toBe(true);
    expect(pdf.image(Buffer.from('nope'), { width: 10, height: 10 })).toBe(false);
    pdf.text('Hall ticket');
    const text = pdf.build().toString('latin1');
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('/Filter /DCTDecode');
    expect(text).toMatch(/\/XObject << \/Im1 \d+ 0 R >>/);
    expect(text).toContain('/Im1 Do');
  });
});
