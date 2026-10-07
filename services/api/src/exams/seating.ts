/**
 * Seating plan: papers sitting at the same time share halls, and candidates of different papers
 * are interleaved so neighbours are never writing the same paper (cuts copying). Pure functions.
 */

export interface Candidate {
  paperId: string;
  studentId: string;
  rollNo: string;
}

export interface Hall {
  roomId: string;
  name: string;
  capacity: number;
}

export interface SeatAssignment {
  paperId: string;
  studentId: string;
  roomId: string;
  seatNo: number;
}

const rollOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Round-robin across papers (each paper's candidates in roll order), then fill the halls in order. */
export function allocateSeats(candidates: Candidate[], halls: Hall[]): SeatAssignment[] {
  const total = halls.reduce((s, h) => s + h.capacity, 0);
  if (candidates.length > total) throw new RangeError(`${candidates.length} candidates but only ${total} seats`);
  const byPaper = new Map<string, Candidate[]>();
  for (const c of candidates) byPaper.set(c.paperId, [...(byPaper.get(c.paperId) ?? []), c]);
  const queues = [...byPaper.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([, q]) => q.sort((a, b) => rollOrder(a.rollNo, b.rollNo)));
  const order: Candidate[] = [];
  for (let i = 0; order.length < candidates.length; i++) for (const q of queues) if (i < q.length) order.push(q[i]);
  const out: SeatAssignment[] = [];
  let n = 0;
  for (const h of halls) for (let seat = 1; seat <= h.capacity && n < order.length; seat++, n++) out.push({ paperId: order[n].paperId, studentId: order[n].studentId, roomId: h.roomId, seatNo: seat });
  return out;
}

/** Papers whose date and time overlap sit together; returns groups of paper ids. */
export function slotGroups(papers: { id: string; examDate: string; startsAt: string; endsAt: string }[]): string[][] {
  const groups: { date: string; start: string; end: string; ids: string[] }[] = [];
  for (const p of [...papers].sort((a, b) => (a.examDate + a.startsAt).localeCompare(b.examDate + b.startsAt))) {
    const g = groups.find((x) => x.date === p.examDate && p.startsAt < x.end && x.start < p.endsAt);
    if (g) {
      g.ids.push(p.id);
      g.start = g.start < p.startsAt ? g.start : p.startsAt;
      g.end = g.end > p.endsAt ? g.end : p.endsAt;
    } else groups.push({ date: p.examDate, start: p.startsAt, end: p.endsAt, ids: [p.id] });
  }
  return groups.map((g) => g.ids);
}

/** True when two papers for the same class overlap in time on one day. */
export function overlaps(a: { examDate: string; startsAt: string; endsAt: string }, b: { examDate: string; startsAt: string; endsAt: string }): boolean {
  return a.examDate === b.examDate && a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
