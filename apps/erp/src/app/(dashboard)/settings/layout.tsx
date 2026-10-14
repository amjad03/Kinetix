import type { ReactNode } from 'react';
import { SettingsNav } from '@/components/settings/SettingsNav';
import type { MessageKey } from '@/i18n/messages';
import { getMe } from '@/lib/api';
import { canSee } from '@/lib/access';
import { NAV_GROUPS, type NavItem } from '@/lib/nav';

const GROUPS: { label: MessageKey; hrefs: string[] }[] = [
  { label: 'v2.set.g.institution', hrefs: ['/settings', '/settings/institution', '/settings/affiliation', '/settings/branding', '/settings/academic-years', '/settings/campuses', '/settings/buildings', '/institution-setup'] },
  { label: 'ga.set.g.access', hrefs: ['/settings/users', '/settings/roles', '/sso', '/settings/notifications'] },
  { label: 'v2.set.g.automation', hrefs: ['/workflows', '/delegations'] },
  { label: 'v2.set.g.data', hrefs: ['/connectors', '/integrations', '/import', '/import/migration', '/settings/data-export', '/recycle-bin'] },
  { label: 'v2.set.g.compliance', hrefs: ['/audit', '/governance/rules', '/governance/incidents', '/governance/retention', '/dpdp', '/integrity', '/ai/audit', '/ai/evals'] },
  { label: 'v2.set.g.billing', hrefs: ['/billing'] },
];

/** Settings pages share a left navigation (redesign v2). */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  let roles: Parameters<typeof canSee>[0] = [];
  try {
    roles = (await getMe()).roles;
  } catch {
    /* the dashboard layout shows the error */
  }
  const all = NAV_GROUPS.flatMap((g) => g.items);
  const groups = GROUPS.map((g) => ({ label: g.label, items: g.hrefs.map((h) => all.find((i) => i.href === h)).filter((i): i is NavItem => !!i && i.section !== 'platform' && canSee(roles, i.section)) })).filter((g) => g.items.length > 0);
  return (
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <SettingsNav groups={groups} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
