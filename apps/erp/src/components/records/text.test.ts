import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/i18n/messages';
import { createT } from '@/i18n/translate';
import { actionText, humanVerb } from './text';

const en = createT('en', MESSAGES.en);
const hi = createT('hi', MESSAGES.hi);
const kn = createT('kn', MESSAGES.kn);

/** Every `.ts` file under a folder. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('record history action words', () => {
  it('words the generic verbs in every language', () => {
    for (const a of ['attendance_leave.approved', 'library_loan.returned', 'passport.revoked', 'library.issued', 'grievance.escalated', 'fee_hold.overridden', 'fee_hold.override_revoked', 'certificate.issued.v1']) {
      expect(actionText(en, a), a).not.toContain('.');
      expect(actionText(hi, a), a).toMatch(/[ऀ-ॿ]/);
      expect(actionText(kn, a), a).toMatch(/[ಀ-೿]/);
    }
    expect(actionText(en, 'library_loan.returned')).toBe('Returned');
    expect(actionText(hi, 'attendance_leave.approved')).toBe(MESSAGES.hi['rk.verb.approved']);
  });

  it('reads a bulk module action as "In bulk" and its verb', () => {
    expect(actionText(en, 'library_book.bulk_update')).toBe('Edited in bulk');
    expect(actionText(en, 'library_book.bulk_issued')).toBe('In bulk: Issued');
    expect(actionText(kn, 'library_book.bulk_assign_call_numbers')).toBe('ಒಟ್ಟಾಗಿ: Assign call numbers');
  });

  it('falls back to plain English for a verb it has no words for, never the raw action', () => {
    expect(humanVerb('offer_letter_sent')).toBe('Offer letter sent');
    expect(actionText(hi, 'x.some_new_thing')).toBe('Some new thing');
  });

  it('has words for every literal action the record lists audit', () => {
    const api = join(__dirname, '../../../../../services/api/src');
    const missing = new Set<string>();
    for (const f of files(api)) {
      const src = readFileSync(f, 'utf8');
      if (!/\.records\.ts$/.test(f) && !src.includes('registry.register(')) continue;
      for (const m of src.matchAll(/action:\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'/g)) {
        const verb = m[1].replace(/\.v\d+$/, '').split('.').pop()!;
        if (!(`rk.verb.${verb}` in MESSAGES.en)) missing.add(`${verb} (${m[1]})`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
