import { describe, expect, it } from 'vitest';
import { MESSAGES } from '@/i18n/messages';
import { claimSubject, doiFallback, RESEARCH_LISTS } from './research-pass';

const ID = '5f456d0d-d09e-468b-b727-79da0072083d';

describe('research pass forms', () => {
  it('turns the claim choice into the publication or patent the API takes', () => {
    expect(claimSubject(`publication:${ID}`)).toEqual({ publicationId: ID });
    expect(claimSubject(`patent:${ID}`)).toEqual({ patentId: ID });
    expect(claimSubject('patent:not-an-id')).toBeNull();
    expect(claimSubject('')).toBeNull();
  });

  it('sends typed-in DOI details only when title, venue and a real year are all there', () => {
    expect(doiFallback({ title: ' Village credit ', venue: 'Economic Notes', year: '2026' })).toEqual({ title: 'Village credit', venue: 'Economic Notes', year: 2026, kind: 'journal' });
    expect(doiFallback({ title: 'Village credit', venue: '', year: '2026' })).toBeUndefined();
    expect(doiFallback({ title: 'Village credit', venue: 'X', year: '26' })).toBeUndefined();
    expect(doiFallback({})).toBeUndefined();
  });

  it('names every register in English, Hindi and Kannada, with the new lists in their views', () => {
    const all = Object.values(RESEARCH_LISTS).flat();
    for (const e of ['research-profiles', 'research-centres', 'grant-heads', 'grant-releases', 'research-incentive-schemes', 'research-incentive-claims', 'scholar-progress-reports']) expect(all).toContain(e);
    expect(new Set(all).size).toBe(all.length);
    for (const loc of ['en', 'hi', 'kn'] as const) {
      for (const e of all) expect(MESSAGES[loc][`rk.entity.${e}` as keyof (typeof MESSAGES)['en']], `${loc} ${e}`).toBeTruthy();
      for (const k of ['rsp.nirf.pu', 'rsp.nba.title', 'rsp.aishe.title', 'rsp.gs.uc', 'rsp.level.level_0', 'rsp.engine.urkund']) expect(MESSAGES[loc][k as keyof (typeof MESSAGES)['en']], `${loc} ${k}`).toBeTruthy();
    }
    // Hindi and Kannada are translations, not copies.
    expect(MESSAGES.hi['rsp.gs.noReleases']).not.toBe(MESSAGES.en['rsp.gs.noReleases']);
    expect(MESSAGES.kn['rk.o.grant-heads.head.equipment']).not.toBe(MESSAGES.en['rk.o.grant-heads.head.equipment']);
  });
});
