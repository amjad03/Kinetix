import { deflateRawSync, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Pdf } from '../common/pdf-doc.js';
import { diffContent, parseSyllabusText } from './curriculum-logic.js';
import { degreeCode, parseDegreeCode } from './university.controller.js';
import { extractSyllabusText, UnsupportedSyllabusFile } from './syllabus-text.js';

export const SYLLABUS = [
  'Semester 3',
  'BCOM-301: Corporate Accounting (4 credits)',
  'Unit 1: Share Capital (10 hours)',
  'Issue of shares; Forfeiture; Reissue',
  'Unit 2: Debentures',
  'Issue and redemption of debentures',
  'CO1: Explain the accounting treatment of share capital',
  'CO2: Apply debenture redemption methods',
  'BCOM-302: Business Statistics',
  'Credits: 3',
  'Unit I: Measures of Central Tendency',
  'Mean; Median; Mode',
];

/** A tiny zip with one deflated entry, enough for the reader (the CRC is not checked). */
export function zipOf(name: string, data: Buffer): Buffer {
  const body = deflateRawSync(data);
  const nm = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nm.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nm.length, 28);
  central.writeUInt32LE(0, 42);
  const cd = Buffer.concat([central, nm]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(30 + nm.length + body.length, 16);
  return Buffer.concat([local, nm, body, cd, eocd]);
}

export const docxOf = (lines: string[]) =>
  zipOf('word/document.xml', Buffer.from(`<?xml version="1.0"?><w:document><w:body>${lines.map((l) => `<w:p><w:r><w:t>${l.replace(/&/g, '&amp;')}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`));

export function pdfOf(lines: string[]): Buffer {
  const pdf = new Pdf('Syllabus').addPage();
  lines.forEach((l, i) => pdf.text(l, 40, 40 + i * 14, { size: 10 }));
  return pdf.build();
}

describe('syllabus text extraction', () => {
  it('reads a plain PDF, a compressed PDF and a Word file', () => {
    expect(extractSyllabusText(pdfOf(SYLLABUS)).text).toContain('BCOM-301: Corporate Accounting (4 credits)');
    const stream = deflateSync(Buffer.from('BT /F1 10 Tf 40 700 Td (Hello syllabus) Tj ET BT 40 680 Td [(Unit ) -300 (One)] TJ ET'));
    const flate = Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream\nendobj\n%%EOF')]);
    const got = extractSyllabusText(flate);
    expect(got.kind).toBe('pdf');
    expect(got.text).toContain('Hello syllabus');
    expect(got.text).toContain('Unit  One');
    const doc = extractSyllabusText(docxOf(['Semester 3', 'Tom & Jerry']));
    expect(doc).toEqual({ kind: 'docx', text: 'Semester 3\nTom & Jerry\n' });
  });

  it('rejects other file types', () => {
    expect(() => extractSyllabusText(Buffer.from('plain text file'))).toThrow(UnsupportedSyllabusFile);
  });
});

describe('syllabus parsing and diff', () => {
  const content = parseSyllabusText(SYLLABUS.join('\n'));

  it('finds subjects, units, topics and outcomes', () => {
    expect(content.subjects.map((s) => [s.code, s.term, s.credits])).toEqual([['BCOM-301', 3, 4], ['BCOM-302', 3, 3]]);
    const [a, b] = content.subjects;
    expect(a.name).toBe('Corporate Accounting');
    expect(a.units.map((u) => [u.title, u.hours, u.topics])).toEqual([['Share Capital', 10, ['Issue of shares', 'Forfeiture', 'Reissue']], ['Debentures', 0, ['Issue and redemption of debentures']]]);
    expect(a.cos.map((c) => c.code)).toEqual(['CO1', 'CO2']);
    expect(a.hours).toBe(10);
    expect(b.units[0]).toMatchObject({ title: 'Measures of Central Tendency', topics: ['Mean', 'Median', 'Mode'] });
  });

  it('reports what changed between two versions', () => {
    const next = structuredClone(content);
    next.subjects[0].credits = 5;
    next.subjects[0].units[1].topics.push('Sinking fund');
    next.subjects[0].cos[1].statement = 'Apply debenture redemption methods with a sinking fund';
    next.subjects.pop();
    next.subjects.push({ code: 'BCOM-303', name: 'Auditing', term: 3, credits: 3, hours: 0, units: [], cos: [] });
    const d = diffContent(content, next);
    expect(d.added.map((s) => s.code)).toEqual(['BCOM-303']);
    expect(d.removed.map((s) => s.code)).toEqual(['BCOM-302']);
    expect(d.changed).toEqual([{ code: 'BCOM-301', name: 'Corporate Accounting', changes: ['Credits 4 to 5', 'Unit "Debentures" topics changed (1 added, 0 removed)', 'CO2 reworded'] }]);
    expect(diffContent(content, content)).toMatchObject({ added: [], removed: [], changed: [], unchanged: 2 });
  });
});

describe('degree codes', () => {
  it('sign the certificate number', () => {
    const code = degreeCode('s', 't1', 'DEG-2026-0001');
    expect(parseDegreeCode('s', 't1', code)).toBe('DEG-2026-0001');
    expect(parseDegreeCode('s', 't2', code)).toBeNull();
    expect(parseDegreeCode('s', 't1', code.replace('0001', '0002'))).toBeNull();
  });
});
