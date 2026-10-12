'use client';

import { ChevronDown, ChevronsUpDown, Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { setWorkspace } from '@/app/shell/actions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, useSidebar,
} from '@/components/shadcn/sidebar';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { isActivePath, navSections, type NavGroup } from '@/lib/nav';
import type { SetupSummary } from '@/lib/setup';
import { WORKSPACES, type Workspace } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import { NAV_ICONS } from './nav-icons';

const CLOSED_KEY = 'kx.nav.closed';

function readClosed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** The active page gets a teal bar on the left edge, as in the redesign. */
const ACTIVE_BAR =
  "data-[active=true]:font-semibold data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground relative data-[active=true]:before:absolute data-[active=true]:before:-left-2 data-[active=true]:before:top-1.5 data-[active=true]:before:bottom-1.5 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-r data-[active=true]:before:bg-teal data-[active=true]:before:content-['']";

/**
 * The redesigned sidebar: an org/workspace switcher, the role's pages grouped into the sections
 * Overview · Academics · Exams · Finance · Campus · Accreditation · Admin (collapsible, remembered),
 * the college-setup progress card, and an icon rail when collapsed (a sheet on phones).
 */
export function AppSidebar({
  groups,
  pathname,
  school,
  roleText,
  workspace,
  home,
  setup,
}: {
  groups: NavGroup[];
  pathname: string;
  school: string;
  roleText: string;
  workspace: Workspace;
  home: string;
  setup?: SetupSummary | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { setOpenMobile, isMobile, state } = useSidebar();
  const [busy, start] = useTransition();
  const [closed, setClosed] = useState<string[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read the remembered choice after hydration
  useEffect(() => setClosed(readClosed()), []);
  const sections = navSections(groups);
  const toggleSection = (id: string) => {
    const next = closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id];
    setClosed(next);
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  };
  const done = () => isMobile && setOpenMobile(false);
  const collapsed = state === 'collapsed' && !isMobile;

  return (
    <Sidebar collapsible="icon" aria-label={t('nav.main')} className="kx-chrome">
      <SidebarHeader className="px-3 pt-3.5 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" data-testid="workspace-switcher" aria-label={t('g1.ws.label')} className="rounded-xl border bg-card hover:bg-sidebar-accent group-data-[collapsible=icon]:border-0">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary text-sm font-bold text-primary-foreground">{school.trim().charAt(0).toUpperCase() || 'K'}</span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <b className="truncate text-[13px] text-foreground" data-testid="school-name">
                      {school}
                    </b>
                    <span className="truncate text-xs text-muted-foreground">{workspace === 'all' ? roleText : t(`g1.ws.${workspace}` as MessageKey)}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('shell.workspace')}</DropdownMenuLabel>
                {WORKSPACES.map((w) => (
                  <DropdownMenuItem
                    key={w}
                    disabled={busy}
                    onSelect={() =>
                      start(async () => {
                        await setWorkspace(w);
                        router.refresh();
                      })
                    }
                  >
                    <span className="flex-1">{t(`g1.ws.${w}` as MessageKey)}</span>
                    {w === workspace && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-1">
        {sections.map((sec) => {
          const isClosed = closed.includes(sec.id) && !collapsed;
          return (
            <SidebarGroup key={sec.id} className="py-1">
              <SidebarGroupLabel asChild className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground hover:text-foreground">
                <button type="button" onClick={() => toggleSection(sec.id)} aria-expanded={!isClosed}>
                  {t(sec.label)}
                  <ChevronDown className={cn('ml-auto transition-transform', isClosed && '-rotate-90')} />
                </button>
              </SidebarGroupLabel>
              {!isClosed && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {sec.groups.map((g) => {
                      const Icon = NAV_ICONS[g.icon];
                      if (g.items.length === 1) {
                        const item = g.items[0];
                        const label = t(g.solo ? g.label : item.label);
                        return (
                          <SidebarMenuItem key={g.id}>
                            <SidebarMenuButton asChild isActive={isActivePath(pathname, item.href)} tooltip={label} className={cn('font-medium text-sidebar-foreground', ACTIVE_BAR)}>
                              <Link href={item.href === '/' ? home : item.href} onClick={done}>
                                <Icon />
                                <span>{label}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      }
                      const hasActive = g.items.some((i) => isActivePath(pathname, i.href));
                      const open = openGroups[g.id] ?? hasActive;
                      return (
                        <SidebarMenuItem key={g.id}>
                          {collapsed ? (
                            <SidebarMenuButton asChild isActive={hasActive} tooltip={t(g.label)} className={cn('font-medium text-sidebar-foreground', ACTIVE_BAR)}>
                              <Link href={g.items[0].href}>
                                <Icon />
                                <span>{t(g.label)}</span>
                              </Link>
                            </SidebarMenuButton>
                          ) : (
                            <SidebarMenuButton aria-expanded={open} onClick={() => setOpenGroups((o) => ({ ...o, [g.id]: !open }))} className={cn('font-medium text-sidebar-foreground', hasActive && 'text-foreground')}>
                              <Icon />
                              <span>{t(g.label)}</span>
                              <ChevronDown className={cn('ml-auto transition-transform', !open && '-rotate-90')} />
                            </SidebarMenuButton>
                          )}
                          {open && !collapsed && (
                            <SidebarMenuSub>
                              {g.items.map((i) => (
                                <SidebarMenuSubItem key={i.href}>
                                  <SidebarMenuSubButton asChild isActive={isActivePath(pathname, i.href) && !g.items.some((o) => o.href.length > i.href.length && isActivePath(pathname, o.href))} className="text-sidebar-foreground data-[active=true]:font-semibold">
                                    <Link href={i.href} onClick={done}>
                                      <span>{t(i.label)}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          )}
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {setup && setup.next && (
        <SidebarFooter className="border-t p-3 group-data-[collapsible=icon]:hidden">
          <Link href="/institution-setup/start" onClick={done} className="block rounded-xl border bg-background p-3 hover:border-border-strong" data-testid="setup-mini">
            <span className="flex items-center justify-between text-[12.5px]">
              <b className="font-semibold">{t('shell.setupMini')}</b>
              <span className="tabular-nums text-muted-foreground">
                {setup.done}/{setup.total}
              </span>
            </span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
              <i className="block h-full rounded-full bg-teal" style={{ width: `${(setup.done / setup.total) * 100}%` }} />
            </span>
            <span className="mt-2 block truncate text-xs text-muted-foreground">{t('shell.setupMiniNext', { step: t(setup.next.title) })}</span>
          </Link>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
