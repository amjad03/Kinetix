/**
 * CAP-style seat allotment. Candidates are taken in overall rank order; each is given the first option on their
 * preference list that still has a seat. Within an option the open (merit) seats go first; a reserved-category
 * candidate who misses a merit seat may take a seat of their own category. Between rounds a candidate answers an offer:
 * freeze (keep it, stop), float or slide (keep it but allow an upgrade to a better preference; the old seat is
 * released only if the upgrade happens) or reject (leave the process). No answer forfeits the seat.
 */

export const MERIT = 'merit';

export interface SeatRow {
  option: string;
  /** 'merit' for open seats, else the reservation category. */
  category: string;
  seats: number;
}

export interface Contender {
  id: string;
  rank: number;
  category: string | null;
  /** Option labels, most wanted first. */
  prefs: string[];
}

export type Response = 'pending' | 'freeze' | 'float' | 'slide' | 'reject' | 'forfeit';

export interface Held {
  option: string;
  seatCategory: string;
  response: Response;
}

export interface Allotment {
  id: string;
  rank: number;
  option: string;
  seatCategory: string;
  /** upgraded: moved to a better preference; kept: float holder who found nothing better; new: first allotment. */
  kind: 'new' | 'upgraded' | 'kept';
  previous?: { option: string; seatCategory: string };
}

const key = (o: string, c: string) => `${o}\u0000${c}`;

/**
 * Seat rows for each option from the cycle's reservation shares (the rule `quota/admission-seats` in the registry, or
 * the cycle's own quotas): each option reserves the same share of its seats for a category, rounded down; the rest is merit.
 */
export function seatMatrixFromShares(options: { label: string; seats: number }[], reserved: { category: string; reservedSeats: number }[] | null, cycleSeats: number): SeatRow[] {
  const rows: SeatRow[] = [];
  for (const o of options) {
    let used = 0;
    for (const q of reserved ?? []) {
      const n = cycleSeats > 0 ? Math.floor((q.reservedSeats * o.seats) / cycleSeats) : 0;
      if (n > 0) rows.push({ option: o.label, category: q.category, seats: n });
      used += n;
    }
    rows.push({ option: o.label, category: MERIT, seats: o.seats - used });
  }
  return rows;
}

/**
 * One round. `held` is what each candidate holds from earlier rounds (only freeze, float and slide are passed in; the
 * rest have given their seat back). Returns the allotments made or kept this round and the free seats left.
 */
export function runRound(matrix: SeatRow[], contenders: Contender[], held: Map<string, Held>): { allotments: Allotment[]; remaining: SeatRow[] } {
  const free = new Map<string, number>();
  for (const r of matrix) free.set(key(r.option, r.category), (free.get(key(r.option, r.category)) ?? 0) + r.seats);
  const bump = (o: string, c: string, d: number) => free.set(key(o, c), (free.get(key(o, c)) ?? 0) + d);
  const has = (o: string, c: string) => (free.get(key(o, c)) ?? 0) > 0;

  // Held seats are taken first: a frozen seat is never touched, a floating one is released only on an upgrade.
  for (const h of held.values()) bump(h.option, h.seatCategory, -1);

  const allotments: Allotment[] = [];
  for (const c of [...contenders].sort((a, b) => a.rank - b.rank)) {
    const h = held.get(c.id);
    if (h && h.response === 'freeze') continue;
    let prefs = c.prefs;
    if (h) {
      const at = c.prefs.indexOf(h.option);
      prefs = at >= 0 ? c.prefs.slice(0, at) : [];
    } else if (!c.prefs.length) continue;
    let got: { option: string; seatCategory: string } | null = null;
    for (const o of prefs) {
      if (has(o, MERIT)) { got = { option: o, seatCategory: MERIT }; break; }
      if (c.category && has(o, c.category)) { got = { option: o, seatCategory: c.category }; break; }
    }
    if (got) {
      bump(got.option, got.seatCategory, -1);
      if (h) bump(h.option, h.seatCategory, 1);
      allotments.push({ id: c.id, rank: c.rank, ...got, kind: h ? 'upgraded' : 'new', ...(h ? { previous: { option: h.option, seatCategory: h.seatCategory } } : {}) });
    } else if (h) {
      allotments.push({ id: c.id, rank: c.rank, option: h.option, seatCategory: h.seatCategory, kind: 'kept' });
    }
  }
  return { allotments, remaining: matrix.map((r) => ({ ...r, seats: Math.max(0, free.get(key(r.option, r.category)) ?? 0) })) };
}
