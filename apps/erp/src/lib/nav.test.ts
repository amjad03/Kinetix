import { describe, expect, it } from 'vitest';
import { SECTION_ROLES } from './access';
import { crumbsFor, findNav, NAV_GROUPS, visibleGroups } from './nav';

const hrefs = (roles: string[], platform = false) => visibleGroups(roles as never, platform).flatMap((g) => g.items.map((i) => i.href));

describe('navigation groups', () => {
  it('shows a role only the pages access.ts lets it open', () => {
    expect([...hrefs(['accountant'])].sort()).toEqual(['/', '/budgets', '/calendar', '/documents', '/fees', '/gl-export', '/payroll', '/payroll/payslips', '/reports', '/scholarships', '/students'].sort());
    expect(hrefs(['accountant'])).not.toContain('/settings');
    expect([...hrefs(['librarian'])].sort()).toEqual(['/calendar', '/library', '/payroll/payslips'].sort());
    expect(hrefs(['principal'])).toContain('/obe');
    expect(hrefs(['principal'])).not.toContain('/platform/concept-videos');
    expect(hrefs(['principal'], true)).toContain('/platform/concept-videos');
  });

  it('drops groups with nothing to show and keeps the product order', () => {
    const ids = visibleGroups(['hr_manager']).map((g) => g.id);
    expect(ids).toEqual(['dashboard', 'students', 'hr', 'reports']);
    const all = visibleGroups(['principal'], true).map((g) => g.id);
    expect(all[0]).toBe('dashboard');
    expect(all[all.length - 1]).toBe('settings');
  });

  it('lists every section that has a page exactly where access.ts says', () => {
    const used = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.section)));
    // Everything but the sections that are reached from inside another page.
    for (const s of Object.keys(SECTION_ROLES)) expect(used.has(s as never), s).toBe(true);
  });

  it('has no page twice', () => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('breadcrumbs', () => {
  const groups = visibleGroups(['principal']);
  it('finds the most specific page', () => {
    expect(findNav(groups, '/payroll/payslips')?.item.href).toBe('/payroll/payslips');
    expect(findNav(groups, '/payroll/runs/abc')?.item.href).toBe('/payroll');
  });
  it('builds Dashboard > Group > Page > Details', () => {
    expect(crumbsFor(groups, '/')).toEqual([]);
    expect(crumbsFor(groups, '/obe')).toEqual([{ label: 'nav.dashboard', href: '/' }, { label: 'nav.obe', href: undefined }]);
    expect(crumbsFor(groups, '/students/123').map((c) => c.label)).toEqual(['nav.dashboard', 'grp.students', 'nav.students', 'ui.crumb.details']);
    expect(crumbsFor(groups, '/payroll/runs/9')[2]).toEqual({ label: 'nav.payroll', href: '/payroll' });
  });
});
