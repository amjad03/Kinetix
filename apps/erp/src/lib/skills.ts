// Types for the skills desk (framework, outcome passport, SDG impact): what v1/skills, v1/passport and v1/sdg send.

export interface Skill { id: string; code: string; name: string; category: string; description: string; active: boolean; sources: number; manualEvidence: number }
export interface SkillMap { id: string; kind: string; ref: string; label: string }
export interface SkillDetail extends Skill { maps: SkillMap[] }
export interface ManualEvidence { id: string; studentId: string; fullName: string; rollNo: string; level: number; title: string; note: string }

export interface PassportEvidence { source: string; title: string; detail: string; level: number }
export interface PassportSkill { skillId: string; code: string; name: string; category: string; level: number | null; evidence: PassportEvidence[] }
export interface Passport {
  student: { id: string; fullName: string; rollNo: string; className: string };
  skills: PassportSkill[];
  certificates: { serialNo: string | null; title: string; issuedOn: string }[];
  activities: { clubs: { club: string; points: number; activities: number }[]; events: { title: string; eventType: string; on: string }[] };
  verification: { verified: boolean; verifiedAt: string | null };
}

export interface SdgItem { id: string; itemType: string; itemId: string; title: string; note: string; participation: number }
export interface SdgGoal { number: number; name: string; count: number; participation: number; byType: Record<string, number>; items: SdgItem[] }
export interface SdgDashboard { goals: SdgGoal[]; totals: { tags: number; goalsCovered: number; distinctItems: number } }

export const SKILL_CATEGORIES = ['knowledge', 'skill', 'attitude', 'leadership', 'communication', 'career'] as const;
export const MAP_KINDS = ['subject', 'course_outcome', 'club', 'event_type', 'placement', 'internship', 'research', 'certificate'] as const;
export const SDG_ITEM_TYPES = ['course', 'research', 'project', 'event', 'club'] as const;
