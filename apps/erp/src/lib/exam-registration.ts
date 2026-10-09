// Shapes from the exam registration and seating-plan endpoints (services/api/src/exams/exam-registration.controller.ts).

export interface RegistrationWindow {
  id: string;
  sessionId: string;
  opensOn: string;
  closesOn: string;
  minAttendancePercent: number | null;
  blockOnFeeDues: boolean;
  maxBacklogs: number | null;
  state: 'upcoming' | 'open' | 'closed';
}

export interface RegistrationRow {
  studentId: string;
  student: string;
  rollNo: string;
  status: 'registered' | 'ineligible';
  reasons: string[];
  overridden: boolean;
  overrideReason: string | null;
  registeredAt: string;
}

export interface Sitting {
  slot: number;
  examDate: string;
  startsAt: string;
  endsAt: string;
  subjects: string[];
  seated: number;
  halls: { roomId: string; room: string; seated: number }[];
}

export interface SeatingPlanOverview {
  layouts: { roomId: string; room: string; rows: number; benchesPerRow: number; seatsPerBench: number }[];
  sittings: Sitting[];
}

/** A blank or whole-number text; undefined when it is something else. */
export function parseWhole(s: string | undefined, min: number, max: number): number | null | undefined {
  const v = (s ?? '').trim();
  if (!v) return null;
  if (!/^\d{1,4}$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

/** Seats in a hall laid out as rows of benches. */
export const hallSeats = (h: { rows: number; benchesPerRow: number; seatsPerBench: number }) => h.rows * h.benchesPerRow * h.seatsPerBench;

/** The PDF link of one hall's chart for one sitting, through the download route. */
export const chartHref = (sessionId: string, slot: number, roomId: string) => `/api/download?kind=seating-chart&id=${sessionId}&slot=${slot}&room=${roomId}`;
