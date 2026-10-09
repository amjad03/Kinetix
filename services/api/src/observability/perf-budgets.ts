/**
 * Response-time budgets per module (PRD section 88). p95 in milliseconds for a list or summary read on a school-sized
 * tenant (about 1,500 students). `test/perf-budget.e2e.spec.ts` times the sample path of each module on a seeded tenant
 * and fails when a read takes longer than its budget, which is how an N+1 query is caught before it ships.
 * docs/operations/performance-budgets.md explains how the numbers were chosen and how to change one.
 */
export interface PerfBudget {
  module: string;
  /** A GET the module owns and that any list screen would call. */
  path: string;
  p95Ms: number;
}

export const PERF_BUDGETS: PerfBudget[] = [
  { module: 'admin', path: '/v1/admin/structure', p95Ms: 400 },
  { module: 'notifications', path: '/v1/notifications?limit=10', p95Ms: 300 },
  { module: 'tasks', path: '/v1/tasks/mine', p95Ms: 400 },
  { module: 'search', path: '/v1/search?q=Student', p95Ms: 600 },
  { module: 'search (plain-words)', path: '/v1/search/ask?q=students%20absent%20today', p95Ms: 800 },
  { module: 'governance', path: '/v1/governance/rules', p95Ms: 400 },
  { module: 'governance (incidents)', path: '/v1/governance/incidents', p95Ms: 400 },
  { module: 'billing', path: '/v1/billing/subscription', p95Ms: 700 },
  { module: 'ai (audit)', path: '/v1/ai/admin/actions', p95Ms: 500 },
  { module: 'exams', path: '/v1/exam-sessions', p95Ms: 500 },
  { module: 'grievances', path: '/v1/grievances', p95Ms: 500 },
  { module: 'mentoring', path: '/v1/mentoring/plans', p95Ms: 500 },
  { module: 'cast', path: '/v1/cast/boards', p95Ms: 400 },
];

/** The p95 of a set of samples (nearest rank). */
export function p95(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] ?? 0;
}
