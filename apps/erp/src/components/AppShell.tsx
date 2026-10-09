'use client';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useI18n } from '@/i18n/client';
import { crumbsFor, visibleGroups } from '@/lib/nav';
import { homeFor } from '@/lib/access';
import { Logo, LogoMark } from './Logo';
import { Breadcrumbs } from './shell/Breadcrumbs';
import { Sidebar, SIDEBAR_W } from './shell/Sidebar';
import { TopBar, type ShellNotice, type ShellYear } from './shell/TopBar';
import { ToastProvider } from './ui/Toast';

export interface ShellUser {
  fullName: string;
  email: string | null;
  roles: string[];
  /** On the KINETIX platform team: Platform › Concept videos. */
  platformAdmin?: boolean;
}

const RAIL_KEY = 'kx.nav.rail';
const RAIL_EVENT = 'kx-rail-change';

function subscribeRail(cb: () => void) {
  window.addEventListener(RAIL_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(RAIL_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}
function readRail(): boolean | null {
  try {
    const v = localStorage.getItem(RAIL_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

/**
 * The app shell: a collapsible left navigation grouped by domain (only what the role may open),
 * a top bar (search, academic year, language, notifications, profile), breadcrumbs and the page.
 * Wide screens show the full sidebar, tablets an icon rail, phones a drawer behind the menu button.
 */
export function AppShell({
  user,
  school,
  years = [],
  yearId = '',
  notices = [],
  unread = 0,
  disabledModules = [],
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
  children: ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  // null: follow the screen (rail on tablets, full on desktops); otherwise the person's choice, remembered.
  const pref = useSyncExternalStore(subscribeRail, readRail, () => null);
  const groups = useMemo(() => visibleGroups(user.roles as never, !!user.platformAdmin, disabledModules), [user.roles, user.platformAdmin, disabledModules]);
  const crumbs = useMemo(() => crumbsFor(groups, pathname), [groups, pathname]);
  const home = homeFor(user.roles as never);

  const toggleRail = (currentlyRail: boolean) => {
    try {
      localStorage.setItem(RAIL_KEY, currentlyRail ? '0' : '1');
    } catch {
      /* storage blocked: the choice is not remembered */
    }
    window.dispatchEvent(new Event(RAIL_EVENT));
  };
  // Below lg the rail is the default; the toggle only matters from lg up, so CSS decides the width.
  const railLg = pref === true;
  const w = (rail: boolean) => (rail ? SIDEBAR_W.rail : SIDEBAR_W.open);

  const logo = (
    <Box component={Link} href={home} aria-label={t('shell.home')} sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', height: 64, px: 2.5, flexShrink: 0 }}>
      <Logo size={30} />
    </Box>
  );

  return (
    <ToastProvider>
      <Box className="kx-shell" sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', display: 'flex' }}>
        <Box component="a" href="#main" sx={{ position: 'absolute', left: 8, top: -48, zIndex: 2000, bgcolor: 'm3.primary', color: 'm3.onPrimary', px: 2, py: 1, borderRadius: '8px', '&:focus': { top: 8 } }}>
          {t('shell.skip')}
        </Box>

        {/* Sidebar: full on desktop, rail on tablet; hidden on phones (drawer). */}
        <Box
          component="aside"
          className="kx-chrome"
          sx={{
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            position: 'sticky',
            top: 0,
            height: '100dvh',
            flexShrink: 0,
            bgcolor: 'kx.pane',
            borderRight: 1,
            borderColor: 'm3.outlineVariant',
            width: { md: SIDEBAR_W.rail, lg: w(railLg) },
            transition: 'width 200ms var(--kx-ease-emphasized)',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          <Box sx={{ display: { md: 'none', lg: railLg ? 'none' : 'block' } }}>{logo}</Box>
          <Box component={Link} href={home} aria-label={t('shell.home')} sx={{ display: { md: 'flex', lg: railLg ? 'flex' : 'none' }, justifyContent: 'center', alignItems: 'center', height: 64, flexShrink: 0 }}>
            <LogoMark size={32} />
          </Box>
          {/* Two instances so CSS can pick the rail on tablets without waiting for JS. */}
          <Box sx={{ display: { md: 'block', lg: 'none' }, flex: 1, minHeight: 0 }}>
            <Sidebar groups={groups} pathname={pathname} rail canCollapse={false} />
          </Box>
          <Box sx={{ display: { md: 'none', lg: 'block' }, flex: 1, minHeight: 0 }}>
            <Sidebar groups={groups} pathname={pathname} rail={railLg} canCollapse onToggleRail={() => toggleRail(railLg)} />
          </Box>
        </Box>

        <Drawer open={mobile} onClose={() => setMobile(false)} sx={{ display: { md: 'none' } }} slotProps={{ paper: { sx: { width: SIDEBAR_W.open, maxWidth: '85vw', bgcolor: 'kx.pane', backgroundImage: 'none' }, 'aria-label': t('nav.main') } as never }}>
          {logo}
          <Sidebar groups={groups} pathname={pathname} rail={false} canCollapse={false} onNavigate={() => setMobile(false)} />
        </Drawer>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <TopBar user={user} school={school} groups={groups} years={years} yearId={yearId} notices={notices} unread={unread} onMenu={() => setMobile(true)} />
          <Box component="main" id="main" tabIndex={-1} className="kx-main" sx={{ flex: 1, minWidth: 0, width: '100%', maxWidth: 1600, mx: 'auto', px: { xs: 2, md: 3, xl: 4 }, py: { xs: 2, md: 3 }, outline: 'none' }}>
            <Breadcrumbs crumbs={crumbs} />
            {children}
          </Box>
        </Box>
      </Box>
    </ToastProvider>
  );
}
