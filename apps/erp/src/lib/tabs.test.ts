import { describe, expect, it } from 'vitest';
import { activate, closeOthers, closeTab, cycle, EMPTY_TABS, MAX_TABS, moveTab, normalizeUrl, openTab, replaceActive, restore, togglePin, type TabsState } from './tabs';

const base = (): TabsState => {
  let s = replaceActive(EMPTY_TABS, '/', 'Home', 'dashboard');
  s = openTab(s, { url: '/students', title: 'Students', icon: 'students' })!;
  s = openTab(s, { url: '/fees', title: 'Fees', icon: 'finance' })!;
  return s;
};

describe('workspace tabs', () => {
  it('opens after the active tab and activates it', () => {
    const s = base();
    expect(s.tabs.map((t) => t.url)).toEqual(['/', '/students', '/fees']);
    expect(s.tabs.find((t) => t.id === s.activeId)?.url).toBe('/fees');
  });

  it('replaces the active tab on an ordinary link', () => {
    const s = replaceActive(base(), '/exams', 'Exams', 'exams');
    expect(s.tabs.map((t) => t.url)).toEqual(['/', '/students', '/exams']);
  });

  it('refuses past the limit', () => {
    let s: TabsState | null = base();
    for (let i = 3; i < MAX_TABS; i++) s = openTab(s!, { url: `/p${i}`, title: '', icon: '' });
    expect(s!.tabs).toHaveLength(MAX_TABS);
    expect(openTab(s!, { url: '/x', title: '', icon: '' })).toBeNull();
  });

  it('closes to the right neighbour, keeps pinned tabs and the last tab', () => {
    let s = base();
    const [home, students] = s.tabs;
    s = activate(s, students.id);
    s = closeTab(s, students.id);
    expect(s.tabs.find((t) => t.id === s.activeId)?.url).toBe('/fees');
    s = togglePin(s, home.id);
    expect(closeTab(s, home.id).tabs).toHaveLength(2);
    expect(closeOthers(s, s.activeId).tabs.map((t) => t.url)).toEqual(['/', '/fees']);
  });

  it('cycles, reorders and keeps pinned tabs first', () => {
    let s = base();
    s = cycle(s, 1);
    expect(s.tabs.find((t) => t.id === s.activeId)?.url).toBe('/');
    s = moveTab(s, s.tabs[2].id, 0);
    expect(s.tabs[0].url).toBe('/fees');
    s = togglePin(s, s.tabs[2].id);
    expect(s.tabs[0].pinned).toBe(true);
  });

  it('focusing the side pane swaps the panes', () => {
    let s = base();
    const students = s.tabs[1];
    s = { ...s, splitId: students.id };
    const fees = s.activeId;
    s = activate(s, students.id);
    expect([s.activeId, s.splitId]).toEqual([students.id, fees]);
  });

  it('restores a saved state, rejecting bad input', () => {
    const s = base();
    const back = restore(JSON.stringify(s), '/students')!;
    expect(back.tabs).toHaveLength(3);
    expect(back.tabs.find((t) => t.id === back.activeId)?.url).toBe('/students');
    expect(restore('{nope', '/')).toBeNull();
    expect(restore(JSON.stringify({ tabs: [{ id: 'a', url: '//evil.example' }] }), '/')).toBeNull();
  });

  it('never opens the same page twice', () => {
    const s = base();
    expect(normalizeUrl('/students/?b=2&a=1#x')).toBe('/students?a=1&b=2');
    const again = openTab(s, { url: '/students/', title: 'Students', icon: 'students' })!;
    expect(again.tabs).toHaveLength(3);
    expect(again.tabs.find((t) => t.id === again.activeId)?.url).toBe('/students');
    const folded = replaceActive(s, '/students', 'Students', 'students');
    expect(folded.tabs.filter((t) => t.url === '/students')).toHaveLength(1);
    const raw = JSON.stringify({ tabs: [{ id: 'a', url: '/x?b=1&a=2' }, { id: 'b', url: '/x?a=2&b=1' }, { id: 'c', url: '/y' }] });
    expect(restore(raw, '/y')!.tabs.map((t) => t.id)).toEqual(['a', 'c']);
  });
});
