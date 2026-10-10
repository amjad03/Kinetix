/** What is known about one student over the last 30 days. Null means there is no data for that signal, which scores nothing. */
export interface AlertSignals {
  attendancePct: number | null;
  averagePercent: number | null;
  failedSubjects: number;
  homeworkMissedPct: number | null;
  overdueDays: number;
  overduePaise: number;
}
export interface AlertReason { signal: 'attendance' | 'marks' | 'assignments' | 'fees'; detail: string; points: number }
export type AlertLevel = 'high' | 'medium' | 'watch' | 'none';

/** Scores the four signals; 60 or more is high, 35 medium, 15 a watch. The reasons are kept so a mentor sees why. */
export function scoreSignals(s: AlertSignals): { score: number; level: AlertLevel; reasons: AlertReason[] } {
  const reasons: AlertReason[] = [];
  const add = (signal: AlertReason['signal'], detail: string, points: number) => points > 0 && reasons.push({ signal, detail, points });
  if (s.attendancePct !== null) add('attendance', `Attendance ${Math.round(s.attendancePct)}% in the last 30 days`, s.attendancePct < 65 ? 40 : s.attendancePct < 75 ? 30 : s.attendancePct < 85 ? 15 : 0);
  if (s.averagePercent !== null) add('marks', `Average ${Math.round(s.averagePercent)}% in the latest published results`, s.averagePercent < 40 ? 35 : s.averagePercent < 50 ? 25 : s.averagePercent < 60 ? 10 : 0);
  if (s.failedSubjects > 0) add('marks', `${s.failedSubjects} subject${s.failedSubjects > 1 ? 's' : ''} not passed`, 10 * Math.min(s.failedSubjects, 2));
  if (s.homeworkMissedPct !== null) add('assignments', `${Math.round(s.homeworkMissedPct)}% of homework not submitted`, s.homeworkMissedPct >= 50 ? 20 : s.homeworkMissedPct >= 30 ? 10 : 0);
  if (s.overduePaise > 0) add('fees', `Fees overdue for ${s.overdueDays} day${s.overdueDays === 1 ? '' : 's'}`, s.overdueDays > 30 ? 20 : 10);
  const score = Math.min(100, reasons.reduce((n, r) => n + r.points, 0));
  return { score, level: score >= 60 ? 'high' : score >= 35 ? 'medium' : score >= 15 ? 'watch' : 'none', reasons };
}
