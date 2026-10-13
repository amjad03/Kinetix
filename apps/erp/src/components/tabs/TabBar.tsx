'use client';

import { ChevronDown, Columns2, FileText, Pin, PinOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu';
import { useI18n } from '@/i18n/client';
import type { NavIcon } from '@/lib/nav';
import type { WorkTab } from '@/lib/tabs';
import { cn } from '@/lib/utils';
import { NAV_ICONS, NavTile } from '../shell/nav-icons';
import { useTabs } from './TabsProvider';

function TabIcon({ tab, className }: { tab: WorkTab; className?: string }) {
  if (tab.icon && tab.icon in NAV_ICONS) return <NavTile icon={tab.icon as NavIcon} size="xs" />;
  const Icon = NAV_ICONS[tab.icon as NavIcon] ?? FileText;
  return <Icon aria-hidden className={cn('size-4 shrink-0', className)} />;
}

/**
 * The workspace tab bar under the top bar. Click switches, the × closes, drag reorders (or drops on
 * the right edge for side-by-side), right-click or the menu pins, splits or closes others. On phones
 * the strip becomes a compact switcher.
 */
export function TabBar() {
  const api = useTabs();
  const { t } = useI18n();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // The tab strip depends on tabs restored from this browser and on Radix ids, so it renders only
  // after hydration (a same-height placeholder first): no server/client markup mismatch.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate
  useEffect(() => setMounted(true), []);
  if (!api || api.state.tabs.length === 0) return null;
  if (!mounted) return <div className="kx-tabbar sticky top-14 z-20 h-[43px] border-b bg-background/95" data-testid="tab-bar" aria-hidden />;
  const { state } = api;
  const active = state.tabs.find((x) => x.id === state.activeId) ?? state.tabs[0];
  const many = state.tabs.length > 1;

  const items = (tab: WorkTab) => (
    <>
      <DropdownMenuItem onSelect={() => api.pin(tab.id)}>
        {tab.pinned ? <PinOff /> : <Pin />}
        {tab.pinned ? t('tabs.unpin') : t('tabs.pin')}
      </DropdownMenuItem>
      {api.wide && many && state.splitId !== tab.id && (
        <DropdownMenuItem onSelect={() => api.setSplit(tab.id)}>
          <Columns2 />
          {t('tabs.sideBySide')}
        </DropdownMenuItem>
      )}
      {state.splitId && (
        <DropdownMenuItem onSelect={() => api.setSplit(null)}>
          <Columns2 />
          {t('tabs.unsplit')}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={tab.pinned || !many} onSelect={() => api.close(tab.id)}>
        <X />
        {t('tabs.close')}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!many} onSelect={() => api.closeOthers(tab.id)}>
        {t('tabs.closeOthers')}
      </DropdownMenuItem>
    </>
  );

  return (
    <div className="kx-tabbar sticky top-14 z-20 border-b bg-background/95 px-4 backdrop-blur md:px-6" data-testid="tab-bar">
      {/* Phones: one compact switcher. */}
      <div className="flex h-11 items-center md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-9 min-w-0 items-center gap-2 rounded-md border bg-card px-3 text-sm font-medium" aria-label={t('tabs.switcher')} data-testid="tab-switcher">
            <TabIcon tab={active} className="text-muted-foreground" />
            <span className="truncate">{active.title}</span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{t('tabs.count', { n: state.tabs.length })}</span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(320px,calc(100vw-32px))]">
            <DropdownMenuLabel>{t('tabs.bar')}</DropdownMenuLabel>
            {state.tabs.map((tab) => (
              <DropdownMenuItem key={tab.id} onSelect={() => api.switchTo(tab.id)} className={cn('gap-2', tab.id === active.id && 'font-semibold')}>
                <TabIcon tab={tab} />
                <span className="flex-1 truncate">{tab.title}</span>
                {tab.pinned ? (
                  <Pin className="text-muted-foreground" />
                ) : (
                  many && (
                    <button
                      type="button"
                      aria-label={`${t('tabs.close')}: ${tab.title}`}
                      className="-mr-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        api.close(tab.id);
                      }}
                    >
                      <X className="size-3.5" />
                    </button>
                  )
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tablets and up: the strip. */}
      <div role="tablist" aria-label={t('tabs.bar')} className="hidden h-[42px] items-end gap-1 overflow-x-auto [scrollbar-width:none] md:flex">
        {state.tabs.map((tab, i) => {
          const on = tab.id === state.activeId;
          const side = tab.id === state.splitId && api.wide;
          return (
            <div
              key={tab.id}
              role="presentation"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/kx-tab', tab.id);
                e.dataTransfer.effectAllowed = 'move';
                document.body.dataset.tabDrag = tab.id;
              }}
              onDragEnd={() => {
                delete document.body.dataset.tabDrag;
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('text/kx-tab')) return;
                e.preventDefault();
                setOver(tab.id);
              }}
              onDragLeave={() => setOver((o) => (o === tab.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/kx-tab');
                delete document.body.dataset.tabDrag;
                setOver(null);
                if (id && id !== tab.id) api.move(id, i);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuFor(tab.id);
              }}
              onAuxClick={(e) => e.button === 1 && !tab.pinned && api.close(tab.id)}
              className={cn(
                'group relative flex h-[34px] max-w-[200px] min-w-0 shrink-0 items-center rounded-t-lg border border-b-0 text-[13px] transition-colors',
                on ? 'border-border bg-card font-semibold text-foreground shadow-[0_1px_0_var(--color-card)]' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                side && !on && 'border-dashed border-border bg-card/60',
                over === tab.id && 'ring-2 ring-primary/40',
              )}
              data-testid="work-tab"
              data-active={on || undefined}
            >
              <button
                type="button"
                role="tab"
                aria-selected={on}
                title={tab.title}
                onClick={() => api.switchTo(tab.id)}
                className={cn('flex h-full min-w-0 items-center gap-2 rounded-t-lg pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50', tab.pinned ? 'pr-3' : 'pr-1')}
              >
                <TabIcon tab={tab} className={on ? 'text-primary' : undefined} />
                {!tab.pinned && <span className="truncate">{tab.title}</span>}
                {tab.pinned && <span className="sr-only">{tab.title}</span>}
                {side && <Columns2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
              </button>
              {!tab.pinned && many && (
                <button
                  type="button"
                  aria-label={`${t('tabs.close')}: ${tab.title}`}
                  onClick={() => api.close(tab.id)}
                  className={cn('mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground', !on && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                >
                  <X className="size-3.5" />
                </button>
              )}
              <DropdownMenu open={menuFor === tab.id} onOpenChange={(o) => !o && setMenuFor(null)}>
                <DropdownMenuTrigger asChild>
                  <span aria-hidden tabIndex={-1} className="pointer-events-none absolute bottom-0 left-2" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">{items(tab)}</DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger className="mb-1 ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t('tabs.more')} data-testid="tab-more">
            <ChevronDown className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="truncate">{active.title}</DropdownMenuLabel>
            {items(active)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
