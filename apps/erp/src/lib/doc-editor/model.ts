/**
 * The template editor's state and every change to it, as a reducer: selection (groups select
 * together), moving and resizing in gestures that snap and draw guides, nudging, rotation, adding,
 * deleting, duplicating, copy and paste, z-order, lock, hide, rename, group, align, distribute,
 * property edits, page setup, and a deep undo/redo history (typing in one field, or a run of
 * arrow-key nudges, is one step). Pure, so it is tested without a browser (model.test.ts).
 */
import { type AlignMode, alignOffsets, type Box, distributeOffsets, type Guide, type Handle, resizeRotated, round, scaleInto, snapMove, type SnapOptions, snapResize, snapTargets, spacingHints, type SpacingHint, unionBox } from './geometry';
import { type DocElement, type DocLayout, DocLayoutSchema, type DocSide, type Fill, pageSizeMm, type PageSpec } from './schema';

interface Snapshot {
  layout: DocLayout;
  sideId: string;
  selection: string[];
}

interface Gesture {
  kind: 'move' | 'resize' | 'rotate';
  /** Each element's box and rotation when the gesture began. */
  origin: Record<string, { x: number; y: number; w: number; h: number; rotationDeg: number }>;
  changed: boolean;
}

export interface EditorState {
  layout: DocLayout;
  sideId: string;
  /** Selected element ids on the current side, in the order they were picked. */
  selection: string[];
  past: Snapshot[];
  future: Snapshot[];
  /** The last change's merge key and time: the same key within a moment is one undo step. */
  lastKey: string | null;
  lastAt: number;
  gesture: Gesture | null;
  guides: Guide[];
  hints: SpacingHint[];
  clipboard: DocElement[] | null;
  /** Pastes of the clipboard per side, so each lands a little further on. */
  pastes: Record<string, number>;
  /** The layout as last saved (JSON), for the unsaved-changes guard. */
  saved: string;
}

/** Undo steps kept. */
export const HISTORY_LIMIT = 200;
/** Edits with the same key closer together than this are one undo step. */
const MERGE_MS = 1200;

export type EditorAction =
  | { type: 'load'; layout: DocLayout }
  | { type: 'markSaved'; json: string }
  | { type: 'setSide'; sideId: string }
  | { type: 'select'; ids: string[]; mode?: 'set' | 'add' | 'toggle'; deep?: boolean }
  | { type: 'selectAll' }
  | { type: 'selectNext'; dir: 1 | -1 }
  | { type: 'gestureStart'; kind: Gesture['kind'] }
  | { type: 'drag'; dx: number; dy: number; snap: SnapOptions }
  | { type: 'resize'; handle: Handle; dx: number; dy: number; keepRatio: boolean; snap: SnapOptions }
  | { type: 'rotate'; deg: number }
  | { type: 'gestureEnd' }
  | { type: 'nudge'; dx: number; dy: number; at: number }
  | { type: 'add'; element: DocElement; select?: boolean }
  | { type: 'remove' }
  | { type: 'duplicate' }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'zorder'; to: 'front' | 'back' | 'forward' | 'backward' }
  | { type: 'reorder'; id: string; index: number }
  | { type: 'toggleLock'; ids?: string[] }
  | { type: 'toggleHide'; ids?: string[] }
  | { type: 'rename'; id: string; name: string; at: number }
  | { type: 'group' }
  | { type: 'ungroup' }
  | { type: 'align'; mode: AlignMode }
  | { type: 'distribute'; axis: 'x' | 'y' }
  | { type: 'update'; id: string; patch: Partial<DocElement>; key?: string; at?: number }
  | { type: 'updateMany'; ids: string[]; patch: Partial<DocElement>; key?: string; at?: number }
  | { type: 'replace'; id: string; element: DocElement }
  | { type: 'setPage'; patch: Partial<PageSpec>; key?: string; at?: number }
  | { type: 'setFonts'; fonts: DocLayout['fonts'] }
  | { type: 'setBackground'; fill: Fill | undefined; key?: string; at?: number }
  | { type: 'clearGuides' }
  | { type: 'undo' }
  | { type: 'redo' };

export function initialState(layout: DocLayout): EditorState {
  return { layout, sideId: layout.sides[0].id, selection: [], past: [], future: [], lastKey: null, lastAt: 0, gesture: null, guides: [], hints: [], clipboard: null, pastes: {}, saved: JSON.stringify(layout) };
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

export const currentSide = (s: Pick<EditorState, 'layout' | 'sideId'>): DocSide => s.layout.sides.find((x) => x.id === s.sideId) ?? s.layout.sides[0];
export const isDirty = (s: EditorState) => JSON.stringify(s.layout) !== s.saved;
export const selectedElements = (s: EditorState) => {
  const els = currentSide(s).elements;
  return s.selection.map((id) => els.find((e) => e.id === id)).filter((e): e is DocElement => !!e);
};
export const pageMm = (l: DocLayout) => pageSizeMm(l.page);
const boxOf = (e: { x: number; y: number; w: number; h: number }): Box => ({ x: e.x, y: e.y, w: e.w, h: e.h });

function withSide(s: EditorState, fn: (els: DocElement[]) => DocElement[]): DocLayout {
  return { ...s.layout, sides: s.layout.sides.map((side) => (side.id === s.sideId ? { ...side, elements: fn(side.elements) } : side)) };
}

/** Records the current state for undo before a change, unless it merges with the previous change. */
function commit(s: EditorState, layout: DocLayout, o: { key?: string; at?: number; selection?: string[] } = {}): EditorState {
  if (layout === s.layout && !o.selection) return s;
  const selection = o.selection ?? s.selection;
  if (s.gesture) return { ...s, layout, selection, gesture: { ...s.gesture, changed: true } };
  const at = o.at ?? 0;
  const merge = !!o.key && o.key === s.lastKey && at - s.lastAt < MERGE_MS && at >= s.lastAt;
  const past = merge ? s.past : [...s.past, { layout: s.layout, sideId: s.sideId, selection: s.selection }].slice(-HISTORY_LIMIT);
  return { ...s, layout, selection, past, future: merge ? s.future : [], lastKey: o.key ?? null, lastAt: at };
}

/** A fresh id like `text-3`, not used on any side. */
export function uniqueId(base: string, layout: DocLayout, taken: Set<string> = new Set()): string {
  const used = new Set([...taken, ...layout.sides.flatMap((x) => x.elements.map((e) => e.id))]);
  const stem = base.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-\d+$/, '').slice(0, 50) || 'element';
  for (let i = 1; ; i++) {
    const id = `${stem}-${i}`;
    if (!used.has(id)) return id;
  }
}

/** Ids to select for `ids`: whole groups unless `deep`. */
function expandGroups(els: DocElement[], ids: string[], deep = false): string[] {
  if (deep) return ids;
  const groups = new Set(els.filter((e) => ids.includes(e.id) && e.group).map((e) => e.group!));
  const out = [...ids];
  for (const e of els) if (e.group && groups.has(e.group) && !out.includes(e.id)) out.push(e.id);
  return out;
}

/** The selection split into units that move as one: a group, or a single element. */
function units(els: DocElement[], ids: string[]): DocElement[][] {
  const out: DocElement[][] = [];
  const byGroup = new Map<string, DocElement[]>();
  for (const id of ids) {
    const e = els.find((x) => x.id === id);
    if (!e || e.locked) continue;
    if (e.group) {
      let g = byGroup.get(e.group);
      if (!g) {
        byGroup.set(e.group, (g = []));
        out.push(g);
      }
      g.push(e);
    } else out.push([e]);
  }
  return out;
}

function moveBy(els: DocElement[], ids: Set<string>, dx: number, dy: number): DocElement[] {
  return els.map((e) => (ids.has(e.id) && !e.locked ? { ...e, x: round(e.x + dx), y: round(e.y + dy) } : e));
}

/** Copies of elements with fresh ids (and fresh group ids), offset by `off` mm. */
function cloneAll(layout: DocLayout, els: DocElement[], off: number): DocElement[] {
  const taken = new Set<string>();
  const groupMap = new Map<string, string>();
  const groups = new Set(layout.sides.flatMap((x) => x.elements.map((e) => e.group).filter(Boolean)));
  return els.map((e) => {
    const id = uniqueId(e.id, layout, taken);
    taken.add(id);
    let group = e.group;
    if (group) {
      if (!groupMap.has(group)) {
        let n = 1;
        while (groups.has(`group-${n}`) || [...groupMap.values()].includes(`group-${n}`)) n++;
        groupMap.set(group, `group-${n}`);
      }
      group = groupMap.get(group);
    }
    const copy = { ...structuredClone(e), id, x: round(e.x + off), y: round(e.y + off), locked: undefined } as DocElement;
    if (group) copy.group = group;
    return copy;
  });
}

const others = (els: DocElement[], ids: Set<string>) => els.filter((e) => !ids.has(e.id) && !e.hidden).map(boxOf);

// ---------------------------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------------------------

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  const side = currentSide(s);
  const els = side.elements;
  switch (a.type) {
    case 'load':
      return { ...initialState(a.layout), sideId: a.layout.sides.some((x) => x.id === s.sideId) ? s.sideId : a.layout.sides[0].id, clipboard: s.clipboard };
    case 'markSaved':
      return { ...s, saved: a.json };
    case 'setSide':
      return s.layout.sides.some((x) => x.id === a.sideId) ? { ...s, sideId: a.sideId, selection: [], guides: [], hints: [] } : s;

    case 'select': {
      const valid = a.ids.filter((id) => els.some((e) => e.id === id));
      const ids = expandGroups(els, valid, a.deep);
      if (a.mode === 'add') return { ...s, selection: [...new Set([...s.selection, ...ids])] };
      if (a.mode === 'toggle') {
        const allIn = ids.every((id) => s.selection.includes(id));
        return { ...s, selection: allIn ? s.selection.filter((id) => !ids.includes(id)) : [...new Set([...s.selection, ...ids])] };
      }
      return { ...s, selection: ids };
    }
    case 'selectAll':
      return { ...s, selection: els.filter((e) => !e.locked && !e.hidden).map((e) => e.id) };
    case 'selectNext': {
      if (!els.length) return s;
      const cur = s.selection.length ? els.findIndex((e) => e.id === s.selection[s.selection.length - 1]) : a.dir === 1 ? -1 : els.length;
      const next = (cur + a.dir + els.length) % els.length;
      return { ...s, selection: [els[next].id] };
    }

    // --- gestures (drag, resize, rotate): one undo step each ---------------------------------
    case 'gestureStart': {
      const origin: Gesture['origin'] = {};
      for (const e of els) if (s.selection.includes(e.id) && !e.locked) origin[e.id] = { x: e.x, y: e.y, w: e.w, h: e.h, rotationDeg: e.rotationDeg ?? 0 };
      if (!Object.keys(origin).length) return s;
      const past = [...s.past, { layout: s.layout, sideId: s.sideId, selection: s.selection }].slice(-HISTORY_LIMIT);
      return { ...s, past, future: [], lastKey: null, gesture: { kind: a.kind, origin, changed: false } };
    }
    case 'drag': {
      if (!s.gesture) return s;
      const ids = new Set(Object.keys(s.gesture.origin));
      const start = unionBox(Object.values(s.gesture.origin));
      const moved = { ...start, x: start.x + a.dx, y: start.y + a.dy };
      const page = pageMm(s.layout);
      const snap = snapMove(moved, snapTargets(page, s.layout.page.marginMm ?? 0, others(els, ids)), a.snap);
      const dx = a.dx + snap.dx;
      const dy = a.dy + snap.dy;
      const layout = withSide(s, (list) => list.map((e) => (ids.has(e.id) ? { ...e, x: round(s.gesture!.origin[e.id].x + dx), y: round(s.gesture!.origin[e.id].y + dy) } : e)));
      const final = { ...start, x: start.x + dx, y: start.y + dy };
      return { ...s, layout, guides: snap.guides, hints: a.snap.objects ? spacingHints(final, others(els, ids), page) : [], gesture: { ...s.gesture, changed: true } };
    }
    case 'resize': {
      if (!s.gesture) return s;
      const ids = Object.keys(s.gesture.origin);
      const page = pageMm(s.layout);
      const targets = snapTargets(page, s.layout.page.marginMm ?? 0, others(els, new Set(ids)));
      let next: Record<string, Box>;
      let guides: Guide[] = [];
      if (ids.length === 1 && s.gesture.origin[ids[0]].rotationDeg) {
        const o = s.gesture.origin[ids[0]];
        next = { [ids[0]]: resizeRotated(o, o.rotationDeg, a.handle, a.dx, a.dy, a.keepRatio) };
      } else {
        const from = unionBox(Object.values(s.gesture.origin));
        let to = resizeRotated(from, 0, a.handle, a.dx, a.dy, a.keepRatio);
        if (!a.keepRatio && (a.snap.objects || a.snap.grid)) {
          const r = snapResize(to, a.handle, targets, a.snap);
          to = r.box;
          guides = r.guides;
        }
        next = Object.fromEntries(ids.map((id) => [id, scaleInto(s.gesture!.origin[id], from, to)]));
      }
      const layout = withSide(s, (list) => list.map((e) => (next[e.id] ? { ...e, x: round(next[e.id].x), y: round(next[e.id].y), w: round(next[e.id].w), h: round(next[e.id].h) } : e)));
      return { ...s, layout, guides, hints: [], gesture: { ...s.gesture, changed: true } };
    }
    case 'rotate': {
      if (!s.gesture) return s;
      const ids = new Set(Object.keys(s.gesture.origin));
      const deg = ((((a.deg + 180) % 360) + 360) % 360) - 180;
      const layout = withSide(s, (list) => list.map((e) => (ids.has(e.id) ? { ...e, rotationDeg: Math.round(deg * 10) / 10 || undefined } : e)));
      return { ...s, layout, gesture: { ...s.gesture, changed: true } };
    }
    case 'gestureEnd': {
      if (!s.gesture) return s;
      const st = { ...s, gesture: null, guides: [], hints: [] };
      // Nothing moved: drop the undo step the gesture opened.
      return s.gesture.changed ? st : { ...st, past: s.past.slice(0, -1) };
    }

    case 'nudge': {
      const ids = new Set(units(els, s.selection).flat().map((e) => e.id));
      if (!ids.size) return s;
      return commit(s, withSide(s, (list) => moveBy(list, ids, a.dx, a.dy)), { key: `nudge:${[...ids].join(',')}`, at: a.at });
    }

    // --- adding and removing ---------------------------------------------------------------
    case 'add': {
      const id = els.some((e) => e.id === a.element.id) || s.layout.sides.some((x) => x.elements.some((e) => e.id === a.element.id)) ? uniqueId(a.element.type, s.layout) : a.element.id;
      const element = { ...a.element, id };
      return commit(s, withSide(s, (list) => [...list, element]), { selection: a.select === false ? s.selection : [id] });
    }
    case 'remove': {
      const ids = new Set(s.selection.filter((id) => !els.find((e) => e.id === id)?.locked));
      if (!ids.size) return s;
      // Elements that flowed after a removed one stay where they are.
      return commit(s, withSide(s, (list) => list.filter((e) => !ids.has(e.id)).map((e) => (e.flowAfter && ids.has(e.flowAfter) ? { ...e, flowAfter: undefined } : e))), { selection: [] });
    }
    case 'duplicate': {
      const picked = els.filter((e) => s.selection.includes(e.id));
      if (!picked.length) return s;
      const copies = cloneAll(s.layout, picked, 3);
      return commit(s, withSide(s, (list) => [...list, ...copies]), { selection: copies.map((e) => e.id) });
    }
    case 'copy': {
      const picked = els.filter((e) => s.selection.includes(e.id));
      return picked.length ? { ...s, clipboard: structuredClone(picked), pastes: {} } : s;
    }
    case 'cut': {
      const picked = els.filter((e) => s.selection.includes(e.id) && !e.locked);
      if (!picked.length) return s;
      return editorReducer({ ...s, clipboard: structuredClone(picked), pastes: {}, selection: picked.map((e) => e.id) }, { type: 'remove' });
    }
    case 'paste': {
      if (!s.clipboard?.length) return s;
      // Over the originals, a paste lands 3 mm off; each further paste on the side 3 mm more.
      const n = s.pastes[s.sideId] ?? 0;
      const over = s.clipboard.some((c) => els.some((e) => e.id === c.id && e.x === c.x && e.y === c.y));
      const copies = cloneAll(s.layout, s.clipboard, (over ? 3 : 0) + n * 3);
      const next = { ...s, pastes: { ...s.pastes, [s.sideId]: n + 1 } };
      return commit(next, withSide(next, (list) => [...list, ...copies]), { selection: copies.map((e) => e.id) });
    }

    // --- order -----------------------------------------------------------------------------
    case 'zorder': {
      const sel = new Set(s.selection);
      if (!sel.size) return s;
      let list = [...els];
      if (a.to === 'front') list = [...list.filter((e) => !sel.has(e.id)), ...list.filter((e) => sel.has(e.id))];
      else if (a.to === 'back') list = [...list.filter((e) => sel.has(e.id)), ...list.filter((e) => !sel.has(e.id))];
      else if (a.to === 'forward') {
        for (let i = list.length - 2; i >= 0; i--) if (sel.has(list[i].id) && !sel.has(list[i + 1].id)) [list[i], list[i + 1]] = [list[i + 1], list[i]];
      } else {
        for (let i = 1; i < list.length; i++) if (sel.has(list[i].id) && !sel.has(list[i - 1].id)) [list[i], list[i - 1]] = [list[i - 1], list[i]];
      }
      if (list.every((e, i) => e === els[i])) return s;
      return commit(s, withSide(s, () => list));
    }
    case 'reorder': {
      const from = els.findIndex((e) => e.id === a.id);
      if (from < 0) return s;
      const to = Math.max(0, Math.min(els.length - 1, a.index));
      if (from === to) return s;
      const list = [...els];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return commit(s, withSide(s, () => list));
    }

    // --- flags and names -------------------------------------------------------------------
    case 'toggleLock':
    case 'toggleHide': {
      const ids = new Set(a.ids ?? s.selection);
      const flag = a.type === 'toggleLock' ? 'locked' : 'hidden';
      const picked = els.filter((e) => ids.has(e.id));
      if (!picked.length) return s;
      const on = !picked.every((e) => e[flag]);
      const layout = withSide(s, (list) => list.map((e) => (ids.has(e.id) ? { ...e, [flag]: on || undefined } : e)));
      // Hidden and locked elements leave the selection (they cannot be moved).
      return commit(s, layout, { selection: on ? s.selection.filter((id) => !ids.has(id)) : s.selection });
    }
    case 'rename':
      return commit(
        s,
        withSide(s, (list) => list.map((e) => (e.id === a.id ? { ...e, name: a.name.slice(0, 80) || undefined } : e))),
        { key: `rename:${a.id}`, at: a.at },
      );
    case 'group': {
      const picked = els.filter((e) => s.selection.includes(e.id));
      if (picked.length < 2) return s;
      const existing = new Set(s.layout.sides.flatMap((x) => x.elements.map((e) => e.group).filter(Boolean)));
      let n = 1;
      while (existing.has(`group-${n}`)) n++;
      const gid = `group-${n}`;
      return commit(s, withSide(s, (list) => list.map((e) => (s.selection.includes(e.id) ? { ...e, group: gid } : e))));
    }
    case 'ungroup': {
      const groups = new Set(els.filter((e) => s.selection.includes(e.id) && e.group).map((e) => e.group));
      if (!groups.size) return s;
      return commit(s, withSide(s, (list) => list.map((e) => (e.group && groups.has(e.group) ? { ...e, group: undefined } : e))));
    }

    // --- align and distribute --------------------------------------------------------------
    case 'align':
    case 'distribute': {
      const us = units(els, s.selection);
      if (!us.length || (a.type === 'distribute' && us.length < 3)) return s;
      const boxes = us.map((u) => unionBox(u.map(boxOf)));
      const { w, h } = pageMm(s.layout);
      const offs = a.type === 'align' ? alignOffsets(boxes, a.mode, us.length > 1 ? unionBox(boxes) : { x: 0, y: 0, w, h }) : distributeOffsets(boxes, a.axis);
      const delta = new Map<string, { dx: number; dy: number }>();
      us.forEach((u, i) => u.forEach((e) => delta.set(e.id, offs[i])));
      const layout = withSide(s, (list) => list.map((e) => (delta.has(e.id) ? { ...e, x: round(e.x + delta.get(e.id)!.dx), y: round(e.y + delta.get(e.id)!.dy) } : e)));
      return commit(s, layout);
    }

    // --- properties ------------------------------------------------------------------------
    case 'update':
      return commit(
        s,
        withSide(s, (list) => list.map((e) => (e.id === a.id ? ({ ...e, ...a.patch, id: e.id, type: e.type } as DocElement) : e))),
        { key: a.key ? `${a.id}:${a.key}` : undefined, at: a.at },
      );
    case 'updateMany': {
      const ids = new Set(a.ids);
      return commit(
        s,
        withSide(s, (list) => list.map((e) => (ids.has(e.id) ? ({ ...e, ...a.patch, id: e.id, type: e.type } as DocElement) : e))),
        { key: a.key ? `many:${a.ids.join(',')}:${a.key}` : undefined, at: a.at },
      );
    }
    case 'replace':
      return commit(s, withSide(s, (list) => list.map((e) => (e.id === a.id ? { ...structuredClone(a.element), id: e.id } : e))));
    case 'setPage': {
      const page = { ...s.layout.page, ...a.patch };
      if (page.size !== 'custom') {
        delete page.widthMm;
        delete page.heightMm;
      }
      return commit(s, { ...s.layout, page }, { key: a.key ? `page:${a.key}` : undefined, at: a.at });
    }
    case 'setFonts':
      return commit(s, { ...s.layout, fonts: a.fonts && (a.fonts.heading || a.fonts.body) ? a.fonts : undefined });
    case 'setBackground':
      return commit(s, { ...s.layout, sides: s.layout.sides.map((x) => (x.id === s.sideId ? { ...x, background: a.fill } : x)) }, { key: a.key ? `bg:${a.key}` : undefined, at: a.at });
    case 'clearGuides':
      return { ...s, guides: [], hints: [] };

    // --- history ---------------------------------------------------------------------------
    case 'undo': {
      const prev = s.past[s.past.length - 1];
      if (!prev || s.gesture) return s;
      return { ...s, ...prev, past: s.past.slice(0, -1), future: [{ layout: s.layout, sideId: s.sideId, selection: s.selection }, ...s.future], lastKey: null };
    }
    case 'redo': {
      const next = s.future[0];
      if (!next || s.gesture) return s;
      return { ...s, ...next, future: s.future.slice(1), past: [...s.past, { layout: s.layout, sideId: s.sideId, selection: s.selection }], lastKey: null };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/** A problem with the layout, tied to the element (and property) it is about when there is one. */
export interface LayoutProblem {
  sideId: string | null;
  elementId: string | null;
  /** The property path inside the element (`style.sizePt`), or the layout path. */
  field: string;
  message: string;
}

/** Problems from Zod issue paths (the shared schema's, or the API's `issues`). */
export function problemsFrom(layout: DocLayout, issues: { path: readonly PropertyKey[]; message: string }[]): LayoutProblem[] {
  return issues.map((i) => {
    const p = i.path.map((k) => (typeof k === 'symbol' ? String(k) : k));
    if (p[0] === 'sides' && typeof p[1] === 'number') {
      const side = layout.sides[p[1]];
      if (p[2] === 'elements' && typeof p[3] === 'number') return { sideId: side?.id ?? null, elementId: side?.elements[p[3]]?.id ?? null, field: p.slice(4).join('.'), message: i.message };
      return { sideId: side?.id ?? null, elementId: null, field: p.slice(2).join('.'), message: i.message };
    }
    return { sideId: null, elementId: null, field: p.join('.'), message: i.message };
  });
}

/** Checks the layout against the API's schema. */
export function validateLayout(layout: unknown): { ok: true; layout: DocLayout } | { ok: false; problems: LayoutProblem[] } {
  const r = DocLayoutSchema.safeParse(layout);
  if (r.success) return { ok: true, layout: r.data };
  return { ok: false, problems: problemsFrom(layout as DocLayout, r.error.issues) };
}
