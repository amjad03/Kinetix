import { createHash } from 'node:crypto';
import { headerKey } from '../import/csv.js';

/** What can be migrated, in the order a first load needs. */
export const MIGRATION_ENTITIES = ['programmes', 'faculty', 'students', 'marks', 'attendance', 'fees'] as const;
export type MigrationEntity = (typeof MIGRATION_ENTITIES)[number];

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** Column headings (as headerKey) that Linways and typical Excel exports use for this field. */
  aliases: string[];
}

const f = (key: string, label: string, aliases: string[], required = false): FieldDef => ({ key, label, aliases: [key, ...aliases], ...(required && { required }) });

const guardian = (n: 1 | 2): FieldDef[] => {
  const who = n === 1 ? ['father', 'parent'] : ['mother', 'guardian'];
  return [
    f(`guardian${n}_name`, `Guardian ${n} name`, who.flatMap((w) => [`${w}_name`, `name_of_${w}`])),
    f(`guardian${n}_phone`, `Guardian ${n} phone`, who.flatMap((w) => [`${w}_mobile`, `${w}_phone`, `${w}_contact_no`])),
    f(`guardian${n}_relation`, `Guardian ${n} relation`, []),
    f(`guardian${n}_language`, `Guardian ${n} language`, []),
  ];
};

/** Fields per entity. The first four entities reuse the importer's own row handlers, so their keys are its column names. */
export const ENTITY_FIELDS: Record<MigrationEntity, FieldDef[]> = {
  programmes: [
    f('program', 'Programme', ['course', 'programme', 'degree', 'branch'], true),
    f('level', 'Level (ug, pg, school)', ['program_level', 'type']),
    f('terms', 'Number of semesters', ['semesters', 'no_of_semesters', 'duration_semesters']),
    f('term', 'Semester', ['sem', 'semester_no']),
    f('section', 'Section / division', ['division', 'batch', 'class_section']),
    f('display_name', 'Class display name', ['class_name']),
    f('subject_code', 'Subject code', ['paper_code', 'course_code', 'subject_no']),
    f('subject_name', 'Subject name', ['paper_name', 'paper', 'course_name', 'subject']),
    f('department', 'Department', ['dept', 'department_name']),
  ],
  faculty: [
    f('full_name', 'Full name', ['name', 'staff_name', 'faculty_name', 'employee_name'], true),
    f('email', 'Email', ['email_id', 'official_email', 'mail']),
    f('phone', 'Mobile', ['mobile', 'mobile_no', 'contact_no', 'phone_no']),
    f('roles', 'Roles', ['role', 'designation_role']),
    f('preferred_language', 'Language', ['language']),
    f('departments', 'Departments', ['department', 'dept']),
  ],
  students: [
    f('roll_no', 'Roll / admission number', ['admission_no', 'admission_number', 'reg_no', 'register_no', 'register_number', 'reg_number', 'roll_number', 'student_id'], true),
    f('full_name', 'Student name', ['name', 'student_name', 'name_of_student'], true),
    f('section', 'Class (as shown in KINETIX)', ['class', 'class_name', 'division', 'batch'], true),
    f('student_email', 'Student email', ['email', 'email_id', 'student_email_id']),
    f('student_phone', 'Student mobile', ['mobile', 'mobile_no', 'student_mobile']),
    f('preferred_language', 'Language', ['language', 'mother_tongue']),
    ...guardian(1),
    ...guardian(2),
  ],
  marks: [
    f('roll_no', 'Roll / register number', ['reg_no', 'register_no', 'register_number', 'admission_no', 'roll_number'], true),
    f('academic_year', 'Academic year', ['year', 'ac_year', 'academic_session', 'session'], true),
    f('term', 'Semester', ['sem', 'semester_no'], true),
    f('subject_code', 'Subject code', ['paper_code', 'course_code'], true),
    f('subject_name', 'Subject name', ['paper_name', 'subject', 'course_name']),
    f('credits', 'Credits', ['credit']),
    f('internal_marks', 'Internal marks', ['ia', 'ia_marks', 'internal', 'cia', 'internal_obtained']),
    f('external_marks', 'External marks', ['ese', 'see', 'external', 'university_marks', 'external_obtained']),
    f('max_internal', 'Internal maximum', ['ia_max', 'internal_max', 'max_ia']),
    f('max_external', 'External maximum', ['ese_max', 'external_max', 'max_ese', 'max_see']),
    f('grade', 'Grade', ['letter_grade']),
    f('grade_point', 'Grade point', ['gp', 'gradepoint']),
    f('result', 'Result (pass / fail)', ['status', 'pass_fail']),
  ],
  attendance: [
    f('roll_no', 'Roll / register number', ['reg_no', 'register_no', 'admission_no', 'roll_number'], true),
    f('academic_year', 'Academic year', ['year', 'ac_year', 'session'], true),
    f('term', 'Semester', ['sem', 'semester_no'], true),
    f('classes_held', 'Classes held', ['total_classes', 'total_working_days', 'working_days', 'held', 'total_periods'], true),
    f('classes_attended', 'Classes attended', ['present', 'days_present', 'attended', 'periods_attended', 'total_present'], true),
  ],
  fees: [
    f('roll_no', 'Roll / admission number', ['admission_no', 'reg_no', 'register_no', 'roll_number'], true),
    f('academic_year', 'Academic year', ['year', 'ac_year', 'session'], true),
    f('entry_type', 'Entry type (charge or receipt)', ['type', 'txn_type', 'voucher_type'], true),
    f('head', 'Fee head', ['fee_head', 'particulars', 'fee_type', 'description']),
    f('reference', 'Reference / receipt number', ['receipt_no', 'receipt_number', 'voucher_no', 'invoice_no', 'ref_no'], true),
    f('entry_date', 'Date', ['date', 'receipt_date', 'paid_on', 'txn_date']),
    f('amount', 'Amount in rupees', ['amount_paid', 'paid', 'debit', 'credit', 'total'], true),
  ],
};

/** The importer's own kind for the entities that write to live tables. */
export const CORE_KIND: Partial<Record<MigrationEntity, 'programs' | 'staff' | 'students'>> = { programmes: 'programs', faculty: 'staff', students: 'students' };

export interface SourceTable {
  headers: string[];
  rows: { line: number; cells: string[] }[];
}

/** Guesses a mapping from the export's headings using each field's aliases; only fields found are returned. */
export function suggestMapping(entity: MigrationEntity, headers: string[]): Record<string, string> {
  const byKey = new Map(headers.map((h) => [headerKey(h), h]));
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const fd of ENTITY_FIELDS[entity]) {
    for (const alias of fd.aliases) {
      const h = byKey.get(alias);
      if (h !== undefined && !used.has(h)) {
        out[fd.key] = h;
        used.add(h);
        break;
      }
    }
  }
  return out;
}

/** Fields the mapping leaves without a source column (and a constant). */
export function missingRequired(entity: MigrationEntity, mapping: Record<string, string>): string[] {
  return ENTITY_FIELDS[entity].filter((fd) => fd.required && !(mapping[fd.key] ?? '').trim()).map((fd) => fd.key);
}

/** A mapping value `=text` is a constant for every row; any other value names a column of the file. */
export function applyMapping(entity: MigrationEntity, table: SourceTable, mapping: Record<string, string>): { line: number; get: (key: string) => string }[] {
  const fields = new Set(ENTITY_FIELDS[entity].map((fd) => fd.key));
  const at = new Map<string, number>();
  const constant = new Map<string, string>();
  const norm = table.headers.map((h) => headerKey(h));
  for (const [key, source] of Object.entries(mapping)) {
    if (!fields.has(key) || !source) continue;
    if (source.startsWith('=')) constant.set(key, source.slice(1).trim());
    else {
      const i = norm.indexOf(headerKey(source));
      if (i >= 0) at.set(key, i);
    }
  }
  return table.rows.map((r) => ({
    line: r.line,
    get: (key: string) => (constant.has(key) ? constant.get(key)! : (r.cells[at.get(key) ?? -1] ?? '').trim()),
  }));
}

/** SHA-256 of the file bytes and the mapping: one file mapped one way is imported once. */
export const fingerprint = (bytes: Uint8Array, mapping: Record<string, string>) =>
  createHash('sha256').update(bytes).update(JSON.stringify(Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b)))).digest('hex');

/** An Excel serial date (days since 1899-12-30) or common day formats to ISO yyyy-mm-dd; null when not a date. */
export function toIsoDate(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000).toISOString().slice(0, 10);
  return null;
}

/** Rupees text ("12,500.50", "₹ 500") to paise; null when not an amount. */
export function toPaise(text: string): number | null {
  const t = text.replace(/[₹,\s]|rs\.?/gi, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** A decimal cell, empty -> null, invalid -> undefined. */
export function toNumber(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : undefined;
}

export interface MigrationRowResult {
  row: number;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message: string;
  code?: string;
  detail?: string;
}

export const tally = (rows: MigrationRowResult[]) => {
  const t = { rows: rows.length, created: 0, updated: 0, skipped: 0, error: 0 };
  for (const r of rows) t[r.status]++;
  return t;
};
