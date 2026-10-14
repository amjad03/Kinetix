import { describe, expect, it } from 'vitest';
import { type AddKind, newElement } from './factory';
import { alignOffsets, distributeOffsets, resizeBox, resizeRotated, snapMove, snapTargets, spacingHints } from './geometry';
import { currentSide, editorReducer, type EditorAction, type EditorState, HISTORY_LIMIT, initialState, isDirty, problemsFrom, validateLayout } from './model';
import { type DocElement, type DocLayout, DocLayoutSchema, ElementSchema } from './schema';

const NO_SNAP = { objects: false, grid: null, threshold: 1 };
const SNAP = { objects: true, grid: null, threshold: 1 };

const rect = (id: string, x: number, y: number, w: number, h: number, more: Partial<DocElement> = {}): DocElement => ({ id, type: 'shape', shape: 'rect', x, y, w, h, fill: 'primary', ...more }) as DocElement;

/** A CR80 card, front and back, the way the API returns a template (defaults applied). */
function card(): DocLayout {
  return DocLayoutSchema.parse({
    schemaVersion: 1,
    docType: 'student_id_card',
    page: { size: 'CR80', orientation: 'portrait', marginMm: 3 },
    sides: [
      { id: 'front', label: 'Front', background: 'paper', elements: [rect('band', 0, 0, 53.98, 14), rect('photo', 15, 20, 24, 30), rect('name', 5, 55, 44, 6), rect('roll', 5, 63, 30, 5)] },
      { id: 'back', label: 'Back', elements: [rect('qr', 15, 10, 24, 24)] },
    ],
  });
}

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const el = (s: EditorState, id: string) => currentSide(s).elements.find((e) => e.id === id)!;
const ids = (s: EditorState) => currentSide(s).elements.map((e) => e.id);

describe('editor reducer', () => {
  it('moves the selection by drag in one undo step, and undo/redo restore it', () => {
    let s = run(initialState(card()), { type: 'select', ids: ['photo'] }, { type: 'gestureStart', kind: 'move' });
    for (let i = 1; i <= 5; i++) s = editorReducer(s, { type: 'drag', dx: i, dy: i / 2, snap: NO_SNAP });
    s = editorReducer(s, { type: 'gestureEnd' });
    expect(el(s, 'photo')).toMatchObject({ x: 20, y: 22.5 });
    expect(s.past).toHaveLength(1);
    expect(isDirty(s)).toBe(true);
    s = editorReducer(s, { type: 'undo' });
    expect(el(s, 'photo')).toMatchObject({ x: 15, y: 20 });
    expect(isDirty(s)).toBe(false);
    s = editorReducer(s, { type: 'redo' });
    expect(el(s, 'photo')).toMatchObject({ x: 20, y: 22.5 });
  });

  it('drops the undo step of a click that did not move anything, and never moves locked elements', () => {
    let s = run(initialState(card()), { type: 'select', ids: ['photo'] }, { type: 'gestureStart', kind: 'move' }, { type: 'gestureEnd' });
    expect(s.past).toHaveLength(0);
    s = run(s, { type: 'toggleLock', ids: ['name'] }, { type: 'select', ids: ['name', 'roll'] }, { type: 'nudge', dx: 1, dy: 0, at: 1 });
    expect(el(s, 'name').x).toBe(5);
    expect(el(s, 'roll').x).toBe(6);
  });

  it('nudges with the arrow keys, a quick run of nudges being one undo step', () => {
    let s = run(initialState(card()), { type: 'select', ids: ['roll'] });
    s = run(s, { type: 'nudge', dx: 0.1, dy: 0, at: 1000 }, { type: 'nudge', dx: 0.1, dy: 0, at: 1100 }, { type: 'nudge', dx: 1, dy: 0, at: 1200 });
    expect(el(s, 'roll').x).toBe(6.2);
    expect(s.past).toHaveLength(1);
    s = editorReducer(s, { type: 'nudge', dx: 0, dy: 1, at: 9000 });
    expect(s.past).toHaveLength(2);
    expect(editorReducer(s, { type: 'undo' }).layout.sides[0].elements.find((e) => e.id === 'roll')).toMatchObject({ x: 6.2, y: 63 });
  });

  it('snaps a dragged element to the page centre and other elements, with guides', () => {
    let s = run(initialState(card()), { type: 'select', ids: ['roll'] }, { type: 'gestureStart', kind: 'move' });
    // roll is 30 wide at x=5: centre 20. Page centre is 26.99; move by 6.6 and it snaps the last 0.39.
    s = editorReducer(s, { type: 'drag', dx: 6.6, dy: 0, snap: SNAP });
    expect(el(s, 'roll').x).toBeCloseTo(11.99, 2);
    expect(s.guides.some((g) => g.axis === 'x' && Math.abs(g.pos - 26.99) < 0.01)).toBe(true);
    // Its top lands on the bottom of the name (61) when close enough.
    s = editorReducer(s, { type: 'drag', dx: 6.6, dy: -1.6, snap: SNAP });
    expect(el(s, 'roll').y).toBe(61);
    expect(s.hints.length).toBeGreaterThan(0);
    s = editorReducer(s, { type: 'gestureEnd' });
    expect(s.guides).toEqual([]);
    // With a grid and no object snapping, the corner lands on the grid.
    s = run(s, { type: 'gestureStart', kind: 'move' }, { type: 'drag', dx: 0.7, dy: 0.2, snap: { objects: false, grid: 1, threshold: 1 } }, { type: 'gestureEnd' });
    expect(el(s, 'roll')).toMatchObject({ x: 13, y: 61 });
  });

  it('resizes from a handle, keeps the ratio with shift, and scales a multi-selection together', () => {
    let s = run(initialState(card()), { type: 'select', ids: ['photo'] }, { type: 'gestureStart', kind: 'resize' }, { type: 'resize', handle: 'se', dx: 6, dy: 2, keepRatio: false, snap: NO_SNAP }, { type: 'gestureEnd' });
    expect(el(s, 'photo')).toMatchObject({ x: 15, y: 20, w: 30, h: 32 });
    s = run(s, { type: 'undo' }, { type: 'gestureStart', kind: 'resize' }, { type: 'resize', handle: 'nw', dx: -6, dy: 0, keepRatio: true, snap: NO_SNAP }, { type: 'gestureEnd' });
    expect(el(s, 'photo')).toMatchObject({ x: 9, w: 30, h: 37.5, y: 12.5 });
    s = run(s, { type: 'select', ids: ['name', 'roll'] }, { type: 'gestureStart', kind: 'resize' }, { type: 'resize', handle: 'e', dx: 44, dy: 0, keepRatio: false, snap: NO_SNAP }, { type: 'gestureEnd' });
    // The pair was 44 wide (5..49): now 88, each scaled by 2 from the left edge.
    expect(el(s, 'name')).toMatchObject({ x: 5, w: 88 });
    expect(el(s, 'roll')).toMatchObject({ x: 5, w: 60 });
  });

  it('rotates in one step, normalising the angle', () => {
    const s = run(initialState(card()), { type: 'select', ids: ['photo'] }, { type: 'gestureStart', kind: 'rotate' }, { type: 'rotate', deg: 200 }, { type: 'gestureEnd' });
    expect(el(s, 'photo').rotationDeg).toBe(-160);
    expect(s.past).toHaveLength(1);
  });

  it('changes z-order: front, back, forward and backward', () => {
    let s = run(initialState(card()), { type: 'select', ids: ['band'] }, { type: 'zorder', to: 'front' });
    expect(ids(s)).toEqual(['photo', 'name', 'roll', 'band']);
    s = run(s, { type: 'zorder', to: 'backward' });
    expect(ids(s)).toEqual(['photo', 'name', 'band', 'roll']);
    s = run(s, { type: 'select', ids: ['roll'] }, { type: 'zorder', to: 'back' });
    expect(ids(s)).toEqual(['roll', 'photo', 'name', 'band']);
    s = run(s, { type: 'zorder', to: 'forward' });
    expect(ids(s)).toEqual(['photo', 'roll', 'name', 'band']);
    // Already at the front: nothing to undo.
    const before = s.past.length;
    s = run(s, { type: 'select', ids: ['band'] }, { type: 'zorder', to: 'front' });
    expect(s.past).toHaveLength(before);
    s = run(s, { type: 'reorder', id: 'band', index: 0 });
    expect(ids(s)[0]).toBe('band');
  });

  it('aligns to the selection or, for one element, to the page; distributes with equal gaps', () => {
    let s = run(initialState(card()), { type: 'select', ids: ['name', 'roll'] }, { type: 'align', mode: 'right' });
    expect(el(s, 'roll').x + el(s, 'roll').w).toBe(49);
    s = run(s, { type: 'select', ids: ['photo'] }, { type: 'align', mode: 'hcenter' });
    expect(el(s, 'photo').x).toBeCloseTo(14.99, 2);
    s = run(s, { type: 'select', ids: ['band', 'photo', 'roll'] }, { type: 'align', mode: 'left' });
    expect([el(s, 'band').x, el(s, 'photo').x, el(s, 'roll').x]).toEqual([0, 0, 0]);
    s = run(initialState(card()), { type: 'select', ids: ['band', 'photo', 'name', 'roll'] }, { type: 'distribute', axis: 'y' });
    // band 0-14, roll ends at 68; heights 14+30+6+5 = 55, so three gaps of 13/3.
    const gap = 13 / 3;
    expect(el(s, 'photo').y).toBeCloseTo(14 + gap, 1);
    expect(el(s, 'name').y).toBeCloseTo(14 + gap + 30 + gap, 1);
    expect(el(s, 'roll').y).toBe(63);
    // Two elements cannot be distributed.
    expect(run(s, { type: 'select', ids: ['band', 'roll'] }, { type: 'distribute', axis: 'x' }).past).toHaveLength(s.past.length);
  });

  it('groups: a click selects the group, it moves together, ungroup frees it', () => {
    let s = run(initialState(card()), { type: 'select', ids: ['name', 'roll'] }, { type: 'group' });
    expect(el(s, 'name').group).toBe('group-1');
    s = run(s, { type: 'select', ids: ['roll'] });
    expect(s.selection.sort()).toEqual(['name', 'roll']);
    expect(run(s, { type: 'select', ids: ['roll'], deep: true }).selection).toEqual(['roll']);
    s = run(s, { type: 'nudge', dx: 2, dy: 0, at: 1 });
    expect([el(s, 'name').x, el(s, 'roll').x]).toEqual([7, 7]);
    // Aligning treats the group as one: its left edge goes to the page's left.
    s = run(s, { type: 'align', mode: 'left' });
    expect([el(s, 'name').x, el(s, 'roll').x]).toEqual([0, 0]);
    s = run(s, { type: 'ungroup' });
    expect(el(s, 'name').group).toBeUndefined();
  });

  it('duplicates, copies, cuts and pastes with fresh ids', () => {
    let s = run(initialState(card()), { type: 'select', ids: ['photo'] }, { type: 'duplicate' });
    expect(s.selection).toEqual(['photo-1']);
    expect(el(s, 'photo-1')).toMatchObject({ x: 18, y: 23 });
    s = run(s, { type: 'select', ids: ['roll'] }, { type: 'copy' }, { type: 'paste' }, { type: 'paste' });
    expect(ids(s)).toEqual(['band', 'photo', 'name', 'roll', 'photo-1', 'roll-1', 'roll-2']);
    expect(el(s, 'roll-2').x).toBe(11);
    // Paste on the other side keeps the position.
    s = run(s, { type: 'setSide', sideId: 'back' }, { type: 'paste' });
    expect(currentSide(s).elements.map((e) => e.id)).toEqual(['qr', 'roll-3']);
    s = run(s, { type: 'select', ids: ['qr'] }, { type: 'cut' });
    expect(currentSide(s).elements.map((e) => e.id)).toEqual(['roll-3']);
    s = run(s, { type: 'paste' });
    expect(el(s, 'qr-1')).toMatchObject({ x: 15, y: 10 });
  });

  it('adds, deletes (not locked ones), hides, renames and edits properties', () => {
    let s = run(initialState(card()), { type: 'add', element: rect('photo', 1, 1, 5, 5) });
    expect(s.selection).toEqual(['shape-1']);
    s = run(s, { type: 'select', ids: ['roll', 'name'] }, { type: 'toggleLock', ids: ['name'] }, { type: 'select', ids: ['roll', 'name'] }, { type: 'remove' });
    expect(ids(s)).toEqual(['band', 'photo', 'name', 'shape-1']);
    s = run(s, { type: 'toggleHide', ids: ['band'] });
    expect(el(s, 'band').hidden).toBe(true);
    s = run(s, { type: 'rename', id: 'band', name: 'Header band', at: 10 }, { type: 'rename', id: 'band', name: 'Header band 2', at: 300 });
    expect(el(s, 'band').name).toBe('Header band 2');
    const steps = s.past.length;
    // Typing into one field is one step.
    s = run(s, { type: 'update', id: 'photo', patch: { opacity: 0.5 }, key: 'opacity', at: 5000 }, { type: 'update', id: 'photo', patch: { opacity: 0.4 }, key: 'opacity', at: 5200 });
    expect(s.past).toHaveLength(steps + 1);
    expect(el(s, 'photo').opacity).toBe(0.4);
    expect(editorReducer(s, { type: 'undo' }).layout.sides[0].elements.find((e) => e.id === 'photo')!.opacity).toBeUndefined();
  });

  it('keeps a deep but bounded history and clears redo on a new change', () => {
    let s = initialState(card());
    s = run(s, { type: 'select', ids: ['roll'] });
    for (let i = 0; i < HISTORY_LIMIT + 30; i++) s = editorReducer(s, { type: 'nudge', dx: 1, dy: 0, at: i * 10_000 });
    expect(s.past).toHaveLength(HISTORY_LIMIT);
    s = run(s, { type: 'undo' }, { type: 'undo' });
    expect(s.future).toHaveLength(2);
    s = run(s, { type: 'nudge', dx: 0, dy: 1, at: 10e9 });
    expect(s.future).toHaveLength(0);
  });

  it('switches page size and orientation, and the side background', () => {
    let s = run(initialState(card()), { type: 'setPage', patch: { orientation: 'landscape' } });
    expect(s.layout.page.orientation).toBe('landscape');
    s = run(s, { type: 'setPage', patch: { size: 'custom', widthMm: 100, heightMm: 70 } }, { type: 'setPage', patch: { size: 'A4' } });
    expect(s.layout.page).toEqual({ size: 'A4', orientation: 'landscape', marginMm: 3 });
    s = run(s, { type: 'setBackground', fill: { kind: 'linear', angleDeg: 90, stops: [{ at: 0, color: 'primary.10' }, { at: 1, color: 'paper' }] } });
    expect(currentSide(s).background).toMatchObject({ kind: 'linear' });
  });
});

describe('geometry', () => {
  it('resizes from each handle with a minimum size and keeps the ratio on edges about the centre', () => {
    const b = { x: 10, y: 10, w: 20, h: 10 };
    expect(resizeBox(b, 'w', 5, 0)).toEqual({ x: 15, y: 10, w: 15, h: 10 });
    expect(resizeBox(b, 'n', 0, 50)).toEqual({ x: 10, y: 19.5, w: 20, h: 0.5 });
    expect(resizeBox(b, 'e', 10, 0, true)).toEqual({ x: 10, y: 7.5, w: 30, h: 15 });
    expect(resizeBox(b, 'se', 2, 10, true)).toEqual({ x: 10, y: 10, w: 40, h: 20 });
  });

  it('keeps the opposite corner of a rotated box in place while resizing', () => {
    const o = { x: 0, y: 0, w: 20, h: 10 };
    const corner = (b: typeof o, deg: number) => {
      const r = (deg * Math.PI) / 180;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const [px, py] = [b.x - cx, b.y - cy];
      return [cx + px * Math.cos(r) - py * Math.sin(r), cy + px * Math.sin(r) + py * Math.cos(r)];
    };
    const n = resizeRotated(o, 90, 'se', 0, 5);
    expect(n.w).toBeCloseTo(25);
    const [ax, ay] = corner(o, 90);
    const [bx, by] = corner(n, 90);
    expect(bx).toBeCloseTo(ax);
    expect(by).toBeCloseTo(ay);
  });

  it('snaps to the nearest line within the threshold and to the grid otherwise', () => {
    const t = snapTargets({ w: 100, h: 100 }, 10, [{ x: 40, y: 40, w: 10, h: 10 }]);
    expect(snapMove({ x: 9.6, y: 70, w: 5, h: 5 }, t, { objects: true, grid: null, threshold: 0.5 })).toMatchObject({ dx: expect.closeTo(0.4), dy: 0 });
    expect(snapMove({ x: 37.4, y: 70, w: 5, h: 5 }, t, { objects: true, grid: 2, threshold: 0.5 })).toMatchObject({ dx: expect.closeTo(0.1), dy: 0 });
    expect(snapMove({ x: 33.3, y: 71.2, w: 5, h: 5 }, t, { objects: false, grid: 2, threshold: 0.5 })).toMatchObject({ dx: expect.closeTo(0.7), dy: expect.closeTo(0.8), guides: [] });
    expect(spacingHints({ x: 60, y: 42, w: 10, h: 4 }, [{ x: 40, y: 40, w: 10, h: 10 }], { w: 100, h: 100 })).toEqual(
      expect.arrayContaining([{ axis: 'x', from: 50, to: 60, at: 44 }, { axis: 'x', from: 70, to: 100, at: 44 }]),
    );
  });

  it('computes align and distribute offsets', () => {
    const boxes = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 5, w: 10, h: 10 }, { x: 15, y: 20, w: 4, h: 4 }];
    expect(alignOffsets(boxes, 'bottom', { x: 0, y: 0, w: 40, h: 24 }).map((o) => o.dy)).toEqual([14, 9, 0]);
    expect(distributeOffsets(boxes, 'x').map((o) => o.dx)).toEqual([0, 0, 3]);
  });
});

describe('layout round trip against the shared schema', () => {
  const KINDS: AddKind[] = ['heading', 'text', 'field', 'fieldList', 'image', 'signature', 'qr', 'barcode', 'table', 'rect', 'rounded', 'line', 'circle', 'band', 'watermark', 'guilloche', 'rosette', 'frame', 'seal'];

  it('builds every kind of element valid for the API, and an edited layout survives JSON and the schema unchanged', () => {
    let s = initialState(card());
    for (const k of KINDS) {
      const e = newElement(k, s.layout, k === 'image' ? { source: 'photo' } : k === 'table' ? { list: { key: 'student.rows', label: 'Rows', kind: 'list', sample: '2 items', itemKeys: ['code', 'subject'] } } : {});
      expect(ElementSchema.safeParse(e).success, k).toBe(true);
      s = editorReducer(s, { type: 'add', element: e });
    }
    s = run(s, { type: 'selectAll' }, { type: 'nudge', dx: 0.3, dy: 0.1, at: 1 }, { type: 'select', ids: ['text-1', 'qr-1'] }, { type: 'group' }, { type: 'zorder', to: 'back' }, { type: 'update', id: 'heading', patch: { rotationDeg: 12, opacity: 0.9 } });
    const json = JSON.parse(JSON.stringify(s.layout));
    const parsed = validateLayout(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.layout).toEqual(json);
    expect(DocLayoutSchema.parse(json)).toEqual(s.layout);
  });

  it('reports what is wrong, on the element and property at fault', () => {
    let s = run(initialState(card()), { type: 'update', id: 'name', patch: { opacity: 4 } as Partial<DocElement> }, { type: 'setSide', sideId: 'back' }, { type: 'update', id: 'qr', patch: { fill: 'teal' } as Partial<DocElement> });
    const r = validateLayout(s.layout);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems).toEqual(expect.arrayContaining([expect.objectContaining({ sideId: 'front', elementId: 'name', field: 'opacity' }), expect.objectContaining({ sideId: 'back', elementId: 'qr', field: 'fill' })]));
    }
    // The API's issues (same paths) map the same way.
    s = initialState(card());
    expect(problemsFrom(s.layout, [{ path: ['sides', 0, 'elements', 3, 'w'], message: 'Too small' }, { path: ['page', 'size'], message: 'Bad' }])).toEqual([
      { sideId: 'front', elementId: 'roll', field: 'w', message: 'Too small' },
      { sideId: null, elementId: null, field: 'page.size', message: 'Bad' },
    ]);
  });
});
