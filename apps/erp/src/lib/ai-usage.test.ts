import { describe, expect, it } from 'vitest';
import { summarizeUsage } from './ai-usage';

describe('summarizeUsage', () => {
  it('groups outcomes per task and totals them', () => {
    const { tasks, total } = summarizeUsage({
      days: 30,
      rows: [
        { task: 'explain', outcome: 'ok', requests: 10, tokens: 5000 },
        { task: 'explain', outcome: 'cached', requests: 4, tokens: 0 },
        { task: 'explain', outcome: 'blocked', requests: 1, tokens: 120 },
        { task: 'quiz', outcome: 'unavailable', requests: 2, tokens: 0 },
        { task: 'quiz', outcome: 'quota', requests: 1, tokens: 0 },
        { task: 'lessonPlan', outcome: 'invalid', requests: 3, tokens: 900 },
      ],
    });
    expect(tasks.map((t) => t.label)).toEqual(['Explain', 'Lesson plan', 'Quiz']);
    expect(tasks[0]).toMatchObject({ requests: 15, answered: 14, blocked: 1, failed: 0, tokens: 5120 });
    expect(tasks[2]).toMatchObject({ requests: 3, failed: 3 });
    expect(total).toEqual({ requests: 21, answered: 14, blocked: 1, failed: 6, tokens: 6020 });
  });

  it('is empty without use', () => {
    expect(summarizeUsage({ days: 30, rows: [] })).toEqual({ tasks: [], total: { requests: 0, answered: 0, blocked: 0, failed: 0, tokens: 0 } });
  });
});
