'use client';

import { usePathname } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/shadcn/sidebar';
import { TooltipProvider } from '@/components/shadcn/tooltip';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { homeFor } from '@/lib/access';
import { crumbsFor, visibleGroups } from '@/lib/nav';
import type { SetupSummary } from '@/lib/setup';
import type { Workspace } from '@/lib/workspaces';
import { AppSidebar } from './shell/AppSidebar';
import { TopBar, type ShellNotice, type ShellYear } from './shell/TopBar';
import { ToastProvider } from './ui/Toast';
import { TabBar } from './tabs/TabBar';
import { TabHost } from './tabs/TabHost';
import { TabsProvider } from './tabs/TabsProvider';

export interface ShellUser {
  fullName: string;
  email: string | null;
  roles: string[];
  /** On the KINETIX platform team: Platform › Concept videos. */
  platformAdmin?: boolean;
}

/**
 * The app shell (redesign): shadcn sidebar with the role's pages in sections (icon rail when
 * collapsed, a sheet on phones), a top bar (breadcrumbs, ⌘K search, year, language, notifications,
 * theme, profile) and the page.
 */
export function AppShell({
  user,
  school,
  years = [],
  yearId = '',
  notices = [],
  unread = 0,
  disabledModules = [],
  workspace = 'all',
  density = 'comfortable',
  sidebarOpen = true,
  setup = null,
  children,
}: {
  user: ShellUser;
  school: string;
  years?: ShellYear[];
  yearId?: string;
  notices?: ShellNotice[];
  unread?: number;
  /** Sections the institution switched off; hidden from the menu. */
  disabledModules?: string[];
  /** The console chosen in the sidebar header; the menu lists only its pages. */
  workspace?: Workspace;
  density?: 'comfortable' | 'compact';
  /** The sidebar's remembered state (cookie), so the first paint matches. */
  sidebarOpen?: boolean;
  /** New-college setup progress, for the sidebar card (principals and administrators). */
  setup?: SetupSummary | null;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const groups = useMemo(() => visibleGroups(user.roles as never, !!user.platformAdmin, disabledModules, workspace), [user.roles, user.platformAdmin, disabledModules, workspace]);
  const crumbs = useMemo(() => crumbsFor(groups, pathname), [groups, pathname]);
  const home = homeFor(user.roles as never);
  const roleText = user.roles
    .map((r) => {
      const key = `role.${r}` as MessageKey;
      const text = t(key);
      return text === key ? '' : text;
    })
    .filter(Boolean)
    .join(' · ');

  return (
    <ToastProvider>
      <TooltipProvider delayDuration={300}>
        <a href="#main" className="absolute -top-14 left-3 z-[100] rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:top-3">
          {t('shell.skip')}
        </a>
        <SidebarProvider defaultOpen={sidebarOpen} className="kx-shell">
          <AppSidebar groups={groups} pathname={pathname} school={school} roleText={roleText} workspace={workspace} home={home} setup={setup} />
          <SidebarInset className="min-w-0 bg-background">
            <TabsProvider groups={groups} userKey={user.email ?? user.fullName}>
              <TopBar user={user} roleText={roleText} groups={groups} crumbs={crumbs} years={years} yearId={yearId} notices={notices} unread={unread} density={density} />
              <TabBar />
              <TabHost className="kx-main mx-auto w-full max-w-[1440px] min-w-0 flex-1 p-4 outline-none md:p-6" density={density}>
                {children}
              </TabHost>
            </TabsProvider>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </ToastProvider>
  );
}
