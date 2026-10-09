import { describe, expect, it } from 'vitest';
import { readScan } from './scan';

describe('readScan', () => {
  it('reads an asset label', () => expect(readScan(' kinetix://asset/LAB-0042 ')).toEqual({ kind: 'asset', code: 'LAB-0042' }));
  it('treats other codes as books', () => expect(readScan('9788175257665')).toEqual({ kind: 'book', code: '9788175257665' }));
  it('ignores blanks', () => expect(readScan('   ').kind).toBe('none'));
});
