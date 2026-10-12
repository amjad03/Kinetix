'use client';

import { useColorScheme } from '@mui/material/styles';
import { Bell, Check, KeyRound, Languages, LogOut, Monitor, Moon, Rows3, ShieldCheck, Sun } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useTransition } from 'react';
import { setLanguage } from '@/app/language/actions';
import { signOut } from '@/app/login/actions';
import { markNotificationsRead, setAcademicYear, setDensity } from '@/app/shell/actions';
import { Avatar, AvatarFallback } from '@/components/shadcn/avatar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/shadcn/breadcrumb';
import { Button } from '@/components/shadcn/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { Separator } from '@/components/shadcn/separator';
import { SidebarTrigger } from '@/components/shadcn/sidebar';
import { useI18n } from '@/i18n/client';
import { BCP47, LANGUAGE_NAMES, LOCALES, type Locale } from '@/i18n/locales';
import type { Crumb, NavGroup } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { initials } from '../initials';
import { CommandSearch } from './CommandSearch';

export interface ShellNotice {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface ShellYear {
  id: string;
  label: string;
  isCurrent: boolean;
}

const SHORT: Record<Locale, string> = { en: 'EN', hi: 'हिं', kn: 'ಕನ್ನಡ' };

/** Avatar colours from the redesign, picked by name. */
const AV = ['bg-[#d7f2ee] text-[#0b5e57]', 'bg-[#fdecc8] text-[#7a4405]', 'bg-[#e3e8f0] text-[#334155]', 'bg-[#ffe2cc] text-[#9a3412]', 'bg-[#dde7fd] text-[#1e3a8a]', 'bg-[#f9dde7] text-[#9d174d]'];
export const avatarTone = (name: string) => AV[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];

/**
 * The top bar: menu toggle, breadcrumbs, ⌘K search, academic year, language (EN · हिं · ಕನ್ನಡ),
 * notifications, light/dark theme and the profile menu.
 */
export function TopBar({
  user,
  roleText,
  groups,
  crumbs,
  years,
  yearId,
  notices,
  unread,
  density = 'comfortable',
}: {
  user: { fullName: string; email: string | null };
  roleText: string;
  groups: NavGroup[];
  crumbs: Crumb[];
  years: ShellYear[];
  yearId: string;
  notices: ShellNotice[];
  unread: number;
  density?: 'comfortable' | 'compact';
}) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [busy, start] = useTransition();
  const { mode, systemMode, setMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) === 'dark';
  const current = years.find((y) => y.id === yearId) ?? years.find((y) => y.isCurrent) ?? years[0];
  const changeLang = (l: Locale) => {
    if (l === locale) return;
    start(async () => {
      await setLanguage(l);
      router.refresh();
    });
  };

  return (
    <header className="kx-chrome sticky top-0 z-30 flex h-[60px] shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md md:px-5">
      <SidebarTrigger aria-label={t('shell.toggleSidebar')} className="size-9 text-muted-foreground" />
      <Separator orientation="vertical" className="mr-1 hidden data-[orientation=vertical]:h-5 md:block" />
      {crumbs.length > 0 && (
        <Breadcrumb className="hidden min-w-0 md:block">
          <BreadcrumbList className="flex-nowrap text-[13px]">
            {crumbs.map((c, i) => (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem className="min-w-0">
                  {i === crumbs.length - 1 ? (
                    <BreadcrumbPage className="truncate font-semibold">{t(c.label)}</BreadcrumbPage>
                  ) : c.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={c.href}>{t(c.label)}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <span className="truncate">{t(c.label)}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <CommandSearch groups={groups} />

      {current && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden h-9 sm:inline-flex" aria-label={t('shell.year', { year: current.label })}>
              {t('shell.yearShort', { year: current.label })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label={t('shell.yearMenu')}>
            <DropdownMenuRadioGroup
              value={current.id}
              onValueChange={(id) => {
                const y = years.find((x) => x.id === id);
                if (!y) return;
                start(async () => {
                  await setAcademicYear(y.isCurrent ? '' : y.id);
                  router.refresh();
                });
              }}
            >
              {years.map((y) => (
                <DropdownMenuRadioItem key={y.id} value={y.id} disabled={busy}>
                  <span className="flex-1">{y.label}</span>
                  {y.isCurrent && <span className="ml-3 text-xs text-muted-foreground">{t('shell.yearCurrent')}</span>}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div role="group" aria-label={t('shell.language')} data-testid="language-button" className="hidden gap-0.5 rounded-md border bg-card p-[3px] lg:inline-flex">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            lang={BCP47[l]}
            aria-pressed={l === locale}
            aria-label={LANGUAGE_NAMES[l]}
            disabled={busy}
            data-testid={`language-${l}`}
            onClick={() => changeLang(l)}
            className={cn('rounded-[7px] px-2 py-1 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground hover:text-foreground', l === locale && 'bg-accent font-semibold text-foreground')}
          >
            {SHORT[l]}
          </button>
        ))}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative size-9 text-muted-foreground" aria-label={unread ? t('shell.notificationsUnread', { n: unread }) : t('shell.notifications')}>
            <Bell className="size-[18px]" />
            {unread > 0 && <span className="absolute top-[7px] right-2 size-2 rounded-full border-2 border-card bg-orange" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
          <div className="flex items-center justify-between px-4 py-2.5">
            <h2 className="text-sm font-semibold">{t('shell.notifications')}</h2>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    await markNotificationsRead();
                    router.refresh();
                  })
                }
              >
                {t('shell.markRead')}
              </Button>
            )}
          </div>
          <Separator />
          {notices.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('shell.noNotifications')}</p>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {notices.map((n) => (
                <li key={n.id} className={cn('border-b px-4 py-2.5 last:border-0', !n.readAt && 'bg-teal-soft/60')}>
                  <p className={cn('text-[13px]', n.readAt ? 'font-medium' : 'font-semibold')}>{n.title}</p>
                  {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="text-xs text-faint">{fmt.relative(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={t('shell.theme')} aria-pressed={dark} data-testid="theme-toggle" onClick={() => setMode(dark ? 'light' : 'dark')}>
        {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('shell.account')} title={`${user.fullName}${roleText ? ` · ${roleText}` : ''}`} className="ml-0.5 rounded-full">
            <Avatar className="size-8">
              <AvatarFallback className={cn('text-xs font-semibold', avatarTone(user.fullName))}>{initials(user.fullName)}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar className="size-[34px]">
              <AvatarFallback className={cn('text-xs font-semibold', avatarTone(user.fullName))}>{initials(user.fullName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <b className="block truncate text-sm">{user.fullName}</b>
              {user.email && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
              {roleText && <span className="block truncate text-xs text-muted-foreground">{roleText}</span>}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Languages className="size-3.5" /> {t('shell.language')}
          </DropdownMenuLabel>
          {LOCALES.map((l) => (
            <DropdownMenuItem key={l} lang={BCP47[l]} disabled={busy} onSelect={() => changeLang(l)} data-testid={`profile-language-${l}`}>
              <span className="flex-1">{LANGUAGE_NAMES[l]}</span>
              {l === locale && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('shell.theme')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={mode ?? 'system'} onValueChange={(v) => setMode(v as 'light' | 'dark' | 'system')}>
            <DropdownMenuRadioItem value="light">
              <Sun className="size-4" /> {t('shell.themeLight')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="size-4" /> {t('shell.themeDark')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="size-4" /> {t('shell.themeSystem')}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="density-button"
            disabled={busy}
            onSelect={() =>
              start(async () => {
                await setDensity(density === 'compact' ? 'comfortable' : 'compact');
                router.refresh();
              })
            }
          >
            <Rows3 className="size-4" />
            <span className="flex-1">{t('shell.density')}</span>
            <span className="text-xs text-muted-foreground">{t(density === 'compact' ? 'shell.densityCompact' : 'shell.densityComfortable')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild data-testid="change-password">
            <Link href="/account/password">
              <KeyRound className="size-4" /> {t('shell.changePassword')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild data-testid="security">
            <Link href="/account/security">
              <ShieldCheck className="size-4" /> {t('shell.security')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="sign-out" onSelect={() => start(() => signOut())}>
            <LogOut className="size-4" /> {t('shell.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
