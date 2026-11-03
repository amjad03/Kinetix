import type { healthProfiles, healthVisits } from '../db/schema.js';
import { seal, sealList, sensitiveAad, unseal, unsealList } from '../common/sensitive.js';

type Profile = typeof healthProfiles.$inferSelect;
type Visit = typeof healthVisits.$inferSelect;
type ProfileFields = Pick<Profile, 'allergies' | 'conditions' | 'medications' | 'notes'>;

/** Conditions, medications, allergies and notes are encrypted at rest (common/sensitive.ts), bound to the student. */
export function sealProfile<T extends ProfileFields>(tenantId: string, studentId: string, v: T): T {
  const a = (f: string) => sensitiveAad(tenantId, 'health', studentId, f);
  return { ...v, allergies: sealList(a('allergies'), v.allergies), conditions: sealList(a('conditions'), v.conditions), medications: sealList(a('medications'), v.medications), notes: seal(a('notes'), v.notes) };
}

export function openProfile(p: Profile): Profile {
  const a = (f: string) => sensitiveAad(p.tenantId, 'health', p.studentId, f);
  return { ...p, allergies: unsealList(a('allergies'), p.allergies), conditions: unsealList(a('conditions'), p.conditions), medications: unsealList(a('medications'), p.medications), notes: unseal(a('notes'), p.notes) };
}

/** A nurse visit's complaint and action, encrypted the same way. */
export function sealVisit<T extends { complaint: string; action: string }>(tenantId: string, studentId: string, v: T): T {
  return { ...v, complaint: seal(sensitiveAad(tenantId, 'health_visit', studentId, 'complaint'), v.complaint), action: seal(sensitiveAad(tenantId, 'health_visit', studentId, 'action'), v.action) };
}

export function openVisit<T extends Pick<Visit, 'tenantId' | 'studentId' | 'complaint' | 'action'>>(v: T): T {
  return { ...v, complaint: unseal(sensitiveAad(v.tenantId, 'health_visit', v.studentId, 'complaint'), v.complaint), action: unseal(sensitiveAad(v.tenantId, 'health_visit', v.studentId, 'action'), v.action) };
}
