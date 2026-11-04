import { describe, expect, it } from 'vitest';
import { MESSAGES, type MessageKey } from '@/i18n/messages';
import { isLhtPath, LHT_GROUPS } from './lht';
import { DERIVED_ITEMS, fitView, isTransportPassPost, project, SAFETY_ITEMS, tilesFor, tripState } from './transport-pass';

describe('transport pass in the ERP', () => {
  it('places points on OpenStreetMap tiles', () => {
    // Zoom 0: the whole world is one 256-pixel tile; 0,0 is its centre.
    expect(project(0, 0, 0)).toEqual({ x: 128, y: 128 });
    const b = project(12.9716, 77.5946, 10);
    expect(Math.floor(b.x / 256)).toBe(732);
    expect(Math.floor(b.y / 256)).toBe(474);
  });

  it('fits the buses and stops in the box and lists the tiles to draw', () => {
    const pts = [
      { lat: 13.08, lng: 77.5 },
      { lat: 13.03, lng: 77.54 },
    ];
    const v = fitView(pts, 800, 420);
    expect(v.z).toBeGreaterThanOrEqual(12);
    for (const p of pts) {
      const q = project(p.lat, p.lng, v.z);
      expect(q.x - v.left).toBeGreaterThanOrEqual(40);
      expect(q.x - v.left).toBeLessThanOrEqual(760);
      expect(q.y - v.top).toBeGreaterThanOrEqual(40);
      expect(q.y - v.top).toBeLessThanOrEqual(380);
    }
    const tiles = tilesFor(v, 800, 420);
    expect(tiles.length).toBeGreaterThanOrEqual(8);
    expect(tiles.every((t) => t.px > -256 && t.px < 800 && t.py > -256 && t.py < 420)).toBe(true);
    // Nothing to show: the view still centres on Bengaluru.
    expect(fitView([], 400, 300).z).toBe(16);
  });

  it('ranks how a bus stands: SOS, silent, late, alert, on time', () => {
    const base = { sos: false, silentMinutes: 1, lateMinutes: 0, alerts: 0, notBoarded: 0 };
    expect(tripState({ ...base, sos: true, lateMinutes: 20 })).toBe('sos');
    expect(tripState({ ...base, silentMinutes: 9, lateMinutes: 20 })).toBe('silent');
    expect(tripState({ ...base, lateMinutes: 12 })).toBe('late');
    expect(tripState({ ...base, notBoarded: 1 })).toBe('alert');
    expect(tripState(base)).toBe('ok');
  });

  it('lets the pages send only their own paths, and words every list and safety item', () => {
    expect(isTransportPassPost('/v1/transport/fare-slabs/apply')).toBe(true);
    expect(isLhtPath('/v1/transport/expiry-reminders/run')).toBe(true);
    expect(isLhtPath('/v1/transport/trips/x/sos')).toBe(false);
    expect(LHT_GROUPS.transport.flatMap((g) => g.entities)).toEqual(expect.arrayContaining(['transport-fare-slabs', 'transport-safety-checks', 'transport-boardings', 'transport-fee-adjustments']));
    for (const k of [...SAFETY_ITEMS, ...DERIVED_ITEMS, 'checkDue']) expect(MESSAGES.kn[`tp.gap.${k}` as MessageKey], k).toBeTruthy();
  });
});
