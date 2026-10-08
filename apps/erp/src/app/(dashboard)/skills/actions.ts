'use server';

import { send, num, optStr, read } from '@/lib/ops-server';
import type { ManualEvidence, Passport, SkillDetail } from '@/lib/skills';

const PAGE = '/skills';
type V = Record<string, string>;
const id = encodeURIComponent;

// ---- skills ----
export async function addSkill(v: V) {
  return send('/v1/skills', { code: v.code, name: v.name, category: v.category || 'skill', description: v.description ?? '' }, PAGE);
}
export const skillDetail = (skillId: string) => read<SkillDetail>(`/v1/skills/${id(skillId)}`);
export const skillEvidence = (skillId: string) => read<ManualEvidence[]>(`/v1/skills/${id(skillId)}/evidence`);
export async function addMap(skillId: string, v: V) {
  return send(`/v1/skills/${id(skillId)}/maps`, { kind: v.kind, ...(optStr(v.ref) ? { ref: v.ref } : {}) }, PAGE);
}
export async function removeMap(skillId: string, mapId: string) {
  return send(`/v1/skills/${id(skillId)}/maps/${id(mapId)}`, undefined, PAGE, 'DELETE');
}
export async function recordEvidence(skillId: string, v: V) {
  return send(`/v1/skills/${id(skillId)}/evidence`, { studentId: v.studentId, level: num(v.level), title: v.title, note: v.note ?? '' }, PAGE);
}

// ---- passport ----
export const openPassport = (studentId: string) => read<Passport>(`/v1/passport/students/${id(studentId)}`);
export async function verifyPassport(studentId: string) {
  return send(`/v1/passport/students/${id(studentId)}/verify`, undefined, PAGE);
}
export async function revokePassport(studentId: string) {
  return send(`/v1/passport/students/${id(studentId)}/revoke`, undefined, PAGE);
}

// ---- SDG ----
export async function tagItem(v: V) {
  return send('/v1/sdg/tags', { sdgNumber: num(v.sdgNumber), itemType: v.itemType, itemId: v.itemId, note: v.note ?? '' }, PAGE);
}
export async function untag(tagId: string) {
  return send(`/v1/sdg/tags/${id(tagId)}`, undefined, PAGE, 'DELETE');
}
