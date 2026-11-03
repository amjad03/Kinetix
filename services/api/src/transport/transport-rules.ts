/**
 * Transport arithmetic, pure and tested on its own: a rider's fee for a month (pro rata when they joined, left or
 * moved mid-month), the fee difference when a rider moves to another route or stop, and how far a bus is off its route.
 */

export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const dayNo = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Days of a seat [startsOn, endedOn] (an end date is the last day ridden; null = still riding) inside the month. */
export function seatDays(month: string, startsOn: string, endedOn: string | null): number {
  const first = dayNo(`${month}-01`);
  const last = first + daysInMonth(month) - 1;
  const s = Math.max(first, dayNo(startsOn));
  // An assignment ended "on" a day was replaced from that day, so the end day itself is not ridden on the old seat.
  const e = Math.min(last, endedOn ? dayNo(endedOn) - 1 : Infinity);
  return e >= s ? e - s + 1 : 0;
}

/** The month's fee for one seat: the full fee for a full month, the days' share otherwise. */
export function seatFee(month: string, monthlyFeePaise: number, startsOn: string, endedOn: string | null): number {
  const days = seatDays(month, startsOn, endedOn);
  const dim = daysInMonth(month);
  return days >= dim ? monthlyFeePaise : Math.round((monthlyFeePaise * days) / dim);
}

/**
 * The fee difference for the rest of the month when a rider moves on `effectiveOn` from a seat costing `fromPaise` a
 * month to one costing `toPaise`: positive is charged, negative is credited.
 */
export function changeDelta(effectiveOn: string, fromPaise: number, toPaise: number): number {
  const month = effectiveOn.slice(0, 7);
  const dim = daysInMonth(month);
  const left = dim - Number(effectiveOn.slice(8, 10)) + 1;
  return Math.round(((toPaise - fromPaise) * left) / dim);
}

/**
 * What changes in a month already billed when a seat ends on `endsOn` (the day it is no longer ridden) instead of
 * running the whole month: the days' share no longer owed. Zero when the end falls after the month.
 */
export function cancelCredit(month: string, monthlyFeePaise: number, startsOn: string, endsOn: string): number {
  return seatFee(month, monthlyFeePaise, startsOn, null) - seatFee(month, monthlyFeePaise, startsOn, endsOn);
}

/**
 * What changes in a month already billed when a rider moves on `on` from a seat at `fromPaise` (begun `startsOn`) to one
 * at `toPaise`: the new seat's share less the old seat's days given up. Positive is charged, negative credited.
 */
export function moveDelta(month: string, fromPaise: number, toPaise: number, startsOn: string, on: string): number {
  return seatFee(month, toPaise, on, null) - cancelCredit(month, fromPaise, startsOn, on);
}

/** The months from `fromMonth` through `toMonth` (both YYYY-MM), in order. */
export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return out;
}

/** A distance band's monthly fee. */
export interface FareSlab {
  fromKm: number;
  toKm: number;
  monthlyFeePaise: number;
}

/** The fee for a stop `km` from the campus: the band with `fromKm < km <= toKm` (a stop at 0 km takes the first band); null when no band covers it. */
export function slabFee(slabs: FareSlab[], km: number | null | undefined): number | null {
  if (km == null || !(km >= 0)) return null;
  const hit = [...slabs].sort((a, b) => a.fromKm - b.fromKm).find((s) => (km > s.fromKm || (km === 0 && s.fromKm === 0)) && km <= s.toKm);
  return hit ? hit.monthlyFeePaise : null;
}

/** Bands that overlap one another (by index pairs), for refusing a slab table that would give a stop two fees. */
export function overlappingSlabs(slabs: FareSlab[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < slabs.length; i++) for (let j = i + 1; j < slabs.length; j++) if (slabs[i].fromKm < slabs[j].toKm && slabs[j].fromKm < slabs[i].toKm) out.push([i, j]);
  return out;
}

/** Minutes after midnight for an HH:MM time. */
const clockMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * How late the bus will reach a stop: the expected arrival (now plus the ETA) less the stop's scheduled time, in
 * whole minutes (0 when on time or early). Null when the stop has no time or the ETA is unknown.
 */
export function lateMinutes(nowHhmm: string, etaMin: number | null, scheduledHhmm: string | null | undefined): number | null {
  if (etaMin == null || !scheduledHhmm || !/^\d{2}:\d{2}/.test(scheduledHhmm)) return null;
  return Math.max(0, clockMin(nowHhmm) + etaMin - clockMin(scheduledHhmm));
}

/** The bus pass QR: `KXBUS:<seat id>:<student id>`. */
export function parsePassCode(code: string): { assignmentId: string; studentId: string } | null {
  const m = /^KXBUS:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(code.trim());
  return m ? { assignmentId: m[1].toLowerCase(), studentId: m[2].toLowerCase() } : null;
}

export interface RouteLoad {
  id: string;
  name: string;
  vehicleId: string | null;
  regNo: string | null;
  capacity: number | null;
  riders: number;
  /** The route's stops, to tell which routes run close to each other. */
  stops: Point[];
}
export interface SpareVehicle {
  id: string;
  regNo: string;
  capacity: number;
}
export type Suggestion =
  | { kind: 'over'; routeId: string; riders: number; capacity: number; moveTo?: { routeId: string; seats: number }; vehicle?: SpareVehicle }
  | { kind: 'low'; routeId: string; riders: number; capacity: number; mergeInto?: { routeId: string; seats: number }; vehicle?: SpareVehicle }
  | { kind: 'swap'; routeId: string; withRouteId: string }
  | { kind: 'no_vehicle'; routeId: string; riders: number; vehicle?: SpareVehicle };

/** Occupancy as a whole percentage (null without a vehicle). */
export const occupancyPct = (riders: number, capacity: number | null) => (capacity ? Math.round((riders * 100) / capacity) : null);

/** The shortest distance in metres between any stop of one route and any stop of another. */
function nearestM(a: Point[], b: Point[]): number {
  let best = Infinity;
  for (const p of a) for (const q of b) best = Math.min(best, toSegmentM(p, q, q));
  return best;
}

/**
 * Capacity against occupancy, route by route: an over-full route is told which nearby route has seats or which idle
 * vehicle is big enough; a route under `lowPct` full which nearby route can take its riders or which smaller idle
 * vehicle would do; an over-full and an under-used route whose vehicles fit each other's riders are told to swap.
 * "Nearby" is any stop of one within `nearKm` of a stop of the other.
 */
export function routeSuggestions(routes: RouteLoad[], idle: SpareVehicle[], o: { lowPct?: number; nearKm?: number } = {}): Suggestion[] {
  const lowPct = o.lowPct ?? 40;
  const near = (o.nearKm ?? 3) * 1000;
  const out: Suggestion[] = [];
  const seats = (r: RouteLoad) => (r.capacity ?? 0) - r.riders;
  const swapped = new Set<string>();
  for (const r of routes) {
    if (r.capacity == null) {
      if (r.riders > 0) out.push({ kind: 'no_vehicle', routeId: r.id, riders: r.riders, vehicle: idle.filter((v) => v.capacity >= r.riders).sort((a, b) => a.capacity - b.capacity)[0] });
      continue;
    }
    if (r.riders > r.capacity) {
      const extra = r.riders - r.capacity;
      const partner = routes.find((x) => x.id !== r.id && x.capacity != null && x.riders * 100 < lowPct * x.capacity && x.capacity >= r.riders && r.capacity! >= x.riders && !swapped.has(x.id));
      if (partner) {
        swapped.add(partner.id).add(r.id);
        out.push({ kind: 'swap', routeId: r.id, withRouteId: partner.id });
        continue;
      }
      const moveTo = routes.filter((x) => x.id !== r.id && x.capacity != null && seats(x) >= extra && nearestM(r.stops, x.stops) <= near).sort((a, b) => seats(b) - seats(a))[0];
      const vehicle = idle.filter((v) => v.capacity >= r.riders).sort((a, b) => a.capacity - b.capacity)[0];
      out.push({ kind: 'over', routeId: r.id, riders: r.riders, capacity: r.capacity, ...(moveTo && { moveTo: { routeId: moveTo.id, seats: seats(moveTo) } }), ...(vehicle && { vehicle }) });
    } else if (r.riders * 100 < lowPct * r.capacity && !swapped.has(r.id)) {
      const mergeInto = routes.filter((x) => x.id !== r.id && x.capacity != null && seats(x) >= r.riders && x.riders <= x.capacity && nearestM(r.stops, x.stops) <= near).sort((a, b) => seats(a) - seats(b))[0];
      const vehicle = idle.filter((v) => v.capacity >= r.riders && v.capacity < r.capacity!).sort((a, b) => a.capacity - b.capacity)[0];
      out.push({ kind: 'low', routeId: r.id, riders: r.riders, capacity: r.capacity, ...(mergeInto && { mergeInto: { routeId: mergeInto.id, seats: seats(mergeInto) } }), ...(vehicle && { vehicle }) });
    }
  }
  return out;
}

interface Point {
  lat: number;
  lng: number;
}

/** Metres from a point to the segment a-b (flat-earth approximation, good for a few kilometres). */
export function toSegmentM(p: Point, a: Point, b: Point): number {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111_320;
  const ax = (a.lng - p.lng) * k;
  const ay = (a.lat - p.lat) * 110_540;
  const bx = (b.lng - p.lng) * k;
  const by = (b.lat - p.lat) * 110_540;
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}

/** How far the bus is from its route: the nearest leg between consecutive stops (or the only stop). */
export function offRouteM(p: Point, stops: Point[]): number | null {
  if (!stops.length) return null;
  if (stops.length === 1) return toSegmentM(p, stops[0], stops[0]);
  let best = Infinity;
  for (let i = 0; i + 1 < stops.length; i++) best = Math.min(best, toSegmentM(p, stops[i], stops[i + 1]));
  return best;
}
