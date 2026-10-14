import { describe, expect, it } from 'vitest';
import { aadhaarHash, aadhaarValid, ageBand, ageOn, allowedBy, cleanValue, maskAadhaar, planRebalance, planRollNumbers, PROFILE_FIELDS } from './student-info.logic.js';

const s = (id: string, fullName: string, gender: string | null, extra: object = {}) => ({ id, fullName, rollNo: id, gender, enrolledOn: null, admissionNo: null, sectionId: 'x', ...extra });

describe('Aadhaar', () => {
  it('checks the Verhoeff digit and the first digit', () => {
    expect(aadhaarValid('2345 6789 0124')).toBe(true);
    expect(aadhaarValid('2345 6789 0123')).toBe(false);
    expect(aadhaarValid('1234 5678 9012')).toBe(false);
    expect(aadhaarValid('23456789')).toBe(false);
  });

  it('shows only the last four digits and fingerprints per institution', () => {
    expect(maskAadhaar('0124')).toBe('XXXX XXXX 0124');
    expect(maskAadhaar(null)).toBeNull();
    expect(aadhaarHash('t1', '2345 6789 0124')).toBe(aadhaarHash('t1', '234567890124'));
    expect(aadhaarHash('t1', '234567890124')).not.toBe(aadhaarHash('t2', '234567890124'));
  });
});

describe('profile values', () => {
  it('cleans and checks each kind of value', () => {
    expect(cleanValue(PROFILE_FIELDS.gender, 'Female')).toBe('female');
    expect(() => cleanValue(PROFILE_FIELDS.gender, 'x')).toThrow('Choose one of');
    expect(cleanValue(PROFILE_FIELDS.pincode, ' 570001 ')).toBe('570001');
    expect(() => cleanValue(PROFILE_FIELDS.pincode, '5700')).toThrow('PIN code');
    expect(cleanValue(PROFILE_FIELDS.isMinority, 'yes')).toBe(true);
    expect(cleanValue(PROFILE_FIELDS.dateOfBirth, '')).toBeNull();
    expect(() => cleanValue({ ...PROFILE_FIELDS.dateOfBirth, required: true }, '')).toThrow('required');
    expect(() => cleanValue(PROFILE_FIELDS.dateOfBirth, '15/06/2008')).toThrow('Use a date');
    expect(cleanValue({ kind: 'number' }, '7')).toBe(7);
  });

  it('lets an empty role list through and otherwise needs one of its roles', () => {
    expect(allowedBy([], ['teacher'])).toBe(true);
    expect(allowedBy(['principal'], ['teacher'])).toBe(false);
    expect(allowedBy(['principal'], ['teacher', 'principal'])).toBe(true);
  });
});

describe('ages', () => {
  it('counts whole years and bands them', () => {
    expect(ageOn('2008-10-15', '2026-10-14')).toBe(17);
    expect(ageOn('2008-10-14', '2026-10-14')).toBe(18);
    expect(ageBand(17)).toBe('15-17');
    expect(ageBand(4)).toBe('Under 6');
    expect(ageBand(30)).toBe('26 and over');
  });
});

describe('roll numbers and sections', () => {
  const rows = [s('1', 'Ravi', 'male'), s('2', 'Asha', 'female'), s('3', 'Zoya', 'female'), s('4', 'Babu', null)];

  it('numbers in name order, or girls first, with a prefix and padding', () => {
    expect(planRollNumbers(rows, { order: 'alphabetic', prefix: 'A', start: 1, width: 2 }).map((x) => `${x.to}:${x.fullName}`)).toEqual(['A01:Asha', 'A02:Babu', 'A03:Ravi', 'A04:Zoya']);
    expect(planRollNumbers(rows, { order: 'gender', prefix: '', start: 101, width: 3 }).map((x) => `${x.to}:${x.fullName}`)).toEqual(['101:Asha', '102:Zoya', '103:Ravi', '104:Babu']);
    expect(planRollNumbers(rows, { order: 'gender', prefix: '', start: 1, width: 1, girlsFirst: false }).map((x) => x.fullName)).toEqual(['Ravi', 'Asha', 'Zoya', 'Babu']);
  });

  it('shares students out in blocks or a balanced mix, leaving those already in place', () => {
    const inX = rows.map((r) => ({ ...r, sectionId: 'x' }));
    const blocks = planRebalance(inX, ['x', 'y'], 'alphabetic');
    expect(blocks.map((m) => `${m.fullName}->${m.to}`)).toEqual(['Ravi->y', 'Zoya->y']);
    const mixed = planRebalance(inX, ['x', 'y'], 'balanced');
    expect(mixed.map((m) => m.fullName).sort()).toEqual(['Asha', 'Ravi']);
    expect(planRebalance(inX, ['x'], 'balanced')).toEqual([]);
  });
});
