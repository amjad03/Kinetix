'use client';
import { type Dispatch, type DragEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { type Box, type Handle, HANDLES, intersects, rotatedBounds, unionBox } from '@/lib/doc-editor/geometry';
import { currentSide, type EditorAction, type EditorState } from '@/lib/doc-editor/model';
import { CanvasRenderer, flowShifts } from '@/lib/doc-editor/render';
import { type DocData, type DocElement, MM, type Palette, pageSizeMm } from '@/lib/doc-editor/schema';
import { cn } from '@/lib/utils';
import type { AddKind, AddOptions } from '@/lib/doc-editor/factory';

/** CSS pixels per millimetre at 100 % zoom (true size on a standard screen). */
export const PX_PER_MM = 96 / 25.4;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
/** Size of the rulers, px. */
export const RULER = 22;

export interface ViewState {
  zoom: number;
  /** Where the page's top-left corner is in the viewport, px. */
  panX: number;
  panY: number;
  grid: boolean;
  gridStep: number;
  snap: boolean;
  smartGuides: boolean;
  margins: boolean;
  bleed: boolean;
  rulers: boolean;
}

/** Bleed shown around ID cards, mm. */
const BLEED_MM = 2;
/** Corner radius of a CR80 card's cut line, mm (ISO/IEC 7810). */
const CR80_RADIUS = 3.18;

type Drag =
  | { mode: 'pending'; id: string; hit: string | null; x: number; y: number; px: number; py: number; wasSelected: boolean; background: boolean }
  | { mode: 'move'; x: number; y: number }
  | { mode: 'resize'; handle: Handle; x: number; y: number }
  | { mode: 'rotate'; cx: number; cy: number }
  | { mode: 'marquee'; x: number; y: number; additive: boolean }
  | { mode: 'pan'; px: number; py: number; panX: number; panY: number };

const CURSORS: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

const handlePoint = (b: Box, h: Handle): [number, number] => [h.includes('w') ? b.x : h.includes('e') ? b.x + b.w : b.x + b.w / 2, h.includes('n') ? b.y : h.includes('s') ? b.y + b.h : b.y + b.h / 2];

/** Whether (px, py) is inside a box drawn rotated by `deg` about its centre. */
function containsPoint(b: Box, deg: number, px: number, py: number): boolean {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = (-deg * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= b.w / 2 + 0.01 && Math.abs(ly) <= b.h / 2 + 0.01;
}

type Drawn = { sig: string; svg: string; unused: number };
const drawCache = new WeakMap<CanvasRenderer, WeakMap<DocData, Map<string, Drawn>>>();
/** The drawn elements for a renderer and data (dropped with them). */
function drawCacheFor(r: CanvasRenderer, data: DocData): Map<string, Drawn> {
  let byData = drawCache.get(r);
  if (!byData) drawCache.set(r, (byData = new WeakMap()));
  let byId = byData.get(data);
  if (!byId) byData.set(data, (byId = new Map()));
  return byId;
}

/** What part of an element is drawn (its markup without position), to know when to draw it again. */
const sigCache = new WeakMap<object, string>();
function signature(e: DocElement): string {
  let s = sigCache.get(e);
  if (s === undefined) {
    const { x: _x, y: _y, rotationDeg: _r, opacity: _o, name: _n, locked: _l, hidden: _h, group: _g, ...rest } = e;
    s = JSON.stringify(rest);
    sigCache.set(e, s);
  }
  return s;
}

/** Elements that cover the page (security grounds, watermarks): a drag on them draws a selection box instead of moving them. */
const isBackground = (e: DocElement, page: { w: number; h: number }) => e.type === 'pattern' || e.type === 'watermark' || (e.w >= page.w * 0.9 && e.h >= page.h * 0.9);

export function EditorCanvas({
  state,
  dispatch,
  renderer,
  data,
  palette,
  view,
  setView,
  problems,
  spaceHeld,
  onEditText,
  onDropAdd,
  onViewport,
  sideLabel,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  renderer: CanvasRenderer;
  data: DocData;
  palette: Palette;
  view: ViewState;
  setView: (fn: (v: ViewState) => ViewState) => void;
  problems: Set<string>;
  spaceHeld: boolean;
  onEditText: (id: string) => void;
  onDropAdd: (kind: AddKind, o: AddOptions) => void;
  onViewport: (w: number, h: number) => void;
  sideLabel: string;
}) {
  const { t } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const layout = state.layout;
  const side = currentSide(state);
  const page = pageSizeMm(layout.page);
  const scale = view.zoom * PX_PER_MM;
  const card = layout.page.size === 'CR80';

  // Viewport size.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
      onViewport(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onViewport]);

  // Drawing, cached per element while its look, the renderer (palette, fonts, images) and the data stay the same.
  const drawn = useMemo(() => {
    const byId = drawCacheFor(renderer, data);
    const out = new Map<string, { svg: string; unused: number; ghost: boolean }>();
    for (const e of side.elements) {
      const ghost = !CanvasRenderer.shows(e, data);
      if (e.hidden) {
        out.set(e.id, { svg: '', unused: e.h * MM, ghost });
        continue;
      }
      const sig = signature(e);
      let hit = byId.get(e.id);
      if (!hit || hit.sig !== sig) {
        const prefix = `k${side.id.replace(/[^a-zA-Z0-9]/g, '')}_${e.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_`;
        let r: { svg: string; unused: number };
        try {
          r = renderer.element(e, data, prefix);
        } catch {
          r = { svg: '', unused: 0 };
        }
        hit = { sig, ...r };
        byId.set(e.id, hit);
      }
      out.set(e.id, { svg: hit.svg, unused: ghost ? e.h * MM : hit.unused, ghost });
    }
    return out;
  }, [side, data, renderer]);
  const shifts = useMemo(() => flowShifts(side.elements, (e) => drawn.get(e.id)?.unused ?? 0), [side.elements, drawn]);
  const background = useMemo(() => renderer.background(side, page.w * MM, page.h * MM, `bg${side.id}_`), [renderer, side, page.w, page.h]);

  /** An element's box as drawn (moved up by flowAfter), mm. */
  const shown = useCallback((e: DocElement): Box => ({ x: e.x, y: e.y - (shifts.get(e.id) ?? 0) / MM, w: e.w, h: e.h }), [shifts]);

  const toMm = useCallback(
    (clientX: number, clientY: number) => {
      const r = svg.current!.getBoundingClientRect();
      return { x: (clientX - r.left - view.panX) / scale, y: (clientY - r.top - view.panY) / scale };
    },
    [view.panX, view.panY, scale],
  );

  const snapOpts = (alt: boolean) => ({ objects: view.snap && view.smartGuides && !alt, grid: view.snap && view.grid && !alt ? view.gridStep : null, threshold: 6 / scale });

  /** Dispatches pointer moves at most once a frame. */
  const later = (fn: () => void) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      fn();
    });
  };

  const selected = side.elements.filter((e) => state.selection.includes(e.id));
  const single = selected.length === 1 ? selected[0] : null;
  const selBox = selected.length ? unionBox(selected.map((e) => rotatedBounds(shown(e), e.rotationDeg))) : null;

  const onPointerDown = (ev: ReactPointerEvent<SVGSVGElement>) => {
    if (ev.button === 2) return;
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    wrap.current?.focus({ preventScroll: true });
    const p = toMm(ev.clientX, ev.clientY);
    if (ev.button === 1 || spaceHeld) {
      drag.current = { mode: 'pan', px: ev.clientX, py: ev.clientY, panX: view.panX, panY: view.panY };
      setPanning(true);
      return;
    }
    const target = ev.target as Element;
    const handle = target.getAttribute('data-handle') as Handle | null;
    if (handle) {
      dispatch({ type: 'gestureStart', kind: 'resize' });
      drag.current = { mode: 'resize', handle, x: p.x, y: p.y };
      return;
    }
    if (target.getAttribute('data-rotate') && single) {
      const b = shown(single);
      dispatch({ type: 'gestureStart', kind: 'rotate' });
      drag.current = { mode: 'rotate', cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
      return;
    }
    // A press inside the current selection drags the selection, even where another element lies on top.
    const id = target.getAttribute('data-hit');
    const inside = !ev.shiftKey && !ev.altKey && [...selected].reverse().find((e) => !e.locked && containsPoint(shown(e), e.rotationDeg ?? 0, p.x, p.y));
    if (inside) {
      drag.current = { mode: 'pending', id: inside.id, hit: id, x: p.x, y: p.y, px: ev.clientX, py: ev.clientY, wasSelected: true, background: false };
      return;
    }
    if (id) {
      const e = side.elements.find((x) => x.id === id)!;
      const wasSelected = state.selection.includes(id);
      if (ev.shiftKey) {
        dispatch({ type: 'select', ids: [id], mode: 'toggle' });
        drag.current = null;
        return;
      }
      if (!wasSelected) dispatch({ type: 'select', ids: [id], deep: ev.altKey });
      drag.current = { mode: 'pending', id, hit: id, x: p.x, y: p.y, px: ev.clientX, py: ev.clientY, wasSelected, background: isBackground(e, page) && !wasSelected };
      return;
    }
    drag.current = { mode: 'marquee', x: p.x, y: p.y, additive: ev.shiftKey };
  };

  const onPointerMove = (ev: ReactPointerEvent<SVGSVGElement>) => {
    const p = toMm(ev.clientX, ev.clientY);
    setCursor(p);
    const d = drag.current;
    if (!d) {
      const id = (ev.target as Element).getAttribute('data-hit');
      if (id !== hover) setHover(id);
      return;
    }
    if (d.mode === 'pan') {
      const nx = d.panX + ev.clientX - d.px;
      const ny = d.panY + ev.clientY - d.py;
      setView((v) => ({ ...v, panX: nx, panY: ny }));
      return;
    }
    if (d.mode === 'pending') {
      if (Math.hypot(ev.clientX - d.px, ev.clientY - d.py) < 3) return;
      if (d.background) {
        drag.current = { mode: 'marquee', x: d.x, y: d.y, additive: false };
        return;
      }
      dispatch({ type: 'gestureStart', kind: 'move' });
      drag.current = { mode: 'move', x: d.x, y: d.y };
      return;
    }
    if (d.mode === 'move') {
      let dx = p.x - d.x;
      let dy = p.y - d.y;
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const snap = snapOpts(ev.altKey);
      later(() => dispatch({ type: 'drag', dx, dy, snap }));
      return;
    }
    if (d.mode === 'resize') {
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      const keepRatio = ev.shiftKey || (single?.type === 'qr' || single?.type === 'seal');
      const snap = snapOpts(ev.altKey);
      later(() => dispatch({ type: 'resize', handle: d.handle, dx, dy, keepRatio, snap }));
      return;
    }
    if (d.mode === 'rotate') {
      let deg = (Math.atan2(p.y - d.cy, p.x - d.cx) * 180) / Math.PI + 90;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      later(() => dispatch({ type: 'rotate', deg }));
      return;
    }
    if (d.mode === 'marquee') setMarquee({ x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) });
  };

  const onPointerUp = (ev: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setPanning(false);
    if (!d) return;
    const p = toMm(ev.clientX, ev.clientY);
    if (d.mode === 'move' || d.mode === 'resize' || d.mode === 'rotate') {
      // Apply the last position before closing the gesture.
      if (d.mode === 'move') {
        let dx = p.x - d.x;
        let dy = p.y - d.y;
        if (ev.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        dispatch({ type: 'drag', dx, dy, snap: snapOpts(ev.altKey) });
      }
      dispatch({ type: 'gestureEnd' });
      return;
    }
    if (d.mode === 'pending') {
      // A click (no drag) on another element inside the selection selects that one; on an element
      // already selected inside a group, just that element.
      if (d.hit && !state.selection.includes(d.hit)) dispatch({ type: 'select', ids: [d.hit] });
      else if (d.wasSelected && state.selection.length > 1) dispatch({ type: 'select', ids: [d.hit ?? d.id], deep: true });
      if (d.background && !d.wasSelected) dispatch({ type: 'select', ids: [d.id] });
      return;
    }
    if (d.mode === 'marquee') {
      const m = marquee;
      setMarquee(null);
      if (!m || (m.w < 0.5 && m.h < 0.5)) {
        if (!d.additive) dispatch({ type: 'select', ids: [] });
        return;
      }
      const ids = side.elements
        .filter((e) => !e.locked && !e.hidden)
        .filter((e) => {
          const b = rotatedBounds(shown(e), e.rotationDeg);
          return isBackground(e, page) ? b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h : intersects(b, m);
        })
        .map((e) => e.id);
      dispatch({ type: 'select', ids, mode: d.additive ? 'add' : 'set' });
    }
  };

  // Zoom with Ctrl + wheel at the pointer; scroll pans.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      if (ev.ctrlKey || ev.metaKey) {
        const mx = ev.clientX - r.left;
        const my = ev.clientY - r.top;
        setView((v) => {
          const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * Math.exp(-ev.deltaY * 0.0022)));
          const k = z / v.zoom;
          return { ...v, zoom: z, panX: mx - (mx - v.panX) * k, panY: my - (my - v.panY) * k };
        });
      } else setView((v) => ({ ...v, panX: v.panX - (ev.shiftKey ? ev.deltaY : ev.deltaX), panY: v.panY - (ev.shiftKey ? 0 : ev.deltaY) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);

  const onDrop = (ev: DragEvent<HTMLDivElement>) => {
    const raw = ev.dataTransfer.getData('application/x-kx-add');
    if (!raw) return;
    ev.preventDefault();
    const p = toMm(ev.clientX, ev.clientY);
    const { kind, opts } = JSON.parse(raw) as { kind: AddKind; opts: AddOptions };
    onDropAdd(kind, { ...opts, at: { x: p.x, y: p.y } });
  };

  // Screen-constant sizes in mm.
  const px = (n: number) => n / scale;
  const vb = `${-view.panX / scale} ${-view.panY / scale} ${size.w / scale} ${size.h / scale}`;
  const handleSize = px(8);
  const resizing = state.gesture?.kind === 'resize';
  const dims = single ? `${single.w.toFixed(1)} × ${single.h.toFixed(1)} mm` : selBox ? `${selBox.w.toFixed(1)} × ${selBox.h.toFixed(1)} mm` : '';

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#e7eaee] dark:bg-[#1c1f24]">
      {view.rulers && <Rulers view={view} size={size} scale={scale} cursor={cursor} selBox={selBox} page={page} />}
      <div
        ref={wrap}
        tabIndex={0}
        role="application"
        aria-label={t('de.canvasLabel', { side: sideLabel })}
        className={cn('relative min-h-0 flex-1 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset', view.rulers && 'mt-[22px] ml-[22px]')}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-kx-add')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={onDrop}
        data-testid="canvas"
      >
        <svg
          ref={svg}
          width={size.w}
          height={size.h}
          viewBox={vb}
          className={cn('block touch-none select-none', panning ? 'cursor-grabbing' : spaceHeld ? 'cursor-grab' : 'cursor-default')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            setCursor(null);
            setHover(null);
          }}
          onDoubleClick={(ev) => {
            const id = (ev.target as Element).getAttribute('data-hit');
            if (!id) return;
            dispatch({ type: 'select', ids: [id], deep: true });
            onEditText(id);
          }}
          aria-hidden
          data-testid="canvas-svg"
        >
          <defs>
            <clipPath id="kx-page-clip">
              {card ? <rect x={0} y={0} width={page.w} height={page.h} rx={CR80_RADIUS} /> : <rect x={0} y={0} width={page.w} height={page.h} />}
            </clipPath>
            <filter id="kx-page-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy={px(6)} stdDeviation={px(10)} floodColor="#101828" floodOpacity="0.22" />
            </filter>
            {view.grid && (
              <pattern id="kx-grid" width={view.gridStep} height={view.gridStep} patternUnits="userSpaceOnUse">
                <path d={`M ${view.gridStep} 0 L 0 0 0 ${view.gridStep}`} fill="none" stroke="#5b8def" strokeOpacity="0.28" strokeWidth={px(1)} />
              </pattern>
            )}
            <style>{'@keyframes kxsweep{0%{transform:translate(-60%,-60%)}55%,100%{transform:translate(60%,60%)}}.kx-shimmer{animation:kxsweep 3.6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.kx-shimmer{animation:none}}'}</style>
          </defs>

          {/* Page label */}
          <text x={0} y={-(card && view.bleed ? BLEED_MM : 0) - px(8)} fontSize={px(11)} fill="#667085" fontFamily="system-ui, sans-serif">
            {`${sideLabel} · ${page.w.toFixed(page.w % 1 ? 2 : 0)} × ${page.h.toFixed(page.h % 1 ? 2 : 0)} mm`}
          </text>
          {/* Bleed area of a card */}
          {card && view.bleed && <rect x={-BLEED_MM} y={-BLEED_MM} width={page.w + 2 * BLEED_MM} height={page.h + 2 * BLEED_MM} rx={CR80_RADIUS + BLEED_MM} fill="#ffffff" fillOpacity={0.55} />}
          {/* The page */}
          <rect x={0} y={0} width={page.w} height={page.h} rx={card ? CR80_RADIUS : 0} fill={palette.paper} filter="url(#kx-page-shadow)" />
          <g clipPath="url(#kx-page-clip)">
            <g transform={`scale(${1 / MM})`}>
              {/* biome-ignore lint: trusted renderer output */}
              <g dangerouslySetInnerHTML={{ __html: background }} />
              {side.elements.map((e) => {
                const d = drawn.get(e.id);
                if (!d || e.hidden) return null;
                const b = shown(e);
                const tr = `translate(${b.x * MM} ${b.y * MM})${e.rotationDeg ? ` rotate(${e.rotationDeg} ${(e.w * MM) / 2} ${(e.h * MM) / 2})` : ''}`;
                const op = (e.opacity ?? 1) * (d.ghost ? 0.35 : 1);
                return <g key={e.id} transform={tr} opacity={op < 1 ? op : undefined} data-el={e.id} dangerouslySetInnerHTML={{ __html: d.svg }} />;
              })}
            </g>
            {view.grid && <rect x={0} y={0} width={page.w} height={page.h} fill="url(#kx-grid)" pointerEvents="none" />}
          </g>

          {/* Guides for printing: safe area, bleed and cut line */}
          {view.margins && (layout.page.marginMm ?? 0) > 0 && (
            <rect x={layout.page.marginMm} y={layout.page.marginMm} width={Math.max(0, page.w - 2 * layout.page.marginMm)} height={Math.max(0, page.h - 2 * layout.page.marginMm)} rx={card ? Math.max(0, CR80_RADIUS - layout.page.marginMm) : 0} fill="none" stroke="#12b76a" strokeDasharray={`${px(4)} ${px(3)}`} strokeWidth={px(1)} pointerEvents="none">
              <title>{t('de.safeArea')}</title>
            </rect>
          )}
          {card && view.bleed && (
            <>
              <rect x={-BLEED_MM} y={-BLEED_MM} width={page.w + 2 * BLEED_MM} height={page.h + 2 * BLEED_MM} rx={CR80_RADIUS + BLEED_MM} fill="none" stroke="#f04438" strokeDasharray={`${px(4)} ${px(3)}`} strokeWidth={px(1)} pointerEvents="none">
                <title>{t('de.bleed')}</title>
              </rect>
              <rect x={0} y={0} width={page.w} height={page.h} rx={CR80_RADIUS} fill="none" stroke="#344054" strokeOpacity={0.5} strokeWidth={px(1)} pointerEvents="none">
                <title>{t('de.cutLine')}</title>
              </rect>
            </>
          )}

          {/* Hit areas, in drawing order (topmost wins) */}
          <g>
            {side.elements.map((e) => {
              if (e.hidden) return null;
              const b = shown(e);
              const tr = e.rotationDeg ? `rotate(${e.rotationDeg} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined;
              const pe = e.locked ? 'none' : undefined;
              if (e.type === 'shape' && e.shape === 'line') return <line key={e.id} data-hit={e.id} x1={b.x} y1={b.y} x2={b.x + b.w} y2={b.y + b.h} stroke="transparent" strokeWidth={Math.max(px(10), 1)} transform={tr} pointerEvents={pe ?? 'stroke'} />;
              if (e.type === 'frame') return <rect key={e.id} data-hit={e.id} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="transparent" strokeWidth={Math.max(px(12), 2)} transform={tr} pointerEvents={pe ?? 'stroke'} />;
              return <rect key={e.id} data-hit={e.id} x={b.x} y={b.y} width={Math.max(b.w, px(4))} height={Math.max(b.h, px(4))} fill="transparent" transform={tr} pointerEvents={pe ?? 'all'} />;
            })}
          </g>

          {/* Problems */}
          {side.elements
            .filter((e) => problems.has(e.id) && !e.hidden)
            .map((e) => {
              const b = shown(e);
              return <rect key={`p-${e.id}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#f04438" fillOpacity={0.06} stroke="#f04438" strokeWidth={px(1.5)} strokeDasharray={`${px(3)} ${px(2)}`} transform={e.rotationDeg ? `rotate(${e.rotationDeg} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined} pointerEvents="none" />;
            })}

          {/* Hover outline */}
          {hover &&
            !state.selection.includes(hover) &&
            (() => {
              const e = side.elements.find((x) => x.id === hover);
              if (!e) return null;
              const b = shown(e);
              return <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#2e90fa" strokeWidth={px(1)} transform={e.rotationDeg ? `rotate(${e.rotationDeg} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined} pointerEvents="none" />;
            })()}

          {/* Smart guides and spacing */}
          {state.guides.map((g, i) =>
            g.axis === 'x' ? (
              <line key={`g${i}`} x1={g.pos} x2={g.pos} y1={g.from - px(8)} y2={g.to + px(8)} stroke={g.kind === 'element' ? '#ee46bc' : '#2e90fa'} strokeWidth={px(1)} pointerEvents="none" />
            ) : (
              <line key={`g${i}`} y1={g.pos} y2={g.pos} x1={g.from - px(8)} x2={g.to + px(8)} stroke={g.kind === 'element' ? '#ee46bc' : '#2e90fa'} strokeWidth={px(1)} pointerEvents="none" />
            ),
          )}
          {state.hints.map((h, i) => {
            const len = h.to - h.from;
            const label = `${len.toFixed(1)}`;
            const lw = px(6.5 * label.length + 8);
            return h.axis === 'x' ? (
              <g key={`h${i}`} pointerEvents="none">
                <line x1={h.from} x2={h.to} y1={h.at} y2={h.at} stroke="#f04438" strokeWidth={px(1)} />
                <rect x={(h.from + h.to) / 2 - lw / 2} y={h.at - px(18)} width={lw} height={px(15)} rx={px(3)} fill="#f04438" />
                <text x={(h.from + h.to) / 2} y={h.at - px(7)} fontSize={px(10.5)} fill="#fff" textAnchor="middle" fontFamily="system-ui, sans-serif">
                  {label}
                </text>
              </g>
            ) : (
              <g key={`h${i}`} pointerEvents="none">
                <line y1={h.from} y2={h.to} x1={h.at} x2={h.at} stroke="#f04438" strokeWidth={px(1)} />
                <rect x={h.at + px(4)} y={(h.from + h.to) / 2 - px(7.5)} width={lw} height={px(15)} rx={px(3)} fill="#f04438" />
                <text x={h.at + px(4) + lw / 2} y={(h.from + h.to) / 2 + px(3.5)} fontSize={px(10.5)} fill="#fff" textAnchor="middle" fontFamily="system-ui, sans-serif">
                  {label}
                </text>
              </g>
            );
          })}

          {/* Selection */}
          {selected.length > 1 && selBox && <rect x={selBox.x} y={selBox.y} width={selBox.w} height={selBox.h} fill="none" stroke="#2e90fa" strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(3)}`} pointerEvents="none" />}
          {selected.map((e) => {
            const b = shown(e);
            return <rect key={`s-${e.id}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={e.locked ? '#98a2b3' : '#2e90fa'} strokeWidth={px(1.5)} transform={e.rotationDeg ? `rotate(${e.rotationDeg} ${b.x + b.w / 2} ${b.y + b.h / 2})` : undefined} pointerEvents="none" />;
          })}
          {selBox &&
            selected.some((e) => !e.locked) &&
            (() => {
              const b = single ? shown(single) : selBox;
              const rot = single?.rotationDeg ?? 0;
              const cx = b.x + b.w / 2;
              const cy = b.y + b.h / 2;
              return (
                <g transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined}>
                  {single && !single.locked && (
                    <>
                      <line x1={cx} x2={cx} y1={b.y} y2={b.y - px(22)} stroke="#2e90fa" strokeWidth={px(1)} pointerEvents="none" />
                      <circle data-rotate="1" cx={cx} cy={b.y - px(22)} r={px(5.5)} fill="#fff" stroke="#2e90fa" strokeWidth={px(1.5)} style={{ cursor: 'grab' }}>
                        <title>{t('de.rotateHint')}</title>
                      </circle>
                    </>
                  )}
                  {HANDLES.filter((h) => !(single?.type === 'shape' && single.shape === 'line' && h.length === 1)).map((h) => {
                    const [hx, hy] = handlePoint(b, h);
                    return <rect key={h} data-handle={h} x={hx - handleSize / 2} y={hy - handleSize / 2} width={handleSize} height={handleSize} rx={px(1.5)} fill="#fff" stroke="#2e90fa" strokeWidth={px(1.5)} style={{ cursor: CURSORS[h] }} />;
                  })}
                </g>
              );
            })()}
          {resizing && selBox && (
            <g pointerEvents="none">
              <rect x={selBox.x + selBox.w / 2 - px(46)} y={selBox.y + selBox.h + px(10)} width={px(92)} height={px(18)} rx={px(4)} fill="#2e90fa" />
              <text x={selBox.x + selBox.w / 2} y={selBox.y + selBox.h + px(23)} fontSize={px(11)} fill="#fff" textAnchor="middle" fontFamily="system-ui, sans-serif">
                {dims}
              </text>
            </g>
          )}
          {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="#2e90fa" fillOpacity={0.08} stroke="#2e90fa" strokeWidth={px(1)} pointerEvents="none" />}
        </svg>
      </div>
      <div className="flex h-7 shrink-0 items-center gap-4 overflow-hidden border-t bg-card px-3 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums" aria-live="polite">
        <span className="shrink-0">{cursor ? `${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)} mm` : '—'}</span>
        {selected.length > 0 && <span data-testid="selection-info">{selected.length === 1 ? `${single!.name ?? single!.id} · ${single!.x.toFixed(1)}, ${single!.y.toFixed(1)} mm · ${dims}` : t('de.nSelected', { n: selected.length })}</span>}
        <span className="ml-auto hidden min-w-0 truncate xl:inline">{t('de.hint.keys')}</span>
      </div>
    </div>
  );
}

/** Rulers in mm along the top and left of the canvas, with the cursor and the selection marked. */
function Rulers({ view, size, scale, cursor, selBox, page }: { view: ViewState; size: { w: number; h: number }; scale: number; cursor: { x: number; y: number } | null; selBox: Box | null; page: { w: number; h: number } }) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const major = steps.find((s) => s * scale >= 56) ?? 500;
  const minor = major / (String(major).startsWith('2') ? 4 : 5);
  const ticks = (len: number, pan: number) => {
    const out: { pos: number; mm: number; major: boolean }[] = [];
    const start = Math.floor(-pan / scale / minor) * minor;
    const end = (len - pan) / scale;
    for (let mm = start; mm <= end; mm += minor) {
      const r = Math.round(mm * 1000) / 1000;
      out.push({ pos: pan + r * scale, mm: r, major: Math.abs(r / major - Math.round(r / major)) < 1e-6 });
    }
    return out;
  };
  const w = size.w;
  const h = size.h;
  const top = ticks(w, view.panX);
  const left = ticks(h, view.panY);
  return (
    <>
      <div aria-hidden className="absolute top-0 left-0 z-10 size-[22px] border-r border-b bg-card" />
      <svg aria-hidden className="absolute top-0 left-[22px] z-10 block border-b bg-card" width={w} height={RULER}>
        <rect x={view.panX} y={0} width={page.w * scale} height={RULER} fill="currentColor" className="text-primary/5" />
        {selBox && <rect x={view.panX + selBox.x * scale} y={0} width={selBox.w * scale} height={RULER} className="fill-primary/20" />}
        {top.map((t) => (
          <g key={t.mm}>
            <line x1={t.pos} x2={t.pos} y1={t.major ? 6 : 15} y2={RULER} stroke="currentColor" className="text-muted-foreground/60" />
            {t.major && (
              <text x={t.pos + 3} y={10} fontSize={9} fill="currentColor" className="text-muted-foreground">
                {t.mm}
              </text>
            )}
          </g>
        ))}
        {cursor && <line x1={view.panX + cursor.x * scale} x2={view.panX + cursor.x * scale} y1={0} y2={RULER} stroke="#f04438" />}
      </svg>
      <svg aria-hidden className="absolute top-[22px] left-0 z-10 block border-r bg-card" width={RULER} height={h}>
        <rect y={view.panY} x={0} height={page.h * scale} width={RULER} className="fill-primary/5" />
        {selBox && <rect y={view.panY + selBox.y * scale} x={0} height={selBox.h * scale} width={RULER} className="fill-primary/20" />}
        {left.map((t) => (
          <g key={t.mm}>
            <line y1={t.pos} y2={t.pos} x1={t.major ? 6 : 15} x2={RULER} stroke="currentColor" className="text-muted-foreground/60" />
            {t.major && (
              <text x={9} y={t.pos + 3} fontSize={9} fill="currentColor" className="text-muted-foreground" transform={`rotate(-90 9 ${t.pos + 3})`}>
                {t.mm}
              </text>
            )}
          </g>
        ))}
        {cursor && <line y1={view.panY + cursor.y * scale} y2={view.panY + cursor.y * scale} x1={0} x2={RULER} stroke="#f04438" />}
      </svg>
    </>
  );
}
