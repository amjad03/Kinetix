import type { AiUsage } from './types';

export const TASK_LABEL: Record<string, string> = {
  explain: 'Explain',
  quiz: 'Quiz',
  homework: 'Homework',
  lessonPlan: 'Lesson plan',
  summarize: 'Lesson summary',
};

/** Outcomes the API records (ai_outcome), grouped for a principal. */
export const OUTCOME_GROUP: Record<string, 'answered' | 'blocked' | 'failed'> = {
  ok: 'answered',
  cached: 'answered',
  blocked: 'blocked',
  invalid: 'failed',
  unavailable: 'failed',
  quota: 'failed',
};

export interface TaskUsage {
  task: string;
  label: string;
  requests: number;
  answered: number;
  blocked: number;
  failed: number;
  tokens: number;
}

/** Per task (busiest first) and overall totals. */
export function summarizeUsage(u: AiUsage): { tasks: TaskUsage[]; total: Omit<TaskUsage, 'task' | 'label'> } {
  const byTask = new Map<string, TaskUsage>();
  for (const r of u.rows) {
    const t = byTask.get(r.task) ?? { task: r.task, label: TASK_LABEL[r.task] ?? r.task, requests: 0, answered: 0, blocked: 0, failed: 0, tokens: 0 };
    t.requests += r.requests;
    t.tokens += r.tokens;
    t[OUTCOME_GROUP[r.outcome] ?? 'failed'] += r.requests;
    byTask.set(r.task, t);
  }
  const tasks = [...byTask.values()].sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label));
  const total = tasks.reduce(
    (s, t) => ({ requests: s.requests + t.requests, answered: s.answered + t.answered, blocked: s.blocked + t.blocked, failed: s.failed + t.failed, tokens: s.tokens + t.tokens }),
    { requests: 0, answered: 0, blocked: 0, failed: 0, tokens: 0 },
  );
  return { tasks, total };
}

/** 12,345 → "12.3K", 2,500,000 → "2.5M". */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
