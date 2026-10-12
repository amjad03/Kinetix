// Workspace tabs: the pure model behind the in-app tab bar (open, replace, close, pin, reorder, split).
// The React side (components/tabs) keeps each tab's page mounted; this file only decides the list.

export const MAX_TABS = 10;

export interface WorkTab {
  id: string;
  /** Path and query, e.g. `/students?class=7A`. */
  url: string;
  title: string;
  /** A NavIcon name, or '' for a page outside the menu. */
  icon: string;
  pinned?: boolean;
  /** Window scroll offset when the tab was last left. */
  scrollY?: number;
}

export interface TabsState {
  tabs: WorkTab[];
  activeId: string;
  /** The tab shown beside the active one (wide screens), or null. */
  splitId: string | null;
  /** Width of the left pane in split view, 0.25–0.75. */
  ratio: number;
}

export const EMPTY_TABS: TabsState = { tabs: [], activeId: '', splitId: null, ratio: 0.5 };

let seq = 0;
export const newTabId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Pinned tabs first, in their own order. */
function ordered(tabs: WorkTab[]): WorkTab[] {
  return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
}

/** Opens `url` in a new tab after the active one; `null` when the limit is reached. */
export function openTab(s: TabsState, tab: Omit<WorkTab, 'id'> & { id?: string }): TabsState | null {
  if (s.tabs.length >= MAX_TABS) return null;
  const t: WorkTab = { ...tab, id: tab.id ?? newTabId() };
  const at = s.tabs.findIndex((x) => x.id === s.activeId);
  const tabs = [...s.tabs];
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, t);
  return { ...s, tabs: ordered(tabs), activeId: t.id };
}

/** The active tab now shows `url` (an ordinary link click). */
export function replaceActive(s: TabsState, url: string, title: string, icon: string): TabsState {
  const active = s.tabs.find((t) => t.id === s.activeId);
  if (!active) {
    const t: WorkTab = { id: newTabId(), url, title, icon };
    return { ...s, tabs: [...s.tabs, t].slice(-MAX_TABS), activeId: t.id };
  }
  if (active.url === url && active.title === title) return s;
  return { ...s, tabs: s.tabs.map((t) => (t.id === active.id ? { ...t, url, title, icon, scrollY: 0 } : t)) };
}

export function activate(s: TabsState, id: string): TabsState {
  if (!s.tabs.some((t) => t.id === id) || s.activeId === id) return s;
  // Focusing the side pane swaps the panes' roles, so both stay on screen.
  const splitId = s.splitId === id ? s.activeId : s.splitId;
  return { ...s, activeId: id, splitId };
}

/** Closes a tab; the neighbour to its right (else left) becomes active. Pinned tabs stay. */
export function closeTab(s: TabsState, id: string): TabsState {
  const i = s.tabs.findIndex((t) => t.id === id);
  if (i < 0 || s.tabs[i].pinned || s.tabs.length === 1) return s;
  const tabs = s.tabs.filter((t) => t.id !== id);
  let activeId = s.activeId;
  let splitId = s.splitId === id ? null : s.splitId;
  if (activeId === id) {
    activeId = s.splitId && s.splitId !== id ? s.splitId : (tabs[i] ?? tabs[i - 1]).id;
    if (activeId === splitId) splitId = null;
  }
  return { ...s, tabs, activeId, splitId };
}

export function closeOthers(s: TabsState, id: string): TabsState {
  const tabs = s.tabs.filter((t) => t.id === id || t.pinned);
  return { ...s, tabs, activeId: id, splitId: null };
}

export function togglePin(s: TabsState, id: string): TabsState {
  return { ...s, tabs: ordered(s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))) };
}

/** Moves tab `id` to `toIndex` (pinned and unpinned tabs keep their groups). */
export function moveTab(s: TabsState, id: string, toIndex: number): TabsState {
  const from = s.tabs.findIndex((t) => t.id === id);
  if (from < 0) return s;
  const tabs = [...s.tabs];
  const [t] = tabs.splice(from, 1);
  tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, t);
  return { ...s, tabs: ordered(tabs) };
}

/** Next (+1) or previous (-1) tab, wrapping. */
export function cycle(s: TabsState, dir: 1 | -1): TabsState {
  const i = s.tabs.findIndex((t) => t.id === s.activeId);
  if (i < 0 || s.tabs.length < 2) return s;
  return activate(s, s.tabs[(i + dir + s.tabs.length) % s.tabs.length].id);
}

export function split(s: TabsState, id: string | null): TabsState {
  if (id === s.activeId) return s;
  return { ...s, splitId: id && s.tabs.some((t) => t.id === id) ? id : null };
}

export function setScroll(s: TabsState, id: string, y: number): TabsState {
  return { ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, scrollY: y } : t)) };
}

/** Reads a saved state, dropping anything malformed; the current URL decides the active tab. */
export function restore(raw: string | null, url: string): TabsState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TabsState>;
    const tabs = (Array.isArray(v.tabs) ? v.tabs : [])
      .filter((t): t is WorkTab => !!t && typeof t.id === 'string' && typeof t.url === 'string' && t.url.startsWith('/') && !t.url.startsWith('//'))
      .map((t) => ({ id: t.id, url: t.url, title: String(t.title ?? ''), icon: String(t.icon ?? ''), pinned: !!t.pinned, scrollY: Number(t.scrollY) || 0 }))
      .slice(0, MAX_TABS);
    if (!tabs.length) return null;
    const match = tabs.find((t) => t.url === url) ?? tabs.find((t) => t.id === v.activeId);
    const ratio = typeof v.ratio === 'number' && v.ratio >= 0.25 && v.ratio <= 0.75 ? v.ratio : 0.5;
    const splitId = typeof v.splitId === 'string' && tabs.some((t) => t.id === v.splitId) && v.splitId !== match?.id ? v.splitId : null;
    return { tabs: ordered(tabs), activeId: match?.id ?? tabs[0].id, splitId, ratio };
  } catch {
    return null;
  }
}
