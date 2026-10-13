import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/i18n/messages';
import { DECISIONS, MOVES, QH_ENTITIES, QH_MODULES, REPORT_IDS, camel, fieldKey, reportKey, statusKey, statusTone } from './quality-hub';

const en = MESSAGES.en as Record<string, string>;

describe('quality hub', () => {
  it('names every module, record type, report, move and status it can show', () => {
    for (const m of QH_MODULES) expect(en[`qh.mod.${m}`], m).toBeTruthy();
    for (const e of QH_ENTITIES) expect(en[`qh.e.${e}`], e).toBeTruthy();
    for (const r of REPORT_IDS) {
      expect(en[reportKey(r)], r).toBeTruthy();
      expect(en[`${reportKey(r)}.d`], r).toBeTruthy();
    }
    for (const [ent, byStatus] of Object.entries(MOVES)) {
      for (const [status, moves] of Object.entries(byStatus ?? {})) {
        expect(en[statusKey(status)], `${ent} ${status}`).toBeTruthy();
        for (const m of moves) expect(en[`qh.move.${m.key}`], m.key).toBeTruthy();
      }
    }
    for (const statuses of Object.values(DECISIONS)) for (const s of statuses ?? []) expect(en[statusKey(s)]).toBeTruthy();
  });

  it('maps API column keys to dictionary keys and statuses to tones', () => {
    expect(camel('ctc_lpa')).toBe('ctcLpa');
    expect(fieldKey('within_sla')).toBe('qh.f.withinSla');
    expect(en[fieldKey('within_sla')]).toBe('Within deadline');
    expect(statusTone('rejected')).toBe('danger');
    expect(statusTone('granted')).toBe('success');
    expect(statusTone('something-new')).toBe('neutral');
  });
});
