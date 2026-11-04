'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { fitView, project, tilesFor, tripState, type LiveTrip } from '@/lib/transport-pass';

const COLOURS = ['#0f766e', '#7c3aed', '#c2410c', '#1d4ed8', '#be185d', '#4d7c0f', '#0369a1', '#a16207'];
const STATE_COLOUR = { sos: '#dc2626', silent: '#6b7280', late: '#d97706', alert: '#d97706', ok: '#0f766e' } as const;

/**
 * The buses under way on OpenStreetMap tiles: each route's stops joined in running order (reached stops filled), and
 * each bus as a marker coloured by how it stands (SOS red, late amber, silent grey). The view fits every point; the
 * picked trip is drawn on top and labelled.
 */
export function BusMap({ trips, selected, onSelect, height = 420 }: { trips: LiveTrip[]; selected?: string | null; onSelect?: (tripId: string) => void; height?: number }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, Math.round(el.clientWidth))));
    ro.observe(el);
    setWidth(Math.max(240, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  const points = useMemo(() => trips.flatMap((tr) => [...tr.stops.map((s) => ({ lat: s.lat, lng: s.lng })), ...(tr.lat != null && tr.lng != null ? [{ lat: tr.lat, lng: tr.lng }] : [])]), [trips]);
  const view = useMemo(() => fitView(points, width, height), [points, width, height]);
  const at = (lat: number, lng: number) => {
    const p = project(lat, lng, view.z);
    return { x: p.x - view.left, y: p.y - view.top };
  };
  const ordered = [...trips].sort((a, b) => Number(a.tripId === selected) - Number(b.tripId === selected));
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-lg border bg-muted" style={{ height }} role="img" aria-label={t('tp.live.mapLabel')} data-testid="tp-bus-map">
      {tilesFor(view, width, height).map((tile) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${tile.z}/${tile.x}/${tile.y}/${tile.px}`} src={`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`} alt="" width={256} height={256} draggable={false} className="pointer-events-none absolute select-none" style={{ left: tile.px, top: tile.py }} />
      ))}
      <svg className="absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {ordered.map((tr) => {
          const colour = COLOURS[trips.indexOf(tr) % COLOURS.length];
          const line = tr.stops.map((s) => at(s.lat, s.lng));
          const bus = tr.lat != null && tr.lng != null ? at(tr.lat, tr.lng) : null;
          const state = tripState(tr);
          const picked = tr.tripId === selected;
          return (
            <g key={tr.tripId} opacity={selected && !picked ? 0.55 : 1}>
              <polyline points={line.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colour} strokeWidth={picked ? 5 : 3} strokeLinejoin="round" strokeLinecap="round" />
              {tr.stops.map((s, i) => (
                <circle key={s.id} cx={line[i].x} cy={line[i].y} r={picked ? 6 : 4.5} fill={s.reached ? colour : '#fff'} stroke={colour} strokeWidth={2}>
                  <title>{s.name}</title>
                </circle>
              ))}
              {bus && (
                <g transform={`translate(${bus.x},${bus.y})`} className="cursor-pointer" onClick={() => onSelect?.(tr.tripId)} data-testid={`tp-bus-${tr.tripId}`}>
                  <circle r={picked ? 13 : 11} fill={STATE_COLOUR[state]} stroke="#fff" strokeWidth={3} />
                  <path d="M-5 -4h10v7h-10z M-3 4v2 M3 4v2" stroke="#fff" strokeWidth={1.6} fill="none" />
                  <title>{`${tr.routeName}${tr.regNo ? ` · ${tr.regNo}` : ''}`}</title>
                  {picked && (
                    <text y={-18} textAnchor="middle" className="fill-foreground text-[12px] font-semibold" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 4 }}>
                      {tr.regNo ?? tr.routeName}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <span className="absolute right-1 bottom-1 rounded bg-white/85 px-1 text-[10px] text-neutral-700">© OpenStreetMap</span>
    </div>
  );
}
