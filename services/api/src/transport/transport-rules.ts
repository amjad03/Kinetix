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
