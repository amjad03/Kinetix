/**
 * Anti-collusion seating. Halls are laid out as rows of benches with a few seats each; the seats of a row
 * run left to right across the benches. Two seats are neighbours when they are side by side (even across a
 * bench edge) or one behind the other. No two neighbours may write the same subject, and neighbours from
 * different programmes are preferred. A seat that cannot be filled without breaking the rule stays vacant.
 * Pure functions.
 */

export interface RoomLayout {
  roomId: string;
  name: string;
  rows: number;
  benchesPerRow: number;
  seatsPerBench: number;
}

export interface SeatCandidate {
  paperId: string;
  studentId: string;
  rollNo: string;
  /** Same key = same subject (papers of one subject across sections share it). */
  subjectKey: string;
  programKey: string;
}

export interface PlacedSeat extends SeatCandidate {
  roomId: string;
  /** 1-based, row by row, left to right. */
  seatNo: number;
  row: number;
  bench: number;
  pos: number;
}

export interface SeatingResult {
  seats: PlacedSeat[];
  /** Seats left empty to keep same-subject candidates apart. */
  vacant: number;
  /** Candidates that did not fit. */
  unplaced: SeatCandidate[];
}

export const roomCapacity = (r: RoomLayout) => r.rows * r.benchesPerRow * r.seatsPerBench;

const rollOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Where seat number `n` (0-based) of a room sits. */
export function seatPosition(r: RoomLayout, n: number): { row: number; col: number; bench: number; pos: number } {
  const perRow = r.benchesPerRow * r.seatsPerBench;
  const col = n % perRow;
  return { row: Math.floor(n / perRow), col, bench: Math.floor(col / r.seatsPerBench), pos: col % r.seatsPerBench };
}

export function antiCollusionSeats(candidates: SeatCandidate[], rooms: RoomLayout[]): SeatingResult {
  const queues = new Map<string, SeatCandidate[]>();
  for (const c of [...candidates].sort((a, b) => rollOrder(a.rollNo, b.rollNo))) queues.set(c.subjectKey, [...(queues.get(c.subjectKey) ?? []), c]);
  let remaining = candidates.length;
  const seats: PlacedSeat[] = [];
  let vacant = 0;
  for (const room of rooms) {
    const grid = new Map<string, SeatCandidate>();
    const perRow = room.benchesPerRow * room.seatsPerBench;
    for (let n = 0; n < roomCapacity(room); n++) {
      if (remaining === 0) break;
      const { row, col, bench, pos } = seatPosition(room, n);
      const side = col > 0 ? grid.get(`${row}:${col - 1}`) : undefined;
      const front = row > 0 ? grid.get(`${row - 1}:${col}`) : undefined;
      const hard = new Set([side?.subjectKey, front?.subjectKey]);
      const nearby = [side, front, col > 0 && row > 0 ? grid.get(`${row - 1}:${col - 1}`) : undefined, col < perRow - 1 && row > 0 ? grid.get(`${row - 1}:${col + 1}`) : undefined].filter((x): x is SeatCandidate => !!x);
      const programs = new Set(nearby.map((x) => x.programKey));
      const subjects = new Set(nearby.map((x) => x.subjectKey));
      // The subject with most candidates left goes first, so a big paper is not stranded at the end.
      const options = [...queues.entries()]
        .filter(([key, q]) => q.length > 0 && !hard.has(key))
        .map(([key, q]) => {
          const idx = q.findIndex((c) => !programs.has(c.programKey));
          return { key, q, idx: idx >= 0 ? idx : 0, mixes: idx >= 0 ? 1 : 0, apart: subjects.has(key) ? 0 : 1 };
        })
        .sort((a, b) => b.apart - a.apart || b.mixes - a.mixes || b.q.length - a.q.length || a.key.localeCompare(b.key));
      const pick = options[0];
      if (!pick) {
        vacant++;
        continue;
      }
      const [c] = pick.q.splice(pick.idx, 1);
      remaining--;
      grid.set(`${row}:${col}`, c);
      seats.push({ ...c, roomId: room.roomId, seatNo: n + 1, row: row + 1, bench: bench + 1, pos: pos + 1 });
    }
  }
  return { seats, vacant, unplaced: [...queues.values()].flat() };
}

/** True when no two neighbouring seats of a placed room hold the same subject. */
export function hasCollusion(seats: PlacedSeat[], rooms: RoomLayout[]): boolean {
  for (const room of rooms) {
    const at = new Map(seats.filter((s) => s.roomId === room.roomId).map((s) => [s.seatNo - 1, s]));
    const perRow = room.benchesPerRow * room.seatsPerBench;
    for (const [n, s] of at) {
      const side = n % perRow > 0 ? at.get(n - 1) : undefined;
      const front = n >= perRow ? at.get(n - perRow) : undefined;
      if ((side && side.subjectKey === s.subjectKey) || (front && front.subjectKey === s.subjectKey)) return true;
    }
  }
  return false;
}
