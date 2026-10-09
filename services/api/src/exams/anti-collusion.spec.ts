import { describe, expect, it } from 'vitest';
import { antiCollusionSeats, hasCollusion, type RoomLayout, type SeatCandidate } from './anti-collusion.js';
import { parseHallTicketCode, hallTicketCode } from './hall-ticket-code.js';
import { ineligibleReasons, windowState } from './registration-rules.js';

const cands = (subject: string, program: string, n: number): SeatCandidate[] =>
  Array.from({ length: n }, (_, i) => ({ paperId: `p-${subject}`, studentId: `${subject}${i}`, rollNo: `${subject}${String(i + 1).padStart(3, '0')}`, subjectKey: subject, programKey: program }));
const hall = (rows: number, benches: number, seats = 2): RoomLayout => ({ roomId: 'r1', name: 'R1', rows, benchesPerRow: benches, seatsPerBench: seats });

describe('anti-collusion seating', () => {
  it('never puts two candidates of one subject side by side or behind each other', () => {
    const room = hall(4, 3);
    const res = antiCollusionSeats([...cands('ECO', 'bcom', 8), ...cands('MKT', 'bba', 8), ...cands('PYT', 'bca', 8)], [room]);
    expect(res.unplaced).toHaveLength(0);
    expect(res.seats).toHaveLength(24);
    expect(hasCollusion(res.seats, [room])).toBe(false);
  });

  it('leaves seats vacant (checkerboard) when one subject is alone in the hall', () => {
    const room = hall(2, 2);
    const res = antiCollusionSeats(cands('ECO', 'bcom', 4), [room]);
    expect(res.unplaced).toHaveLength(0);
    expect(res.vacant).toBeGreaterThan(0);
    expect(hasCollusion(res.seats, [room])).toBe(false);
  });

  it('reports candidates that do not fit instead of breaking the rule', () => {
    const room = hall(1, 2);
    const res = antiCollusionSeats(cands('ECO', 'bcom', 4), [room]);
    expect(res.seats.length + res.unplaced.length).toBe(4);
    expect(res.unplaced.length).toBeGreaterThan(0);
    expect(hasCollusion(res.seats, [room])).toBe(false);
  });

  it('mixes programmes among neighbours where it can', () => {
    const room = hall(1, 3);
    const res = antiCollusionSeats([...cands('A', 'bcom', 3), ...cands('B', 'bba', 3)], [room]);
    const bySeat = [...res.seats].sort((a, b) => a.seatNo - b.seatNo);
    for (let i = 1; i < bySeat.length; i++) expect(bySeat[i].programKey).not.toBe(bySeat[i - 1].programKey);
  });
});

describe('hall ticket code', () => {
  it('verifies its own code and refuses a tampered one', () => {
    const code = hallTicketCode('secret', 'tenant-1', 'HT-ABC123-21.BC/007');
    expect(parseHallTicketCode('secret', 'tenant-1', code)).toBe('HT-ABC123-21.BC/007');
    expect(parseHallTicketCode('secret', 'tenant-2', code)).toBeNull();
    expect(parseHallTicketCode('secret', 'tenant-1', code.replace('007', '008'))).toBeNull();
  });
});

describe('registration eligibility', () => {
  const rules = { minAttendancePercent: 75, blockOnFeeDues: true, maxBacklogs: 2 };
  it('is eligible when every rule passes, and ignores missing attendance', () => {
    expect(ineligibleReasons(rules, { attendancePercent: 80, feeDuePaise: 0, backlogs: 2 })).toEqual([]);
    expect(ineligibleReasons(rules, { attendancePercent: null, feeDuePaise: 0, backlogs: 0 })).toEqual([]);
  });
  it('gives one reason per failed rule', () => {
    const r = ineligibleReasons(rules, { attendancePercent: 60, feeDuePaise: 250000, backlogs: 3 });
    expect(r).toHaveLength(3);
    expect(r[0]).toMatch(/Attendance shortage/);
    expect(r[1]).toMatch(/2500\.00/);
  });
  it('turns rules off when they are not set', () => {
    expect(ineligibleReasons({ minAttendancePercent: null, blockOnFeeDues: false, maxBacklogs: null }, { attendancePercent: 10, feeDuePaise: 5, backlogs: 9 })).toEqual([]);
  });
  it('knows when a window is open', () => {
    const w = { opensOn: '2026-10-01', closesOn: '2026-10-10' };
    expect([windowState(w, '2026-09-30'), windowState(w, '2026-10-10'), windowState(w, '2026-10-11')]).toEqual(['upcoming', 'open', 'closed']);
  });
});
