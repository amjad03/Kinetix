'use client';

import { LayoutRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { NavigationPromisesContext, PathnameContext, PathParamsContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { Activity, useEffect, useRef, useState, type ReactNode } from 'react';
import { Skeleton } from '@/components/shadcn/skeleton';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { useTabs, type RouteSnap } from './TabsProvider';

/** Gives a page the router values of its own tab, so a hidden tab keeps showing its own route. */
function Frozen({ snap, children }: { snap: RouteSnap; children: ReactNode }) {
  return (
    <LayoutRouterContext.Provider value={snap.layout as never}>
      <PathnameContext.Provider value={snap.pathname as never}>
        <SearchParamsContext.Provider value={snap.search as never}>
          <PathParamsContext.Provider value={snap.params as never}>
            <NavigationPromisesContext.Provider value={snap.nav as never}>{children}</NavigationPromisesContext.Provider>
          </PathParamsContext.Provider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </LayoutRouterContext.Provider>
  );
}

function Loading() {
  return (
    <div className="grid gap-4" aria-busy>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * The page area. Every open tab is rendered in its own <Activity>: the active one is visible, the
 * others are hidden but stay mounted, so switching back restores the page exactly as it was. On wide
 * screens a second tab can sit beside the active one with a draggable divider.
 */
export function TabHost({ children, className, density }: { children: ReactNode; className?: string; density?: string }) {
  const api = useTabs();
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(112);
  const splitOn = !!api && api.wide && !!api.state.splitId && api.state.tabs.some((x) => x.id === api.state.splitId);

  useEffect(() => {
    if (splitOn && box.current) setTop(Math.max(0, box.current.getBoundingClientRect().top + window.scrollY));
  }, [splitOn]);

  if (!api) return <main id="main" tabIndex={-1} className={className} data-density={density}>{children}</main>;
  const { state, pending, snaps, live } = api;
  const ids = state.tabs.map((x) => x.id);
  const leftId = splitOn ? (ids.indexOf(state.activeId) < ids.indexOf(state.splitId!) ? state.activeId : state.splitId) : null;

  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => api.setRatio((ev.clientX - rect.left) / rect.width);
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
  };

  return (
    <main
      id="main"
      tabIndex={-1}
      className={cn(className, splitOn && 'max-w-none')}
      data-density={density}
      onDragOver={(e) => api.wide && e.dataTransfer.types.includes('text/kx-tab') && e.preventDefault()}
    >
      <div
        ref={box}
        data-testid="tab-host"
        data-split={splitOn || undefined}
        className={cn('relative', splitOn && 'flex min-h-0 gap-0')}
        style={splitOn ? { height: `calc(100dvh - ${top}px - 16px)` } : undefined}
      >
        {state.tabs.map((tab) => {
          const role = tab.id === state.activeId ? 'main' : splitOn && tab.id === state.splitId ? 'side' : 'hidden';
          const snap = role === 'main' && !pending ? live : (snaps[tab.id] ?? null);
          if (!snap && role === 'hidden') return null;
          const content = snap ? <Frozen snap={snap}>{children}</Frozen> : role === 'side' ? (
            <button type="button" onClick={() => api.switchTo(tab.id)} className="flex h-40 w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted">
              {t('tabs.loadPane')}
            </button>
          ) : (
            <Loading />
          );
          const left = tab.id === leftId;
          return (
            <div
              key={tab.id}
              data-tab-pane={tab.id}
              data-active={role === 'main' || undefined}
              hidden={role === 'hidden'}
              onPointerDownCapture={role === 'side' && snap ? () => api.switchTo(tab.id) : undefined}
              className={cn(
                splitOn && role !== 'hidden' && 'min-w-0 overflow-y-auto overscroll-contain px-1',
                splitOn && role !== 'hidden' && (left ? 'pr-3' : 'pl-3'),
                splitOn && role === 'side' && 'opacity-95',
              )}
              style={splitOn && role !== 'hidden' ? { order: left ? 0 : 2, flexBasis: `${(left ? state.ratio : 1 - state.ratio) * 100}%`, flexGrow: 0, flexShrink: 1 } : undefined}
            >
              <Activity mode={role === 'hidden' ? 'hidden' : 'visible'}>{content}</Activity>
            </div>
          );
        })}
        {splitOn && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('tabs.resize')}
            aria-valuenow={Math.round(state.ratio * 100)}
            aria-valuemin={25}
            aria-valuemax={75}
            tabIndex={0}
            onPointerDown={drag}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') api.setRatio(state.ratio - 0.05);
              if (e.key === 'ArrowRight') api.setRatio(state.ratio + 0.05);
            }}
            className="group relative z-10 order-1 w-2 shrink-0 cursor-col-resize outline-none"
            data-testid="split-divider"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:w-[3px] group-hover:bg-primary group-focus-visible:w-[3px] group-focus-visible:bg-primary" />
          </div>
        )}
        {api.wide && (
          <div
            className="kx-split-drop pointer-events-auto fixed top-28 right-4 bottom-4 z-40 hidden w-[28%] items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/kx-tab');
              delete document.body.dataset.tabDrag;
              if (id) api.setSplit(id);
            }}
          >
            {t('tabs.dropSplit')}
          </div>
        )}
      </div>
    </main>
  );
}
