/**
 * The reservation matrix of an admission cycle and the counselling allotment that fills it.
 *
 * A seat row is one option (course or course and college) × seat type (government/CET, COMEDK, management, NRI) ×
 * vertical category (GM is the open "merit" row; SC, ST, Category-1, 2A, 2B, 3A, 3B in Karnataka). A row may earmark
 * horizontal seats inside it (persons with disabilities, rural, Kannada medium) and a row may be supernumerary: seats
 * outside the approved intake, open only to candidates who hold that claim (AICTE tuition fee waiver, foreign
 * nationals / PIO / Gulf children, PM special scholarship for Jammu and Kashmir).
 *
 * Allotment follows the counselling practice of KEA and the CAP rounds: candidates in overall rank order, each takes
 * the first preference with a free seat of their own seat type, trying the open (GM) row before their own category
 * (a reserved candidate who makes the open merit list does not use up a reserved seat), then any supernumerary row they
 * qualify for. Horizontal seats are then made good inside each row the way the Supreme Court set out in Saurav Yadav v.
 * State of UP (2020): if a row has fewer horizontal candidates than it earmarks, the lowest-ranked newcomer without the
 * claim gives way to the best-ranked waiting candidate with it who is eligible for that row, and the displaced
 * candidate tries their remaining preferences.
 */

export const MERIT = 'merit';

/** Karnataka's vertical categories, as KEA and the state universities write them, with their seat shares. */
export const KARNATAKA_CATEGORIES = [
  { key: 'sc', label: 'Scheduled Caste (SC)', percent: 17 },
  { key: 'st', label: 'Scheduled Tribe (ST)', percent: 7 },
  { key: 'cat-1', label: 'Category-1', percent: 4 },
  { key: '2a', label: 'Category-2A', percent: 15 },
  { key: '2b', label: 'Category-2B', percent: 4 },
  { key: '3a', label: 'Category-3A', percent: 4 },
  { key: '3b', label: 'Category-3B', percent: 5 },
] as const;

/** Category names as families type them, mapped to the matrix keys. GM, general, open and unreserved are the merit row. */
const ALIASES: Record<string, string> = {
  gm: MERIT, general: MERIT, gen: MERIT, open: MERIT, ur: MERIT, unreserved: MERIT, merit: MERIT, oc: MERIT,
  'cat-1': 'cat-1', cat1: 'cat-1', 'category-1': 'cat-1', 'category 1': 'cat-1', c1: 'cat-1', i: 'cat-1', '1': 'cat-1', 'cat 1': 'cat-1',
  '2a': '2a', 'cat-2a': '2a', 'category-2a': '2a', iia: '2a',
  '2b': '2b', 'cat-2b': '2b', 'category-2b': '2b', iib: '2b',
  '3a': '3a', 'cat-3a': '3a', 'category-3a': '3a', iiia: '3a',
  '3b': '3b', 'cat-3b': '3b', 'category-3b': '3b', iiib: '3b',
};

/** The matrix key of a category as written on a form: "GM" → merit, "Cat-1" → cat-1, "SC" → sc. */
export function categoryKey(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return MERIT;
  return ALIASES[s] ?? ALIASES[s.replace(/\s/g, '')] ?? s;
}

export const SEAT_TYPES = ['merit', 'comedk', 'management', 'nri'] as const;
export type SeatType = (typeof SEAT_TYPES)[number];
export const SEAT_TYPE_LABELS: Record<SeatType, string> = { merit: 'Government (CET / university merit)', comedk: 'COMEDK', management: 'Management', nri: 'NRI' };

export const HORIZONTAL_KINDS = ['pwd', 'rural', 'kannada_medium', 'hk_region', 'sports', 'ncc', 'defence'] as const;
export type HorizontalKind = (typeof HORIZONTAL_KINDS)[number];

export const SUPERNUMERARY_KINDS = ['tfw', 'foreign', 'jk_migrant', 'pmsss', 'ews'] as const;
export type SupernumeraryKind = (typeof SUPERNUMERARY_KINDS)[number];

/** The tuition fee waiver scheme (AICTE): family income from all sources below Rs 8 lakh a year. */
export const TFW_INCOME_LIMIT_PAISE = 8_00_000_00;

export interface PlanRow {
  option: string;
  seatType: string;
  /** 'merit' for the open (GM) row, else the vertical category; for a supernumerary row, its kind (tfw, foreign...). */
  category: string;
  seats: number;
  /** Seats inside this row earmarked for a horizontal claim: { pwd: 1, rural: 3 }. */
  horizontal: Record<string, number>;
  supernumerary: boolean;
}

export interface SeatPlanInput {
  options: { label: string; intake: number }[];
  /** Share of each option's intake per seat type, in percent; must add up to 100. */
  seatTypes: { seatType: string; percent: number }[];
  /** Vertical reservation inside each seat type that has it (KEA: the government seats only). */
  reservation: { appliesTo: string[]; categories: { key: string; percent: number }[] };
  /** Horizontal shares, in percent of each reserved-scheme row (rounded down; PwD at least one where the row allows). */
  horizontal: { appliesTo: string[]; kinds: { kind: string; percent: number }[] };
  /** Supernumerary seats, in percent of each option's intake (rounded down), with the seat type they sit in. */
  supernumerary: { kind: string; percent: number; seatType: string }[];
}

/** Seats split by largest remainder so the parts always add up to the whole. */
export function splitByShares(total: number, shares: { key: string; percent: number }[]): Map<string, number> {
  const raw = shares.map((s) => ({ key: s.key, exact: (total * s.percent) / 100 }));
  const out = new Map(raw.map((r) => [r.key, Math.floor(r.exact)]));
  let left = total - [...out.values()].reduce((n, v) => n + v, 0);
  for (const r of [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || a.key.localeCompare(b.key))) {
    if (left <= 0) break;
    out.set(r.key, (out.get(r.key) ?? 0) + 1);
    left--;
  }
  return out;
}

/** Problems with a plan's shares, in plain words. */
export function planProblems(p: SeatPlanInput): string[] {
  const out: string[] = [];
  const typeTotal = p.seatTypes.reduce((n, s) => n + s.percent, 0);
  if (!p.seatTypes.length) out.push('Give at least one seat type');
  else if (Math.abs(typeTotal - 100) > 0.001) out.push(`Seat types add up to ${typeTotal}%, not 100%`);
  if (new Set(p.seatTypes.map((s) => s.seatType)).size !== p.seatTypes.length) out.push('A seat type appears twice');
  const resTotal = p.reservation.categories.reduce((n, c) => n + c.percent, 0);
  if (resTotal >= 100) out.push('Reserved categories take every seat; leave some for general merit');
  if (p.reservation.categories.some((c) => categoryKey(c.key) === MERIT)) out.push('GM is the open row; do not reserve it');
  if (!p.options.length) out.push('Give at least one option');
  for (const o of p.options) if (!(o.intake > 0)) out.push(`${o.label}: intake must be above zero`);
  for (const s of p.supernumerary) if (!p.seatTypes.some((t) => t.seatType === s.seatType)) out.push(`Supernumerary ${s.kind}: seat type ${s.seatType} is not in the plan`);
  return out;
}

/** The plan's seat rows. Intake seats always add up to each option's intake; supernumerary rows are on top. */
export function buildSeatPlan(p: SeatPlanInput): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const o of p.options) {
    const byType = splitByShares(o.intake, p.seatTypes.map((s) => ({ key: s.seatType, percent: s.percent })));
    for (const t of p.seatTypes) {
      const typeSeats = byType.get(t.seatType) ?? 0;
      if (typeSeats <= 0) continue;
      const reserved = p.reservation.appliesTo.includes(t.seatType) ? p.reservation.categories : [];
      const resShares = reserved.map((c) => ({ key: categoryKey(c.key), percent: c.percent }));
      const parts = splitByShares(typeSeats, [...resShares, { key: MERIT, percent: 100 - resShares.reduce((n, c) => n + c.percent, 0) }]);
      for (const [category, seats] of parts) {
        if (seats <= 0) continue;
        const horizontal: Record<string, number> = {};
        if (p.horizontal.appliesTo.includes(t.seatType)) {
          for (const h of p.horizontal.kinds) {
            const n = Math.floor((seats * h.percent) / 100);
            if (n > 0) horizontal[h.kind] = n;
          }
        }
        rows.push({ option: o.label, seatType: t.seatType, category, seats, horizontal, supernumerary: false });
      }
    }
    for (const s of p.supernumerary) {
      const n = Math.floor((o.intake * s.percent) / 100);
      if (n > 0) rows.push({ option: o.label, seatType: s.seatType, category: s.kind, seats: n, horizontal: {}, supernumerary: true });
    }
  }
  return rows;
}

export interface PlanPreset {
  key: string;
  label: string;
  source: string;
  plan: Omit<SeatPlanInput, 'options'>;
}

const KA_RES = { appliesTo: ['merit'], categories: KARNATAKA_CATEGORIES.map((c) => ({ key: c.key, percent: c.percent })) };
const KA_HORIZONTAL = { appliesTo: ['merit'], kinds: [{ kind: 'pwd', percent: 5 }, { kind: 'rural', percent: 15 }, { kind: 'kannada_medium', percent: 5 }] };

/**
 * Starting points; every share stays editable because the split is fixed each year (the consensual agreement between
 * the state and the private colleges' associations, the university's or government's admission notification).
 */
export const PLAN_PRESETS: PlanPreset[] = [
  {
    key: 'karnataka-engineering-private',
    label: 'Karnataka private unaided engineering: Government (KCET) 45%, COMEDK 30%, Management 25%',
    source: 'Seat-sharing agreement between the Government of Karnataka and the private engineering colleges; reservation under the Karnataka SC/ST (Reservation of Seats in Educational Institutions) Act 2022 and the backward-class orders; AICTE TFW 5% and PIO/FN/Gulf 15% supernumerary',
    plan: { seatTypes: [{ seatType: 'merit', percent: 45 }, { seatType: 'comedk', percent: 30 }, { seatType: 'management', percent: 25 }], reservation: KA_RES, horizontal: KA_HORIZONTAL, supernumerary: [{ kind: 'tfw', percent: 5, seatType: 'merit' }, { kind: 'foreign', percent: 15, seatType: 'management' }] },
  },
  {
    key: 'karnataka-pg-private',
    label: 'Karnataka private MBA / MCA: Government (PGCET) 50%, Management 50%',
    source: 'Karnataka PGCET seat sharing for private unaided colleges; reservation as for government seats; AICTE TFW 5% supernumerary',
    plan: { seatTypes: [{ seatType: 'merit', percent: 50 }, { seatType: 'management', percent: 50 }], reservation: KA_RES, horizontal: KA_HORIZONTAL, supernumerary: [{ kind: 'tfw', percent: 5, seatType: 'merit' }] },
  },
  {
    key: 'karnataka-degree',
    label: 'Karnataka degree college (state university): university merit with state reservation, Management 20%',
    source: 'Admission notification of the state university under the Karnataka State Universities Act; reservation as per the state orders',
    plan: { seatTypes: [{ seatType: 'merit', percent: 80 }, { seatType: 'management', percent: 20 }], reservation: KA_RES, horizontal: { appliesTo: ['merit'], kinds: [{ kind: 'pwd', percent: 5 }] }, supernumerary: [{ kind: 'foreign', percent: 5, seatType: 'management' }] },
  },
  {
    key: 'open-merit',
    label: 'Open merit only: no seat types or reservation (autonomous or minority institutions with their own rules)',
    source: 'Institution policy',
    plan: { seatTypes: [{ seatType: 'merit', percent: 100 }], reservation: { appliesTo: [], categories: [] }, horizontal: { appliesTo: ['merit'], kinds: [{ kind: 'pwd', percent: 5 }] }, supernumerary: [] },
  },
];

// ---- allotment -----------------------------------------------------------------------------------------

export interface Contender {
  id: string;
  rank: number;
  /** The seat type the candidate competes for (their quota). */
  seatType: string;
  /** Vertical category key (categoryKey); merit for GM. */
  category: string;
  /** Verified horizontal claims (pwd, rural...). */
  horizontal: string[];
  /** Verified supernumerary claims (tfw, foreign...). */
  supernumerary: string[];
  prefs: string[];
}

export type Response = 'pending' | 'freeze' | 'float' | 'slide' | 'reject' | 'forfeit';

export interface Held {
  option: string;
  seatType: string;
  seatCategory: string;
  response: Response;
}

export interface Allotment {
  id: string;
  rank: number;
  option: string;
  seatType: string;
  seatCategory: string;
  /** The horizontal claim the seat counts towards, if any. */
  horizontal: string | null;
  kind: 'new' | 'upgraded' | 'kept';
  previous?: { option: string; seatType: string; seatCategory: string };
}

const rk = (o: string, t: string, c: string) => `${o}\u0000${t}\u0000${c}`;

/** The rows a candidate may sit in for an option, best first: open, own category, then each supernumerary claim. */
function rowsFor(c: Contender, option: string, rows: Map<string, PlanRow>): string[] {
  const out: string[] = [];
  const open = rk(option, c.seatType, MERIT);
  if (rows.has(open) && !rows.get(open)!.supernumerary) out.push(open);
  if (c.category !== MERIT) {
    const own = rk(option, c.seatType, c.category);
    if (rows.has(own) && !rows.get(own)!.supernumerary) out.push(own);
  }
  for (const s of c.supernumerary) {
    for (const r of rows.values()) if (r.supernumerary && r.option === option && r.category === s && r.seatType === c.seatType) out.push(rk(r.option, r.seatType, r.category));
  }
  return out;
}

/**
 * One counselling round over the matrix. `held` is what each candidate keeps from earlier rounds (freeze, float or
 * slide only). Returns the allotments made or kept and the seats left in each row.
 */
export function allotRound(matrix: PlanRow[], contenders: Contender[], held: Map<string, Held>): { allotments: Allotment[]; remaining: PlanRow[] } {
  const rows = new Map(matrix.map((r) => [rk(r.option, r.seatType, r.category), r]));
  const free = new Map<string, number>();
  for (const [k, r] of rows) free.set(k, (free.get(k) ?? 0) + r.seats);
  const bump = (k: string, d: number) => free.set(k, (free.get(k) ?? 0) + d);
  for (const h of held.values()) bump(rk(h.option, h.seatType, h.seatCategory), -1);

  const byId = new Map(contenders.map((c) => [c.id, c]));
  const given = new Map<string, Allotment>();
  /** Options a candidate may still try (better than what they hold, in order). */
  const prefsOf = (c: Contender): string[] => {
    const h = held.get(c.id);
    if (!h) return c.prefs;
    const at = c.prefs.indexOf(h.option);
    return at >= 0 ? c.prefs.slice(0, at) : [];
  };
  /** Gives a candidate the first free seat in their preferences, skipping the rows in `avoid`. */
  const place = (c: Contender, avoid: Set<string>): boolean => {
    const h = held.get(c.id);
    for (const o of prefsOf(c)) {
      for (const k of rowsFor(c, o, rows)) {
        if (avoid.has(k) || (free.get(k) ?? 0) <= 0) continue;
        const r = rows.get(k)!;
        bump(k, -1);
        if (h) bump(rk(h.option, h.seatType, h.seatCategory), 1);
        given.set(c.id, { id: c.id, rank: c.rank, option: r.option, seatType: r.seatType, seatCategory: r.category, horizontal: null, kind: h ? 'upgraded' : 'new', ...(h ? { previous: { option: h.option, seatType: h.seatType, seatCategory: h.seatCategory } } : {}) });
        return true;
      }
    }
    return false;
  };
  const order = [...contenders].sort((a, b) => a.rank - b.rank);
  for (const c of order) {
    if (held.get(c.id)?.response === 'freeze') continue;
    place(c, new Set());
  }

  // Horizontal seats, row by row: newcomers without the claim give way to waiting candidates who have it.
  for (const [k, r] of rows) {
    for (const [kind, need] of Object.entries(r.horizontal)) {
      const inRow = () => [...given.values()].filter((a) => rk(a.option, a.seatType, a.seatCategory) === k);
      const counted = () => inRow().filter((a) => byId.get(a.id)?.horizontal.includes(kind)).length + [...held.entries()].filter(([id, h]) => !given.has(id) && rk(h.option, h.seatType, h.seatCategory) === k && byId.get(id)?.horizontal.includes(kind)).length;
      let guard = need + 1;
      while (counted() < need && guard-- > 0) {
        const waiting = order.find((c) => !given.has(c.id) && !held.has(c.id) && c.horizontal.includes(kind) && rowsFor(c, r.option, rows).includes(k) && c.prefs.includes(r.option));
        if (!waiting) break;
        if ((free.get(k) ?? 0) > 0) {
          bump(k, -1);
          given.set(waiting.id, { id: waiting.id, rank: waiting.rank, option: r.option, seatType: r.seatType, seatCategory: r.category, horizontal: kind, kind: 'new' });
          continue;
        }
        const out = inRow().filter((a) => a.kind === 'new' && !byId.get(a.id)?.horizontal.includes(kind) && a.rank < Infinity).sort((a, b) => b.rank - a.rank)[0];
        if (!out) break;
        given.delete(out.id);
        given.set(waiting.id, { id: waiting.id, rank: waiting.rank, option: r.option, seatType: r.seatType, seatCategory: r.category, horizontal: kind, kind: 'new' });
        // The displaced candidate tries their other rows and options (not this row again).
        place(byId.get(out.id)!, new Set([k]));
      }
      for (const a of inRow()) if (!a.horizontal && byId.get(a.id)?.horizontal.includes(kind)) a.horizontal = kind;
    }
  }

  const allotments: Allotment[] = [];
  for (const c of order) {
    const a = given.get(c.id);
    const h = held.get(c.id);
    if (a) allotments.push(a);
    else if (h && h.response !== 'freeze') allotments.push({ id: c.id, rank: c.rank, option: h.option, seatType: h.seatType, seatCategory: h.seatCategory, horizontal: null, kind: 'kept' });
  }
  return { allotments, remaining: matrix.map((r) => ({ ...r, seats: Math.max(0, free.get(rk(r.option, r.seatType, r.category)) ?? 0) })) };
}

// ---- de-reservation ------------------------------------------------------------------------------------

export interface DereserveRules {
  /** Pairs whose unfilled seats pass to each other first (SC and ST in Karnataka). */
  interchange: [string, string][];
  /** Whatever is still unfilled in a reserved row goes to the open row of the same option and seat type. */
  toMerit: boolean;
  /** Unfilled seats of a seat type handed to another (government seats surrendered to the college: merit → management). */
  surrender: Record<string, string>;
}

export const KARNATAKA_DERESERVE: DereserveRules = { interchange: [['sc', 'st']], toMerit: true, surrender: {} };

export interface Move {
  option: string;
  seatType: string;
  from: string;
  to: string;
  toSeatType: string;
  seats: number;
  why: string;
}

/**
 * Converts the seats left after the last round: SC ↔ ST first (only where the other row has a waiting candidate),
 * then any reserved seat to GM, then a seat type's leftovers to another. `waiting` says which rows still have a
 * candidate who could take a seat (row key "option|seatType|category"). Supernumerary rows are never converted.
 */
export function dereserve(remaining: PlanRow[], waiting: Set<string>, rules: DereserveRules): { rows: PlanRow[]; moves: Move[] } {
  const rows = remaining.map((r) => ({ ...r, horizontal: { ...r.horizontal } }));
  const find = (o: string, t: string, c: string) => rows.find((r) => r.option === o && r.seatType === t && r.category === c && !r.supernumerary);
  const moves: Move[] = [];
  const shift = (from: PlanRow, toKey: { seatType: string; category: string }, n: number, why: string) => {
    if (n <= 0) return;
    let to = find(from.option, toKey.seatType, toKey.category);
    if (!to) {
      to = { option: from.option, seatType: toKey.seatType, category: toKey.category, seats: 0, horizontal: {}, supernumerary: false };
      rows.push(to);
    }
    from.seats -= n;
    to.seats += n;
    moves.push({ option: from.option, seatType: from.seatType, from: from.category, to: toKey.category, toSeatType: toKey.seatType, seats: n, why });
  };
  for (const [a, b] of rules.interchange) {
    for (const r of rows.filter((x) => !x.supernumerary && (x.category === a || x.category === b) && x.seats > 0)) {
      const other = r.category === a ? b : a;
      if (waiting.has(`${r.option}|${r.seatType}|${other}`) && !waiting.has(`${r.option}|${r.seatType}|${r.category}`)) shift(r, { seatType: r.seatType, category: other }, r.seats, `No ${r.category.toUpperCase()} candidate left; passed to ${other.toUpperCase()}`);
    }
  }
  if (rules.toMerit) {
    for (const r of rows.filter((x) => !x.supernumerary && x.category !== MERIT && x.seats > 0)) {
      if (!waiting.has(`${r.option}|${r.seatType}|${r.category}`)) shift(r, { seatType: r.seatType, category: MERIT }, r.seats, `No ${r.category.toUpperCase()} candidate left; converted to general merit`);
    }
  }
  for (const [from, to] of Object.entries(rules.surrender)) {
    for (const r of rows.filter((x) => !x.supernumerary && x.seatType === from && x.category === MERIT && x.seats > 0)) {
      if (!waiting.has(`${r.option}|${r.seatType}|${MERIT}`)) shift(r, { seatType: to, category: MERIT }, r.seats, `Unfilled ${from} seats surrendered to ${to}`);
    }
  }
  return { rows: rows.filter((r) => r.seats > 0 || r.supernumerary), moves };
}
