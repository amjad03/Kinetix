// Relative (curve) grading (/v1/relative-grading) and the re-admission scheme (/v1/readmissions).
import type { RoleName } from './types';

export interface RelativeBand {
  grade: string;
  gradePoint: number;
  minZ: number;
}

export interface RelativeSettings {
  enabled: boolean;
  /** The regulation in force allows it (the affiliation profile, or the institution's own rules). */
  allowed: boolean;
  profile: string | null;
  minClassSize: number;
  regulationMinClassSize: number;
  maxShift: number;
  bands: RelativeBand[];
  stored?: { enabled: boolean; minClassSize: number | null };
}

export interface RelativeCut {
  grade: string;
  points: number;
  minPercent: number;
}

export interface AppliedCurve {
  id: string;
  candidates: number;
  mean: number;
  sd: number;
  shift: number;
  cuts: RelativeCut[];
  note: string;
  appliedAt: string;
}

export interface CurveSession {
  session: { id: string; name: string; status: string };
  settings: RelativeSettings;
  subjects: { id: string; code: string; name: string; applied: AppliedCurve | null }[];
}

export interface CurvePreview {
  subject: { id: string; code: string; name: string };
  settings: RelativeSettings;
  stats: { candidates: number; mean: number; sd: number };
  passPercent: number;
  shift: number;
  cuts: RelativeCut[];
  tooSmall: boolean;
  applied: boolean;
  absolute: { grade: string; count: number }[];
  relative: { grade: string; count: number }[];
  regraded?: number;
}

/** Who turns relative grading on and applies a curve (relative-grading.controller.ts ADMIN); heads of department preview. */
export const CURVE_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'exam_controller'];
export const canApplyCurve = (roles: readonly RoleName[]) => roles.some((r) => CURVE_ADMIN.includes(r));

export interface VersionRef {
  id: string;
  label: string;
  regulationYear: number;
  versionNo: number;
}

export interface ReadmissionPlan {
  student: { id: string; name: string; program: string };
  rejoinedOn: string;
  rejoinTerm: number;
  from: VersionRef | null;
  to: VersionRef;
  sameVersion: boolean;
  scheme: { profile: string; scheme: string; name: string } | null;
  credited: { fromCode: string; fromName: string; toCode: string; toName: string; credits: number; grade: string | null }[];
  notCounted: { code: string; name: string }[];
  toTake: { code: string; name: string; term: number; credits: number }[];
  equivalencesUsed: number;
}

export interface ReadmissionRow {
  id: string;
  rejoinedOn: string;
  rejoinTerm: number;
  from: VersionRef | null;
  to: VersionRef | null;
  credited: ReadmissionPlan['credited'];
  toTake: ReadmissionPlan['toTake'];
  note: string;
  createdAt: string;
}

/** Who re-admits a student into the scheme in force (readmission.controller.ts READMISSION_ROLES). */
export const READMISSION_ROLES: RoleName[] = ['tenant_admin', 'principal', 'exam_controller'];
export const canReadmit = (roles: readonly RoleName[]) => roles.some((r) => READMISSION_ROLES.includes(r));

export const versionText = (v: VersionRef | null) => (v ? `${v.regulationYear} v${v.versionNo}: ${v.label}` : '');
