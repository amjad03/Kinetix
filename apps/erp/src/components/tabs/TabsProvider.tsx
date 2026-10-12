'use client';

import { useRouter } from 'next/navigation';
import { LayoutRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { NavigationPromisesContext, PathnameContext, PathParamsContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToastOptional } from '@/components/ui/Toast';
import { useI18n } from '@/i18n/client';
import { findNav, type NavGroup } from '@/lib/nav';
import * as M from '@/lib/tabs';

/**
 * The router contexts a page reads. A tab that is not on screen keeps the values it had when it was
 * last active, so its page stays mounted (state, scroll, half-typed forms) while the URL moves on.
 */
export interface RouteSnap {
  layout: unknown;
  pathname: unknown;
  search: unknown;
  params: unknown;
  nav: unknown;
}

interface TabsApi {
  state: M.TabsState;
  liveUrl: string;
  /** A switch is in flight: the target tab shows its saved page until the URL arrives. */
  pending: string | null;
  snaps: Record<string, RouteSnap>;
  live: RouteSnap;
  wide: boolean;
  open: (url: string, opts?: { side?: boolean }) => void;
  switchTo: (id: string) => void;
  close: (id: string) => void;
  closeOthers: (id: string) => void;
  pin: (id: string) => void;
  move: (id: string, to: number) => void;
  setSplit: (id: string | null) => void;
  setRatio: (r: number) => void;
}

const Ctx = createContext<TabsApi | null>(null);
export const useTabs = () => useContext(Ctx);

const KEY = 'kx.tabs.v1:';
/** Paths inside the shell; anything else (sign-in, account, API) opens normally. */
const OUTSIDE = /^\/(api|auth|login|account|language|cast|lti|apply|verify|events|examiner)(\/|$)/;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* private mode or quota: tabs simply are not remembered */
  }
}

/** Same-origin shell path for a link or row, else null. */
function internal(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, window.location.href);
    if (u.origin !== window.location.origin || OUTSIDE.test(u.pathname)) return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

function targetOf(el: EventTarget | null): { url: string; zone: boolean } | null {
  if (!(el instanceof Element)) return null;
  const a = el.closest<HTMLElement>('a[href], [data-href]');
  if (!a || a.getAttribute('target') === '_blank' || a.hasAttribute('download')) return null;
  const url = internal(a.getAttribute('href') ?? a.getAttribute('data-href'));
  if (!url) return null;
  // The custom menu replaces the browser's only in the menu and in tables.
  const zone = !!a.closest('[data-sidebar="sidebar"], table, [data-tab-menu]');
  return { url, zone };
}

export function TabsProvider({ groups, userKey, children }: { groups: NavGroup[]; userKey: string; children: ReactNode }) {
  const { t } = useI18n();
  const toast = useToastOptional();
  const router = useRouter();
  const live: RouteSnap = {
    layout: useContext(LayoutRouterContext),
    pathname: useContext(PathnameContext),
    search: useContext(SearchParamsContext),
    params: useContext(PathParamsContext),
    nav: useContext(NavigationPromisesContext),
  };
  const pathname = (live.pathname as string | null) ?? '/';
  const qs = (live.search as URLSearchParams | null)?.toString() ?? '';
  const liveUrl = qs ? `${pathname}?${qs}` : pathname;

  const describe = useCallback(
    (url: string) => {
      const hit = findNav(groups, url.split('?')[0]);
      return { title: hit ? t(hit.item.label) : t('tabs.untitled'), icon: hit?.item.icon ?? '' };
    },
    [groups, t],
  );

  const storeKey = KEY + userKey;
  const [state, setState] = useState<M.TabsState>(() => {
    // A fixed id for the first tab, so the server and the browser render the same markup.
    const d = describe(liveUrl);
    return { ...M.EMPTY_TABS, tabs: [{ id: 't0', url: liveUrl, ...d }], activeId: 't0' };
  });
  const [pending, setPending] = useState<string | null>(null);
  const [snaps, setSnaps] = useState<Record<string, RouteSnap>>({});
  const [wide, setWide] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; url: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const liveRef = useRef(live);
  const stateRef = useRef(state);

  useLayoutEffect(() => {
    stateRef.current = state;
    if (!pending) liveRef.current = live;
  });

  // Restore the saved tabs once, on the client (after sign-in or a reload).
  useEffect(() => {
    const back = M.restore(read(storeKey), liveUrl);
    if (back) {
      const withCurrent = back.tabs.some((x) => x.url === liveUrl) ? back : { ...back, ...M.replaceActive({ ...back, activeId: '' }, liveUrl, describe(liveUrl).title, describe(liveUrl).icon) };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
      setState(withCurrent);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  useEffect(() => {
    if (hydrated) write(storeKey, JSON.stringify(state));
  }, [state, storeKey, hydrated]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // The URL moved: an ordinary link replaced the active tab's page, or a switch arrived.
  useLayoutEffect(() => {
    const d = describe(liveUrl);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the router's URL
    setPending(null);
    setState((s) => M.replaceActive(s, liveUrl, d.title, d.icon));
    const timer = window.setTimeout(() => {
      const doc = document.title.split(' · ')[0]?.trim();
      if (doc && doc !== d.title && findNav(groups, liveUrl.split('?')[0])?.item.href !== liveUrl.split('?')[0]) {
        setState((s) => ({ ...s, tabs: s.tabs.map((x) => (x.url === liveUrl ? { ...x, title: doc } : x)) }));
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [liveUrl, describe, groups]);

  /** Leaves the active tab (saving its page and scroll) for `next`, then routes to `url`. */
  const leave = useCallback(
    (next: M.TabsState, url: string) => {
      const cur = stateRef.current;
      const from = cur.activeId;
      setSnaps((m) => ({ ...m, [from]: liveRef.current }));
      next = M.setScroll(next, from, window.scrollY);
      setState(next);
      if (url !== liveUrl) {
        setPending(url);
        router.push(url, { scroll: false });
      }
      const y = next.tabs.find((x) => x.id === next.activeId)?.scrollY ?? 0;
      requestAnimationFrame(() => window.scrollTo(0, y));
    },
    [liveUrl, router],
  );

  const open = useCallback(
    (url: string, opts?: { side?: boolean }) => {
      const cur = stateRef.current;
      const d = describe(url);
      const next = M.openTab(cur, { url, ...d });
      if (!next) {
        toast?.info(t('tabs.limit', { n: M.MAX_TABS }));
        return;
      }
      if (opts?.side) {
        // The new page goes beside the current one, which stays where it is.
        leave({ ...next, splitId: cur.activeId }, url);
      } else leave(next, url);
    },
    [describe, leave, t, toast],
  );

  const switchTo = useCallback(
    (id: string) => {
      const cur = stateRef.current;
      const tab = cur.tabs.find((x) => x.id === id);
      if (!tab || id === cur.activeId) return;
      leave(M.activate(cur, id), tab.url);
    },
    [leave],
  );

  const close = useCallback(
    (id: string) => {
      const cur = stateRef.current;
      const next = M.closeTab(cur, id);
      if (next === cur) return;
      setSnaps((m) => {
        const { [id]: _gone, ...rest } = m;
        return rest;
      });
      if (next.activeId !== cur.activeId) {
        const to = next.tabs.find((x) => x.id === next.activeId)!;
        setState(next);
        if (to.url !== liveUrl) {
          setPending(to.url);
          router.push(to.url, { scroll: false });
        }
        requestAnimationFrame(() => window.scrollTo(0, to.scrollY ?? 0));
      } else setState(next);
    },
    [liveUrl, router],
  );

  const api = useMemo<TabsApi>(
    () => ({
      state,
      liveUrl,
      pending,
      snaps,
      live,
      wide,
      open,
      switchTo,
      close,
      closeOthers: (id) => {
        if (id !== stateRef.current.activeId) switchTo(id);
        setState((s) => M.closeOthers(s, id));
      },
      pin: (id) => setState((s) => M.togglePin(s, id)),
      move: (id, to) => setState((s) => M.moveTab(s, id, to)),
      setSplit: (id) =>
        setState((s) => {
          if (!id) return M.split(s, null);
          // The dragged tab goes on the right; dragging the active tab puts its neighbour on the left.
          const other = id === s.activeId ? s.tabs.find((x) => x.id !== id)?.id : s.activeId;
          if (!other) return s;
          const moved = M.moveTab(s, id, s.tabs.findIndex((x) => x.id === other) + 1);
          return id === s.activeId ? { ...moved, splitId: other } : M.split(moved, id);
        }),
      setRatio: (r) => setState((s) => ({ ...s, ratio: Math.min(0.75, Math.max(0.25, r)) })),
    }),
    // `live` changes identity every render; the host reads it through the same render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, liveUrl, pending, snaps, wide, open, switchTo, close],
  );

  // Ctrl/Cmd+click and middle-click open a tab; right-click in the menu or a table offers it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const hit = targetOf(e.target);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      open(hit.url);
    };
    const onAux = (e: MouseEvent) => {
      if (e.button !== 1) return;
      const hit = targetOf(e.target);
      if (!hit) return;
      e.preventDefault();
      open(hit.url);
    };
    const onMenu = (e: MouseEvent) => {
      const hit = targetOf(e.target);
      if (!hit?.zone) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, url: hit.url });
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const s = stateRef.current;
      if (e.key === 'Tab' && e.ctrlKey) {
        e.preventDefault();
        const next = M.cycle(s, e.shiftKey ? -1 : 1);
        if (next.activeId !== s.activeId) switchTo(next.activeId);
      } else if (k === 'w' && !e.shiftKey && s.tabs.length > 1) {
        e.preventDefault();
        close(s.activeId);
      } else if (k === 't' && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kx:palette', { detail: { newTab: true } }));
      }
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('auxclick', onAux, true);
    document.addEventListener('contextmenu', onMenu);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('auxclick', onAux, true);
      document.removeEventListener('contextmenu', onMenu);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, switchTo, close]);

  useEffect(() => {
    if (!menu) return;
    const shut = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && shut();
    window.addEventListener('pointerdown', shut);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', shut);
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {menu && (
        <div
          role="menu"
          aria-label={t('tabs.more')}
          data-testid="tab-context-menu"
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 96) }}
          className="fixed z-[90] min-w-[200px] rounded-[12px] border bg-popover p-1.5 text-sm text-popover-foreground shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button role="menuitem" autoFocus className="flex h-9 w-full items-center rounded-md px-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" onClick={() => (setMenu(null), open(menu.url))}>
            {t('tabs.newTab')}
          </button>
          {wide && (
            <button role="menuitem" className="flex h-9 w-full items-center rounded-md px-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" onClick={() => (setMenu(null), open(menu.url, { side: true }))}>
              {t('tabs.sideBySide')}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
