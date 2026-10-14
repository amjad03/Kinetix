import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/i18n/messages';
import { fyOf, KIT_OF, nextFy, receiptState, rupeesInput, SETUP_TABS, shortfall } from './fee-depth';
import { ENTITIES, LISTS, REPORTS } from './fee-desk';

const en = MESSAGES.en as Record<string, string>;

describe('fee depth helpers', () => {
  it('reads rupees typed at the counter, with or without the sign and commas', () => {
    expect(rupeesInput('2,500')).toBe(250000);
    expect(rupeesInput('₹ 2500.5')).toBe(250050);
    expect(rupeesInput('12.345')).toBeNull();
    expect(rupeesInput('abc')).toBeNull();
  });

  it('says what is left to give across the modes', () => {
    expect(shortfall(10000, [{ amountPaise: 6000 }, { amountPaise: Number.NaN }])).toBe(4000);
    expect(shortfall(10000, [{ amountPaise: 6000 }, { amountPaise: 5000 }])).toBe(-1000);
  });

  it('lets an active receipt be cancelled and a cancelled one be reissued once', () => {
    expect(receiptState({ status: 'active', reissuedAs: null })).toEqual({ canCancel: true, canReissue: false, taken: false });
    expect(receiptState({ status: 'cancelled', reissuedAs: null })).toMatchObject({ canCancel: false, canReissue: true, taken: true });
    expect(receiptState({ status: 'cancelled', reissuedAs: { id: 'x', receiptNo: 'R/2' } })).toMatchObject({ canReissue: false });
    expect(receiptState({ status: 'bounced', reissuedAs: null })).toMatchObject({ canCancel: false, canReissue: false, taken: true });
  });

  it('works out the financial year (April to March) and the next one', () => {
    expect(fyOf('2026-03-31')).toBe('2025-26');
    expect(fyOf('2026-04-01')).toBe('2026-27');
    expect(nextFy('2026-27')).toBe('2027-28');
    expect(nextFy('2099-00')).toBe('2100-01');
  });
});

describe('fee and accounts wording', () => {
  it('names every desk list, its columns and statuses, and every report', () => {
    for (const e of ENTITIES) {
      expect(en[`fd.nav.${e}`], e).toBeTruthy();
      expect(en[`fd.sub.${e}`], e).toBeTruthy();
      expect(en[`fd.one.${e}`], e).toBeTruthy();
      for (const c of LISTS[e].columns) expect(en[c.label], `${e} ${c.label}`).toBeTruthy();
      for (const s of LISTS[e].statuses ?? []) expect(en[`fd.st.${s}`], `${e} ${s}`).toBeTruthy();
    }
    for (const r of REPORTS) {
      expect(en[`fd.rep.${r.key}`], r.key).toBeTruthy();
      expect(en[`fd.rep.${r.key}.sub`], r.key).toBeTruthy();
      for (const c of r.columns) expect(en[c.label], `${r.key} ${c.label}`).toBeTruthy();
      for (const [, label] of r.totals) expect(en[label], `${r.key} ${label}`).toBeTruthy();
    }
  });

  it('names every record-kit list behind the desk and the setup tabs', () => {
    for (const kit of [...Object.values(KIT_OF), 'fee-heads', 'fee-concession-types', 'fee-instalment-plans', 'fee-profiles']) {
      expect(en[`rk.entity.${kit}`], kit).toBeTruthy();
      expect(en[`rk.one.${kit}`], kit).toBeTruthy();
    }
    for (const tab of [...SETUP_TABS, 'fines']) {
      expect(en[`fx.setup.${tab}`], tab).toBeTruthy();
      expect(en[`fx.setup.${tab}.sub`], tab).toBeTruthy();
    }
  });
});
