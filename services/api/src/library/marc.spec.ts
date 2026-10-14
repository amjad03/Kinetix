import { describe, expect, it } from 'vitest';
import { callNumber, marcToBook, normaliseIsbn, parseIso2709, parseMarc, parseMarcXml, writeIso2709 } from './marc.js';

describe('ISBNs', () => {
  it('checks the digit and turns ISBN-10 into ISBN-13', () => {
    expect(normaliseIsbn('0-306-40615-2')).toBe('9780306406157');
    expect(normaliseIsbn('978-0-306-40615-7')).toBe('9780306406157');
    expect(normaliseIsbn('9780306406158')).toBeNull();
    expect(normaliseIsbn('0306406153')).toBeNull();
    expect(normaliseIsbn('080442957X')).toBe('9780804429573');
    expect(normaliseIsbn('abc')).toBeNull();
  });

  it('makes a call number from the DDC number and the surname', () => {
    expect(callNumber('657.95', 'Maheshwari, S. N.')).toBe('657.95 MAH');
    expect(callNumber('658', 'S. N. Gupta')).toBe('658 GUP');
    expect(callNumber('', 'Kapoor')).toBe('KAP');
  });
});

describe('MARC21', () => {
  const record = writeIso2709([
    { tag: '001', value: 'b1' },
    { tag: '008', value: '230101s2023    ii            000 0 eng d' },
    { tag: '020', value: '$a 9780306406157 (pbk.)' },
    { tag: '082', value: '$a 657/.95' },
    { tag: '100', value: '$a Maheshwari, S. N.' },
    { tag: '245', value: '$a Corporate accounting : $b with Indian AS /' },
    { tag: '250', value: '$a 7th ed.' },
    { tag: '264', value: '$b Vikas, $c 2023.' },
    { tag: '300', value: '$a 812 p. ;' },
    { tag: '650', value: '$a Corporations $x Accounting.' },
    { tag: '650', value: '$a Accounting standards' },
  ]);

  it('reads an ISO 2709 file back, Indian scripts included', () => {
    const two = Buffer.concat([record, writeIso2709([{ tag: '245', value: '$a लेखांकन के सिद्धांत' }])]);
    const recs = parseIso2709(two);
    expect(recs).toHaveLength(2);
    expect(recs[0]['245']).toEqual(['$a Corporate accounting : $b with Indian AS /']);
    expect(recs[1]['245']).toEqual(['$a लेखांकन के सिद्धांत']);
  });

  it('maps a bibliographic record to catalogue fields', () => {
    const b = marcToBook(parseMarc(record)[0]);
    expect(b).toEqual({ title: 'Corporate accounting: with Indian AS', author: 'Maheshwari, S. N.', isbn: '9780306406157', publisher: 'Vikas', edition: '7th ed', pubYear: 2023, ddc: '657.95', callNo: '657.95 MAH', subject: 'Corporations', keywords: 'Corporations, Accounting standards', pages: 812, language: 'eng' });
  });

  it('reads MARCXML with or without the marc: prefix', () => {
    const xml = `<?xml version="1.0"?><marc:collection xmlns:marc="http://www.loc.gov/MARC21/slim"><marc:record><marc:leader>00000nam a2200000 a 4500</marc:leader>
      <marc:datafield tag="245" ind1="1" ind2="0"><marc:subfield code="a">Business law &amp; ethics</marc:subfield></marc:datafield>
      <marc:datafield tag="100" ind1="1" ind2=" "><marc:subfield code="a">Kapoor, N. D.</marc:subfield></marc:datafield>
      <marc:datafield tag="020" ind1=" " ind2=" "><marc:subfield code="a">0306406152</marc:subfield></marc:datafield></marc:record></marc:collection>`;
    const recs = parseMarcXml(xml);
    expect(recs).toHaveLength(1);
    expect(marcToBook(recs[0])).toMatchObject({ title: 'Business law & ethics', author: 'Kapoor, N. D.', isbn: '9780306406157' });
    expect(parseMarc(Buffer.from(xml))).toHaveLength(1);
  });

  it('skips junk', () => {
    expect(parseIso2709(Buffer.from('not a marc file at all, really not'))).toEqual([]);
  });
});
