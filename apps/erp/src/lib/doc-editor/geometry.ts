/**
 * Geometry of the template editor, in millimetres: boxes, resizing from a handle (rotated boxes
 * keep their opposite corner in place), snapping to the page, margins, grid and other elements
 * with the guides to draw, spacing hints, and align / distribute. Pure functions, tested in
 * geometry.test.ts and model.test.ts.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Smallest box side the editor makes, mm (a line may be 0 thick). */
export const MIN_SIZE = 0.5;

/** Rounds to 0.01 mm, the precision the editor stores. */
export const round = (v: number) => Math.round(v * 100) / 100;

export const unionBox = (boxes: Box[]): Box => {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The axis-aligned box a rotated box covers. */
export function rotatedBounds(b: Box, deg = 0): Box {
  if (!deg) return b;
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const w = b.w * c + b.h * s;
  const h = b.w * s + b.h * c;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

/**
 * The box after dragging `handle` by (dx, dy). The opposite edge stays put; `keepRatio` keeps the
 * proportions (corner handles follow the larger change; edge handles grow the other side about the
 * centre). Dragging past the opposite edge stops at the minimum size.
 */
export function resizeBox(o: Box, handle: Handle, dx: number, dy: number, keepRatio = false, min = MIN_SIZE): Box {
  let { x, y, w, h } = o;
  const left = handle.includes('w');
  const right = handle.includes('e');
  const top = handle.includes('n');
  const bottom = handle.includes('s');
  if (left) {
    w = Math.max(min, o.w - dx);
    x = o.x + o.w - w;
  }
  if (right) w = Math.max(min, o.w + dx);
  if (top) {
    h = Math.max(min, o.h - dy);
    y = o.y + o.h - h;
  }
  if (bottom) h = Math.max(min, o.h + dy);
  if (keepRatio && o.w > 0 && o.h > 0) {
    const ratio = o.w / o.h;
    const corner = (left || right) && (top || bottom);
    if (corner) {
      // Follow whichever side changed more, relative to its size.
      if (Math.abs(w / o.w - 1) >= Math.abs(h / o.h - 1)) h = w / ratio;
      else w = h * ratio;
      if (left) x = o.x + o.w - w;
      if (top) y = o.y + o.h - h;
    } else if (left || right) {
      h = w / ratio;
      y = o.y + (o.h - h) / 2;
    } else {
      w = h * ratio;
      x = o.x + (o.w - w) / 2;
    }
  }
  return { x, y, w, h };
}

const rot = (x: number, y: number, deg: number): [number, number] => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

/**
 * Resizing a box drawn rotated by `deg` about its centre: the pointer's movement is taken in the
 * box's own axes, and the box is moved so the opposite handle stays where it is on the page.
 */
export function resizeRotated(o: Box, deg: number, handle: Handle, dx: number, dy: number, keepRatio = false): Box {
  if (!deg) return resizeBox(o, handle, dx, dy, keepRatio);
  const [lx, ly] = rot(dx, dy, -deg);
  const n = resizeBox(o, handle, lx, ly, keepRatio);
  // The centre moved by (dcx, dcy) in local axes; on the page that is a rotated move. Keep the
  // anchor fixed: shift by the difference between the rotated and the unrotated centre offset.
  const dcx = n.x + n.w / 2 - (o.x + o.w / 2);
  const dcy = n.y + n.h / 2 - (o.y + o.h / 2);
  const [rx, ry] = rot(dcx, dcy, deg);
  return { x: n.x + (rx - dcx), y: n.y + (ry - dcy), w: n.w, h: n.h };
}

/** `child` moved and scaled from inside `from` to the same place inside `to` (multi-selection resize). */
export function scaleInto(child: Box, from: Box, to: Box): Box {
  const sx = from.w > 0 ? to.w / from.w : 1;
  const sy = from.h > 0 ? to.h / from.h : 1;
  return { x: to.x + (child.x - from.x) * sx, y: to.y + (child.y - from.y) * sy, w: Math.max(0, child.w * sx), h: Math.max(0, child.h * sy) };
}

// ---------------------------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------------------------

/** A line something can snap to: its position on one axis and the span it covers on the other. */
export interface SnapLine {
  pos: number;
  from: number;
  to: number;
  kind: 'page' | 'margin' | 'element' | 'center';
}

export interface SnapTargets {
  /** Vertical lines (x positions). */
  xs: SnapLine[];
  /** Horizontal lines (y positions). */
  ys: SnapLine[];
}

/** A guide to draw while snapped: a vertical (`x`) or horizontal (`y`) line from `from` to `to`. */
export interface Guide {
  axis: 'x' | 'y';
  pos: number;
  from: number;
  to: number;
  kind: SnapLine['kind'];
}

/** A distance to show between the moving box and its neighbour (or the page edge). */
export interface SpacingHint {
  axis: 'x' | 'y';
  /** Where the gap starts and ends on its axis. */
  from: number;
  to: number;
  /** The position across (where to draw the measure line). */
  at: number;
}

export interface SnapOptions {
  /** Snap to elements, page edges, centre and margins. */
  objects: boolean;
  /** Grid step in mm, or null. */
  grid: number | null;
  /** How close counts as a snap, mm (a few screen pixels at the current zoom). */
  threshold: number;
}

/** What a moving box can snap to: page edges and centre, the safe margin, and other boxes' edges and centres. */
export function snapTargets(page: { w: number; h: number }, marginMm: number, others: Box[]): SnapTargets {
  const xs: SnapLine[] = [
    { pos: 0, from: 0, to: page.h, kind: 'page' },
    { pos: page.w, from: 0, to: page.h, kind: 'page' },
    { pos: page.w / 2, from: 0, to: page.h, kind: 'center' },
  ];
  const ys: SnapLine[] = [
    { pos: 0, from: 0, to: page.w, kind: 'page' },
    { pos: page.h, from: 0, to: page.w, kind: 'page' },
    { pos: page.h / 2, from: 0, to: page.w, kind: 'center' },
  ];
  if (marginMm > 0) {
    xs.push({ pos: marginMm, from: 0, to: page.h, kind: 'margin' }, { pos: page.w - marginMm, from: 0, to: page.h, kind: 'margin' });
    ys.push({ pos: marginMm, from: 0, to: page.w, kind: 'margin' }, { pos: page.h - marginMm, from: 0, to: page.w, kind: 'margin' });
  }
  for (const b of others) {
    for (const x of [b.x, b.x + b.w / 2, b.x + b.w]) xs.push({ pos: x, from: b.y, to: b.y + b.h, kind: 'element' });
    for (const y of [b.y, b.y + b.h / 2, b.y + b.h]) ys.push({ pos: y, from: b.x, to: b.x + b.w, kind: 'element' });
  }
  return { xs, ys };
}

/** The best snap of any of `edges` to `lines`: the offset to add, or null. */
function bestSnap(edges: number[], lines: SnapLine[], threshold: number): { delta: number; lines: SnapLine[] } | null {
  let best: { delta: number; lines: SnapLine[] } | null = null;
  for (const e of edges)
    for (const l of lines) {
      const d = l.pos - e;
      if (Math.abs(d) > threshold) continue;
      if (!best || Math.abs(d) < Math.abs(best.delta) - 1e-6) best = { delta: d, lines: [l] };
      else if (Math.abs(d - best.delta) < 1e-6) best.lines.push(l);
    }
  return best;
}

const snapGrid = (v: number, grid: number) => Math.round(v / grid) * grid;

/**
 * Snaps a box being moved: to element and page lines first (with the guides to draw), otherwise to
 * the grid by its top-left corner. Returns the corrected offset to add to the box.
 */
export function snapMove(box: Box, targets: SnapTargets, o: SnapOptions): { dx: number; dy: number; guides: Guide[] } {
  const guides: Guide[] = [];
  let dx = 0;
  let dy = 0;
  let snappedX = false;
  let snappedY = false;
  if (o.objects) {
    const sx = bestSnap([box.x, box.x + box.w / 2, box.x + box.w], targets.xs, o.threshold);
    if (sx) {
      dx = sx.delta;
      snappedX = true;
    }
    const sy = bestSnap([box.y, box.y + box.h / 2, box.y + box.h], targets.ys, o.threshold);
    if (sy) {
      dy = sy.delta;
      snappedY = true;
    }
  }
  if (o.grid) {
    if (!snappedX) dx = snapGrid(box.x, o.grid) - box.x;
    if (!snappedY) dy = snapGrid(box.y, o.grid) - box.y;
  }
  if (o.objects) guides.push(...guidesFor({ x: box.x + dx, y: box.y + dy, w: box.w, h: box.h }, targets));
  return { dx, dy, guides };
}

/** Snaps the edges a resize moves (only those), to lines or the grid. */
export function snapResize(box: Box, handle: Handle, targets: SnapTargets, o: SnapOptions): { box: Box; guides: Guide[] } {
  let { x, y, w, h } = box;
  const fix = (v: number, lines: SnapLine[]) => {
    if (o.objects) {
      const s = bestSnap([v], lines, o.threshold);
      if (s) return v + s.delta;
    }
    return o.grid ? snapGrid(v, o.grid) : v;
  };
  if (handle.includes('w')) {
    const nx = fix(x, targets.xs);
    w = Math.max(MIN_SIZE, w + (x - nx));
    x = nx;
  }
  if (handle.includes('e')) w = Math.max(MIN_SIZE, fix(x + w, targets.xs) - x);
  if (handle.includes('n')) {
    const ny = fix(y, targets.ys);
    h = Math.max(MIN_SIZE, h + (y - ny));
    y = ny;
  }
  if (handle.includes('s')) h = Math.max(MIN_SIZE, fix(y + h, targets.ys) - y);
  const out = { x, y, w, h };
  return { box: out, guides: o.objects ? guidesFor(out, targets) : [] };
}

/** Guides for every line the box's edges or centre lie on, spanning the box and what it lines up with. */
export function guidesFor(b: Box, targets: SnapTargets): Guide[] {
  const out: Guide[] = [];
  const near = (a: number, c: number) => Math.abs(a - c) < 0.01;
  for (const x of [b.x, b.x + b.w / 2, b.x + b.w]) {
    const hits = targets.xs.filter((l) => near(l.pos, x));
    if (!hits.length) continue;
    const from = Math.min(b.y, ...hits.map((l) => l.from));
    const to = Math.max(b.y + b.h, ...hits.map((l) => l.to));
    out.push({ axis: 'x', pos: x, from, to, kind: hits.some((l) => l.kind === 'element') ? 'element' : hits[0].kind });
  }
  for (const y of [b.y, b.y + b.h / 2, b.y + b.h]) {
    const hits = targets.ys.filter((l) => near(l.pos, y));
    if (!hits.length) continue;
    const from = Math.min(b.x, ...hits.map((l) => l.from));
    const to = Math.max(b.x + b.w, ...hits.map((l) => l.to));
    out.push({ axis: 'y', pos: y, from, to, kind: hits.some((l) => l.kind === 'element') ? 'element' : hits[0].kind });
  }
  return out;
}

/**
 * Distances from the box to its nearest neighbour on each side (boxes that overlap it across that
 * axis), or to the page edge when there is none.
 */
export function spacingHints(b: Box, others: Box[], page: { w: number; h: number }): SpacingHint[] {
  const hints: SpacingHint[] = [];
  const overlapY = (o: Box) => o.y < b.y + b.h && o.y + o.h > b.y;
  const overlapX = (o: Box) => o.x < b.x + b.w && o.x + o.w > b.x;
  const midY = b.y + b.h / 2;
  const midX = b.x + b.w / 2;
  const left = others.filter((o) => overlapY(o) && o.x + o.w <= b.x + 1e-6).sort((p, q) => q.x + q.w - (p.x + p.w))[0];
  const right = others.filter((o) => overlapY(o) && o.x >= b.x + b.w - 1e-6).sort((p, q) => p.x - q.x)[0];
  const above = others.filter((o) => overlapX(o) && o.y + o.h <= b.y + 1e-6).sort((p, q) => q.y + q.h - (p.y + p.h))[0];
  const below = others.filter((o) => overlapX(o) && o.y >= b.y + b.h - 1e-6).sort((p, q) => p.y - q.y)[0];
  const lx = left ? left.x + left.w : 0;
  const rx = right ? right.x : page.w;
  const ty = above ? above.y + above.h : 0;
  const by = below ? below.y : page.h;
  if (b.x - lx > 0.05) hints.push({ axis: 'x', from: lx, to: b.x, at: midY });
  if (rx - (b.x + b.w) > 0.05) hints.push({ axis: 'x', from: b.x + b.w, to: rx, at: midY });
  if (b.y - ty > 0.05) hints.push({ axis: 'y', from: ty, to: b.y, at: midX });
  if (by - (b.y + b.h) > 0.05) hints.push({ axis: 'y', from: b.y + b.h, to: by, at: midX });
  return hints;
}

// ---------------------------------------------------------------------------------------------
// Align and distribute
// ---------------------------------------------------------------------------------------------

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** How far each box moves to line up with `ref` (the selection's bounds, or the page). */
export function alignOffsets(boxes: Box[], mode: AlignMode, ref: Box): { dx: number; dy: number }[] {
  return boxes.map((b) => {
    switch (mode) {
      case 'left':
        return { dx: ref.x - b.x, dy: 0 };
      case 'hcenter':
        return { dx: ref.x + ref.w / 2 - (b.x + b.w / 2), dy: 0 };
      case 'right':
        return { dx: ref.x + ref.w - (b.x + b.w), dy: 0 };
      case 'top':
        return { dx: 0, dy: ref.y - b.y };
      case 'vcenter':
        return { dx: 0, dy: ref.y + ref.h / 2 - (b.y + b.h / 2) };
      case 'bottom':
        return { dx: 0, dy: ref.y + ref.h - (b.y + b.h) };
    }
  });
}

/**
 * How far each box moves so the gaps between them are equal along `axis`, the first and last
 * staying where they are. Boxes are taken in the order of their position.
 */
export function distributeOffsets(boxes: Box[], axis: 'x' | 'y'): { dx: number; dy: number }[] {
  const out = boxes.map(() => ({ dx: 0, dy: 0 }));
  if (boxes.length < 3) return out;
  const pos = (b: Box) => (axis === 'x' ? b.x : b.y);
  const size = (b: Box) => (axis === 'x' ? b.w : b.h);
  const order = boxes.map((b, i) => i).sort((a, b) => pos(boxes[a]) - pos(boxes[b]));
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const span = pos(last) + size(last) - pos(first);
  const total = order.reduce((s, i) => s + size(boxes[i]), 0);
  const gap = (span - total) / (order.length - 1);
  let cursor = pos(first);
  for (const i of order) {
    const d = cursor - pos(boxes[i]);
    out[i] = axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d };
    cursor += size(boxes[i]) + gap;
  }
  return out;
}
