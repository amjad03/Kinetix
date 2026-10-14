import type { RoleName } from '../auth/principal.js';

/**
 * The semantic data catalogue behind the report builder: every dataset a person may report on,
 * its fields (type, label in English, Hindi and Kannada, whether it can be summed), the joins
 * it may need and who may see what. Every SQL fragment here is written by us; a request only
 * ever picks keys from this file, and the engine (engine.ts) binds every value as a parameter.
 *
 * Expressions may use two placeholders the engine binds per run: `{{today}}` (the institution's
 * local date) and `{{tz}}` (its time zone).
 */

export type Lang = 'en' | 'hi' | 'kn';
export const LANGS: Lang[] = ['en', 'hi', 'kn'];
export type L = Record<Lang, string>;
export const l = (en: string, hi: string, kn: string): L => ({ en, hi, kn });

export type FieldType = 'text' | 'int' | 'number' | 'money' | 'percent' | 'date' | 'bool';
export const NUMERIC: FieldType[] = ['int', 'number', 'money', 'percent'];

/** Pickers the builder offers for a field's filter: a list of the institution's own records. */
export type Picker = 'section' | 'program' | 'campus' | 'department' | 'academic_year' | 'subject' | 'values';

export interface SemField {
  key: string;
  label: L;
  type: FieldType;
  /** A SQL expression over the dataset's aliases. */
  expr: string;
  /** The record id behind a name (class, program…): pickers filter on it. */
  idExpr?: string;
  picker?: Picker;
  /** Orders this field's values when it is grouped or pivoted (a funnel's stages, ageing buckets). */
  sortExpr?: string;
  /** Only these roles see the field (salary, contact details). Others use the dataset without it. */
  roles?: RoleName[];
  /** False for numbers that make no sense summed (a term, a capacity, a rank). */
  agg?: boolean;
}

export interface Join {
  alias: string;
  sql: string;
}

export type DatasetCategory = 'students' | 'admissions' | 'academics' | 'exams' | 'fees' | 'hr' | 'facilities' | 'placements' | 'communication';

export interface SemDataset {
  key: string;
  label: L;
  description: L;
  category: DatasetCategory;
  roles: RoleName[];
  /** The base table and its alias, e.g. `students s`. */
  from: string;
  /** The alias whose `tenant_id` the engine checks (row-level security checks every table too). */
  base: string;
  /** Joins in dependency order; the engine adds only those the query needs. */
  joins: Join[];
  /** A condition every query of the dataset carries. */
  where?: string;
  /** Has the `sec` (sections) alias: a teacher sees only the classes they teach. */
  classScoped: boolean;
  /** The main date, for quick date filters. */
  dateField?: string;
  /** Columns a drill-down from a total shows. */
  detail: string[];
  fields: SemField[];
}

// ----- roles ------------------------------------------------------------------------------------------

const MGMT: RoleName[] = ['tenant_admin', 'principal'];
const ACAD: RoleName[] = [...MGMT, 'hod', 'exam_controller'];
const FIN: RoleName[] = [...MGMT, 'accountant'];
const HR: RoleName[] = [...MGMT, 'hr_manager'];
/** Salaries are for HR and finance only, not every leader. */
export const SALARY_ROLES: RoleName[] = ['tenant_admin', 'hr_manager', 'accountant'];
/** Personal contact details of students. */
const STUDENT_PII: RoleName[] = [...MGMT, 'admissions_officer'];
const STAFF_PII: RoleName[] = [...MGMT, 'hr_manager'];

// ----- shared labels ------------------------------------------------------------------------------------

const L_ = {
  student: l('Student', 'छात्र', 'ವಿದ್ಯಾರ್ಥಿ'),
  roll: l('Roll no', 'रोल नंबर', 'ರೋಲ್ ಸಂಖ್ಯೆ'),
  class: l('Class', 'कक्षा', 'ತರಗತಿ'),
  program: l('Program', 'कार्यक्रम', 'ಕಾರ್ಯಕ್ರಮ'),
  campus: l('Campus', 'परिसर', 'ಕ್ಯಾಂಪಸ್'),
  year: l('Academic year', 'शैक्षणिक वर्ष', 'ಶೈಕ್ಷಣಿಕ ವರ್ಷ'),
  term: l('Term', 'सत्र', 'ಅವಧಿ'),
  status: l('Status', 'स्थिति', 'ಸ್ಥಿತಿ'),
  gender: l('Gender', 'लिंग', 'ಲಿಂಗ'),
  category: l('Category', 'श्रेणी', 'ವರ್ಗ'),
  phone: l('Phone', 'फ़ोन', 'ಫೋನ್'),
  email: l('Email', 'ईमेल', 'ಇಮೇಲ್'),
  date: l('Date', 'तिथि', 'ದಿನಾಂಕ'),
  month: l('Month', 'महीना', 'ತಿಂಗಳು'),
  subject: l('Subject', 'विषय', 'ವಿಷಯ'),
  subjectCode: l('Subject code', 'विषय कोड', 'ವಿಷಯ ಸಂಕೇತ'),
  department: l('Department', 'विभाग', 'ವಿಭಾಗ'),
  name: l('Name', 'नाम', 'ಹೆಸರು'),
  employeeCode: l('Employee code', 'कर्मचारी कोड', 'ನೌಕರರ ಸಂಕೇತ'),
  designation: l('Designation', 'पदनाम', 'ಹುದ್ದೆ'),
  amount: l('Amount', 'राशि', 'ಮೊತ್ತ'),
  fee: l('Fee', 'शुल्क', 'ಶುಲ್ಕ'),
  dob: l('Date of birth', 'जन्म तिथि', 'ಹುಟ್ಟಿದ ದಿನಾಂಕ'),
  age: l('Age', 'आयु', 'ವಯಸ್ಸು'),
  session: l('Exam session', 'परीक्षा सत्र', 'ಪರೀಕ್ಷಾ ಅವಧಿ'),
  level: l('Level', 'स्तर', 'ಹಂತ'),
};

const f = (key: string, label: L, type: FieldType, expr: string, extra: Partial<SemField> = {}): SemField => ({ key, label, type, expr, ...extra });

/** The class, program, campus and academic year of a row, through `sec`. `left` when the row may have no class. */
function classJoins(sectionExpr: string, left = false): Join[] {
  const j = left ? 'left join' : 'join';
  return [
    { alias: 'sec', sql: `${j} sections sec on sec.id = ${sectionExpr}` },
    { alias: 'pr', sql: `${j} programs pr on pr.id = sec.program_id` },
    { alias: 'cp', sql: `${j} campuses cp on cp.id = pr.campus_id` },
    { alias: 'ay', sql: 'left join academic_years ay on ay.id = sec.academic_year_id' },
  ];
}

const classFields = (): SemField[] => [
  f('class', L_.class, 'text', 'sec.display_name', { idExpr: 'sec.id', picker: 'section' }),
  f('program', L_.program, 'text', 'pr.name', { idExpr: 'pr.id', picker: 'program' }),
  f('campus', L_.campus, 'text', 'cp.name', { idExpr: 'cp.id', picker: 'campus' }),
  f('academic_year', L_.year, 'text', "coalesce(ay.label, '')", { idExpr: 'ay.id', picker: 'academic_year' }),
];
const studentFields = (): SemField[] => [f('student', L_.student, 'text', 's.full_name'), f('roll_no', L_.roll, 'text', 's.roll_no'), ...classFields()];
/** Gender and social category come from the student's admission application. */
const applicantFields = (alias: string): SemField[] => [
  f('gender', L_.gender, 'text', `coalesce(nullif(initcap(${alias}.gender), ''), 'Not recorded')`),
  f('category', L_.category, 'text', `coalesce(nullif(upper(${alias}.category), ''), 'Not recorded')`, { sortExpr: `case upper(${alias}.category) when 'GM' then 1 when 'GEN' then 1 when 'OBC' then 2 when 'SC' then 3 when 'ST' then 4 else 9 end` }),
];
const localDate = (ts: string) => `(${ts} at time zone {{tz}})::date`;
const monthOf = (d: string) => `to_char(${d}, 'YYYY-MM')`;
const staffFields = (u: string): SemField[] => [
  f('name', L_.name, 'text', `${u}.full_name`),
  f('employee_code', L_.employeeCode, 'text', "coalesce(sp.employee_code, '')"),
  f('department', L_.department, 'text', "coalesce(d.name, 'No department')", { idExpr: 'd.id', picker: 'department' }),
];
const staffJoins = (userExpr: string): Join[] => [
  { alias: 'sp', sql: `left join staff_profiles sp on sp.user_id = ${userExpr}` },
  { alias: 'd', sql: 'left join departments d on d.id = sp.department_id' },
  { alias: 'dg', sql: 'left join designations dg on dg.id = sp.designation_id' },
];

const APP_STATUS_RANK = "case a.status::text when 'submitted' then 1 when 'correction_requested' then 2 when 'under_review' then 3 when 'eligible' then 4 when 'waitlisted' then 5 when 'offered' then 6 when 'accepted' then 7 when 'enrolled' then 8 when 'ineligible' then 9 when 'declined' then 10 when 'rejected' then 11 when 'withdrawn' then 12 else 13 end";
const ENQ_STAGE_RANK = "case e.stage::text when 'new' then 1 when 'contacted' then 2 when 'counselling' then 3 when 'applied' then 4 when 'converted' then 5 when 'deferred' then 6 when 'lost' then 7 else 8 end";
const OVERDUE = "(i.status = 'due' and i.paid_paise < i.amount_paise and i.due_on < {{today}}::date)";
const DAYS_LATE = `(case when ${OVERDUE} then ({{today}}::date - i.due_on) else 0 end)`;
const AGEING_RANK = `(case when i.status <> 'due' or i.paid_paise >= i.amount_paise then 0 when i.due_on >= {{today}}::date then 1 when ${DAYS_LATE} <= 30 then 2 when ${DAYS_LATE} <= 60 then 3 when ${DAYS_LATE} <= 90 then 4 else 5 end)`;
const WEEKDAY = "(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[ts.day_of_week]";

// ----- the catalogue ------------------------------------------------------------------------------------

export const DATASETS: SemDataset[] = [
  {
    key: 'students',
    label: l('Students', 'छात्र', 'ವಿದ್ಯಾರ್ಥಿಗಳು'),
    description: l('One row per student: class, program, gender, category and status.', 'प्रति छात्र एक पंक्ति: कक्षा, कार्यक्रम, लिंग, श्रेणी और स्थिति।', 'ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿಗೆ ಒಂದು ಸಾಲು: ತರಗತಿ, ಕಾರ್ಯಕ್ರಮ, ಲಿಂಗ, ವರ್ಗ ಮತ್ತು ಸ್ಥಿತಿ.'),
    category: 'students',
    roles: [...ACAD, 'teacher', 'admissions_officer'],
    from: 'students s',
    base: 's',
    joins: [...classJoins('s.section_id'), { alias: 'app', sql: 'left join applications app on app.id = s.application_id' }, { alias: 'su', sql: 'left join users su on su.id = s.user_id' }],
    classScoped: true,
    dateField: 'enrolled_on',
    detail: ['roll_no', 'student', 'class', 'program', 'gender', 'category', 'status'],
    fields: [
      ...studentFields(),
      f('term', L_.term, 'int', 'sec.term', { agg: false }),
      f('level', L_.level, 'text', 'pr.level::text'),
      f('status', L_.status, 'text', 's.status'),
      f('enrolled_on', l('Enrolled on', 'नामांकन तिथि', 'ದಾಖಲಾತಿ ದಿನಾಂಕ'), 'date', 's.enrolled_on'),
      ...applicantFields('app'),
      f('date_of_birth', L_.dob, 'date', 'app.date_of_birth', { roles: STUDENT_PII }),
      f('age', L_.age, 'int', 'date_part(\'year\', age({{today}}::date, app.date_of_birth))::int', { agg: false }),
      f('phone', L_.phone, 'text', "coalesce(su.phone, app.phone, '')", { roles: STUDENT_PII }),
      f('is_active', l('Active', 'सक्रिय', 'ಸಕ್ರಿಯ'), 'bool', "s.status in ('active', 'enrolled')"),
    ],
  },
  {
    key: 'admissions',
    label: l('Admission applications', 'प्रवेश आवेदन', 'ಪ್ರವೇಶ ಅರ್ಜಿಗಳು'),
    description: l('One row per application, with its cycle, program, stage and merit.', 'प्रति आवेदन एक पंक्ति: चक्र, कार्यक्रम, चरण और मेरिट।', 'ಪ್ರತಿ ಅರ್ಜಿಗೆ ಒಂದು ಸಾಲು: ಆವರ್ತ, ಕಾರ್ಯಕ್ರಮ, ಹಂತ ಮತ್ತು ಮೆರಿಟ್.'),
    category: 'admissions',
    roles: [...MGMT, 'admissions_officer'],
    from: 'applications a',
    base: 'a',
    joins: [
      { alias: 'cy', sql: 'join admission_cycles cy on cy.id = a.cycle_id' },
      { alias: 'pr', sql: 'join programs pr on pr.id = cy.program_id' },
      { alias: 'cp', sql: 'join campuses cp on cp.id = pr.campus_id' },
      { alias: 'ay', sql: 'left join academic_years ay on ay.id = cy.academic_year_id' },
    ],
    classScoped: false,
    dateField: 'submitted_on',
    detail: ['application_no', 'applicant', 'program', 'category', 'status', 'merit_rank'],
    fields: [
      f('application_no', l('Application no', 'आवेदन संख्या', 'ಅರ್ಜಿ ಸಂಖ್ಯೆ'), 'text', 'a.application_no'),
      f('applicant', l('Applicant', 'आवेदक', 'ಅರ್ಜಿದಾರ'), 'text', 'a.applicant_name'),
      ...applicantFields('a'),
      f('status', l('Stage', 'चरण', 'ಹಂತ'), 'text', 'a.status::text', { sortExpr: APP_STATUS_RANK }),
      f('fee_status', l('Application fee', 'आवेदन शुल्क', 'ಅರ್ಜಿ ಶುಲ್ಕ'), 'text', 'a.fee_status::text'),
      f('cycle', l('Admission cycle', 'प्रवेश चक्र', 'ಪ್ರವೇಶ ಆವರ್ತ'), 'text', 'cy.name', { idExpr: 'cy.id', picker: 'values' }),
      f('program', L_.program, 'text', 'pr.name', { idExpr: 'pr.id', picker: 'program' }),
      f('campus', L_.campus, 'text', 'cp.name', { idExpr: 'cp.id', picker: 'campus' }),
      f('academic_year', L_.year, 'text', "coalesce(ay.label, '')", { idExpr: 'ay.id', picker: 'academic_year' }),
      f('submitted_on', l('Submitted on', 'जमा करने की तिथि', 'ಸಲ್ಲಿಸಿದ ದಿನಾಂಕ'), 'date', localDate('a.submitted_at')),
      f('merit_score', l('Merit score', 'मेरिट अंक', 'ಮೆರಿಟ್ ಅಂಕ'), 'number', 'a.merit_score', { agg: false }),
      f('merit_rank', l('Merit rank', 'मेरिट रैंक', 'ಮೆರಿಟ್ ಶ್ರೇಣಿ'), 'int', 'a.merit_rank', { agg: false }),
      f('is_offered', l('Offered a seat', 'सीट प्रस्तावित', 'ಸೀಟು ನೀಡಲಾಗಿದೆ'), 'bool', "a.status in ('offered', 'accepted', 'enrolled')"),
      f('is_enrolled', l('Enrolled', 'नामांकित', 'ದಾಖಲಾಗಿದೆ'), 'bool', "a.status = 'enrolled'"),
      f('phone', L_.phone, 'text', 'a.phone', { roles: STUDENT_PII }),
      f('email', L_.email, 'text', "coalesce(a.email, '')", { roles: STUDENT_PII }),
    ],
  },
  {
    key: 'enquiries',
    label: l('Admission enquiries', 'प्रवेश पूछताछ', 'ಪ್ರವೇಶ ವಿಚಾರಣೆಗಳು'),
    description: l('One row per enquiry (lead): source, stage, counsellor and follow-up.', 'प्रति पूछताछ एक पंक्ति: स्रोत, चरण, परामर्शदाता और अनुवर्ती।', 'ಪ್ರತಿ ವಿಚಾರಣೆಗೆ ಒಂದು ಸಾಲು: ಮೂಲ, ಹಂತ, ಸಲಹೆಗಾರ ಮತ್ತು ಮುಂದಿನ ಸಂಪರ್ಕ.'),
    category: 'admissions',
    roles: [...MGMT, 'admissions_officer'],
    from: 'enquiries e',
    base: 'e',
    joins: [{ alias: 'pr', sql: 'left join programs pr on pr.id = e.program_id' }, { alias: 'cu', sql: 'left join users cu on cu.id = e.counsellor_id' }],
    classScoped: false,
    dateField: 'created_on',
    detail: ['name', 'program', 'source', 'stage', 'counsellor', 'next_follow_up_on'],
    fields: [
      f('name', L_.name, 'text', 'e.name'),
      f('phone', L_.phone, 'text', 'e.phone', { roles: STUDENT_PII }),
      f('source', l('Source', 'स्रोत', 'ಮೂಲ'), 'text', 'e.source::text'),
      f('stage', l('Stage', 'चरण', 'ಹಂತ'), 'text', 'e.stage::text', { sortExpr: ENQ_STAGE_RANK }),
      f('program', L_.program, 'text', "coalesce(pr.name, 'Not chosen')", { idExpr: 'pr.id', picker: 'program' }),
      f('counsellor', l('Counsellor', 'परामर्शदाता', 'ಸಲಹೆಗಾರ'), 'text', "coalesce(cu.full_name, 'Unassigned')"),
      f('created_on', l('Received on', 'प्राप्ति तिथि', 'ಸ್ವೀಕರಿಸಿದ ದಿನಾಂಕ'), 'date', localDate('e.created_at')),
      f('next_follow_up_on', l('Next follow-up', 'अगला अनुवर्ती', 'ಮುಂದಿನ ಸಂಪರ್ಕ'), 'date', 'e.next_follow_up_on'),
      f('lost_reason', l('Reason lost', 'खोने का कारण', 'ಕಳೆದುಕೊಂಡ ಕಾರಣ'), 'text', "coalesce(e.lost_reason, '')"),
      f('utm_source', l('Campaign source', 'अभियान स्रोत', 'ಅಭಿಯಾನ ಮೂಲ'), 'text', "coalesce(e.utm_source, '')"),
      f('lead_score', l('Lead score', 'लीड स्कोर', 'ಲೀಡ್ ಅಂಕ'), 'int', 'e.lead_score', { agg: false }),
      f('converted', l('Converted', 'परिवर्तित', 'ಪರಿವರ್ತಿತ'), 'bool', "e.stage = 'converted'"),
    ],
  },
  {
    key: 'attendance',
    label: l('Student attendance', 'छात्र उपस्थिति', 'ವಿದ್ಯಾರ್ಥಿ ಹಾಜರಾತಿ'),
    description: l('One row per attendance mark. "Present" counts present and late; its % is the attendance rate.', 'प्रति उपस्थिति अंकन एक पंक्ति। "उपस्थित" में देर से आए भी गिने जाते हैं।', 'ಪ್ರತಿ ಹಾಜರಾತಿ ಗುರುತಿಗೆ ಒಂದು ಸಾಲು. "ಹಾಜರು" ತಡವಾಗಿ ಬಂದವರನ್ನೂ ಎಣಿಸುತ್ತದೆ.'),
    category: 'academics',
    roles: [...ACAD, 'teacher'],
    from: 'attendance_records a',
    base: 'a',
    joins: [
      { alias: 's', sql: 'join students s on s.id = a.student_id' },
      ...classJoins('a.section_id'),
      { alias: 'ts', sql: 'left join timetable_slots ts on ts.id = a.timetable_slot_id' },
      { alias: 'sub', sql: 'left join subjects sub on sub.id = ts.subject_id' },
    ],
    classScoped: true,
    dateField: 'date',
    detail: ['date', 'roll_no', 'student', 'class', 'subject', 'status'],
    fields: [
      ...studentFields(),
      f('subject', L_.subject, 'text', "coalesce(sub.name, 'Whole day')", { idExpr: 'sub.id', picker: 'subject' }),
      f('date', L_.date, 'date', 'a.date'),
      f('month', L_.month, 'text', monthOf('a.date')),
      f('status', L_.status, 'text', 'a.status::text'),
      f('present', l('Present (1 or 0)', 'उपस्थित (1 या 0)', 'ಹಾಜರು (1 ಅಥವಾ 0)'), 'int', "(case when a.status in ('present', 'late') then 1 else 0 end)"),
      f('is_present', l('Present', 'उपस्थित', 'ಹಾಜರು'), 'bool', "a.status in ('present', 'late')"),
      f('is_absent', l('Absent', 'अनुपस्थित', 'ಗೈರು'), 'bool', "a.status = 'absent'"),
    ],
  },
  {
    key: 'marks',
    label: l('Marks', 'अंक', 'ಅಂಕಗಳು'),
    description: l('One row per student and assessment, using the moderated mark when there is one.', 'प्रति छात्र और मूल्यांकन एक पंक्ति; संशोधित अंक हों तो वही।', 'ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿ ಮತ್ತು ಮೌಲ್ಯಮಾಪನಕ್ಕೆ ಒಂದು ಸಾಲು; ಪರಿಷ್ಕೃತ ಅಂಕ ಇದ್ದರೆ ಅದೇ.'),
    category: 'exams',
    roles: [...ACAD, 'teacher'],
    from: 'marks m',
    base: 'm',
    joins: [
      { alias: 'asm', sql: 'join assessments asm on asm.id = m.assessment_id' },
      { alias: 's', sql: 'join students s on s.id = m.student_id' },
      ...classJoins('asm.section_id'),
      { alias: 'sub', sql: 'join subjects sub on sub.id = asm.subject_id' },
      { alias: 'd', sql: 'left join departments d on d.id = sub.department_id' },
    ],
    classScoped: true,
    dateField: 'held_on',
    detail: ['roll_no', 'student', 'class', 'subject', 'assessment', 'marks', 'max_marks', 'percent'],
    fields: [
      ...studentFields(),
      f('subject', L_.subject, 'text', 'sub.name', { idExpr: 'sub.id', picker: 'subject' }),
      f('subject_code', L_.subjectCode, 'text', 'sub.code'),
      f('department', L_.department, 'text', "coalesce(d.name, 'No department')", { idExpr: 'd.id', picker: 'department' }),
      f('assessment', l('Assessment', 'मूल्यांकन', 'ಮೌಲ್ಯಮಾಪನ'), 'text', 'asm.title'),
      f('kind', l('Kind', 'प्रकार', 'ಬಗೆ'), 'text', 'asm.kind::text'),
      f('held_on', l('Held on', 'आयोजन तिथि', 'ನಡೆದ ದಿನಾಂಕ'), 'date', 'asm.held_on'),
      f('marks', l('Marks', 'अंक', 'ಅಂಕಗಳು'), 'number', 'coalesce(m.moderated_marks, m.marks)'),
      f('max_marks', l('Maximum marks', 'अधिकतम अंक', 'ಗರಿಷ್ಠ ಅಂಕಗಳು'), 'number', 'asm.max_marks'),
      f('percent', l('Percent', 'प्रतिशत', 'ಶೇಕಡಾ'), 'percent', 'round(coalesce(m.moderated_marks, m.marks) / nullif(asm.max_marks, 0) * 100, 1)'),
      f('absent', l('Absent', 'अनुपस्थित', 'ಗೈರು'), 'bool', 'm.absent'),
    ],
  },
  {
    key: 'results',
    label: l('Subject results', 'विषयवार परिणाम', 'ವಿಷಯವಾರು ಫಲಿತಾಂಶ'),
    description: l('One row per student and subject in a published exam session: percent, grade and pass.', 'प्रकाशित परीक्षा सत्र में प्रति छात्र और विषय एक पंक्ति: प्रतिशत, ग्रेड और उत्तीर्ण।', 'ಪ್ರಕಟಿತ ಪರೀಕ್ಷೆಯಲ್ಲಿ ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿ ಮತ್ತು ವಿಷಯಕ್ಕೆ ಒಂದು ಸಾಲು: ಶೇಕಡಾ, ಗ್ರೇಡ್ ಮತ್ತು ತೇರ್ಗಡೆ.'),
    category: 'exams',
    roles: [...ACAD, 'teacher'],
    from: 'exam_result_lines erl',
    base: 'erl',
    joins: [
      { alias: 'er', sql: 'join exam_results er on er.id = erl.result_id' },
      { alias: 'es', sql: 'join exam_sessions es on es.id = er.session_id' },
      { alias: 's', sql: 'join students s on s.id = er.student_id' },
      ...classJoins('s.section_id'),
      { alias: 'sub', sql: 'join subjects sub on sub.id = erl.subject_id' },
      { alias: 'd', sql: 'left join departments d on d.id = sub.department_id' },
    ],
    where: "es.status in ('published', 'locked')",
    classScoped: true,
    detail: ['roll_no', 'student', 'class', 'subject', 'percent', 'grade', 'passed'],
    fields: [
      ...studentFields(),
      f('session', L_.session, 'text', 'es.name', { idExpr: 'es.id', picker: 'values' }),
      f('term', L_.term, 'int', 'es.term', { agg: false }),
      f('subject', L_.subject, 'text', 'sub.name', { idExpr: 'sub.id', picker: 'subject' }),
      f('subject_code', L_.subjectCode, 'text', 'sub.code'),
      f('department', L_.department, 'text', "coalesce(d.name, 'No department')", { idExpr: 'd.id', picker: 'department' }),
      f('percent', l('Percent', 'प्रतिशत', 'ಶೇಕಡಾ'), 'percent', 'erl.percent'),
      f('grade', l('Grade', 'ग्रेड', 'ಗ್ರೇಡ್'), 'text', "coalesce(erl.grade, '')", { sortExpr: '-coalesce(erl.grade_point, 0)' }),
      f('grade_point', l('Grade point', 'ग्रेड पॉइंट', 'ಗ್ರೇಡ್ ಅಂಕ'), 'number', 'erl.grade_point'),
      f('credits', l('Credits', 'क्रेडिट', 'ಕ್ರೆಡಿಟ್‌ಗಳು'), 'number', 'erl.credits'),
      f('passed', l('Passed', 'उत्तीर्ण', 'ತೇರ್ಗಡೆ'), 'bool', 'erl.passed'),
      f('failed', l('Failed', 'अनुत्तीर्ण', 'ಅನುತ್ತೀರ್ಣ'), 'bool', 'not erl.passed'),
    ],
  },
  {
    key: 'semester_results',
    label: l('Semester results', 'सेमेस्टर परिणाम', 'ಸೆಮಿಸ್ಟರ್ ಫಲಿತಾಂಶ'),
    description: l('One row per student and published exam session: SGPA, CGPA, credits and outcome.', 'प्रति छात्र और प्रकाशित सत्र एक पंक्ति: एसजीपीए, सीजीपीए, क्रेडिट और परिणाम।', 'ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿ ಮತ್ತು ಪ್ರಕಟಿತ ಅವಧಿಗೆ ಒಂದು ಸಾಲು: ಎಸ್‌ಜಿಪಿಎ, ಸಿಜಿಪಿಎ, ಕ್ರೆಡಿಟ್ ಮತ್ತು ಫಲಿತಾಂಶ.'),
    category: 'exams',
    roles: [...ACAD, 'teacher', 'placement_officer'],
    from: 'exam_results er',
    base: 'er',
    joins: [{ alias: 'es', sql: 'join exam_sessions es on es.id = er.session_id' }, { alias: 's', sql: 'join students s on s.id = er.student_id' }, ...classJoins('s.section_id')],
    where: "es.status in ('published', 'locked')",
    classScoped: true,
    detail: ['roll_no', 'student', 'class', 'session', 'sgpa', 'cgpa', 'outcome'],
    fields: [
      ...studentFields(),
      f('session', L_.session, 'text', 'es.name', { idExpr: 'es.id', picker: 'values' }),
      f('term', L_.term, 'int', 'es.term', { agg: false }),
      f('sgpa', l('SGPA', 'एसजीपीए', 'ಎಸ್‌ಜಿಪಿಎ'), 'number', 'er.sgpa'),
      f('cgpa', l('CGPA', 'सीजीपीए', 'ಸಿಜಿಪಿಎ'), 'number', 'er.cgpa'),
      f('credits_attempted', l('Credits attempted', 'प्रयासित क्रेडिट', 'ಪ್ರಯತ್ನಿಸಿದ ಕ್ರೆಡಿಟ್'), 'number', 'er.credits_attempted'),
      f('credits_earned', l('Credits earned', 'अर्जित क्रेडिट', 'ಗಳಿಸಿದ ಕ್ರೆಡಿಟ್'), 'number', 'er.credits_earned'),
      f('outcome', l('Outcome', 'परिणाम', 'ಫಲಿತಾಂಶ'), 'text', 'er.outcome'),
      f('passed', l('Passed', 'उत्तीर्ण', 'ತೇರ್ಗಡೆ'), 'bool', "er.outcome = 'pass'"),
    ],
  },
  {
    key: 'fees',
    label: l('Fee invoices and dues', 'शुल्क चालान और बकाया', 'ಶುಲ್ಕ ಇನ್‌ವಾಯ್ಸ್ ಮತ್ತು ಬಾಕಿ'),
    description: l('One row per fee invoice: billed, paid, balance, due date and how overdue it is.', 'प्रति शुल्क चालान एक पंक्ति: बिल, भुगतान, शेष, नियत तिथि और कितना विलंब।', 'ಪ್ರತಿ ಶುಲ್ಕ ಇನ್‌ವಾಯ್ಸ್‌ಗೆ ಒಂದು ಸಾಲು: ಬಿಲ್, ಪಾವತಿ, ಬಾಕಿ, ಗಡುವು ಮತ್ತು ವಿಳಂಬ.'),
    category: 'fees',
    roles: FIN,
    from: 'fee_invoices i',
    base: 'i',
    joins: [{ alias: 's', sql: 'join students s on s.id = i.student_id' }, ...classJoins('i.section_id'), { alias: 'app', sql: 'left join applications app on app.id = s.application_id' }],
    classScoped: false,
    dateField: 'due_on',
    detail: ['invoice_no', 'roll_no', 'student', 'class', 'title', 'due_on', 'amount', 'paid', 'balance'],
    fields: [
      ...studentFields(),
      ...applicantFields('app'),
      f('invoice_no', l('Invoice no', 'चालान संख्या', 'ಇನ್‌ವಾಯ್ಸ್ ಸಂಖ್ಯೆ'), 'text', "coalesce(i.invoice_no, '')"),
      f('title', l('Fee head', 'शुल्क मद', 'ಶುಲ್ಕ ಶೀರ್ಷಿಕೆ'), 'text', 'i.title'),
      f('status', L_.status, 'text', 'i.status::text'),
      f('due_on', l('Due on', 'नियत तिथि', 'ಗಡುವು'), 'date', 'i.due_on'),
      f('due_month', l('Due month', 'नियत महीना', 'ಗಡುವಿನ ತಿಂಗಳು'), 'text', monthOf('i.due_on')),
      f('amount', l('Billed', 'बिल राशि', 'ಬಿಲ್ ಮೊತ್ತ'), 'money', 'i.amount_paise'),
      f('paid', l('Paid', 'भुगतान', 'ಪಾವತಿ'), 'money', 'i.paid_paise'),
      f('balance', l('Balance', 'शेष', 'ಬಾಕಿ'), 'money', '(i.amount_paise - i.paid_paise)'),
      f('is_overdue', l('Overdue', 'अतिदेय', 'ಮೀರಿದ ಬಾಕಿ'), 'bool', OVERDUE),
      f('days_overdue', l('Days overdue', 'विलंब के दिन', 'ವಿಳಂಬದ ದಿನಗಳು'), 'int', DAYS_LATE, { agg: false }),
      f('ageing', l('Ageing', 'बकाया अवधि', 'ಬಾಕಿ ಅವಧಿ'), 'text', `(array['Settled','Not yet due','1-30 days','31-60 days','61-90 days','Over 90 days'])[${AGEING_RANK} + 1]`, { sortExpr: AGEING_RANK }),
    ],
  },
  {
    key: 'collections',
    label: l('Fee collections', 'शुल्क संग्रह', 'ಶುಲ್ಕ ಸಂಗ್ರಹ'),
    description: l('One row per successful payment: receipt, date, mode and who collected it.', 'प्रति सफल भुगतान एक पंक्ति: रसीद, तिथि, माध्यम और संग्रहकर्ता।', 'ಪ್ರತಿ ಯಶಸ್ವಿ ಪಾವತಿಗೆ ಒಂದು ಸಾಲು: ರಸೀದಿ, ದಿನಾಂಕ, ವಿಧಾನ ಮತ್ತು ಸಂಗ್ರಹಿಸಿದವರು.'),
    category: 'fees',
    roles: FIN,
    from: 'fee_payments p',
    base: 'p',
    joins: [
      { alias: 'i', sql: 'join fee_invoices i on i.id = p.invoice_id' },
      { alias: 's', sql: 'join students s on s.id = p.student_id' },
      ...classJoins('i.section_id'),
      { alias: 'ru', sql: 'left join users ru on ru.id = p.recorded_by' },
    ],
    where: "p.status = 'paid'",
    classScoped: false,
    dateField: 'paid_on',
    detail: ['receipt_no', 'paid_on', 'roll_no', 'student', 'class', 'fee', 'method', 'amount'],
    fields: [
      f('receipt_no', l('Receipt no', 'रसीद संख्या', 'ರಸೀದಿ ಸಂಖ್ಯೆ'), 'text', "coalesce(p.receipt_no, '')"),
      f('paid_on', l('Paid on', 'भुगतान तिथि', 'ಪಾವತಿ ದಿನಾಂಕ'), 'date', localDate('coalesce(p.paid_at, p.created_at)')),
      f('paid_month', l('Month', 'महीना', 'ತಿಂಗಳು'), 'text', monthOf(localDate('coalesce(p.paid_at, p.created_at)'))),
      f('method', l('Payment mode', 'भुगतान माध्यम', 'ಪಾವತಿ ವಿಧಾನ'), 'text', 'p.method::text'),
      f('amount', l('Amount', 'राशि', 'ಮೊತ್ತ'), 'money', 'p.amount_paise'),
      f('reference', l('Reference', 'संदर्भ', 'ಉಲ್ಲೇಖ'), 'text', "coalesce(p.reference, p.provider_payment_id, '')"),
      f('fee', l('Fee head', 'शुल्क मद', 'ಶುಲ್ಕ ಶೀರ್ಷಿಕೆ'), 'text', 'i.title'),
      f('invoice_no', l('Invoice no', 'चालान संख्या', 'ಇನ್‌ವಾಯ್ಸ್ ಸಂಖ್ಯೆ'), 'text', "coalesce(i.invoice_no, '')"),
      ...studentFields(),
      f('collected_by', l('Collected by', 'संग्रहकर्ता', 'ಸಂಗ್ರಹಿಸಿದವರು'), 'text', "coalesce(ru.full_name, 'Online')"),
    ],
  },
  {
    key: 'concessions',
    label: l('Fee concessions', 'शुल्क रियायत', 'ಶುಲ್ಕ ರಿಯಾಯಿತಿ'),
    description: l('One row per concession: kind, sponsor, amount and approval.', 'प्रति रियायत एक पंक्ति: प्रकार, प्रायोजक, राशि और अनुमोदन।', 'ಪ್ರತಿ ರಿಯಾಯಿತಿಗೆ ಒಂದು ಸಾಲು: ಬಗೆ, ಪ್ರಾಯೋಜಕ, ಮೊತ್ತ ಮತ್ತು ಅನುಮೋದನೆ.'),
    category: 'fees',
    roles: FIN,
    from: 'fee_concessions c',
    base: 'c',
    joins: [{ alias: 's', sql: 'join students s on s.id = c.student_id' }, ...classJoins('s.section_id'), { alias: 'i', sql: 'left join fee_invoices i on i.id = c.invoice_id' }, { alias: 'app', sql: 'left join applications app on app.id = s.application_id' }],
    classScoped: false,
    dateField: 'requested_on',
    detail: ['number', 'roll_no', 'student', 'class', 'kind', 'amount', 'status'],
    fields: [
      f('number', l('Number', 'संख्या', 'ಸಂಖ್ಯೆ'), 'text', 'c.number'),
      f('kind', l('Kind', 'प्रकार', 'ಬಗೆ'), 'text', 'c.kind'),
      f('sponsor', l('Sponsor', 'प्रायोजक', 'ಪ್ರಾಯೋಜಕ'), 'text', "coalesce(c.sponsor_name, '')"),
      f('percent', l('Percent', 'प्रतिशत', 'ಶೇಕಡಾ'), 'percent', 'c.percent', { agg: false }),
      f('amount', l('Concession', 'रियायत', 'ರಿಯಾಯಿತಿ'), 'money', 'c.amount_paise'),
      f('applied', l('Applied to fees', 'शुल्क पर लागू', 'ಶುಲ್ಕಕ್ಕೆ ಅನ್ವಯ'), 'money', 'c.applied_paise'),
      f('status', L_.status, 'text', 'c.status'),
      f('reason', l('Reason', 'कारण', 'ಕಾರಣ'), 'text', "coalesce(c.reason, '')"),
      f('requested_on', l('Requested on', 'अनुरोध तिथि', 'ವಿನಂತಿ ದಿನಾಂಕ'), 'date', localDate('c.created_at')),
      f('fee', l('Fee head', 'शुल्क मद', 'ಶುಲ್ಕ ಶೀರ್ಷಿಕೆ'), 'text', "coalesce(i.title, '')"),
      ...studentFields(),
      ...applicantFields('app'),
    ],
  },
  {
    key: 'scholarships',
    label: l('Scholarships', 'छात्रवृत्ति', 'ವಿದ್ಯಾರ್ಥಿವೇತನ'),
    description: l('One row per scholarship application: scheme, status and amount awarded.', 'प्रति छात्रवृत्ति आवेदन एक पंक्ति: योजना, स्थिति और स्वीकृत राशि।', 'ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿವೇತನ ಅರ್ಜಿಗೆ ಒಂದು ಸಾಲು: ಯೋಜನೆ, ಸ್ಥಿತಿ ಮತ್ತು ಮಂಜೂರಾದ ಮೊತ್ತ.'),
    category: 'fees',
    roles: [...FIN, 'hod'],
    from: 'scholarship_applications sa',
    base: 'sa',
    joins: [{ alias: 'sc', sql: 'join scholarship_schemes sc on sc.id = sa.scheme_id' }, { alias: 's', sql: 'join students s on s.id = sa.student_id' }, ...classJoins('s.section_id'), { alias: 'app', sql: 'left join applications app on app.id = s.application_id' }],
    classScoped: false,
    dateField: 'applied_on',
    detail: ['roll_no', 'student', 'class', 'scheme', 'status', 'awarded'],
    fields: [
      f('scheme', l('Scheme', 'योजना', 'ಯೋಜನೆ'), 'text', 'sc.name', { idExpr: 'sc.id', picker: 'values' }),
      f('scheme_kind', l('Scheme kind', 'योजना प्रकार', 'ಯೋಜನೆಯ ಬಗೆ'), 'text', 'sc.kind'),
      f('status', L_.status, 'text', 'sa.status'),
      f('income', l('Family income', 'पारिवारिक आय', 'ಕುಟುಂಬದ ಆದಾಯ'), 'money', 'sa.income_paise', { roles: FIN }),
      f('awarded', l('Awarded', 'स्वीकृत राशि', 'ಮಂಜೂರಾದ ಮೊತ್ತ'), 'money', 'coalesce(sa.awarded_paise, 0)'),
      f('applied_on', l('Applied on', 'आवेदन तिथि', 'ಅರ್ಜಿ ದಿನಾಂಕ'), 'date', localDate('sa.created_at')),
      f('decided_on', l('Decided on', 'निर्णय तिथि', 'ನಿರ್ಧಾರ ದಿನಾಂಕ'), 'date', localDate('sa.decided_at')),
      ...studentFields(),
      ...applicantFields('app'),
    ],
  },
  {
    key: 'staff',
    label: l('Staff', 'कर्मचारी', 'ಸಿಬ್ಬಂದಿ'),
    description: l('One row per staff member. Bank, tax and identity numbers are never available.', 'प्रति कर्मचारी एक पंक्ति। बैंक, कर और पहचान संख्या कभी उपलब्ध नहीं।', 'ಪ್ರತಿ ಸಿಬ್ಬಂದಿಗೆ ಒಂದು ಸಾಲು. ಬ್ಯಾಂಕ್, ತೆರಿಗೆ ಮತ್ತು ಗುರುತಿನ ಸಂಖ್ಯೆಗಳು ಎಂದಿಗೂ ಲಭ್ಯವಿಲ್ಲ.'),
    category: 'hr',
    roles: HR,
    from: 'staff_profiles sp',
    base: 'sp',
    joins: [{ alias: 'u', sql: 'join users u on u.id = sp.user_id' }, { alias: 'd', sql: 'left join departments d on d.id = sp.department_id' }, { alias: 'dg', sql: 'left join designations dg on dg.id = sp.designation_id' }],
    classScoped: false,
    dateField: 'joined_on',
    detail: ['employee_code', 'name', 'department', 'designation', 'employment_type', 'status'],
    fields: [
      f('employee_code', L_.employeeCode, 'text', 'sp.employee_code'),
      f('name', L_.name, 'text', 'u.full_name'),
      f('department', L_.department, 'text', "coalesce(d.name, 'No department')", { idExpr: 'd.id', picker: 'department' }),
      f('designation', L_.designation, 'text', "coalesce(dg.name, '')"),
      f('grade', l('Grade', 'ग्रेड', 'ಗ್ರೇಡ್'), 'text', "coalesce(dg.grade, '')"),
      f('employment_type', l('Employment type', 'रोजगार प्रकार', 'ಉದ್ಯೋಗದ ಬಗೆ'), 'text', 'sp.employment_type'),
      f('status', L_.status, 'text', 'sp.status'),
      f('joined_on', l('Joined on', 'कार्यग्रहण तिथि', 'ಸೇರಿದ ದಿನಾಂಕ'), 'date', 'sp.date_of_joining'),
      f('left_on', l('Left on', 'कार्यमुक्ति तिथि', 'ತೊರೆದ ದಿನಾಂಕ'), 'date', 'sp.date_of_leaving'),
      f('experience_years', l('Years of service', 'सेवा के वर्ष', 'ಸೇವಾ ವರ್ಷಗಳು'), 'number', 'round(((coalesce(sp.date_of_leaving, {{today}}::date) - sp.date_of_joining) / 365.25)::numeric, 1)', { agg: false }),
      f('gender', L_.gender, 'text', "coalesce(nullif(initcap(sp.gender), ''), 'Not recorded')"),
      f('date_of_birth', L_.dob, 'date', 'sp.date_of_birth', { roles: STAFF_PII }),
      f('age', L_.age, 'int', 'date_part(\'year\', age({{today}}::date, sp.date_of_birth))::int', { agg: false }),
      f('phone', L_.phone, 'text', "coalesce(u.phone, '')", { roles: STAFF_PII }),
      f('email', L_.email, 'text', "coalesce(u.email, '')", { roles: STAFF_PII }),
    ],
  },
  {
    key: 'staff_attendance',
    label: l('Staff attendance', 'कर्मचारी उपस्थिति', 'ಸಿಬ್ಬಂದಿ ಹಾಜರಾತಿ'),
    description: l('One row per staff member per day: present, half day, absent or on leave.', 'प्रति कर्मचारी प्रति दिन एक पंक्ति: उपस्थित, आधा दिन, अनुपस्थित या अवकाश।', 'ಪ್ರತಿ ಸಿಬ್ಬಂದಿಗೆ ಪ್ರತಿ ದಿನ ಒಂದು ಸಾಲು: ಹಾಜರು, ಅರ್ಧ ದಿನ, ಗೈರು ಅಥವಾ ರಜೆ.'),
    category: 'hr',
    roles: [...HR, 'hod'],
    from: 'staff_attendance sa',
    base: 'sa',
    joins: [{ alias: 'u', sql: 'join users u on u.id = sa.user_id' }, ...staffJoins('sa.user_id')],
    classScoped: false,
    dateField: 'date',
    detail: ['date', 'employee_code', 'name', 'department', 'status', 'check_in'],
    fields: [
      ...staffFields('u'),
      f('date', L_.date, 'date', 'sa.date'),
      f('month', L_.month, 'text', monthOf('sa.date')),
      f('status', L_.status, 'text', 'sa.status'),
      f('present_days', l('Days present', 'उपस्थित दिन', 'ಹಾಜರಾದ ದಿನಗಳು'), 'number', "(case sa.status when 'present' then 1 when 'half_day' then 0.5 else 0 end)"),
      f('is_present', l('Present', 'उपस्थित', 'ಹಾಜರು'), 'bool', "sa.status in ('present', 'half_day')"),
      f('is_absent', l('Absent', 'अनुपस्थित', 'ಗೈರು'), 'bool', "sa.status = 'absent'"),
      f('on_leave', l('On leave', 'अवकाश पर', 'ರಜೆಯಲ್ಲಿ'), 'bool', "sa.status = 'on_leave'"),
      f('check_in', l('Check-in', 'आगमन समय', 'ಆಗಮನ ಸಮಯ'), 'text', "coalesce(to_char(sa.check_in_at at time zone {{tz}}, 'HH24:MI'), '')"),
    ],
  },
  {
    key: 'leave',
    label: l('Staff leave', 'कर्मचारी अवकाश', 'ಸಿಬ್ಬಂದಿ ರಜೆ'),
    description: l('One row per leave request: type, dates, days and decision.', 'प्रति अवकाश अनुरोध एक पंक्ति: प्रकार, तिथियाँ, दिन और निर्णय।', 'ಪ್ರತಿ ರಜೆ ವಿನಂತಿಗೆ ಒಂದು ಸಾಲು: ಬಗೆ, ದಿನಾಂಕಗಳು, ದಿನಗಳು ಮತ್ತು ನಿರ್ಧಾರ.'),
    category: 'hr',
    roles: [...HR, 'hod'],
    from: 'leave_requests lr',
    base: 'lr',
    joins: [{ alias: 'u', sql: 'join users u on u.id = lr.user_id' }, { alias: 'lt', sql: 'join leave_types lt on lt.id = lr.leave_type_id' }, ...staffJoins('lr.user_id')],
    classScoped: false,
    dateField: 'from_date',
    detail: ['employee_code', 'name', 'department', 'leave_type', 'from_date', 'to_date', 'days', 'status'],
    fields: [
      ...staffFields('u'),
      f('leave_type', l('Leave type', 'अवकाश प्रकार', 'ರಜೆಯ ಬಗೆ'), 'text', 'lt.name', { idExpr: 'lt.id', picker: 'values' }),
      f('paid', l('Paid leave', 'सवेतन अवकाश', 'ವೇತನಸಹಿತ ರಜೆ'), 'bool', 'lt.paid'),
      f('from_date', l('From', 'से', 'ಇಂದ'), 'date', 'lr.from_date'),
      f('to_date', l('To', 'तक', 'ವರೆಗೆ'), 'date', 'lr.to_date'),
      f('month', L_.month, 'text', monthOf('lr.from_date')),
      f('days', l('Days', 'दिन', 'ದಿನಗಳು'), 'number', 'lr.days'),
      f('status', L_.status, 'text', 'lr.status'),
      f('applied_on', l('Applied on', 'आवेदन तिथि', 'ಅರ್ಜಿ ದಿನಾಂಕ'), 'date', localDate('lr.created_at')),
      f('reason', l('Reason', 'कारण', 'ಕಾರಣ'), 'text', "coalesce(lr.reason, '')", { roles: STAFF_PII }),
    ],
  },
  {
    key: 'payroll',
    label: l('Payroll', 'वेतन', 'ವೇತನ'),
    description: l('One row per payslip: month, gross, deductions and net pay. Amounts are for HR and finance only.', 'प्रति वेतन पर्ची एक पंक्ति: महीना, सकल, कटौती और शुद्ध वेतन। राशियाँ केवल एचआर और वित्त के लिए।', 'ಪ್ರತಿ ವೇತನ ಚೀಟಿಗೆ ಒಂದು ಸಾಲು: ತಿಂಗಳು, ಒಟ್ಟು, ಕಡಿತ ಮತ್ತು ನಿವ್ವಳ ವೇತನ. ಮೊತ್ತಗಳು ಮಾನವ ಸಂಪನ್ಮೂಲ ಮತ್ತು ಹಣಕಾಸು ವಿಭಾಗಕ್ಕೆ ಮಾತ್ರ.'),
    category: 'hr',
    roles: [...HR, 'accountant'],
    from: 'payslips ps',
    base: 'ps',
    joins: [{ alias: 'run', sql: 'join payroll_runs run on run.id = ps.run_id' }, { alias: 'u', sql: 'join users u on u.id = ps.user_id' }, ...staffJoins('ps.user_id')],
    classScoped: false,
    detail: ['month', 'employee_code', 'name', 'department', 'gross', 'deductions', 'net'],
    fields: [
      f('month', L_.month, 'text', 'run.month'),
      f('run_status', l('Run status', 'रन स्थिति', 'ರನ್ ಸ್ಥಿತಿ'), 'text', 'run.status'),
      ...staffFields('u'),
      f('designation', L_.designation, 'text', "coalesce(dg.name, '')"),
      f('gross', l('Gross pay', 'सकल वेतन', 'ಒಟ್ಟು ವೇತನ'), 'money', 'ps.gross_paise', { roles: SALARY_ROLES }),
      f('deductions', l('Deductions', 'कटौती', 'ಕಡಿತಗಳು'), 'money', 'ps.deductions_paise', { roles: SALARY_ROLES }),
      f('net', l('Net pay', 'शुद्ध वेतन', 'ನಿವ್ವಳ ವೇತನ'), 'money', 'ps.net_paise', { roles: SALARY_ROLES }),
      f('employer_cost', l('Cost to institution', 'संस्था की लागत', 'ಸಂಸ್ಥೆಯ ವೆಚ್ಚ'), 'money', 'ps.employer_cost_paise', { roles: SALARY_ROLES }),
      f('pf', l('Provident fund', 'भविष्य निधि', 'ಭವಿಷ್ಯ ನಿಧಿ'), 'money', 'ps.employee_pf_paise', { roles: SALARY_ROLES }),
      f('pt', l('Professional tax', 'व्यवसाय कर', 'ವೃತ್ತಿ ತೆರಿಗೆ'), 'money', 'ps.pt_paise', { roles: SALARY_ROLES }),
      f('tds', l('Income tax (TDS)', 'आयकर (TDS)', 'ಆದಾಯ ತೆರಿಗೆ (TDS)'), 'money', 'ps.tds_paise', { roles: SALARY_ROLES }),
    ],
  },
  {
    key: 'library_loans',
    label: l('Library loans', 'पुस्तकालय निर्गम', 'ಗ್ರಂಥಾಲಯ ಎರವಲು'),
    description: l('One row per book issue: borrower, due date, return and fine.', 'प्रति पुस्तक निर्गम एक पंक्ति: उधारकर्ता, नियत तिथि, वापसी और जुर्माना।', 'ಪ್ರತಿ ಪುಸ್ತಕ ವಿತರಣೆಗೆ ಒಂದು ಸಾಲು: ಎರವಲುಗಾರ, ಗಡುವು, ಹಿಂತಿರುಗಿಸುವಿಕೆ ಮತ್ತು ದಂಡ.'),
    category: 'facilities',
    roles: [...MGMT, 'librarian'],
    from: 'library_loans lo',
    base: 'lo',
    joins: [{ alias: 'b', sql: 'join library_books b on b.id = lo.book_id' }, { alias: 's', sql: 'left join students s on s.id = lo.student_id' }, ...classJoins('s.section_id', true)],
    classScoped: false,
    dateField: 'issued_on',
    detail: ['book', 'roll_no', 'student', 'class', 'issued_on', 'due_on', 'returned_on', 'fine'],
    fields: [
      f('book', l('Book', 'पुस्तक', 'ಪುಸ್ತಕ'), 'text', 'b.title'),
      f('author', l('Author', 'लेखक', 'ಲೇಖಕ'), 'text', "coalesce(b.author, '')"),
      f('isbn', l('ISBN', 'ISBN', 'ISBN'), 'text', "coalesce(b.isbn, '')"),
      f('call_no', l('Call number', 'कॉल नंबर', 'ಕಾಲ್ ಸಂಖ್ಯೆ'), 'text', "coalesce(b.call_no, '')"),
      f('student', L_.student, 'text', "coalesce(s.full_name, '')"),
      f('roll_no', L_.roll, 'text', "coalesce(s.roll_no, '')"),
      ...classFields(),
      f('issued_on', l('Issued on', 'निर्गम तिथि', 'ವಿತರಣಾ ದಿನಾಂಕ'), 'date', localDate('lo.issued_at')),
      f('due_on', l('Due on', 'नियत तिथि', 'ಗಡುವು'), 'date', 'lo.due_on'),
      f('returned_on', l('Returned on', 'वापसी तिथि', 'ಹಿಂತಿರುಗಿಸಿದ ದಿನಾಂಕ'), 'date', localDate('lo.returned_at')),
      f('is_returned', l('Returned', 'वापस', 'ಹಿಂತಿರುಗಿಸಲಾಗಿದೆ'), 'bool', 'lo.returned_at is not null'),
      f('is_overdue', l('Overdue', 'अतिदेय', 'ಗಡುವು ಮೀರಿದೆ'), 'bool', 'lo.returned_at is null and lo.due_on < {{today}}::date'),
      f('days_overdue', l('Days overdue', 'विलंब के दिन', 'ವಿಳಂಬದ ದಿನಗಳು'), 'int', '(case when lo.returned_at is null and lo.due_on < {{today}}::date then {{today}}::date - lo.due_on else 0 end)', { agg: false }),
      f('fine', l('Fine', 'जुर्माना', 'ದಂಡ'), 'money', 'coalesce(lo.fine_paise, 0)'),
      f('fine_paid', l('Fine paid', 'जुर्माना भुगतान', 'ದಂಡ ಪಾವತಿ'), 'bool', 'lo.fine_paid_at is not null'),
      f('renewals', l('Renewals', 'नवीनीकरण', 'ನವೀಕರಣಗಳು'), 'int', 'lo.renew_count'),
    ],
  },
  {
    key: 'hostel',
    label: l('Hostel beds', 'छात्रावास बिस्तर', 'ವಸತಿ ನಿಲಯದ ಹಾಸಿಗೆಗಳು'),
    description: l('One row per bed, with the student living in it today (if any).', 'प्रति बिस्तर एक पंक्ति, आज उसमें रहने वाले छात्र सहित।', 'ಪ್ರತಿ ಹಾಸಿಗೆಗೆ ಒಂದು ಸಾಲು, ಇಂದು ಅದರಲ್ಲಿರುವ ವಿದ್ಯಾರ್ಥಿಯೊಂದಿಗೆ.'),
    category: 'facilities',
    roles: [...MGMT, 'hostel_warden'],
    from: 'hostel_beds hb',
    base: 'hb',
    joins: [
      { alias: 'hr', sql: 'join hostel_rooms hr on hr.id = hb.room_id' },
      { alias: 'bl', sql: 'join hostel_blocks bl on bl.id = hr.block_id' },
      { alias: 'al', sql: 'left join hostel_allotments al on al.bed_id = hb.id and al.vacated_on is null' },
      { alias: 's', sql: 'left join students s on s.id = al.student_id' },
      ...classJoins('s.section_id', true),
    ],
    classScoped: false,
    detail: ['block', 'room', 'bed', 'student', 'class', 'allotted_on'],
    fields: [
      f('block', l('Block', 'ब्लॉक', 'ಬ್ಲಾಕ್'), 'text', 'bl.name', { idExpr: 'bl.id', picker: 'values' }),
      f('block_gender', l('Block for', 'ब्लॉक किसके लिए', 'ಬ್ಲಾಕ್ ಯಾರಿಗೆ'), 'text', 'bl.gender'),
      f('room', l('Room', 'कमरा', 'ಕೊಠಡಿ'), 'text', 'hr.number'),
      f('floor', l('Floor', 'मंज़िल', 'ಮಹಡಿ'), 'int', 'hr.floor', { agg: false }),
      f('bed', l('Bed', 'बिस्तर', 'ಹಾಸಿಗೆ'), 'text', 'hb.label'),
      f('occupied', l('Occupied', 'भरा हुआ', 'ಭರ್ತಿ'), 'bool', 'al.id is not null'),
      f('vacant', l('Vacant', 'खाली', 'ಖಾಲಿ'), 'bool', 'al.id is null'),
      f('student', L_.student, 'text', "coalesce(s.full_name, '')"),
      ...classFields(),
      f('allotted_on', l('Allotted on', 'आवंटन तिथि', 'ಹಂಚಿಕೆ ದಿನಾಂಕ'), 'date', 'al.starts_on'),
      f('monthly_fee', l('Monthly fee', 'मासिक शुल्क', 'ಮಾಸಿಕ ಶುಲ್ಕ'), 'money', 'coalesce(hr.monthly_fee_paise, 0)'),
    ],
  },
  {
    key: 'transport',
    label: l('Transport riders', 'परिवहन उपयोगकर्ता', 'ಸಾರಿಗೆ ಬಳಕೆದಾರರು'),
    description: l('One row per student assigned to a route and stop.', 'मार्ग और स्टॉप पर नियत प्रति छात्र एक पंक्ति।', 'ಮಾರ್ಗ ಮತ್ತು ನಿಲ್ದಾಣಕ್ಕೆ ನಿಯೋಜಿತ ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿಗೆ ಒಂದು ಸಾಲು.'),
    category: 'facilities',
    roles: [...MGMT, 'transport_manager'],
    from: 'transport_assignments ta',
    base: 'ta',
    joins: [
      { alias: 'rt', sql: 'join transport_routes rt on rt.id = ta.route_id' },
      { alias: 'st', sql: 'left join transport_stops st on st.id = ta.stop_id' },
      { alias: 'v', sql: 'left join transport_vehicles v on v.id = rt.vehicle_id' },
      { alias: 's', sql: 'join students s on s.id = ta.student_id' },
      ...classJoins('s.section_id'),
    ],
    classScoped: false,
    detail: ['route', 'stop', 'pickup_time', 'roll_no', 'student', 'class'],
    fields: [
      f('route', l('Route', 'मार्ग', 'ಮಾರ್ಗ'), 'text', 'rt.name', { idExpr: 'rt.id', picker: 'values' }),
      f('stop', l('Stop', 'स्टॉप', 'ನಿಲ್ದಾಣ'), 'text', "coalesce(st.name, 'No stop')", { sortExpr: 'coalesce(st.seq, 999)' }),
      f('pickup_time', l('Pickup time', 'पिकअप समय', 'ಪಿಕಪ್ ಸಮಯ'), 'text', "coalesce(st.pickup_time, '')"),
      f('vehicle', l('Vehicle', 'वाहन', 'ವಾಹನ'), 'text', "coalesce(v.reg_no, 'No vehicle')"),
      f('capacity', l('Seats in vehicle', 'वाहन में सीटें', 'ವಾಹನದ ಆಸನಗಳು'), 'int', 'v.capacity', { agg: false }),
      f('monthly_fee', l('Monthly fee', 'मासिक शुल्क', 'ಮಾಸಿಕ ಶುಲ್ಕ'), 'money', 'coalesce(rt.monthly_fee_paise, 0)'),
      ...studentFields(),
      f('starts_on', l('From', 'से', 'ಇಂದ'), 'date', 'ta.starts_on'),
      f('ended_on', l('Until', 'तक', 'ವರೆಗೆ'), 'date', 'ta.ended_on'),
      f('active', l('Riding now', 'अभी यात्रा कर रहे', 'ಈಗ ಪ್ರಯಾಣಿಸುತ್ತಿದ್ದಾರೆ'), 'bool', '(ta.ended_on is null or ta.ended_on >= {{today}}::date)'),
    ],
  },
  {
    key: 'inventory',
    label: l('Inventory stock', 'भंडार स्टॉक', 'ದಾಸ್ತಾನು'),
    description: l('One row per item in each store: quantity on hand and reorder level.', 'प्रत्येक भंडार में प्रति वस्तु एक पंक्ति: उपलब्ध मात्रा और पुनः ऑर्डर स्तर।', 'ಪ್ರತಿ ಉಗ್ರಾಣದಲ್ಲಿ ಪ್ರತಿ ವಸ್ತುವಿಗೆ ಒಂದು ಸಾಲು: ಲಭ್ಯ ಪ್ರಮಾಣ ಮತ್ತು ಮರು ಆರ್ಡರ್ ಮಟ್ಟ.'),
    category: 'facilities',
    roles: [...FIN, 'store_keeper'],
    from: 'inv_stock st',
    base: 'st',
    joins: [{ alias: 'it', sql: 'join inv_items it on it.id = st.item_id' }, { alias: 'so', sql: 'join inv_stores so on so.id = st.store_id' }],
    classScoped: false,
    detail: ['store', 'sku', 'item', 'category', 'qty', 'reorder_level'],
    fields: [
      f('store', l('Store', 'भंडार', 'ಉಗ್ರಾಣ'), 'text', 'so.name', { idExpr: 'so.id', picker: 'values' }),
      f('item', l('Item', 'वस्तु', 'ವಸ್ತು'), 'text', 'it.name'),
      f('sku', l('Item code', 'वस्तु कोड', 'ವಸ್ತು ಸಂಕೇತ'), 'text', 'it.sku'),
      f('category', l('Category', 'श्रेणी', 'ವರ್ಗ'), 'text', 'it.category'),
      f('unit', l('Unit', 'इकाई', 'ಘಟಕ'), 'text', 'it.unit'),
      f('qty', l('Quantity', 'मात्रा', 'ಪ್ರಮಾಣ'), 'int', 'st.qty'),
      f('reorder_level', l('Reorder level', 'पुनः ऑर्डर स्तर', 'ಮರು ಆರ್ಡರ್ ಮಟ್ಟ'), 'int', 'it.reorder_level', { agg: false }),
      f('below_reorder', l('Below reorder level', 'पुनः ऑर्डर स्तर से कम', 'ಮರು ಆರ್ಡರ್ ಮಟ್ಟಕ್ಕಿಂತ ಕಡಿಮೆ'), 'bool', 'st.qty <= it.reorder_level'),
      f('active', l('Active item', 'सक्रिय वस्तु', 'ಸಕ್ರಿಯ ವಸ್ತು'), 'bool', 'it.active'),
    ],
  },
  {
    key: 'placements',
    label: l('Placement offers', 'प्लेसमेंट ऑफ़र', 'ಉದ್ಯೋಗ ಆಫರ್‌ಗಳು'),
    description: l('One row per job offer: company, role, package and response.', 'प्रति नौकरी ऑफ़र एक पंक्ति: कंपनी, भूमिका, पैकेज और उत्तर।', 'ಪ್ರತಿ ಉದ್ಯೋಗ ಆಫರ್‌ಗೆ ಒಂದು ಸಾಲು: ಕಂಪನಿ, ಹುದ್ದೆ, ಪ್ಯಾಕೇಜ್ ಮತ್ತು ಪ್ರತಿಕ್ರಿಯೆ.'),
    category: 'placements',
    roles: [...MGMT, 'hod', 'placement_officer'],
    from: 'placement_offers o',
    base: 'o',
    joins: [
      { alias: 'dr', sql: 'join placement_drives dr on dr.id = o.drive_id' },
      { alias: 'co', sql: 'join placement_companies co on co.id = dr.company_id' },
      { alias: 's', sql: 'join students s on s.id = o.student_id' },
      ...classJoins('s.section_id'),
    ],
    classScoped: false,
    dateField: 'offered_on',
    detail: ['roll_no', 'student', 'class', 'company', 'role', 'ctc_lpa', 'status'],
    fields: [
      f('company', l('Company', 'कंपनी', 'ಕಂಪನಿ'), 'text', 'co.name', { idExpr: 'co.id', picker: 'values' }),
      f('sector', l('Sector', 'क्षेत्र', 'ವಲಯ'), 'text', "coalesce(co.sector, '')"),
      f('drive', l('Drive', 'ड्राइव', 'ಡ್ರೈವ್'), 'text', 'dr.title'),
      f('role', l('Role', 'भूमिका', 'ಹುದ್ದೆ'), 'text', 'o.role_title'),
      f('ctc_lpa', l('Package (lakh a year)', 'पैकेज (लाख प्रति वर्ष)', 'ಪ್ಯಾಕೇಜ್ (ವರ್ಷಕ್ಕೆ ಲಕ್ಷ)'), 'number', 'o.ctc_lpa'),
      f('status', L_.status, 'text', 'o.status'),
      f('offered_on', l('Offered on', 'ऑफ़र तिथि', 'ಆಫರ್ ದಿನಾಂಕ'), 'date', 'o.offered_on'),
      f('is_accepted', l('Accepted', 'स्वीकृत', 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ'), 'bool', "o.status = 'accepted'"),
      ...studentFields(),
    ],
  },
  {
    key: 'exam_registrations',
    label: l('Exam registrations', 'परीक्षा पंजीकरण', 'ಪರೀಕ್ಷಾ ನೋಂದಣಿ'),
    description: l('One row per student registered for an exam session, with the hall ticket.', 'परीक्षा सत्र के लिए पंजीकृत प्रति छात्र एक पंक्ति, प्रवेश पत्र सहित।', 'ಪರೀಕ್ಷಾ ಅವಧಿಗೆ ನೋಂದಾಯಿತ ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿಗೆ ಒಂದು ಸಾಲು, ಪ್ರವೇಶ ಪತ್ರದೊಂದಿಗೆ.'),
    category: 'exams',
    roles: ACAD,
    from: 'exam_registrations r',
    base: 'r',
    joins: [
      { alias: 'es', sql: 'join exam_sessions es on es.id = r.session_id' },
      { alias: 's', sql: 'join students s on s.id = r.student_id' },
      ...classJoins('s.section_id'),
      { alias: 'ht', sql: 'left join hall_tickets ht on ht.session_id = r.session_id and ht.student_id = r.student_id' },
    ],
    classScoped: false,
    dateField: 'registered_on',
    detail: ['session', 'roll_no', 'student', 'class', 'status', 'hall_ticket_no', 'blocked_reason'],
    fields: [
      f('session', L_.session, 'text', 'es.name', { idExpr: 'es.id', picker: 'values' }),
      f('term', L_.term, 'int', 'es.term', { agg: false }),
      f('exam_kind', l('Exam kind', 'परीक्षा प्रकार', 'ಪರೀಕ್ಷೆಯ ಬಗೆ'), 'text', 'es.kind::text'),
      ...studentFields(),
      f('status', L_.status, 'text', 'r.status'),
      f('registered_on', l('Registered on', 'पंजीकरण तिथि', 'ನೋಂದಣಿ ದಿನಾಂಕ'), 'date', localDate('r.registered_at')),
      f('hall_ticket_no', l('Hall ticket', 'प्रवेश पत्र', 'ಪ್ರವೇಶ ಪತ್ರ'), 'text', "coalesce(ht.ticket_no, '')"),
      f('blocked', l('Hall ticket blocked', 'प्रवेश पत्र रोका गया', 'ಪ್ರವೇಶ ಪತ್ರ ತಡೆಹಿಡಿಯಲಾಗಿದೆ'), 'bool', 'coalesce(ht.blocked, false)'),
      f('blocked_reason', l('Reason blocked', 'रोकने का कारण', 'ತಡೆಹಿಡಿದ ಕಾರಣ'), 'text', "coalesce(ht.blocked_reason, '')"),
    ],
  },
  {
    key: 'timetable',
    label: l('Timetable periods', 'समय सारणी के कालांश', 'ವೇಳಾಪಟ್ಟಿಯ ಅವಧಿಗಳು'),
    description: l('One row per weekly period in the current timetable: class, subject, teacher and room.', 'वर्तमान समय सारणी में प्रति साप्ताहिक कालांश एक पंक्ति: कक्षा, विषय, शिक्षक और कमरा।', 'ಪ್ರಸ್ತುತ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಪ್ರತಿ ವಾರದ ಅವಧಿಗೆ ಒಂದು ಸಾಲು: ತರಗತಿ, ವಿಷಯ, ಶಿಕ್ಷಕ ಮತ್ತು ಕೊಠಡಿ.'),
    category: 'academics',
    roles: [...ACAD, 'teacher'],
    from: 'timetable_slots ts',
    base: 'ts',
    joins: [
      ...classJoins('ts.section_id'),
      { alias: 'sub', sql: 'join subjects sub on sub.id = ts.subject_id' },
      { alias: 'tu', sql: 'left join users tu on tu.id = ts.teacher_id' },
      { alias: 'rm', sql: 'left join rooms rm on rm.id = ts.room_id' },
    ],
    where: 'ts.archived_at is null',
    classScoped: true,
    detail: ['day', 'starts_at', 'class', 'subject', 'teacher', 'room'],
    fields: [
      ...classFields(),
      f('subject', L_.subject, 'text', 'sub.name', { idExpr: 'sub.id', picker: 'subject' }),
      f('teacher', l('Teacher', 'शिक्षक', 'ಶಿಕ್ಷಕ'), 'text', "coalesce(tu.full_name, 'Not assigned')"),
      f('day', l('Day', 'दिन', 'ದಿನ'), 'text', WEEKDAY, { sortExpr: 'ts.day_of_week' }),
      f('starts_at', l('Starts', 'आरंभ', 'ಆರಂಭ'), 'text', "to_char(ts.starts_at, 'HH24:MI')"),
      f('ends_at', l('Ends', 'समाप्ति', 'ಮುಕ್ತಾಯ'), 'text', "to_char(ts.ends_at, 'HH24:MI')"),
      f('hours', l('Hours', 'घंटे', 'ಗಂಟೆಗಳು'), 'number', 'round((extract(epoch from (ts.ends_at - ts.starts_at)) / 3600)::numeric, 2)'),
      f('room', l('Room', 'कमरा', 'ಕೊಠಡಿ'), 'text', "coalesce(rm.name, '')"),
    ],
  },
  {
    key: 'communication',
    label: l('Message deliveries', 'संदेश वितरण', 'ಸಂದೇಶ ವಿತರಣೆ'),
    description: l('One row per message sent to a person: campaign, channel, delivery and reading.', 'प्रति व्यक्ति भेजे गए संदेश की एक पंक्ति: अभियान, माध्यम, वितरण और पठन।', 'ಪ್ರತಿ ವ್ಯಕ್ತಿಗೆ ಕಳುಹಿಸಿದ ಸಂದೇಶಕ್ಕೆ ಒಂದು ಸಾಲು: ಅಭಿಯಾನ, ಮಾಧ್ಯಮ, ವಿತರಣೆ ಮತ್ತು ಓದುವಿಕೆ.'),
    category: 'communication',
    roles: MGMT,
    from: 'message_deliveries md',
    base: 'md',
    joins: [{ alias: 'mc', sql: 'left join message_campaigns mc on mc.id = md.campaign_id' }, { alias: 'u', sql: 'left join users u on u.id = md.user_id' }],
    classScoped: false,
    dateField: 'created_on',
    detail: ['campaign', 'recipient', 'channel', 'status', 'sent_on'],
    fields: [
      f('campaign', l('Campaign', 'अभियान', 'ಅಭಿಯಾನ'), 'text', "coalesce(mc.title, 'Direct')", { idExpr: 'mc.id', picker: 'values' }),
      f('recipient', l('Recipient', 'प्राप्तकर्ता', 'ಸ್ವೀಕರಿಸುವವರು'), 'text', "coalesce(u.full_name, '')"),
      f('channel', l('Channel', 'माध्यम', 'ಮಾಧ್ಯಮ'), 'text', 'md.channel'),
      f('status', L_.status, 'text', 'md.status'),
      f('created_on', l('Queued on', 'कतार तिथि', 'ಸರದಿ ದಿನಾಂಕ'), 'date', localDate('md.created_at')),
      f('sent_on', l('Sent on', 'भेजने की तिथि', 'ಕಳುಹಿಸಿದ ದಿನಾಂಕ'), 'date', localDate('md.sent_at')),
      f('is_delivered', l('Delivered', 'वितरित', 'ತಲುಪಿದೆ'), 'bool', "md.status in ('sent', 'read')"),
      f('is_read', l('Read', 'पढ़ा गया', 'ಓದಲಾಗಿದೆ'), 'bool', 'md.read_at is not null'),
      f('is_failed', l('Failed', 'विफल', 'ವಿಫಲ'), 'bool', "md.status = 'failed'"),
      f('attempts', l('Attempts', 'प्रयास', 'ಪ್ರಯತ್ನಗಳು'), 'int', 'md.attempts'),
    ],
  },
];

export const datasetByKey = (key: string): SemDataset | undefined => DATASETS.find((d) => d.key === key);

/** May these roles use the dataset at all? */
export const mayUseDataset = (ds: SemDataset, roles: readonly RoleName[]): boolean => ds.roles.some((r) => roles.includes(r));

/** May these roles see the field (it has no role list, or they hold one of its roles)? */
export const maySeeField = (fd: SemField, roles: readonly RoleName[]): boolean => !fd.roles || fd.roles.some((r) => roles.includes(r));

export const datasetsFor = (roles: readonly RoleName[]): SemDataset[] => DATASETS.filter((d) => mayUseDataset(d, roles));

/** Every role that uses some dataset: the people the report studio is for. */
export const STUDIO_ROLES: RoleName[] = [...new Set(DATASETS.flatMap((d) => d.roles))];

export const fieldAggregatable = (fd: { type: FieldType; agg?: boolean }): boolean => NUMERIC.includes(fd.type) && fd.agg !== false;
