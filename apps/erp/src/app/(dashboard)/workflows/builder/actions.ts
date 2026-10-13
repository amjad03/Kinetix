'use server';

import { read, send } from '@/lib/ops-server';
import type { BuilderGraph, GraphIssue, TestPathStep } from '@/lib/workflow-builder';

const BASE = '/v1/workflows/builder';
const PAGE = '/workflows/builder';
const one = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export async function createWorkflow(name: string, module: string) {
  return send<{ id: string; requestType: string }>(BASE, { name, module }, PAGE);
}

export async function saveDraft(id: string, body: { graph: BuilderGraph; name?: string; module?: string; expectedVersion: number }) {
  return send<{ version: number; issues: GraphIssue[] }>(`${one(id)}/draft`, body, PAGE, 'PUT');
}

export async function publishWorkflow(id: string, expectedVersion: number) {
  return send<{ version: number; publishedVersion: number }>(`${one(id)}/publish`, { expectedVersion }, PAGE);
}

export async function discardDraft(id: string) {
  return send<{ version: number }>(`${one(id)}/draft`, undefined, PAGE, 'DELETE');
}

export async function setWorkflowActive(id: string, active: boolean, expectedVersion: number) {
  return send<{ version: number }>(`${one(id)}/active`, { active, expectedVersion }, PAGE);
}

export async function testWorkflow(id: string, amount: number | null, payload: Record<string, unknown>) {
  return send<{ path: TestPathStep[]; issues: GraphIssue[] }>(`${one(id)}/test`, { amount, payload }, PAGE);
}

export async function loadWorkflow(id: string) {
  return read<import('@/lib/workflow-builder').WorkflowDetail>(one(id));
}
