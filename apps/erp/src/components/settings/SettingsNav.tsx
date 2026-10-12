'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavTile } from '@/components/shell/nav-icons';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { NavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Settings left navigation (redesign v2, NexaCRM style): the settings pages the person may open, in groups. */
export function SettingsNav({ groups }: { groups: { label: MessageKey; items: NavItem[] }[] }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const active = (href: string) => pathname === href || (href !== '/settings' && pathname.startsWith(href + '/'));
  return (
    <nav aria-label={t('v2.set.nav')} className="flex gap-1 overflow-x-auto pb-1 md:sticky md:top-[120px] md:flex-col md:gap-4 md:overflow-visible md:pb-0" data-testid="settings-nav">
      {groups.map((g) => (
        <div key={g.label} className="flex shrink-0 gap-1 md:flex-col md:gap-0.5">
          <div className="hidden px-2 pb-1 text-[11px] font-semibold tracking-[.06em] text-muted-foreground uppercase md:block">{t(g.label)}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={active(i.href) ? 'page' : undefined} className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] whitespace-nowrap hover:bg-muted', active(i.href) ? 'bg-muted font-semibold' : 'text-foreground/90')}>
              <NavTile icon={i.icon} size="xs" />
              {t(i.label)}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
