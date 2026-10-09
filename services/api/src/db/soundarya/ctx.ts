import type { Kit, Rng } from './kit.js';
import type { Dept, ProgramDef } from './data.js';

export interface UserRef {
  id: string;
  name: string;
  email: string;
  dept?: Dept;
}
export interface SubjectRef {
  id: string;
  programId: string;
  prog: string;
  term: number;
  code: string;
  name: string;
  credits: number;
  dept: Dept;
  teacherId: string;
}
export interface StudentRef {
  id: string;
  name: string;
  rollNo: string;
  sectionId: string;
  prog: string;
  term: number;
  female: boolean;
  /** Probability of being present on a working day (drives attendance, marks and risk). */
  presence: number;
  /** Academic strength 0-1 (drives marks). */
  ability: number;
  userId?: string;
}
export interface SectionRef {
  id: string;
  programId: string;
  prog: string;
  def: ProgramDef;
  term: number;
  label: string;
  roomId: string;
  subjects: SubjectRef[];
  students: StudentRef[];
  slotIds: string[];
}
export interface Ctx {
  kit: Kit;
  r: Rng;
  tenantId: string;
  hash: string;
  today: string;
  semStart: string;
  campusId: string;
  years: { prev: string; cur: string; next: string };
  termId: string;
  programs: Record<string, { id: string; def: ProgramDef }>;
  departments: Record<string, string>;
  designations: Record<string, string>;
  staff: UserRef[];
  byEmail: Record<string, UserRef>;
  teachers: UserRef[];
  sections: SectionRef[];
  students: StudentRef[];
  guardianOf: Map<string, string[]>;
  rooms: { id: string; name: string }[];
  /** Working days (Mon to Sat, no holidays) from the semester start up to yesterday. */
  workingDays: string[];
  holidays: Set<string>;
}
