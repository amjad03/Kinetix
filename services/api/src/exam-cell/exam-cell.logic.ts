/**
 * Exam cell rules as pure functions: late-fee slabs, attendance-linked internal marks, double-entry checks,
 * the revaluation change rule, attempts (best or latest), result differences for a dry run, rank lists without
 * repeaters, gold medals, remuneration, the invigilation roster and the hall's answer-book balance.
 * No database here, so each rule is tested on its own (exam-cell.logic.spec.ts).
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- registration fees -----------------------------------------------------------------------

/** A late-fee slab: registering `afterDays` or more days after the window closed costs `amountPaise` extra. */
export interface LateFeeSlab {
  afterDays: number;
  amountPaise: number;
  label: string;
}

/** Days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * The late fee for registering `daysLate` days after the window closed: the highest slab reached (the super-fine
 * slabs are simply later, larger ones). Zero when on time. With no slabs, `flatPaise` (the office's one late fee).
 */
export function lateFeeFor(slabs: LateFeeSlab[], daysLate: number, flatPaise = 0): { amountPaise: number; slab: string | null } {
  if (daysLate <= 0) return { amountPaise: 0, slab: null };
  if (slabs.length === 0) return { amountPaise: flatPaise, slab: null };
  const hit = [...slabs].sort((a, b) => b.afterDays - a.afterDays).find((s) => daysLate >= s.afterDays);
  return hit ? { amountPaise: hit.amountPaise, slab: hit.label } : { amountPaise: 0, slab: null };
}

/** Whether today allows registration: open in the window, late until `lateUntil`, else closed or not yet open. */
export function registrationState(w: { opensOn: string; closesOn: string; lateUntil: string | null }, today: string): 'upcoming' | 'open' | 'late' | 'closed' {
  if (today < w.opensOn) return 'upcoming';
  if (today <= w.closesOn) return 'open';
  if (w.lateUntil && today <= w.lateUntil) return 'late';
  return 'closed';
}

// ---- internal marks --------------------------------------------------------------------------

/** One row of an attendance-marks slab table: attendance at or above `minPercent` earns `percentOfMax` of the component. */
export interface AttendanceSlab {
  minPercent: number;
  percentOfMax: number;
}

/** Marks for attendance from the slab table (whole marks, rounded half up), 0 below the lowest slab. */
export function attendanceMarks(slabs: AttendanceSlab[], attendancePercent: number, max: number): number {
  const hit = [...slabs].sort((a, b) => b.minPercent - a.minPercent).find((s) => attendancePercent + 1e-9 >= s.minPercent);
  if (!hit) return 0;
  return Math.min(max, Math.round((max * hit.percentOfMax) / 100));
}

export function slabProblem(slabs: AttendanceSlab[]): string | null {
  if (new Set(slabs.map((s) => s.minPercent)).size !== slabs.length) return 'Two slabs start at the same attendance';
  const sorted = [...slabs].sort((a, b) => a.minPercent - b.minPercent);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].percentOfMax < sorted[i - 1].percentOfMax) return 'Higher attendance cannot earn fewer marks';
  return null;
}

// ---- double entry ----------------------------------------------------------------------------

export interface Entry {
  marks: number | null;
  absent: boolean;
}

/** Whether two keyings of the same marks agree: both absent, or the same marks. */
export function entryStatus(first: Entry | null, second: Entry | null): 'pending' | 'matched' | 'mismatch' {
  if (!first || !second) return 'pending';
  if (first.absent || second.absent) return first.absent && second.absent ? 'matched' : 'mismatch';
  if (first.marks === null || second.marks === null) return 'pending';
  return Math.abs(first.marks - second.marks) < 0.005 ? 'matched' : 'mismatch';
}

// ---- revaluation -----------------------------------------------------------------------------

/**
 * The marks that stand after a revaluation: the revalued marks when they differ from the original by at least
 * `thresholdPercent` of the paper's maximum (null = any change counts), otherwise the original.
 */
export function revaluationOutcome(original: number, revalued: number, max: number, thresholdPercent: number | null): { marks: number; changed: boolean; difference: number } {
  const difference = round2(revalued - original);
  if (difference === 0) return { marks: original, changed: false, difference };
  if (thresholdPercent !== null && Math.abs(difference) + 1e-9 < (max * thresholdPercent) / 100) return { marks: original, changed: false, difference };
  return { marks: revalued, changed: true, difference };
}

// ---- attempts --------------------------------------------------------------------------------

export interface Attempt {
  passed: boolean;
  gradePoint: number;
  percent?: number;
}

/** Of two attempts of a subject (`next` is later): the later one, or with `best` the better one (a pass beats a fail). */
export function pickAttempt<T extends Attempt>(prev: T | undefined, next: T, policy: 'best' | 'latest'): T {
  if (!prev || policy === 'latest') return next;
  if (prev.passed !== next.passed) return prev.passed ? prev : next;
  if (next.gradePoint !== prev.gradePoint) return next.gradePoint > prev.gradePoint ? next : prev;
  return (next.percent ?? 0) >= (prev.percent ?? 0) ? next : prev;
}

// ---- result differences ----------------------------------------------------------------------

export interface ResultShape {
  studentId: string;
  sgpa: number;
  outcome: string;
  lines: { subjectId: string; grade: string; percent: number; passed: boolean }[];
}

export interface ResultChange {
  studentId: string;
  kind: 'new' | 'changed' | 'removed';
  before: { sgpa: number; outcome: string } | null;
  after: { sgpa: number; outcome: string } | null;
  subjects: { subjectId: string; before: string | null; after: string | null }[];
}

/** What a processing would change against the stored results, student by student. */
export function diffResults(before: ResultShape[], after: ResultShape[]): ResultChange[] {
  const old = new Map(before.map((r) => [r.studentId, r]));
  const out: ResultChange[] = [];
  for (const a of after) {
    const b = old.get(a.studentId);
    old.delete(a.studentId);
    if (!b) {
      out.push({ studentId: a.studentId, kind: 'new', before: null, after: { sgpa: a.sgpa, outcome: a.outcome }, subjects: a.lines.map((l) => ({ subjectId: l.subjectId, before: null, after: l.grade })) });
      continue;
    }
    const subjects = [...new Set([...a.lines.map((l) => l.subjectId), ...b.lines.map((l) => l.subjectId)])]
      .map((sid) => {
        const x = b.lines.find((l) => l.subjectId === sid);
        const y = a.lines.find((l) => l.subjectId === sid);
        return { subjectId: sid, before: x ? `${x.grade} ${x.percent}` : null, after: y ? `${y.grade} ${y.percent}` : null };
      })
      .filter((s) => s.before !== s.after);
    if (subjects.length || a.sgpa !== b.sgpa || a.outcome !== b.outcome) out.push({ studentId: a.studentId, kind: 'changed', before: { sgpa: b.sgpa, outcome: b.outcome }, after: { sgpa: a.sgpa, outcome: a.outcome }, subjects: subjects.map((s) => ({ subjectId: s.subjectId, before: s.before?.split(' ')[0] ?? null, after: s.after?.split(' ')[0] ?? null })) });
  }
  for (const b of old.values()) out.push({ studentId: b.studentId, kind: 'removed', before: { sgpa: b.sgpa, outcome: b.outcome }, after: null, subjects: [] });
  return out;
}

// ---- ranks and medals ------------------------------------------------------------------------

export interface RankCandidate {
  studentId: string;
  score: number;
  passed: boolean;
  /** Failed a subject at some earlier attempt, or is repeating the term. */
  repeater: boolean;
  rollNo: string;
}

/**
 * Ranks by score, highest first, ties sharing a rank (1, 2, 2, 4). Only those who passed are ranked; with
 * `excludeRepeaters` a repeater gets no rank either (most universities rank first-attempt candidates only).
 */
export function rankList<T extends RankCandidate>(rows: T[], opts: { excludeRepeaters: boolean }): (T & { rank: number | null })[] {
  const eligible = rows.filter((r) => r.passed && !(opts.excludeRepeaters && r.repeater)).sort((a, b) => b.score - a.score || a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
  const rank = new Map<string, number>();
  eligible.forEach((r, i) => rank.set(r.studentId, i > 0 && eligible[i - 1].score === r.score ? rank.get(eligible[i - 1].studentId)! : i + 1));
  return [...rows].sort((a, b) => b.score - a.score || a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true })).map((r) => ({ ...r, rank: rank.get(r.studentId) ?? null }));
}

export interface MedalRule {
  /** Lowest CGPA for a medal. */
  minCgpa: number;
  /** Only candidates who passed every subject at the first attempt. */
  firstAttemptOnly: boolean;
}

/** The gold medallist(s) of a programme: the top CGPA among those the rule allows (joint medals on a tie). */
export function goldMedallists<T extends { studentId: string; cgpa: number; firstAttempt: boolean; completed: boolean }>(rows: T[], rule: MedalRule): T[] {
  const pool = rows.filter((r) => r.completed && r.cgpa + 1e-9 >= rule.minCgpa && (!rule.firstAttemptOnly || r.firstAttempt));
  if (pool.length === 0) return [];
  const top = Math.max(...pool.map((r) => r.cgpa));
  return pool.filter((r) => Math.abs(r.cgpa - top) < 1e-9);
}

// ---- remuneration ----------------------------------------------------------------------------

export interface Rates {
  invigilatorPaise: number;
  chiefPaise: number;
  valuationPerScriptPaise: number;
  chiefExaminerPerDayPaise: number;
}

/** What a member of staff is owed for duties and valued scripts. */
export function remuneration(rates: Rates, w: { invigilations: number; chiefDuties: number; scripts: number; chiefDays: number }): { dutiesPaise: number; valuationPaise: number; totalPaise: number } {
  const dutiesPaise = w.invigilations * rates.invigilatorPaise + w.chiefDuties * rates.chiefPaise;
  const valuationPaise = w.scripts * rates.valuationPerScriptPaise + w.chiefDays * rates.chiefExaminerPerDayPaise;
  return { dutiesPaise, valuationPaise, totalPaise: dutiesPaise + valuationPaise };
}

// ---- invigilation roster ---------------------------------------------------------------------

export interface RosterStaff {
  id: string;
  /** Days of service: more senior staff are made chief superintendent and get fewer hall duties. */
  seniorityDays: number;
  /** Duties already held (this session and any others counted by the caller). */
  load: number;
}

export interface RosterSlot {
  key: string;
  date: string;
  startsAt: string;
  endsAt: string;
  rooms: { roomId: string; candidates: number }[];
}

/** How many invigilators a hall needs: one per `perInvigilator` candidates, at least one. */
export const invigilatorsFor = (candidates: number, perInvigilator: number) => Math.max(1, Math.ceil(candidates / Math.max(1, perInvigilator)));

/**
 * Builds a roster: for each sitting, a chief superintendent (the most senior free person) and the halls'
 * invigilators, always picking the person with the lightest load so far (juniors first on a tie). `busy` says
 * whether someone already has a duty overlapping the sitting. Returns the duties and the halls left short.
 */
export function buildRoster(slots: RosterSlot[], staff: RosterStaff[], perInvigilator: number, busy: (staffId: string, slot: RosterSlot) => boolean): { duties: { slotKey: string; staffId: string; roomId: string; role: 'chief' | 'invigilator' }[]; short: { slotKey: string; roomId: string; missing: number }[] } {
  const load = new Map(staff.map((s) => [s.id, s.load]));
  const duties: { slotKey: string; staffId: string; roomId: string; role: 'chief' | 'invigilator' }[] = [];
  const short: { slotKey: string; roomId: string; missing: number }[] = [];
  for (const slot of slots) {
    const taken = new Set<string>();
    const free = () => staff.filter((s) => !taken.has(s.id) && !busy(s.id, slot));
    if (slot.rooms.length === 0) continue;
    const chief = free().sort((a, b) => b.seniorityDays - a.seniorityDays || (load.get(a.id)! - load.get(b.id)!))[0];
    if (chief) {
      taken.add(chief.id);
      load.set(chief.id, load.get(chief.id)! + 1);
      duties.push({ slotKey: slot.key, staffId: chief.id, roomId: slot.rooms[0].roomId, role: 'chief' });
    }
    for (const room of slot.rooms) {
      const need = invigilatorsFor(room.candidates, perInvigilator);
      for (let i = 0; i < need; i++) {
        const pick = free().sort((a, b) => load.get(a.id)! - load.get(b.id)! || a.seniorityDays - b.seniorityDays || a.id.localeCompare(b.id))[0];
        if (!pick) {
          short.push({ slotKey: slot.key, roomId: room.roomId, missing: need - i });
          break;
        }
        taken.add(pick.id);
        load.set(pick.id, load.get(pick.id)! + 1);
        duties.push({ slotKey: slot.key, staffId: pick.id, roomId: room.roomId, role: 'invigilator' });
      }
    }
  }
  return { duties, short };
}

// ---- answer books ----------------------------------------------------------------------------

export interface BookAccount {
  received: number;
  issued: number;
  additional: number;
  spoiled: number;
  returned: number;
  present: number;
  absent: number;
}

/** Why a hall's answer-book account does not balance, or null when it does. */
export function bookProblem(a: BookAccount, seated: number | null): string | null {
  if (a.issued + a.additional > a.received) return `More books issued (${a.issued + a.additional}) than received (${a.received})`;
  if (a.returned + a.spoiled !== a.issued + a.additional) return `Returned and spoiled books (${a.returned + a.spoiled}) must equal the books issued (${a.issued + a.additional})`;
  if (a.issued > a.present) return `More main books issued (${a.issued}) than candidates present (${a.present})`;
  if (seated !== null && a.present + a.absent !== seated) return `Present and absent (${a.present + a.absent}) must add up to the ${seated} candidates seated in the hall`;
  return null;
}

// ---- CSV -------------------------------------------------------------------------------------

/** Quotes a CSV cell when it has a comma, quote or line break. */
export const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
