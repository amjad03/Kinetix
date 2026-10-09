import { describe, expect, it } from 'vitest';
import { buildBody, deskPathAllowed, fillPath, getPath, parseBlocks, parseItems, parsePairs, parsePeriods, parseRubric, type DeskField } from './g1-desk';

const f = (name: string, to?: DeskField['to'], extra: Partial<DeskField> = {}): DeskField => ({ name, label: 'ops.f.name', to, ...extra });

describe('reading what was typed', () => {
  it('turns lines into the shapes the API wants', () => {
    expect(parsePairs('nav.classes=Sections\nnav.syllabus = Subjects')).toEqual({ 'nav.classes': 'Sections', 'nav.syllabus': 'Subjects' });
    expect(parsePairs('no equals sign')).toBeNull();
    expect(parseItems('Tuition, 40000\nLab fee, 5000.50')).toEqual([{ head: 'Tuition', amountPaise: 4_000_000 }, { head: 'Lab fee', amountPaise: 500_050 }]);
    expect(parseItems('Tuition')).toBeNull();
    expect(parseItems('Tuition, free')).toBeNull();
    expect(parseRubric('Method | Full=4 ; Partial=2 ; None=0\nAccuracy | Full=3 ; None=0')).toEqual([
      { name: 'Method', levels: [{ label: 'Full', points: 4, descriptor: '' }, { label: 'Partial', points: 2, descriptor: '' }, { label: 'None', points: 0, descriptor: '' }] },
      { name: 'Accuracy', levels: [{ label: 'Full', points: 3, descriptor: '' }, { label: 'None', points: 0, descriptor: '' }] },
    ]);
    expect(parseRubric('One level | Only=1')).toBeNull();
    expect(parsePeriods('9:00-09:45\n09:45 - 10:30')).toEqual([{ startsAt: '09:00', endsAt: '09:45' }, { startsAt: '09:45', endsAt: '10:30' }]);
    expect(parsePeriods('morning')).toBeNull();
    expect(parseBlocks('NAAC accredited | Grade A\nHostel | Boys and girls')).toEqual([{ title: 'NAAC accredited', text: 'Grade A' }, { title: 'Hostel', text: 'Boys and girls' }]);
    expect(parseBlocks('Title only')).toBeNull();
  });
});

describe('request bodies', () => {
  it('types each value, nests dotted names and leaves blank boxes out', () => {
    const fields = [f('name'), f('thresholdPct', 'int'), f('aiPolicy.enabled', 'bool'), f('aiPolicy.requireTeacherReview', 'bool'), f('languages', 'list'), f('lockHours', 'int'), f('note')];
    const out = buildBody(fields, { name: ' Main ', thresholdPct: '85', 'aiPolicy.enabled': 'yes', 'aiPolicy.requireTeacherReview': 'no', languages: 'en, kn', lockHours: '', note: '' }, { apply: true });
    expect(out).toEqual({ body: { apply: true, name: 'Main', thresholdPct: 85, aiPolicy: { enabled: true, requireTeacherReview: false }, languages: ['en', 'kn'] } });
  });
  it('names the field it could not read', () => {
    expect('bad' in buildBody([f('n', 'int')], { n: '8.5' })).toBe(true);
    const r = buildBody([f('ok'), f('rubric', 'rubric')], { ok: 'x', rubric: 'broken' });
    expect('bad' in r && r.bad.name).toBe('rubric');
    expect(buildBody([f('x', 'rupeesToPaise')], { x: '12.5' })).toEqual({ body: { x: 1250 } });
  });
  it('sends null for a cleared box when the field allows it', () => {
    expect(buildBody([f('lockHours', 'int', { clearable: true })], { lockHours: '' })).toEqual({ body: { lockHours: null } });
  });
  it('reads a nested value back', () => {
    expect(getPath({ a: { b: 3 } }, 'a.b')).toBe(3);
    expect(getPath({ a: null }, 'a.b')).toBeUndefined();
  });
});

describe('paths', () => {
  it('fills placeholders from the row, then the filters, and encodes them', () => {
    expect(fillPath('/v1/x/{programId}/y/{sectionId}', { programId: 'p 1' }, { sectionId: 's2' })).toBe('/v1/x/p%201/y/s2');
    expect(fillPath('/v1/x/{missing}', {}, {})).toBe('/v1/x/{missing}');
  });
  it('lets the generic action reach only the areas these desks own', () => {
    expect(deskPathAllowed('/v1/scheduling/term-presets')).toBe(true);
    expect(deskPathAllowed('/v1/admin/institution/presets/nursery/apply')).toBe(true);
    expect(deskPathAllowed('/v1/auth/login')).toBe(false);
    expect(deskPathAllowed('/v1/scheduling/../auth/login')).toBe(false);
    expect(deskPathAllowed('https://evil.example/v1/scheduling/x')).toBe(false);
    expect(deskPathAllowed('/v1/fees/invoices')).toBe(false);
  });
});
