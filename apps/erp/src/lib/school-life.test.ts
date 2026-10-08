import { describe, expect, it } from 'vitest';
import { formatContacts, parseContacts, splitList } from './school-life';

describe('school life helpers', () => {
  it('splits comma and line separated lists and drops blanks', () => {
    expect(splitList('Peanuts, Penicillin,, ')).toEqual(['Peanuts', 'Penicillin']);
    expect(splitList(undefined)).toEqual([]);
  });

  it('reads one emergency contact per line and reports the first bad line', () => {
    expect(parseContacts('Ravi, father, 9876543210\n\nSita, mother, 9123456780')).toEqual({ ok: true, value: [{ name: 'Ravi', relation: 'father', phone: '9876543210' }, { name: 'Sita', relation: 'mother', phone: '9123456780' }] });
    expect(parseContacts('Ravi, father, 9876543210\nSita, mother')).toEqual({ ok: false, line: 2 });
  });

  it('writes contacts back in the same format', () => {
    const text = 'Ravi, father, 9876543210';
    const parsed = parseContacts(text);
    expect(parsed.ok && formatContacts(parsed.value)).toBe(text);
  });
});
