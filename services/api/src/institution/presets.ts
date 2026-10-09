// Institution types, structure models and the sample configurations of PRD Appendix B, loadable as presets.
import { TOGGLE_MODULES } from './institution.controller.js';

export const INSTITUTION_TYPES = ['school', 'puc_college', 'degree_college', 'autonomous_college', 'university', 'deemed_university', 'custom'] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];
export const STRUCTURE_MODELS = ['GRADE_SECTION', 'PROGRAM_SEMESTER_COURSE', 'EARLY_YEARS', 'STREAM_COMBINATION', 'UNIVERSITY_MULTI_INSTITUTION'] as const;
export type StructureModel = (typeof STRUCTURE_MODELS)[number];
export const GOVERNANCE_MODELS = ['affiliated', 'autonomous', 'constituent', 'deemed'] as const;
export type GovernanceModel = (typeof GOVERNANCE_MODELS)[number];

type ToggleModule = (typeof TOGGLE_MODULES)[number];

export interface InstitutionPreset {
  key: string;
  name: string;
  institutionType: InstitutionType;
  structureModel: StructureModel;
  /** The older academicModel the ERP navigation already understands. */
  academicModel: 'school' | 'puc' | 'ug' | 'pg' | 'university';
  governanceModel: GovernanceModel | null;
  qualityFramework: string | null;
  feeModel: string;
  board: { code: string; name: string; kind: 'central' | 'state' | 'international' | 'university'; region: string } | null;
  /** Modules this configuration does not use; they leave the navigation and their endpoints are refused. */
  disabledModules: ToggleModule[];
}

const SCHOOL_OFF: ToggleModule[] = ['placements', 'research', 'obe', 'courseRegistration', 'alumni', 'skills'];

/** Appendix B.1 to B.5. */
export const PRESETS: readonly InstitutionPreset[] = [
  {
    key: 'nursery',
    name: 'Nursery school',
    institutionType: 'school',
    structureModel: 'EARLY_YEARS',
    academicModel: 'school',
    governanceModel: null,
    qualityFramework: null,
    feeModel: 'term_fees',
    board: null,
    disabledModules: [...SCHOOL_OFF, 'hostel', 'library', 'inventory'],
  },
  {
    key: 'cbse_1_10',
    name: 'CBSE classes 1 to 10',
    institutionType: 'school',
    structureModel: 'GRADE_SECTION',
    academicModel: 'school',
    governanceModel: null,
    qualityFramework: null,
    feeModel: 'term_fees',
    board: { code: 'CBSE', name: 'Central Board of Secondary Education', kind: 'central', region: 'India' },
    disabledModules: [...SCHOOL_OFF, 'earlyYears'],
  },
  {
    key: 'karnataka_puc',
    name: 'Karnataka PUC',
    institutionType: 'puc_college',
    structureModel: 'STREAM_COMBINATION',
    academicModel: 'puc',
    governanceModel: null,
    qualityFramework: null,
    feeModel: 'annual_fees',
    board: { code: 'KSEAB-PUC', name: 'Department of Pre-University Education, Karnataka', kind: 'state', region: 'Karnataka' },
    disabledModules: [...SCHOOL_OFF, 'earlyYears'],
  },
  {
    key: 'soundarya',
    name: 'Autonomous degree college',
    institutionType: 'autonomous_college',
    structureModel: 'PROGRAM_SEMESTER_COURSE',
    academicModel: 'ug',
    governanceModel: 'autonomous',
    qualityFramework: 'NAAC',
    feeModel: 'semester_fees',
    board: null,
    disabledModules: ['earlyYears'],
  },
  {
    key: 'university',
    name: 'University with affiliated institutions',
    institutionType: 'university',
    structureModel: 'UNIVERSITY_MULTI_INSTITUTION',
    academicModel: 'university',
    governanceModel: 'constituent',
    qualityFramework: 'NAAC',
    feeModel: 'semester_fees',
    board: null,
    disabledModules: ['earlyYears', 'canteen'],
  },
];

export const presetByKey = (key: string) => PRESETS.find((p) => p.key === key);

/** Route prefix (after /v1/) -> the module switch that turns it off. */
export const MODULE_ROUTES: Record<string, ToggleModule> = {
  hostel: 'hostel',
  canteen: 'canteen',
  transport: 'transport',
  library: 'library',
  placements: 'placements',
  alumni: 'alumni',
  'alumni-portal': 'alumni',
  research: 'research',
  obe: 'obe',
  'course-registration': 'courseRegistration',
  'early-years': 'earlyYears',
  inventory: 'inventory',
  assets: 'assets',
  skills: 'skills',
  passport: 'skills',
  sdg: 'skills',
  'campus-life': 'campusLife',
  mentoring: 'mentoring',
  workflows: 'workflows',
};

/** The module a request path belongs to, or null. Parent routes (`parent/children/:id/early-years`) are matched by their last segment too. */
export function moduleOfPath(path: string): ToggleModule | null {
  const clean = path.split('?')[0].replace(/^\/+/, '');
  const parts = clean.split('/');
  if (parts[0] !== 'v1') return null;
  if (parts[1] === 'parent' && parts[2] === 'children' && parts.length >= 5) return MODULE_ROUTES[parts[4]] ?? null;
  if (parts[1] === 'teacher' && parts[2] === 'diary') return null;
  return MODULE_ROUTES[parts[1]] ?? null;
}

/** What a university-governance model changes in behaviour (PRD 4.7): who sets the syllabus, runs exams and awards the degree. */
export interface GovernanceRules {
  syllabusAuthority: 'university' | 'institution' | 'university_plus_institution';
  /** The institution conducts its own examinations and publishes its own results. */
  ownExams: boolean;
  /** The institution's own degree is awarded (otherwise the affiliating university's). */
  ownDegree: boolean;
  /** An activated curriculum version must carry the university's Board of Studies reference. */
  requiresUniversityBosRef: boolean;
}

export const GOVERNANCE_RULES: Record<GovernanceModel, GovernanceRules> = {
  affiliated: { syllabusAuthority: 'university', ownExams: false, ownDegree: false, requiresUniversityBosRef: true },
  autonomous: { syllabusAuthority: 'university_plus_institution', ownExams: true, ownDegree: false, requiresUniversityBosRef: false },
  constituent: { syllabusAuthority: 'university', ownExams: true, ownDegree: true, requiresUniversityBosRef: false },
  deemed: { syllabusAuthority: 'institution', ownExams: true, ownDegree: true, requiresUniversityBosRef: false },
};
