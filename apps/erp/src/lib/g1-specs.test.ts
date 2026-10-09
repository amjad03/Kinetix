import { describe, expect, it } from 'vitest';
import { MESSAGES, type MessageKey } from '@/i18n/messages';
import { canSee } from './access';
import { deskPathAllowed, fillPath } from './g1-desk';
import { DESKS } from './g1-specs';
import { visibleGroups } from './nav';
import { inWorkspace, WORKSPACES, WORKSPACE_SECTIONS } from './workspaces';

const known = (k: string) => k in MESSAGES.en;

describe('tabbed desks', () => {
  it('only use words the dictionary has, in all three languages', () => {
    const missing: string[] = [];
    const need = (k: string | undefined) => {
      if (k && !known(k)) missing.push(k);
    };
    for (const d of Object.values(DESKS)) {
      need(d.title);
      need(d.subtitle);
      for (const f of d.filters) {
        need(f.label);
        for (const o of f.options ?? []) need(o.label);
      }
      for (const t of d.tabs) {
        need(t.label);
        need(t.empty);
        need(t.hint);
        for (const c of t.columns) need(c.label);
        for (const a of t.actions) {
          need(a.label);
          need(a.confirm);
          for (const f of a.fields) {
            need(f.label);
            for (const o of f.options ?? []) need(o.label);
          }
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
    for (const l of ['hi', 'kn'] as const) for (const k of Object.keys(MESSAGES.en).filter((x) => x.startsWith('g1.'))) expect(MESSAGES[l][k as MessageKey], `${l} ${k}`).toBeTruthy();
  });

  it('call only paths the generic action may reach, and every placeholder has a source', () => {
    for (const d of Object.values(DESKS)) {
      const filters = Object.fromEntries(d.filters.map((f) => [f.param, 'x']));
      for (const t of d.tabs) {
        if (t.load) expect(fillPath(t.load, null, filters), `${d.id}/${t.id} load`).not.toContain('{');
        for (const a of t.actions) {
          const fieldNames = Object.fromEntries(a.fields.map((f) => [f.name, 'x']));
          const filled = fillPath(a.path, { id: 'x', key: 'x', programId: 'x', campusId: 'x', subjectId: 'x' }, filters, fieldNames);
          expect(filled, `${d.id}/${t.id}/${a.id}`).not.toContain('{');
          expect(deskPathAllowed(filled), `${d.id}/${t.id}/${a.id} ${filled}`).toBe(true);
        }
        for (const need of t.needs ?? []) expect(d.filters.map((f) => f.param), `${d.id}/${t.id}`).toContain(need);
      }
    }
  });

  it('are reachable from the menu by the roles that may use them', () => {
    const hrefs = (roles: string[]) => visibleGroups(roles).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs(['principal'])).toEqual(expect.arrayContaining(['/institution-setup', '/scheduling', '/admissions-tools', '/learning-support', '/assessment-tools']));
    expect(hrefs(['admissions_officer'])).toContain('/admissions-tools');
    expect(hrefs(['admissions_officer'])).not.toContain('/institution-setup');
    expect(hrefs(['teacher'])).not.toContain('/learning-support');
    expect(canSee(['university_admin'], 'institutionSetup')).toBe(true);
    expect(canSee(['exam_controller'], 'assessmentTools')).toBe(true);
    expect(canSee(['accountant'], 'scheduling')).toBe(false);
  });
});

describe('workspaces', () => {
  it('list every page in "all" and a smaller set in each console', () => {
    for (const w of WORKSPACES) expect(inWorkspace('dashboard', w)).toBe(true);
    expect(inWorkspace('fees', 'all')).toBe(true);
    expect(inWorkspace('fees', 'finance_ops')).toBe(true);
    expect(inWorkspace('fees', 'quality')).toBe(false);
    expect(inWorkspace('obe', 'quality')).toBe(true);
    expect(inWorkspace('obe', 'finance_ops')).toBe(false);
    expect(inWorkspace('ai', 'ai')).toBe(true);
    expect(Object.keys(WORKSPACE_SECTIONS)).toEqual(['academic', 'finance_ops', 'quality', 'content', 'ai']);
  });
  it('narrow the menu but never beyond what the role may open', () => {
    const all = visibleGroups(['principal'], false, [], 'all').flatMap((g) => g.items.map((i) => i.href));
    const fin = visibleGroups(['principal'], false, [], 'finance_ops').flatMap((g) => g.items.map((i) => i.href));
    expect(fin.length).toBeLessThan(all.length);
    expect(fin).toEqual(expect.arrayContaining(['/', '/fees', '/payroll']));
    expect(fin).not.toContain('/obe');
    expect(visibleGroups(['accountant'], false, [], 'quality').flatMap((g) => g.items.map((i) => i.href))).not.toContain('/fees');
  });
});
