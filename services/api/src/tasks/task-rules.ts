/** Pure task rules: status moves, deadlines and overdue checks. */

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

const NEXT: Record<TaskStatus, TaskStatus[]> = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['open', 'done', 'cancelled'],
  done: ['open'],
  cancelled: ['open'],
};

export const canMoveTask = (from: string, to: string) => (NEXT[from as TaskStatus] ?? []).includes(to as TaskStatus);

export const isActive = (status: string) => status === 'open' || status === 'in_progress';

/** The deadline: the one given, else created time plus the SLA hours, else none. */
export function dueFor(given: Date | null | undefined, slaHours: number | null | undefined, now: Date): Date | null {
  if (given) return given;
  return slaHours ? new Date(now.getTime() + slaHours * 3_600_000) : null;
}

/** Overdue and not yet escalated: the escalation job picks these up. */
export const needsEscalation = (t: { status: string; dueAt: Date | null; escalatedAt: Date | null }, now: Date) => isActive(t.status) && !!t.dueAt && t.dueAt < now && !t.escalatedAt;
