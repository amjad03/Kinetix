'use server';

import { read, send } from '@/lib/ops-server';
import { parseQuestions, parseSteps, splitList, type ResumeRow, type TestResults } from '@/lib/pathways-a';
import { failure, parseFailure } from '@/lib/pathways-server';

const PAGE = '/careers';
const id = encodeURIComponent;
type V = Record<string, string>;

/** Resumes students chose to share, narrowed by a search over name, headline and skills. */
export async function searchResumes(q: string) {
  return read<ResumeRow[]>(`/v1/careers/resumes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
}

export async function createTest(v: V) {
  const q = parseQuestions(v.questions ?? '');
  if (!q.ok) return parseFailure(q);
  const durationMin = Number(v.durationMin || 30);
  const passPercent = Number(v.passPercent || 40);
  if (!Number.isInteger(durationMin) || !Number.isInteger(passPercent)) return failure('pw.err.number');
  return send('/v1/careers/tests', { title: v.title, category: v.category || 'mixed', durationMin, passPercent, questions: q.value }, PAGE);
}

export async function setTestActive(testId: string, active: boolean) {
  return send(`/v1/careers/tests/${id(testId)}/active`, { active }, PAGE, 'PUT');
}

export async function testResults(testId: string) {
  return read<TestResults>(`/v1/careers/tests/${id(testId)}/results`);
}

export async function savePath(v: V, existingId?: string) {
  const steps = parseSteps(v.steps ?? '');
  if (!steps.ok) return parseFailure(steps);
  const body = { title: v.title, family: v.family ?? '', description: v.description ?? '', requiredSkills: splitList(v.requiredSkills ?? ''), roles: splitList(v.roles ?? ''), steps: steps.value, active: v.active !== 'no' };
  return existingId ? send(`/v1/careers/paths/${id(existingId)}`, body, PAGE, 'PUT') : send('/v1/careers/paths', body, PAGE);
}
