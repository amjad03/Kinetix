import { describe, expect, it } from 'vitest';
import { parseCredits, parseIdList, parseIntList } from './course-registration';

describe('course registration form parsers', () => {
  it('reads credits as whole or one-decimal numbers', () => {
    expect(parseCredits('4')).toBe(4);
    expect(parseCredits(' 1.5 ')).toBe(1.5);
    expect(parseCredits('x')).toBeNull();
    expect(parseCredits('1.55')).toBeNull();
  });

  it('reads comma lists of semesters', () => {
    expect(parseIntList('')).toEqual([]);
    expect(parseIntList('3, 4,5')).toEqual([3, 4, 5]);
    expect(parseIntList('3;4')).toBeNull();
  });

  it('splits id lists on commas and spaces', () => {
    expect(parseIdList('a, b  c')).toEqual(['a', 'b', 'c']);
    expect(parseIdList('')).toEqual([]);
  });
});
