'use server';

import { optStr as opt, optNum, send } from '@/lib/ops-server';
import type { TaskRow } from '@/lib/work';

const PAGE = '/tasks';
type V = Record<string, string>;

export async function createTask(v: V) {
  return send(
    '/v1/tasks',
    { title: v.title, description: v.description ?? '', assigneeId: v.assigneeId, priority: v.priority || 'normal', dueAt: opt(v.dueAt), slaHours: optNum(v.slaHours) },
    PAGE,
  );
}

export async function setTaskStatus(id: string, status: TaskRow['status'], version: number) {
  return send(`/v1/tasks/${encodeURIComponent(id)}/status`, { status, expectedVersion: version }, PAGE);
}
