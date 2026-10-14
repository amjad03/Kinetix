import type { RoleName } from '../auth/principal.js';
import { DefinitionSchema, rolesAllowed, type Definition } from './engine.js';
import { datasetByKey, l, type L } from './semantic.js';

/**
 * The report library: ready-made reports an Indian school or college office expects, each one an
 * ordinary builder definition, so any of them opens in the builder to be changed and saved as a
 * person's own. Who may run one follows from its dataset and the fields it reads.
 */

export const LIBRARY_CATEGORIES = ['students', 'admissions', 'attendance', 'exams', 'fees', 'hr', 'payroll', 'library', 'hostel', 'transport', 'inventory', 'placements', 'timetable', 'communication'] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export interface LibraryReport {
  key: string;
  category: LibraryCategory;
  dataset: string;
  title: L;
  description: L;
  definition: Definition;
  /** Roles that may run it: the dataset's, less any whose people may not see a field it reads. */
  roles: RoleName[];
}

type Input = Partial<Omit<Definition, 'chart'>> & { chart?: Definition['chart'] };
const t = (en: string, hi: string, kn: string) => l(en, hi, kn);
const ALL: { key: string; category: LibraryCategory; dataset: string; title: L; description: L; def: Input }[] = [];
const r = (key: string, category: LibraryCategory, dataset: string, title: L, description: L, def: Input) => ALL.push({ key, category, dataset, title, description, def });

const ACTIVE = { field: 'is_active', op: 'is_true' as const };
const THIS_AY = (field: string) => ({ field, op: 'relative' as const, value: 'this_academic_year' });
const LAST_30 = (field: string) => ({ field, op: 'relative' as const, value: 'last_30_days' });
const TODAY = (field: string) => ({ field, op: 'relative' as const, value: 'today' });
const THIS_MONTH = (field: string) => ({ field, op: 'relative' as const, value: 'this_month' });
const YES = (field: string) => ({ field, op: 'is_true' as const });

// ----- students ---------------------------------------------------------------------------------------

r('students.strength_by_class', 'students', 'students', t('Class-wise student strength', 'कक्षावार छात्र संख्या', 'ತರಗತಿವಾರು ವಿದ್ಯಾರ್ಥಿ ಸಂಖ್ಯೆ'), t('Active students in each class.', 'प्रत्येक कक्षा में सक्रिय छात्र।', 'ಪ್ರತಿ ತರಗತಿಯ ಸಕ್ರಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['class'], aggregates: [{ fn: 'count', label: 'Students' }], filters: [ACTIVE], chart: { type: 'bar', x: 'class', y: ['count'] },
});
r('students.category_enrolment', 'students', 'students', t('Category-wise enrolment (SC/ST/OBC/GM)', 'श्रेणीवार नामांकन (SC/ST/OBC/GM)', 'ವರ್ಗವಾರು ದಾಖಲಾತಿ (SC/ST/OBC/GM)'), t('Active students by program and social category.', 'कार्यक्रम और सामाजिक श्रेणी के अनुसार सक्रिय छात्र।', 'ಕಾರ್ಯಕ್ರಮ ಮತ್ತು ಸಾಮಾಜಿಕ ವರ್ಗದ ಪ್ರಕಾರ ಸಕ್ರಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['program'], pivot: { column: 'category' }, aggregates: [{ fn: 'count' }], filters: [ACTIVE], chart: { type: 'stacked', x: 'program' },
});
r('students.gender_ratio', 'students', 'students', t('Gender ratio by class', 'कक्षावार लिंग अनुपात', 'ತರಗತಿವಾರು ಲಿಂಗ ಅನುಪಾತ'), t('Boys, girls and others in each class.', 'प्रत्येक कक्षा में लड़के, लड़कियाँ और अन्य।', 'ಪ್ರತಿ ತರಗತಿಯಲ್ಲಿ ಹುಡುಗರು, ಹುಡುಗಿಯರು ಮತ್ತು ಇತರರು.'), {
  groupBy: ['class'], pivot: { column: 'gender' }, aggregates: [{ fn: 'count' }], filters: [ACTIVE], chart: { type: 'stacked100', x: 'class' },
});
r('students.new_admissions', 'students', 'students', t('New admissions this academic year', 'इस शैक्षणिक वर्ष के नए प्रवेश', 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷದ ಹೊಸ ಪ್ರವೇಶಗಳು'), t('Students who joined this academic year.', 'इस शैक्षणिक वर्ष में जुड़े छात्र।', 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷದಲ್ಲಿ ಸೇರಿದ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  columns: ['roll_no', 'student', 'class', 'program', 'gender', 'category', 'enrolled_on'], filters: [THIS_AY('enrolled_on')], sort: [{ field: 'enrolled_on', dir: 'desc' }],
});
r('students.directory', 'students', 'students', t('Student directory', 'छात्र निर्देशिका', 'ವಿದ್ಯಾರ್ಥಿ ಪಟ್ಟಿ'), t('Every active student by class and roll number.', 'कक्षा और रोल नंबर के अनुसार सभी सक्रिय छात्र।', 'ತರಗತಿ ಮತ್ತು ರೋಲ್ ಸಂಖ್ಯೆಯ ಪ್ರಕಾರ ಎಲ್ಲಾ ಸಕ್ರಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  columns: ['class', 'roll_no', 'student', 'program', 'gender', 'category', 'status'], filters: [ACTIVE], sort: [{ field: 'class', dir: 'asc' }, { field: 'roll_no', dir: 'asc' }], limit: 5000,
});
r('students.by_status', 'students', 'students', t('Students by status', 'स्थिति के अनुसार छात्र', 'ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ವಿದ್ಯಾರ್ಥಿಗಳು'), t('Active, left, passed out and other students.', 'सक्रिय, छोड़ चुके, उत्तीर्ण और अन्य छात्र।', 'ಸಕ್ರಿಯ, ತೊರೆದ, ತೇರ್ಗಡೆಯಾದ ಮತ್ತು ಇತರ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['status'], aggregates: [{ fn: 'count' }, { fn: 'pct' }], chart: { type: 'donut', x: 'status', y: ['count'] },
});
r('students.campus_program', 'students', 'students', t('Strength by campus and program', 'परिसर और कार्यक्रम के अनुसार संख्या', 'ಕ್ಯಾಂಪಸ್ ಮತ್ತು ಕಾರ್ಯಕ್ರಮದ ಪ್ರಕಾರ ಸಂಖ್ಯೆ'), t('Active students in each program of each campus.', 'प्रत्येक परिसर के प्रत्येक कार्यक्रम में सक्रिय छात्र।', 'ಪ್ರತಿ ಕ್ಯಾಂಪಸ್‌ನ ಪ್ರತಿ ಕಾರ್ಯಕ್ರಮದ ಸಕ್ರಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['campus', 'program'], aggregates: [{ fn: 'count' }], filters: [ACTIVE], chart: { type: 'hbar', x: 'program', y: ['count'] },
});
r('students.category_gender', 'students', 'students', t('Category and gender cross-tab', 'श्रेणी और लिंग तालिका', 'ವರ್ಗ ಮತ್ತು ಲಿಂಗ ಕೋಷ್ಟಕ'), t('Active students by social category and gender.', 'सामाजिक श्रेणी और लिंग के अनुसार सक्रिय छात्र।', 'ಸಾಮಾಜಿಕ ವರ್ಗ ಮತ್ತು ಲಿಂಗದ ಪ್ರಕಾರ ಸಕ್ರಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['category'], pivot: { column: 'gender' }, aggregates: [{ fn: 'count' }], filters: [ACTIVE], chart: { type: 'stacked', x: 'category' },
});

// ----- admissions -------------------------------------------------------------------------------------

r('admissions.funnel', 'admissions', 'admissions', t('Admission funnel', 'प्रवेश फ़नल', 'ಪ್ರವೇಶ ಕೊಳವೆ'), t('Applications at each stage, from submitted to enrolled.', 'जमा से नामांकन तक प्रत्येक चरण के आवेदन।', 'ಸಲ್ಲಿಕೆಯಿಂದ ದಾಖಲಾತಿಯವರೆಗೆ ಪ್ರತಿ ಹಂತದ ಅರ್ಜಿಗಳು.'), {
  groupBy: ['status'], aggregates: [{ fn: 'count' }, { fn: 'pct' }], chart: { type: 'hbar', x: 'status', y: ['count'], showValues: true },
});
r('admissions.by_program', 'admissions', 'admissions', t('Applications by program and stage', 'कार्यक्रम और चरण के अनुसार आवेदन', 'ಕಾರ್ಯಕ್ರಮ ಮತ್ತು ಹಂತದ ಪ್ರಕಾರ ಅರ್ಜಿಗಳು'), t('Where each program’s applications stand.', 'प्रत्येक कार्यक्रम के आवेदन किस चरण में हैं।', 'ಪ್ರತಿ ಕಾರ್ಯಕ್ರಮದ ಅರ್ಜಿಗಳು ಯಾವ ಹಂತದಲ್ಲಿವೆ.'), {
  groupBy: ['program'], pivot: { column: 'status' }, aggregates: [{ fn: 'count' }], chart: { type: 'stacked', x: 'program' },
});
r('admissions.category', 'admissions', 'admissions', t('Category-wise applications', 'श्रेणीवार आवेदन', 'ವರ್ಗವಾರು ಅರ್ಜಿಗಳು'), t('Applications, offers and enrolments by social category.', 'सामाजिक श्रेणी के अनुसार आवेदन, प्रस्ताव और नामांकन।', 'ಸಾಮಾಜಿಕ ವರ್ಗದ ಪ್ರಕಾರ ಅರ್ಜಿ, ಆಫರ್ ಮತ್ತು ದಾಖಲಾತಿ.'), {
  groupBy: ['category'], aggregates: [{ fn: 'count' }, { fn: 'pct_true', field: 'is_offered', label: 'Offered %' }, { fn: 'pct_true', field: 'is_enrolled', label: 'Enrolled %' }], chart: { type: 'bar', x: 'category', y: ['count'] },
});
r('admissions.daily_trend', 'admissions', 'admissions', t('Applications per day (last 30 days)', 'प्रतिदिन आवेदन (पिछले 30 दिन)', 'ದಿನಕ್ಕೆ ಅರ್ಜಿಗಳು (ಕಳೆದ 30 ದಿನ)'), t('How many applications came in each day.', 'प्रतिदिन कितने आवेदन आए।', 'ಪ್ರತಿ ದಿನ ಎಷ್ಟು ಅರ್ಜಿಗಳು ಬಂದವು.'), {
  groupBy: ['submitted_on:day'], aggregates: [{ fn: 'count' }], filters: [LAST_30('submitted_on')], chart: { type: 'line', x: 'submitted_on__day', y: ['count'] },
});
r('admissions.merit_list', 'admissions', 'admissions', t('Merit list', 'मेरिट सूची', 'ಮೆರಿಟ್ ಪಟ್ಟಿ'), t('Ranked applicants by program.', 'कार्यक्रम के अनुसार रैंक किए गए आवेदक।', 'ಕಾರ್ಯಕ್ರಮದ ಪ್ರಕಾರ ಶ್ರೇಣೀಕೃತ ಅರ್ಜಿದಾರರು.'), {
  columns: ['program', 'merit_rank', 'application_no', 'applicant', 'category', 'merit_score', 'status'], filters: [{ field: 'merit_rank', op: 'not_null' }], sort: [{ field: 'program', dir: 'asc' }, { field: 'merit_rank', dir: 'asc' }], limit: 5000,
});
r('enquiries.source', 'admissions', 'enquiries', t('Enquiries by source', 'स्रोत के अनुसार पूछताछ', 'ಮೂಲದ ಪ್ರಕಾರ ವಿಚಾರಣೆಗಳು'), t('Where leads come from and how many convert.', 'लीड कहाँ से आती हैं और कितनी परिवर्तित होती हैं।', 'ಲೀಡ್‌ಗಳು ಎಲ್ಲಿಂದ ಬರುತ್ತವೆ ಮತ್ತು ಎಷ್ಟು ಪರಿವರ್ತನೆಯಾಗುತ್ತವೆ.'), {
  groupBy: ['source'], aggregates: [{ fn: 'count' }, { fn: 'pct_true', field: 'converted', label: 'Conversion %' }], chart: { type: 'donut', x: 'source', y: ['count'] },
});
r('enquiries.pipeline', 'admissions', 'enquiries', t('Enquiry pipeline', 'पूछताछ पाइपलाइन', 'ವಿಚಾರಣೆ ಹಂತಗಳು'), t('Enquiries at each stage this academic year.', 'इस शैक्षणिक वर्ष प्रत्येक चरण की पूछताछ।', 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷ ಪ್ರತಿ ಹಂತದ ವಿಚಾರಣೆಗಳು.'), {
  groupBy: ['stage'], aggregates: [{ fn: 'count' }], filters: [THIS_AY('created_on')], chart: { type: 'hbar', x: 'stage', y: ['count'], showValues: true },
});
r('enquiries.follow_ups_due', 'admissions', 'enquiries', t('Follow-ups due today', 'आज के अनुवर्ती', 'ಇಂದಿನ ಮುಂದಿನ ಸಂಪರ್ಕಗಳು'), t('Open enquiries to call back today.', 'आज वापस कॉल करने वाली खुली पूछताछ।', 'ಇಂದು ಮರಳಿ ಕರೆ ಮಾಡಬೇಕಾದ ತೆರೆದ ವಿಚಾರಣೆಗಳು.'), {
  columns: ['name', 'phone', 'program', 'stage', 'counsellor', 'next_follow_up_on'], filters: [TODAY('next_follow_up_on'), { field: 'stage', op: 'not_in', value: ['converted', 'lost'] }], sort: [{ field: 'counsellor', dir: 'asc' }],
});
r('enquiries.counsellor', 'admissions', 'enquiries', t('Counsellor performance', 'परामर्शदाता प्रदर्शन', 'ಸಲಹೆಗಾರರ ಸಾಧನೆ'), t('Enquiries handled and converted by each counsellor.', 'प्रत्येक परामर्शदाता द्वारा संभाली और परिवर्तित पूछताछ।', 'ಪ್ರತಿ ಸಲಹೆಗಾರರು ನಿರ್ವಹಿಸಿದ ಮತ್ತು ಪರಿವರ್ತಿಸಿದ ವಿಚಾರಣೆಗಳು.'), {
  groupBy: ['counsellor'], aggregates: [{ fn: 'count' }, { fn: 'pct_true', field: 'converted', label: 'Conversion %' }], sort: [{ field: 'count', dir: 'desc' }], chart: { type: 'hbar', x: 'counsellor', y: ['count'] },
});

// ----- attendance -------------------------------------------------------------------------------------

const ATT_TONES = [
  { column: 'pct_true_is_present', op: 'lt' as const, value: 65, tone: 'red' as const, style: 'fill' as const },
  { column: 'pct_true_is_present', op: 'between' as const, value: 65, value2: 74.99, tone: 'amber' as const, style: 'fill' as const },
];
r('attendance.shortage', 'attendance', 'attendance', t('Attendance shortage list (below 75%)', 'उपस्थिति कमी सूची (75% से कम)', 'ಹಾಜರಾತಿ ಕೊರತೆ ಪಟ್ಟಿ (75% ಕ್ಕಿಂತ ಕಡಿಮೆ)'), t('Students under 75% attendance this academic year.', 'इस शैक्षणिक वर्ष 75% से कम उपस्थिति वाले छात्र।', 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷ 75% ಕ್ಕಿಂತ ಕಡಿಮೆ ಹಾಜರಾತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['class', 'roll_no', 'student'], aggregates: [{ fn: 'count', label: 'Marks' }, { fn: 'pct_true', field: 'is_present', label: 'Attendance %' }], having: [{ field: 'pct_true_is_present', op: 'lt', value: 75 }], filters: [THIS_AY('date')], sort: [{ field: 'pct_true_is_present', dir: 'asc' }], formatting: ATT_TONES, limit: 5000,
});
r('attendance.class_wise', 'attendance', 'attendance', t('Class-wise attendance %', 'कक्षावार उपस्थिति %', 'ತರಗತಿವಾರು ಹಾಜರಾತಿ %'), t('Attendance rate of each class over the last 30 days.', 'पिछले 30 दिनों में प्रत्येक कक्षा की उपस्थिति दर।', 'ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ ಪ್ರತಿ ತರಗತಿಯ ಹಾಜರಾತಿ ದರ.'), {
  groupBy: ['class'], aggregates: [{ fn: 'pct_true', field: 'is_present', label: 'Attendance %' }, { fn: 'count', label: 'Marks' }], filters: [LAST_30('date')], formatting: ATT_TONES, chart: { type: 'bar', x: 'class', y: ['pct_true_is_present'] },
});
r('attendance.daily_trend', 'attendance', 'attendance', t('Daily attendance trend', 'दैनिक उपस्थिति रुझान', 'ದೈನಂದಿನ ಹಾಜರಾತಿ ಪ್ರವೃತ್ತಿ'), t('Institution-wide attendance % for each of the last 30 days.', 'पिछले 30 दिनों में प्रतिदिन संस्थान की उपस्थिति %।', 'ಕಳೆದ 30 ದಿನಗಳ ಪ್ರತಿ ದಿನದ ಸಂಸ್ಥೆಯ ಹಾಜರಾತಿ %.'), {
  groupBy: ['date:day'], aggregates: [{ fn: 'pct_true', field: 'is_present', label: 'Attendance %' }], filters: [LAST_30('date')], chart: { type: 'line', x: 'date__day', y: ['pct_true_is_present'] },
});
r('attendance.monthly_class', 'attendance', 'attendance', t('Monthly attendance by class', 'कक्षावार मासिक उपस्थिति', 'ತರಗತಿವಾರು ಮಾಸಿಕ ಹಾಜರಾತಿ'), t('Attendance % of each class, month by month this academic year.', 'इस शैक्षणिक वर्ष में प्रत्येक कक्षा की मासिक उपस्थिति %।', 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷ ಪ್ರತಿ ತರಗತಿಯ ತಿಂಗಳವಾರು ಹಾಜರಾತಿ %.'), {
  groupBy: ['class'], pivot: { column: 'date:month' }, aggregates: [{ fn: 'pct_true', field: 'is_present' }], filters: [THIS_AY('date')], chart: { type: 'table' },
});
r('attendance.absentees_today', 'attendance', 'attendance', t('Absentees today', 'आज के अनुपस्थित', 'ಇಂದಿನ ಗೈರುಹಾಜರಿಗಳು'), t('Students marked absent today.', 'आज अनुपस्थित चिह्नित छात्र।', 'ಇಂದು ಗೈರು ಎಂದು ಗುರುತಿಸಿದ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  columns: ['class', 'roll_no', 'student', 'subject', 'status'], filters: [TODAY('date'), YES('is_absent')], sort: [{ field: 'class', dir: 'asc' }, { field: 'roll_no', dir: 'asc' }],
});
r('attendance.chronic_absentees', 'attendance', 'attendance', t('Frequently absent (5+ in 30 days)', 'बार-बार अनुपस्थित (30 दिनों में 5+)', 'ಪದೇ ಪದೇ ಗೈರು (30 ದಿನಗಳಲ್ಲಿ 5+)'), t('Students absent five or more times in the last 30 days.', 'पिछले 30 दिनों में पाँच या अधिक बार अनुपस्थित छात्र।', 'ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ ಐದು ಅಥವಾ ಹೆಚ್ಚು ಬಾರಿ ಗೈರಾದ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['class', 'roll_no', 'student'], aggregates: [{ fn: 'count', label: 'Absences' }], filters: [LAST_30('date'), YES('is_absent')], having: [{ field: 'count', op: 'gte', value: 5 }], sort: [{ field: 'count', dir: 'desc' }],
});
r('attendance.subject_wise', 'attendance', 'attendance', t('Subject-wise attendance %', 'विषयवार उपस्थिति %', 'ವಿಷಯವಾರು ಹಾಜರಾತಿ %'), t('Attendance in each subject’s periods over the last 30 days.', 'पिछले 30 दिनों में प्रत्येक विषय के कालांश में उपस्थिति।', 'ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ ಪ್ರತಿ ವಿಷಯದ ಅವಧಿಗಳ ಹಾಜರಾತಿ.'), {
  groupBy: ['subject'], aggregates: [{ fn: 'pct_true', field: 'is_present', label: 'Attendance %' }], filters: [LAST_30('date')], formatting: ATT_TONES, chart: { type: 'hbar', x: 'subject', y: ['pct_true_is_present'] },
});

// ----- marks and results ------------------------------------------------------------------------------

r('marks.assessment_average', 'exams', 'marks', t('Assessment-wise class average', 'मूल्यांकनवार कक्षा औसत', 'ಮೌಲ್ಯಮಾಪನವಾರು ತರಗತಿ ಸರಾಸರಿ'), t('Average percent of each class in each assessment.', 'प्रत्येक मूल्यांकन में प्रत्येक कक्षा का औसत प्रतिशत।', 'ಪ್ರತಿ ಮೌಲ್ಯಮಾಪನದಲ್ಲಿ ಪ್ರತಿ ತರಗತಿಯ ಸರಾಸರಿ ಶೇಕಡಾ.'), {
  groupBy: ['class', 'subject', 'assessment'], aggregates: [{ fn: 'avg', field: 'percent', label: 'Average %' }, { fn: 'count', label: 'Students' }], filters: [{ field: 'absent', op: 'is_false' }],
});
r('marks.below_40', 'exams', 'marks', t('Students below 40% in assessments', 'मूल्यांकन में 40% से कम छात्र', 'ಮೌಲ್ಯಮಾಪನದಲ್ಲಿ 40% ಕ್ಕಿಂತ ಕಡಿಮೆ ವಿದ್ಯಾರ್ಥಿಗಳು'), t('Marks under 40% in any assessment, lowest first.', 'किसी भी मूल्यांकन में 40% से कम अंक, सबसे कम पहले।', 'ಯಾವುದೇ ಮೌಲ್ಯಮಾಪನದಲ್ಲಿ 40% ಕ್ಕಿಂತ ಕಡಿಮೆ ಅಂಕ, ಕನಿಷ್ಠ ಮೊದಲು.'), {
  columns: ['class', 'roll_no', 'student', 'subject', 'assessment', 'marks', 'max_marks', 'percent'], filters: [{ field: 'percent', op: 'lt', value: 40 }, { field: 'absent', op: 'is_false' }], sort: [{ field: 'percent', dir: 'asc' }],
});
r('marks.subject_average', 'exams', 'marks', t('Subject-wise average marks', 'विषयवार औसत अंक', 'ವಿಷಯವಾರು ಸರಾಸರಿ ಅಂಕ'), t('Average, highest and lowest percent in each subject.', 'प्रत्येक विषय में औसत, उच्चतम और न्यूनतम प्रतिशत।', 'ಪ್ರತಿ ವಿಷಯದಲ್ಲಿ ಸರಾಸರಿ, ಗರಿಷ್ಠ ಮತ್ತು ಕನಿಷ್ಠ ಶೇಕಡಾ.'), {
  groupBy: ['subject'], aggregates: [{ fn: 'avg', field: 'percent', label: 'Average %' }, { fn: 'max', field: 'percent', label: 'Highest %' }, { fn: 'min', field: 'percent', label: 'Lowest %' }], filters: [{ field: 'absent', op: 'is_false' }], chart: { type: 'hbar', x: 'subject', y: ['avg_percent'] },
});
const PASS_TONES = [{ column: 'pct_true_passed', op: 'lt' as const, value: 60, tone: 'red' as const, style: 'fill' as const }, { column: 'pct_true_passed', op: 'gte' as const, value: 90, tone: 'green' as const, style: 'fill' as const }];
r('results.subject_analysis', 'exams', 'results', t('Subject-wise result analysis', 'विषयवार परिणाम विश्लेषण', 'ವಿಷಯವಾರು ಫಲಿತಾಂಶ ವಿಶ್ಲೇಷಣೆ'), t('Appeared, passed, failed, pass % and average in each subject.', 'प्रत्येक विषय में उपस्थित, उत्तीर्ण, अनुत्तीर्ण, उत्तीर्ण % और औसत।', 'ಪ್ರತಿ ವಿಷಯದಲ್ಲಿ ಹಾಜರಾದವರು, ತೇರ್ಗಡೆ, ಅನುತ್ತೀರ್ಣ, ತೇರ್ಗಡೆ % ಮತ್ತು ಸರಾಸರಿ.'), {
  calculated: [{ key: 'passed_count', label: 'Passed', expr: 'count_if(passed)', kind: 'measure' }, { key: 'failed_count', label: 'Failed', expr: 'count_if(failed)', kind: 'measure' }],
  groupBy: ['subject'],
  aggregates: [{ fn: 'count', label: 'Appeared' }, { fn: 'measure', field: 'passed_count' }, { fn: 'measure', field: 'failed_count' }, { fn: 'pct_true', field: 'passed', label: 'Pass %' }, { fn: 'avg', field: 'percent', label: 'Average %' }, { fn: 'max', field: 'percent', label: 'Highest %' }],
  formatting: PASS_TONES,
  chart: { type: 'bar', x: 'subject', y: ['pct_true_passed'] },
});
r('results.pass_by_section', 'exams', 'results', t('Pass % by section', 'अनुभागवार उत्तीर्ण %', 'ವಿಭಾಗವಾರು ತೇರ್ಗಡೆ %'), t('Share of subject results passed in each class.', 'प्रत्येक कक्षा में उत्तीर्ण विषय परिणामों का हिस्सा।', 'ಪ್ರತಿ ತರಗತಿಯಲ್ಲಿ ತೇರ್ಗಡೆಯಾದ ವಿಷಯ ಫಲಿತಾಂಶಗಳ ಪಾಲು.'), {
  groupBy: ['class'], aggregates: [{ fn: 'pct_true', field: 'passed', label: 'Pass %' }, { fn: 'count', label: 'Results' }], formatting: PASS_TONES, chart: { type: 'bar', x: 'class', y: ['pct_true_passed'] },
});
r('results.grade_distribution', 'exams', 'results', t('Grade distribution by subject', 'विषयवार ग्रेड वितरण', 'ವಿಷಯವಾರು ಗ್ರೇಡ್ ಹಂಚಿಕೆ'), t('How many students got each grade in each subject.', 'प्रत्येक विषय में प्रत्येक ग्रेड पाने वाले छात्र।', 'ಪ್ರತಿ ವಿಷಯದಲ್ಲಿ ಪ್ರತಿ ಗ್ರೇಡ್ ಪಡೆದ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['subject'], pivot: { column: 'grade' }, aggregates: [{ fn: 'count' }], chart: { type: 'stacked100', x: 'subject' },
});
r('results.failures', 'exams', 'results', t('Subject failure list', 'विषय अनुत्तीर्ण सूची', 'ವಿಷಯ ಅನುತ್ತೀರ್ಣ ಪಟ್ಟಿ'), t('Every student and subject not passed.', 'हर छात्र और विषय जो उत्तीर्ण नहीं हुआ।', 'ತೇರ್ಗಡೆಯಾಗದ ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿ ಮತ್ತು ವಿಷಯ.'), {
  columns: ['class', 'roll_no', 'student', 'session', 'subject', 'percent', 'grade'], filters: [YES('failed')], sort: [{ field: 'class', dir: 'asc' }, { field: 'roll_no', dir: 'asc' }],
});
r('results.department', 'exams', 'results', t('Department-wise pass %', 'विभागवार उत्तीर्ण %', 'ವಿಭಾಗವಾರು ತೇರ್ಗಡೆ %'), t('Pass % and average percent of the subjects each department teaches.', 'प्रत्येक विभाग के विषयों का उत्तीर्ण % और औसत प्रतिशत।', 'ಪ್ರತಿ ವಿಭಾಗದ ವಿಷಯಗಳ ತೇರ್ಗಡೆ % ಮತ್ತು ಸರಾಸರಿ ಶೇಕಡಾ.'), {
  groupBy: ['department'], aggregates: [{ fn: 'pct_true', field: 'passed', label: 'Pass %' }, { fn: 'avg', field: 'percent', label: 'Average %' }], formatting: PASS_TONES, chart: { type: 'bar', x: 'department', y: ['pct_true_passed'] },
});
r('semester_results.toppers', 'exams', 'semester_results', t('Toppers (top 10 by SGPA)', 'टॉपर्स (एसजीपीए से शीर्ष 10)', 'ಟಾಪರ್‌ಗಳು (ಎಸ್‌ಜಿಪಿಎ ಪ್ರಕಾರ ಮೊದಲ 10)'), t('The ten highest SGPAs in published results.', 'प्रकाशित परिणामों में दस सर्वोच्च एसजीपीए।', 'ಪ್ರಕಟಿತ ಫಲಿತಾಂಶಗಳಲ್ಲಿ ಹತ್ತು ಗರಿಷ್ಠ ಎಸ್‌ಜಿಪಿಎ.'), {
  columns: ['roll_no', 'student', 'class', 'session', 'sgpa', 'cgpa'], sort: [{ field: 'sgpa', dir: 'desc' }, { field: 'cgpa', dir: 'desc' }], limit: 10, totals: false,
});
r('semester_results.class_summary', 'exams', 'semester_results', t('Class-wise SGPA summary', 'कक्षावार एसजीपीए सारांश', 'ತರಗತಿವಾರು ಎಸ್‌ಜಿಪಿಎ ಸಾರಾಂಶ'), t('Average, highest and lowest SGPA and pass % of each class.', 'प्रत्येक कक्षा का औसत, उच्चतम, न्यूनतम एसजीपीए और उत्तीर्ण %।', 'ಪ್ರತಿ ತರಗತಿಯ ಸರಾಸರಿ, ಗರಿಷ್ಠ, ಕನಿಷ್ಠ ಎಸ್‌ಜಿಪಿಎ ಮತ್ತು ತೇರ್ಗಡೆ %.'), {
  groupBy: ['session', 'class'], aggregates: [{ fn: 'count', label: 'Students' }, { fn: 'avg', field: 'sgpa', label: 'Average SGPA' }, { fn: 'max', field: 'sgpa', label: 'Highest SGPA' }, { fn: 'min', field: 'sgpa', label: 'Lowest SGPA' }, { fn: 'pct_true', field: 'passed', label: 'Pass %' }], formatting: PASS_TONES,
});
r('exam_registrations.status', 'exams', 'exam_registrations', t('Exam registration status', 'परीक्षा पंजीकरण स्थिति', 'ಪರೀಕ್ಷಾ ನೋಂದಣಿ ಸ್ಥಿತಿ'), t('Registered and ineligible students per class and session.', 'प्रति कक्षा और सत्र पंजीकृत और अयोग्य छात्र।', 'ಪ್ರತಿ ತರಗತಿ ಮತ್ತು ಅವಧಿಯ ನೋಂದಾಯಿತ ಮತ್ತು ಅನರ್ಹ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['session', 'class'], pivot: { column: 'status' }, aggregates: [{ fn: 'count' }],
});
r('exam_registrations.blocked', 'exams', 'exam_registrations', t('Blocked hall tickets', 'रोके गए प्रवेश पत्र', 'ತಡೆಹಿಡಿದ ಪ್ರವೇಶ ಪತ್ರಗಳು'), t('Students whose hall ticket is blocked, and why.', 'जिन छात्रों के प्रवेश पत्र रोके गए और क्यों।', 'ಪ್ರವೇಶ ಪತ್ರ ತಡೆಹಿಡಿದ ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಕಾರಣ.'), {
  columns: ['session', 'class', 'roll_no', 'student', 'blocked_reason'], filters: [YES('blocked')], sort: [{ field: 'class', dir: 'asc' }, { field: 'roll_no', dir: 'asc' }],
});

// ----- fees -------------------------------------------------------------------------------------------

r('fees.dues_ageing', 'fees', 'fees', t('Fee dues ageing', 'शुल्क बकाया अवधि विश्लेषण', 'ಶುಲ್ಕ ಬಾಕಿ ಅವಧಿ ವಿಶ್ಲೇಷಣೆ'), t('Unpaid balance of each class by how long it is overdue.', 'प्रत्येक कक्षा का बकाया, कितने समय से अतिदेय है उसके अनुसार।', 'ಪ್ರತಿ ತರಗತಿಯ ಬಾಕಿ, ಎಷ್ಟು ಕಾಲದಿಂದ ಮೀರಿದೆ ಎಂಬುದರ ಪ್ರಕಾರ.'), {
  groupBy: ['class'], pivot: { column: 'ageing' }, aggregates: [{ fn: 'sum', field: 'balance' }], filters: [{ field: 'status', op: 'eq', value: 'due' }, { field: 'balance', op: 'gt', value: 0 }], chart: { type: 'stacked', x: 'class' },
});
r('fees.defaulters', 'fees', 'fees', t('Fee defaulters', 'शुल्क बकायादार', 'ಶುಲ್ಕ ಬಾಕಿದಾರರು'), t('Students with fees past the due date, longest overdue first.', 'नियत तिथि के बाद बकाया वाले छात्र, सबसे पुराने पहले।', 'ಗಡುವು ಮೀರಿದ ಶುಲ್ಕವಿರುವ ವಿದ್ಯಾರ್ಥಿಗಳು, ಹಳೆಯದು ಮೊದಲು.'), {
  columns: ['class', 'roll_no', 'student', 'title', 'due_on', 'days_overdue', 'balance'], filters: [YES('is_overdue')], sort: [{ field: 'days_overdue', dir: 'desc' }], limit: 5000,
  formatting: [{ column: 'days_overdue', op: 'gt', value: 90, tone: 'red', style: 'fill' }, { column: 'days_overdue', op: 'between', value: 31, value2: 90, tone: 'amber', style: 'fill' }],
});
r('fees.collection_summary', 'fees', 'fees', t('Class-wise fee collection summary', 'कक्षावार शुल्क संग्रह सारांश', 'ತರಗತಿವಾರು ಶುಲ್ಕ ಸಂಗ್ರಹ ಸಾರಾಂಶ'), t('Billed, collected and balance for each class, with the share collected.', 'प्रत्येक कक्षा का बिल, संग्रह और शेष, संग्रह प्रतिशत सहित।', 'ಪ್ರತಿ ತರಗತಿಯ ಬಿಲ್, ಸಂಗ್ರಹ ಮತ್ತು ಬಾಕಿ, ಸಂಗ್ರಹ ಶೇಕಡಾದೊಂದಿಗೆ.'), {
  calculated: [{ key: 'collected_pct', label: 'Collected %', expr: 'percent(sum(paid), sum(amount))', kind: 'measure' }],
  groupBy: ['class'], aggregates: [{ fn: 'sum', field: 'amount' }, { fn: 'sum', field: 'paid' }, { fn: 'sum', field: 'balance' }, { fn: 'measure', field: 'collected_pct' }], filters: [{ field: 'status', op: 'neq', value: 'cancelled' }],
  formatting: [{ column: 'collected_pct', op: 'lt', value: 50, tone: 'red', style: 'fill' }, { column: 'collected_pct', op: 'gte', value: 90, tone: 'green', style: 'fill' }],
  chart: { type: 'bar', x: 'class', y: ['sum_paid', 'sum_balance'] },
});
r('fees.outstanding_by_head', 'fees', 'fees', t('Outstanding by fee head', 'शुल्क मद के अनुसार बकाया', 'ಶುಲ್ಕ ಶೀರ್ಷಿಕೆಯ ಪ್ರಕಾರ ಬಾಕಿ'), t('Unpaid balance of tuition, transport, hostel and other heads.', 'शिक्षण, परिवहन, छात्रावास और अन्य मदों का बकाया।', 'ಬೋಧನೆ, ಸಾರಿಗೆ, ವಸತಿ ಮತ್ತು ಇತರ ಶೀರ್ಷಿಕೆಗಳ ಬಾಕಿ.'), {
  groupBy: ['title'], aggregates: [{ fn: 'sum', field: 'balance' }, { fn: 'count', label: 'Invoices' }], filters: [{ field: 'status', op: 'eq', value: 'due' }, { field: 'balance', op: 'gt', value: 0 }], sort: [{ field: 'sum_balance', dir: 'desc' }], chart: { type: 'hbar', x: 'title', y: ['sum_balance'] },
});
r('fees.invoice_status', 'fees', 'fees', t('Invoices by status', 'स्थिति के अनुसार चालान', 'ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ಇನ್‌ವಾಯ್ಸ್‌ಗಳು'), t('Due, paid and cancelled invoices and their amounts.', 'देय, भुगतान और रद्द चालान और उनकी राशि।', 'ಬಾಕಿ, ಪಾವತಿಸಿದ ಮತ್ತು ರದ್ದಾದ ಇನ್‌ವಾಯ್ಸ್‌ಗಳು ಮತ್ತು ಮೊತ್ತ.'), {
  groupBy: ['status'], aggregates: [{ fn: 'count' }, { fn: 'sum', field: 'amount' }], chart: { type: 'donut', x: 'status', y: ['sum_amount'] },
});
r('fees.due_this_month', 'fees', 'fees', t('Fees due this month', 'इस महीने देय शुल्क', 'ಈ ತಿಂಗಳ ಬಾಕಿ ಶುಲ್ಕ'), t('Unpaid invoices falling due this month.', 'इस महीने देय अवैतनिक चालान।', 'ಈ ತಿಂಗಳು ಗಡುವಿರುವ ಪಾವತಿಯಾಗದ ಇನ್‌ವಾಯ್ಸ್‌ಗಳು.'), {
  columns: ['due_on', 'class', 'roll_no', 'student', 'title', 'amount', 'paid', 'balance'], filters: [THIS_MONTH('due_on'), { field: 'balance', op: 'gt', value: 0 }, { field: 'status', op: 'eq', value: 'due' }], sort: [{ field: 'due_on', dir: 'asc' }],
});
r('fees.category_dues', 'fees', 'fees', t('Dues by student category', 'छात्र श्रेणी के अनुसार बकाया', 'ವಿದ್ಯಾರ್ಥಿ ವರ್ಗದ ಪ್ರಕಾರ ಬಾಕಿ'), t('Billed and unpaid fees by social category.', 'सामाजिक श्रेणी के अनुसार बिल और बकाया शुल्क।', 'ಸಾಮಾಜಿಕ ವರ್ಗದ ಪ್ರಕಾರ ಬಿಲ್ ಮತ್ತು ಬಾಕಿ ಶುಲ್ಕ.'), {
  groupBy: ['category'], aggregates: [{ fn: 'sum', field: 'amount' }, { fn: 'sum', field: 'balance' }], filters: [{ field: 'status', op: 'neq', value: 'cancelled' }], chart: { type: 'bar', x: 'category', y: ['sum_amount', 'sum_balance'] },
});
r('fees.program_dues', 'fees', 'fees', t('Outstanding by program', 'कार्यक्रम के अनुसार बकाया', 'ಕಾರ್ಯಕ್ರಮದ ಪ್ರಕಾರ ಬಾಕಿ'), t('Unpaid balance and students owing in each program.', 'प्रत्येक कार्यक्रम में बकाया और देनदार छात्र।', 'ಪ್ರತಿ ಕಾರ್ಯಕ್ರಮದ ಬಾಕಿ ಮತ್ತು ಬಾಕಿ ಉಳಿಸಿದ ವಿದ್ಯಾರ್ಥಿಗಳು.'), {
  groupBy: ['program'], aggregates: [{ fn: 'sum', field: 'balance' }, { fn: 'count_distinct', field: 'roll_no', label: 'Students' }], filters: [{ field: 'status', op: 'eq', value: 'due' }, { field: 'balance', op: 'gt', value: 0 }], sort: [{ field: 'sum_balance', dir: 'desc' }], chart: { type: 'hbar', x: 'program', y: ['sum_balance'] },
});
r('collections.daily', 'fees', 'collections', t('Daily collection report', 'दैनिक संग्रह रिपोर्ट', 'ದೈನಂದಿನ ಸಂಗ್ರಹ ವರದಿ'), t('Every receipt issued today, with the total.', 'आज जारी हर रसीद, कुल सहित।', 'ಇಂದು ನೀಡಿದ ಪ್ರತಿ ರಸೀದಿ, ಒಟ್ಟು ಮೊತ್ತದೊಂದಿಗೆ.'), {
  columns: ['receipt_no', 'paid_on', 'roll_no', 'student', 'class', 'fee', 'method', 'collected_by', 'amount'], filters: [TODAY('paid_on')], sort: [{ field: 'receipt_no', dir: 'asc' }], limit: 5000,
});
r('collections.day_wise', 'fees', 'collections', t('Day-wise collection (last 30 days)', 'दिनवार संग्रह (पिछले 30 दिन)', 'ದಿನವಾರು ಸಂಗ್ರಹ (ಕಳೆದ 30 ದಿನ)'), t('Amount collected each day.', 'प्रतिदिन संग्रहित राशि।', 'ಪ್ರತಿ ದಿನ ಸಂಗ್ರಹಿಸಿದ ಮೊತ್ತ.'), {
  groupBy: ['paid_on:day'], aggregates: [{ fn: 'sum', field: 'amount' }, { fn: 'count', label: 'Receipts' }], filters: [LAST_30('paid_on')], chart: { type: 'bar', x: 'paid_on__day', y: ['sum_amount'] },
});
r('collections.by_mode', 'fees', 'collections', t('Collection by payment mode', 'भुगतान माध्यम के अनुसार संग्रह', 'ಪಾವತಿ ವಿಧಾನದ ಪ್ರಕಾರ ಸಂಗ್ರಹ'), t('Cash, UPI, online, cheque and bank transfer this month.', 'इस महीने नकद, UPI, ऑनलाइन, चेक और बैंक हस्तांतरण।', 'ಈ ತಿಂಗಳು ನಗದು, UPI, ಆನ್‌ಲೈನ್, ಚೆಕ್ ಮತ್ತು ಬ್ಯಾಂಕ್ ವರ್ಗಾವಣೆ.'), {
  groupBy: ['method'], aggregates: [{ fn: 'sum', field: 'amount' }, { fn: 'count', label: 'Receipts' }, { fn: 'pct', field: 'amount' }], filters: [THIS_MONTH('paid_on')], chart: { type: 'donut', x: 'method', y: ['sum_amount'] },
});
r('collections.monthly', 'fees', 'collections', t('Monthly collection trend', 'मासिक संग्रह रुझान', 'ಮಾಸಿಕ ಸಂಗ್ರಹ ಪ್ರವೃತ್ತಿ'), t('Amount collected each month of this financial year.', 'इस वित्तीय वर्ष के प्रत्येक महीने संग्रहित राशि।', 'ಈ ಆರ್ಥಿಕ ವರ್ಷದ ಪ್ರತಿ ತಿಂಗಳು ಸಂಗ್ರಹಿಸಿದ ಮೊತ್ತ.'), {
  groupBy: ['paid_on:month'], aggregates: [{ fn: 'sum', field: 'amount' }], filters: [{ field: 'paid_on', op: 'relative', value: 'this_financial_year' }], chart: { type: 'bar', x: 'paid_on__month', y: ['sum_amount'] },
});
r('collections.cashier', 'fees', 'collections', t('Cashier-wise collection (last 7 days)', 'कैशियरवार संग्रह (पिछले 7 दिन)', 'ಕ್ಯಾಷಿಯರ್‌ವಾರು ಸಂಗ್ರಹ (ಕಳೆದ 7 ದಿನ)'), t('What each person at the fee counter collected, by mode.', 'शुल्क काउंटर पर प्रत्येक व्यक्ति का संग्रह, माध्यम के अनुसार।', 'ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಪ್ರತಿಯೊಬ್ಬರ ಸಂಗ್ರಹ, ವಿಧಾನದ ಪ್ರಕಾರ.'), {
  groupBy: ['collected_by'], pivot: { column: 'method' }, aggregates: [{ fn: 'sum', field: 'amount' }], filters: [{ field: 'paid_on', op: 'relative', value: 'last_7_days' }],
});
r('concessions.register', 'fees', 'concessions', t('Concession register', 'रियायत रजिस्टर', 'ರಿಯಾಯಿತಿ ರಿಜಿಸ್ಟರ್'), t('Every fee concession with its kind, sponsor, amount and status.', 'प्रत्येक शुल्क रियायत, प्रकार, प्रायोजक, राशि और स्थिति सहित।', 'ಪ್ರತಿ ಶುಲ್ಕ ರಿಯಾಯಿತಿ, ಬಗೆ, ಪ್ರಾಯೋಜಕ, ಮೊತ್ತ ಮತ್ತು ಸ್ಥಿತಿಯೊಂದಿಗೆ.'), {
  columns: ['number', 'requested_on', 'roll_no', 'student', 'class', 'kind', 'sponsor', 'percent', 'amount', 'status'], sort: [{ field: 'requested_on', dir: 'desc' }], limit: 5000,
});
r('concessions.by_kind', 'fees', 'concessions', t('Concessions by kind', 'प्रकार के अनुसार रियायत', 'ಬಗೆಯ ಪ್ರಕಾರ ರಿಯಾಯಿತಿ'), t('Concession amounts by kind and status.', 'प्रकार और स्थिति के अनुसार रियायत राशि।', 'ಬಗೆ ಮತ್ತು ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ರಿಯಾಯಿತಿ ಮೊತ್ತ.'), {
  groupBy: ['kind'], pivot: { column: 'status' }, aggregates: [{ fn: 'sum', field: 'amount' }], chart: { type: 'stacked', x: 'kind' },
});
r('scholarships.status', 'fees', 'scholarships', t('Scholarship status', 'छात्रवृत्ति स्थिति', 'ವಿದ್ಯಾರ್ಥಿವೇತನ ಸ್ಥಿತಿ'), t('Applications for each scheme by status.', 'प्रत्येक योजना के आवेदन स्थिति के अनुसार।', 'ಪ್ರತಿ ಯೋಜನೆಯ ಅರ್ಜಿಗಳು ಸ್ಥಿತಿಯ ಪ್ರಕಾರ.'), {
  groupBy: ['scheme'], pivot: { column: 'status' }, aggregates: [{ fn: 'count' }], chart: { type: 'stacked', x: 'scheme' },
});
r('scholarships.awarded', 'fees', 'scholarships', t('Scholarship amount awarded', 'स्वीकृत छात्रवृत्ति राशि', 'ಮಂಜೂರಾದ ವಿದ್ಯಾರ್ಥಿವೇತನ ಮೊತ್ತ'), t('Approved scholarships and amounts by scheme.', 'योजना के अनुसार स्वीकृत छात्रवृत्ति और राशि।', 'ಯೋಜನೆಯ ಪ್ರಕಾರ ಅನುಮೋದಿತ ವಿದ್ಯಾರ್ಥಿವೇತನ ಮತ್ತು ಮೊತ್ತ.'), {
  groupBy: ['scheme'], aggregates: [{ fn: 'count', label: 'Students' }, { fn: 'sum', field: 'awarded' }], filters: [{ field: 'status', op: 'eq', value: 'approved' }], chart: { type: 'hbar', x: 'scheme', y: ['sum_awarded'] },
});
r('scholarships.category', 'fees', 'scholarships', t('Scholarships by category', 'श्रेणी के अनुसार छात्रवृत्ति', 'ವರ್ಗದ ಪ್ರಕಾರ ವಿದ್ಯಾರ್ಥಿವೇತನ'), t('Scholarship applications by social category and status.', 'सामाजिक श्रेणी और स्थिति के अनुसार छात्रवृत्ति आवेदन।', 'ಸಾಮಾಜಿಕ ವರ್ಗ ಮತ್ತು ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ವಿದ್ಯಾರ್ಥಿವೇತನ ಅರ್ಜಿಗಳು.'), {
  groupBy: ['category'], pivot: { column: 'status' }, aggregates: [{ fn: 'count' }],
});

// ----- staff, leave and payroll -----------------------------------------------------------------------

const STAFF_ACTIVE = { field: 'status', op: 'eq' as const, value: 'active' };
r('staff.by_department', 'hr', 'staff', t('Staff strength by department', 'विभागवार कर्मचारी संख्या', 'ವಿಭಾಗವಾರು ಸಿಬ್ಬಂದಿ ಸಂಖ್ಯೆ'), t('Active staff in each department by employment type.', 'रोजगार प्रकार के अनुसार प्रत्येक विभाग में सक्रिय कर्मचारी।', 'ಉದ್ಯೋಗದ ಬಗೆಯ ಪ್ರಕಾರ ಪ್ರತಿ ವಿಭಾಗದ ಸಕ್ರಿಯ ಸಿಬ್ಬಂದಿ.'), {
  groupBy: ['department'], pivot: { column: 'employment_type' }, aggregates: [{ fn: 'count' }], filters: [STAFF_ACTIVE], chart: { type: 'stacked', x: 'department' },
});
r('staff.by_designation', 'hr', 'staff', t('Staff by designation', 'पदनाम के अनुसार कर्मचारी', 'ಹುದ್ದೆಯ ಪ್ರಕಾರ ಸಿಬ್ಬಂದಿ'), t('Active staff in each designation.', 'प्रत्येक पदनाम में सक्रिय कर्मचारी।', 'ಪ್ರತಿ ಹುದ್ದೆಯ ಸಕ್ರಿಯ ಸಿಬ್ಬಂದಿ.'), {
  groupBy: ['designation'], aggregates: [{ fn: 'count' }], filters: [STAFF_ACTIVE], sort: [{ field: 'count', dir: 'desc' }], chart: { type: 'hbar', x: 'designation', y: ['count'] },
});
r('staff.gender', 'hr', 'staff', t('Staff gender ratio', 'कर्मचारी लिंग अनुपात', 'ಸಿಬ್ಬಂದಿ ಲಿಂಗ ಅನುಪಾತ'), t('Men, women and others in each department.', 'प्रत्येक विभाग में पुरुष, महिलाएँ और अन्य।', 'ಪ್ರತಿ ವಿಭಾಗದಲ್ಲಿ ಪುರುಷರು, ಮಹಿಳೆಯರು ಮತ್ತು ಇತರರು.'), {
  groupBy: ['department'], pivot: { column: 'gender' }, aggregates: [{ fn: 'count' }], filters: [STAFF_ACTIVE], chart: { type: 'stacked100', x: 'department' },
});
r('staff.joined_this_year', 'hr', 'staff', t('Staff joined this academic year', 'इस शैक्षणिक वर्ष जुड़े कर्मचारी', 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷ ಸೇರಿದ ಸಿಬ್ಬಂದಿ'), t('New staff since the academic year began.', 'शैक्षणिक वर्ष शुरू होने से नए कर्मचारी।', 'ಶೈಕ್ಷಣಿಕ ವರ್ಷ ಆರಂಭದಿಂದ ಹೊಸ ಸಿಬ್ಬಂದಿ.'), {
  columns: ['employee_code', 'name', 'department', 'designation', 'employment_type', 'joined_on'], filters: [THIS_AY('joined_on')], sort: [{ field: 'joined_on', dir: 'desc' }],
});
r('staff.long_service', 'hr', 'staff', t('Long-serving staff (10+ years)', 'दीर्घ सेवा वाले कर्मचारी (10+ वर्ष)', 'ದೀರ್ಘ ಸೇವೆಯ ಸಿಬ್ಬಂದಿ (10+ ವರ್ಷ)'), t('Active staff with ten or more years of service.', 'दस या अधिक वर्ष की सेवा वाले सक्रिय कर्मचारी।', 'ಹತ್ತು ಅಥವಾ ಹೆಚ್ಚು ವರ್ಷ ಸೇವೆಯ ಸಕ್ರಿಯ ಸಿಬ್ಬಂದಿ.'), {
  columns: ['employee_code', 'name', 'department', 'designation', 'joined_on', 'experience_years'], filters: [STAFF_ACTIVE, { field: 'experience_years', op: 'gte', value: 10 }], sort: [{ field: 'experience_years', dir: 'desc' }],
});
r('staff_attendance.register', 'hr', 'staff_attendance', t('Staff attendance register (this month)', 'कर्मचारी उपस्थिति रजिस्टर (इस महीने)', 'ಸಿಬ್ಬಂದಿ ಹಾಜರಾತಿ ರಿಜಿಸ್ಟರ್ (ಈ ತಿಂಗಳು)'), t('Days present, absent and on leave for each person.', 'प्रत्येक व्यक्ति के उपस्थित, अनुपस्थित और अवकाश के दिन।', 'ಪ್ರತಿಯೊಬ್ಬರ ಹಾಜರು, ಗೈರು ಮತ್ತು ರಜೆಯ ದಿನಗಳು.'), {
  calculated: [{ key: 'absent_days', label: 'Days absent', expr: 'count_if(is_absent)', kind: 'measure' }, { key: 'leave_days', label: 'Days on leave', expr: 'count_if(on_leave)', kind: 'measure' }],
  groupBy: ['department', 'employee_code', 'name'], aggregates: [{ fn: 'sum', field: 'present_days', label: 'Days present' }, { fn: 'measure', field: 'absent_days' }, { fn: 'measure', field: 'leave_days' }], filters: [THIS_MONTH('date')],
});
r('staff_attendance.department_pct', 'hr', 'staff_attendance', t('Staff attendance % by department', 'विभागवार कर्मचारी उपस्थिति %', 'ವಿಭಾಗವಾರು ಸಿಬ್ಬಂದಿ ಹಾಜರಾತಿ %'), t('Attendance rate of each department over the last 30 days.', 'पिछले 30 दिनों में प्रत्येक विभाग की उपस्थिति दर।', 'ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ ಪ್ರತಿ ವಿಭಾಗದ ಹಾಜರಾತಿ ದರ.'), {
  groupBy: ['department'], aggregates: [{ fn: 'pct_true', field: 'is_present', label: 'Attendance %' }], filters: [LAST_30('date')], chart: { type: 'bar', x: 'department', y: ['pct_true_is_present'] },
});
r('staff_attendance.absent_today', 'hr', 'staff_attendance', t('Staff absent or on leave today', 'आज अनुपस्थित या अवकाश पर कर्मचारी', 'ಇಂದು ಗೈರು ಅಥವಾ ರಜೆಯಲ್ಲಿರುವ ಸಿಬ್ಬಂದಿ'), t('Who is not in today.', 'आज कौन नहीं आया।', 'ಇಂದು ಯಾರು ಬಂದಿಲ್ಲ.'), {
  columns: ['department', 'employee_code', 'name', 'status'], filters: [TODAY('date'), { field: 'status', op: 'in', value: ['absent', 'on_leave'] }], sort: [{ field: 'department', dir: 'asc' }],
});
r('leave.register', 'hr', 'leave', t('Leave register', 'अवकाश रजिस्टर', 'ರಜೆ ರಿಜಿಸ್ಟರ್'), t('Every leave request this academic year.', 'इस शैक्षणिक वर्ष का प्रत्येक अवकाश अनुरोध।', 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷದ ಪ್ರತಿ ರಜೆ ವಿನಂತಿ.'), {
  columns: ['employee_code', 'name', 'department', 'leave_type', 'from_date', 'to_date', 'days', 'status'], filters: [THIS_AY('from_date')], sort: [{ field: 'from_date', dir: 'desc' }], limit: 5000,
});
r('leave.by_type', 'hr', 'leave', t('Leave taken by type and department', 'प्रकार और विभाग के अनुसार लिया गया अवकाश', 'ಬಗೆ ಮತ್ತು ವಿಭಾಗದ ಪ್ರಕಾರ ತೆಗೆದ ರಜೆ'), t('Approved leave days this academic year.', 'इस शैक्षणिक वर्ष स्वीकृत अवकाश दिन।', 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷ ಅನುಮೋದಿತ ರಜೆ ದಿನಗಳು.'), {
  groupBy: ['department'], pivot: { column: 'leave_type' }, aggregates: [{ fn: 'sum', field: 'days' }], filters: [{ field: 'status', op: 'eq', value: 'approved' }, THIS_AY('from_date')], chart: { type: 'stacked', x: 'department' },
});
r('leave.pending', 'hr', 'leave', t('Pending leave approvals', 'लंबित अवकाश अनुमोदन', 'ಬಾಕಿ ರಜೆ ಅನುಮೋದನೆಗಳು'), t('Leave requests waiting for a decision, oldest first.', 'निर्णय की प्रतीक्षा में अवकाश अनुरोध, सबसे पुराने पहले।', 'ನಿರ್ಧಾರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿರುವ ರಜೆ ವಿನಂತಿಗಳು, ಹಳೆಯದು ಮೊದಲು.'), {
  columns: ['applied_on', 'employee_code', 'name', 'department', 'leave_type', 'from_date', 'to_date', 'days'], filters: [{ field: 'status', op: 'eq', value: 'pending' }], sort: [{ field: 'applied_on', dir: 'asc' }],
});
r('payroll.summary', 'payroll', 'payroll', t('Payroll summary by month', 'मासिक वेतन सारांश', 'ತಿಂಗಳವಾರು ವೇತನ ಸಾರಾಂಶ'), t('Payslips, gross, deductions, net pay and cost for each month.', 'प्रत्येक महीने की वेतन पर्चियाँ, सकल, कटौती, शुद्ध वेतन और लागत।', 'ಪ್ರತಿ ತಿಂಗಳ ವೇತನ ಚೀಟಿ, ಒಟ್ಟು, ಕಡಿತ, ನಿವ್ವಳ ವೇತನ ಮತ್ತು ವೆಚ್ಚ.'), {
  groupBy: ['month'], aggregates: [{ fn: 'count', label: 'Payslips' }, { fn: 'sum', field: 'gross' }, { fn: 'sum', field: 'deductions' }, { fn: 'sum', field: 'net' }, { fn: 'sum', field: 'employer_cost' }], sort: [{ field: 'month', dir: 'desc' }], chart: { type: 'bar', x: 'month', y: ['sum_net'] },
});
r('payroll.department_cost', 'payroll', 'payroll', t('Department-wise salary cost', 'विभागवार वेतन लागत', 'ವಿಭಾಗವಾರು ವೇತನ ವೆಚ್ಚ'), t('Gross pay of each department, month by month.', 'प्रत्येक विभाग का मासिक सकल वेतन।', 'ಪ್ರತಿ ವಿಭಾಗದ ತಿಂಗಳವಾರು ಒಟ್ಟು ವೇತನ.'), {
  groupBy: ['department'], pivot: { column: 'month' }, aggregates: [{ fn: 'sum', field: 'gross' }],
});
r('payroll.statutory', 'payroll', 'payroll', t('Statutory deductions (PF, PT, TDS)', 'वैधानिक कटौती (PF, PT, TDS)', 'ಶಾಸನಬದ್ಧ ಕಡಿತಗಳು (PF, PT, TDS)'), t('Provident fund, professional tax and income tax deducted each month.', 'प्रत्येक महीने काटी गई भविष्य निधि, व्यवसाय कर और आयकर।', 'ಪ್ರತಿ ತಿಂಗಳು ಕಡಿತಗೊಳಿಸಿದ ಭವಿಷ್ಯ ನಿಧಿ, ವೃತ್ತಿ ತೆರಿಗೆ ಮತ್ತು ಆದಾಯ ತೆರಿಗೆ.'), {
  groupBy: ['month'], aggregates: [{ fn: 'sum', field: 'pf' }, { fn: 'sum', field: 'pt' }, { fn: 'sum', field: 'tds' }], sort: [{ field: 'month', dir: 'desc' }],
});

// ----- library, hostel, transport, inventory ----------------------------------------------------------

r('library.overdue', 'library', 'library_loans', t('Overdue library books', 'अतिदेय पुस्तकालय पुस्तकें', 'ಗಡುವು ಮೀರಿದ ಗ್ರಂಥಾಲಯ ಪುಸ್ತಕಗಳು'), t('Books not returned by their due date, longest overdue first.', 'नियत तिथि तक वापस न की गई पुस्तकें, सबसे पुरानी पहले।', 'ಗಡುವಿನೊಳಗೆ ಹಿಂತಿರುಗಿಸದ ಪುಸ್ತಕಗಳು, ಹಳೆಯದು ಮೊದಲು.'), {
  columns: ['book', 'author', 'class', 'roll_no', 'student', 'issued_on', 'due_on', 'days_overdue'], filters: [YES('is_overdue')], sort: [{ field: 'days_overdue', dir: 'desc' }], limit: 5000,
  formatting: [{ column: 'days_overdue', op: 'gt', value: 30, tone: 'red', style: 'fill' }],
});
r('library.issue_register', 'library', 'library_loans', t('Issue register (this month)', 'निर्गम रजिस्टर (इस महीने)', 'ವಿತರಣಾ ರಿಜಿಸ್ಟರ್ (ಈ ತಿಂಗಳು)'), t('Every book issued this month and whether it is back.', 'इस महीने निर्गत हर पुस्तक और क्या वह लौटी।', 'ಈ ತಿಂಗಳು ವಿತರಿಸಿದ ಪ್ರತಿ ಪುಸ್ತಕ ಮತ್ತು ಹಿಂತಿರುಗಿದೆಯೇ.'), {
  columns: ['issued_on', 'book', 'class', 'roll_no', 'student', 'due_on', 'returned_on'], filters: [THIS_MONTH('issued_on')], sort: [{ field: 'issued_on', dir: 'desc' }], limit: 5000,
});
r('library.most_borrowed', 'library', 'library_loans', t('Most borrowed books', 'सबसे अधिक उधार ली गई पुस्तकें', 'ಹೆಚ್ಚು ಎರವಲು ಪಡೆದ ಪುಸ್ತಕಗಳು'), t('The 25 books issued most often this academic year.', 'इस शैक्षणिक वर्ष सबसे अधिक निर्गत 25 पुस्तकें।', 'ಈ ಶೈಕ್ಷಣಿಕ ವರ್ಷ ಹೆಚ್ಚು ವಿತರಿಸಿದ 25 ಪುಸ್ತಕಗಳು.'), {
  groupBy: ['book', 'author'], aggregates: [{ fn: 'count', label: 'Issues' }], filters: [THIS_AY('issued_on')], sort: [{ field: 'count', dir: 'desc' }], limit: 25, totals: false, chart: { type: 'hbar', x: 'book', y: ['count'] },
});
r('library.fines', 'library', 'library_loans', t('Library fines by class', 'कक्षावार पुस्तकालय जुर्माना', 'ತರಗತಿವಾರು ಗ್ರಂಥಾಲಯ ದಂಡ'), t('Fines charged and collected for each class.', 'प्रत्येक कक्षा के लगाए और वसूले गए जुर्माने।', 'ಪ್ರತಿ ತರಗತಿಗೆ ವಿಧಿಸಿದ ಮತ್ತು ಸಂಗ್ರಹಿಸಿದ ದಂಡ.'), {
  calculated: [{ key: 'fines_paid', label: 'Fines paid', expr: 'sum(if(fine_paid, fine, 0))', kind: 'measure' }],
  groupBy: ['class'], aggregates: [{ fn: 'sum', field: 'fine' }, { fn: 'measure', field: 'fines_paid' }], filters: [{ field: 'fine', op: 'gt', value: 0 }], chart: { type: 'bar', x: 'class', y: ['sum_fine', 'fines_paid'] },
});
r('hostel.occupancy', 'hostel', 'hostel', t('Hostel occupancy by block', 'ब्लॉकवार छात्रावास अधिभोग', 'ಬ್ಲಾಕ್‌ವಾರು ವಸತಿ ನಿಲಯ ಭರ್ತಿ'), t('Beds, occupied, vacant and occupancy % of each block.', 'प्रत्येक ब्लॉक के बिस्तर, भरे, खाली और अधिभोग %।', 'ಪ್ರತಿ ಬ್ಲಾಕ್‌ನ ಹಾಸಿಗೆ, ಭರ್ತಿ, ಖಾಲಿ ಮತ್ತು ಭರ್ತಿ %.'), {
  calculated: [{ key: 'occupied_beds', label: 'Occupied', expr: 'count_if(occupied)', kind: 'measure' }, { key: 'vacant_beds', label: 'Vacant', expr: 'count_if(vacant)', kind: 'measure' }],
  groupBy: ['block'], aggregates: [{ fn: 'count', label: 'Beds' }, { fn: 'measure', field: 'occupied_beds' }, { fn: 'measure', field: 'vacant_beds' }, { fn: 'pct_true', field: 'occupied', label: 'Occupancy %' }], chart: { type: 'stacked', x: 'block', y: ['occupied_beds', 'vacant_beds'] },
});
r('hostel.vacant_beds', 'hostel', 'hostel', t('Vacant beds', 'खाली बिस्तर', 'ಖಾಲಿ ಹಾಸಿಗೆಗಳು'), t('Every bed free to allot today.', 'आज आवंटन के लिए हर खाली बिस्तर।', 'ಇಂದು ಹಂಚಿಕೆಗೆ ಲಭ್ಯವಿರುವ ಪ್ರತಿ ಹಾಸಿಗೆ.'), {
  columns: ['block', 'block_gender', 'floor', 'room', 'bed', 'monthly_fee'], filters: [YES('vacant')], sort: [{ field: 'block', dir: 'asc' }, { field: 'room', dir: 'asc' }], limit: 5000, totals: false,
});
r('hostel.residents', 'hostel', 'hostel', t('Hostel residents by class', 'कक्षावार छात्रावास निवासी', 'ತರಗತಿವಾರು ವಸತಿ ನಿಲಯ ನಿವಾಸಿಗಳು'), t('Students living in each block, by class.', 'प्रत्येक ब्लॉक में रहने वाले छात्र, कक्षा के अनुसार।', 'ಪ್ರತಿ ಬ್ಲಾಕ್‌ನಲ್ಲಿರುವ ವಿದ್ಯಾರ್ಥಿಗಳು, ತರಗತಿಯ ಪ್ರಕಾರ.'), {
  groupBy: ['class'], pivot: { column: 'block' }, aggregates: [{ fn: 'count' }], filters: [YES('occupied')],
});
r('transport.route_strength', 'transport', 'transport', t('Route-wise strength', 'मार्गवार संख्या', 'ಮಾರ್ಗವಾರು ಸಂಖ್ಯೆ'), t('Students on each route against the seats in its vehicle.', 'प्रत्येक मार्ग पर छात्र, वाहन की सीटों की तुलना में।', 'ಪ್ರತಿ ಮಾರ್ಗದ ವಿದ್ಯಾರ್ಥಿಗಳು, ವಾಹನದ ಆಸನಗಳಿಗೆ ಹೋಲಿಸಿ.'), {
  calculated: [{ key: 'seats_filled', label: 'Seats filled %', expr: 'percent(count(), max(capacity))', kind: 'measure' }],
  groupBy: ['route', 'vehicle'], aggregates: [{ fn: 'count', label: 'Students' }, { fn: 'max', field: 'capacity', label: 'Seats' }, { fn: 'measure', field: 'seats_filled' }], filters: [YES('active')],
  formatting: [{ column: 'seats_filled', op: 'gt', value: 100, tone: 'red', style: 'fill' }, { column: 'seats_filled', op: 'between', value: 90, value2: 100, tone: 'amber', style: 'fill' }],
  chart: { type: 'hbar', x: 'route', y: ['count'] },
});
r('transport.stop_strength', 'transport', 'transport', t('Stop-wise strength', 'स्टॉपवार संख्या', 'ನಿಲ್ದಾಣವಾರು ಸಂಖ್ಯೆ'), t('Students boarding at each stop of each route, in route order.', 'प्रत्येक मार्ग के प्रत्येक स्टॉप पर चढ़ने वाले छात्र, मार्ग क्रम में।', 'ಪ್ರತಿ ಮಾರ್ಗದ ಪ್ರತಿ ನಿಲ್ದಾಣದಲ್ಲಿ ಹತ್ತುವ ವಿದ್ಯಾರ್ಥಿಗಳು, ಮಾರ್ಗ ಕ್ರಮದಲ್ಲಿ.'), {
  groupBy: ['route', 'stop', 'pickup_time'], aggregates: [{ fn: 'count', label: 'Students' }], filters: [YES('active')],
});
r('transport.riders', 'transport', 'transport', t('Transport riders list', 'परिवहन उपयोगकर्ता सूची', 'ಸಾರಿಗೆ ಬಳಕೆದಾರರ ಪಟ್ಟಿ'), t('Every student using transport, with route and stop.', 'परिवहन उपयोग करने वाला हर छात्र, मार्ग और स्टॉप सहित।', 'ಸಾರಿಗೆ ಬಳಸುವ ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿ, ಮಾರ್ಗ ಮತ್ತು ನಿಲ್ದಾಣದೊಂದಿಗೆ.'), {
  columns: ['route', 'stop', 'pickup_time', 'class', 'roll_no', 'student'], filters: [YES('active')], sort: [{ field: 'route', dir: 'asc' }, { field: 'pickup_time', dir: 'asc' }], limit: 5000,
});
r('inventory.reorder', 'inventory', 'inventory', t('Stock below reorder level', 'पुनः ऑर्डर स्तर से कम स्टॉक', 'ಮರು ಆರ್ಡರ್ ಮಟ್ಟಕ್ಕಿಂತ ಕಡಿಮೆ ದಾಸ್ತಾನು'), t('Items to buy: quantity at or under the reorder level.', 'खरीदने योग्य वस्तुएँ: मात्रा पुनः ऑर्डर स्तर पर या कम।', 'ಖರೀದಿಸಬೇಕಾದ ವಸ್ತುಗಳು: ಮರು ಆರ್ಡರ್ ಮಟ್ಟಕ್ಕೆ ಸಮ ಅಥವಾ ಕಡಿಮೆ.'), {
  columns: ['store', 'sku', 'item', 'category', 'unit', 'qty', 'reorder_level'], filters: [YES('below_reorder'), YES('active')], sort: [{ field: 'qty', dir: 'asc' }], totals: false,
  formatting: [{ column: 'qty', op: 'eq', value: 0, tone: 'red', style: 'fill' }],
});
r('inventory.by_store', 'inventory', 'inventory', t('Stock by store and category', 'भंडार और श्रेणी के अनुसार स्टॉक', 'ಉಗ್ರಾಣ ಮತ್ತು ವರ್ಗದ ಪ್ರಕಾರ ದಾಸ್ತಾನು'), t('Quantity on hand in each store by item category.', 'वस्तु श्रेणी के अनुसार प्रत्येक भंडार में उपलब्ध मात्रा।', 'ವಸ್ತು ವರ್ಗದ ಪ್ರಕಾರ ಪ್ರತಿ ಉಗ್ರಾಣದ ಲಭ್ಯ ಪ್ರಮಾಣ.'), {
  groupBy: ['store'], pivot: { column: 'category' }, aggregates: [{ fn: 'sum', field: 'qty' }],
});

// ----- placements, timetable, communication -----------------------------------------------------------

r('placements.summary', 'placements', 'placements', t('Placement summary by program', 'कार्यक्रमवार प्लेसमेंट सारांश', 'ಕಾರ್ಯಕ್ರಮವಾರು ಉದ್ಯೋಗ ಸಾರಾಂಶ'), t('Offers, students placed, and average and highest package.', 'ऑफ़र, प्लेस हुए छात्र, औसत और उच्चतम पैकेज।', 'ಆಫರ್‌ಗಳು, ಉದ್ಯೋಗ ಪಡೆದವರು, ಸರಾಸರಿ ಮತ್ತು ಗರಿಷ್ಠ ಪ್ಯಾಕೇಜ್.'), {
  groupBy: ['program'], aggregates: [{ fn: 'count', label: 'Offers' }, { fn: 'count_distinct', field: 'roll_no', label: 'Students placed' }, { fn: 'avg', field: 'ctc_lpa', label: 'Average package' }, { fn: 'max', field: 'ctc_lpa', label: 'Highest package' }], filters: [{ field: 'status', op: 'in', value: ['offered', 'accepted'] }], chart: { type: 'bar', x: 'program', y: ['count'] },
});
r('placements.company', 'placements', 'placements', t('Company-wise offers', 'कंपनीवार ऑफ़र', 'ಕಂಪನಿವಾರು ಆಫರ್‌ಗಳು'), t('Offers from each recruiter and the average package.', 'प्रत्येक भर्तीकर्ता के ऑफ़र और औसत पैकेज।', 'ಪ್ರತಿ ನೇಮಕಾತಿದಾರರ ಆಫರ್ ಮತ್ತು ಸರಾಸರಿ ಪ್ಯಾಕೇಜ್.'), {
  groupBy: ['company', 'sector'], aggregates: [{ fn: 'count', label: 'Offers' }, { fn: 'avg', field: 'ctc_lpa', label: 'Average package' }], sort: [{ field: 'count', dir: 'desc' }], chart: { type: 'hbar', x: 'company', y: ['count'] },
});
r('placements.status', 'placements', 'placements', t('Offer status', 'ऑफ़र स्थिति', 'ಆಫರ್ ಸ್ಥಿತಿ'), t('Offers accepted, declined, pending and expired.', 'स्वीकृत, अस्वीकृत, लंबित और समाप्त ऑफ़र।', 'ಸ್ವೀಕರಿಸಿದ, ತಿರಸ್ಕರಿಸಿದ, ಬಾಕಿ ಮತ್ತು ಅವಧಿ ಮುಗಿದ ಆಫರ್‌ಗಳು.'), {
  groupBy: ['status'], aggregates: [{ fn: 'count' }], chart: { type: 'donut', x: 'status', y: ['count'] },
});
r('placements.top_packages', 'placements', 'placements', t('Highest packages', 'सर्वोच्च पैकेज', 'ಗರಿಷ್ಠ ಪ್ಯಾಕೇಜ್‌ಗಳು'), t('The 20 best offers made to students.', 'छात्रों को मिले 20 सर्वश्रेष्ठ ऑफ़र।', 'ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಬಂದ 20 ಅತ್ಯುತ್ತಮ ಆಫರ್‌ಗಳು.'), {
  columns: ['student', 'class', 'company', 'role', 'ctc_lpa', 'status'], sort: [{ field: 'ctc_lpa', dir: 'desc' }], limit: 20, totals: false,
});
r('timetable.teacher_load', 'timetable', 'timetable', t('Teacher workload (hours a week)', 'शिक्षक कार्यभार (प्रति सप्ताह घंटे)', 'ಶಿಕ್ಷಕರ ಕಾರ್ಯಭಾರ (ವಾರಕ್ಕೆ ಗಂಟೆ)'), t('Periods and teaching hours of each teacher in the current timetable.', 'वर्तमान समय सारणी में प्रत्येक शिक्षक के कालांश और घंटे।', 'ಪ್ರಸ್ತುತ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಪ್ರತಿ ಶಿಕ್ಷಕರ ಅವಧಿಗಳು ಮತ್ತು ಗಂಟೆಗಳು.'), {
  groupBy: ['teacher'], aggregates: [{ fn: 'count', label: 'Periods' }, { fn: 'sum', field: 'hours' }], sort: [{ field: 'sum_hours', dir: 'desc' }], chart: { type: 'hbar', x: 'teacher', y: ['sum_hours'] },
});
r('timetable.class_subject', 'timetable', 'timetable', t('Weekly periods per subject', 'प्रति विषय साप्ताहिक कालांश', 'ವಿಷಯವಾರು ವಾರದ ಅವಧಿಗಳು'), t('How many periods each class has of each subject in a week.', 'प्रत्येक कक्षा में प्रत्येक विषय के सप्ताह में कितने कालांश।', 'ಪ್ರತಿ ತರಗತಿಗೆ ವಾರದಲ್ಲಿ ಪ್ರತಿ ವಿಷಯದ ಎಷ್ಟು ಅವಧಿಗಳು.'), {
  groupBy: ['class'], pivot: { column: 'subject' }, aggregates: [{ fn: 'count' }],
});
r('communication.campaigns', 'communication', 'communication', t('Message campaign delivery', 'संदेश अभियान वितरण', 'ಸಂದೇಶ ಅಭಿಯಾನ ವಿತರಣೆ'), t('Messages sent, delivered, read and failed for each campaign.', 'प्रत्येक अभियान के भेजे, वितरित, पढ़े और विफल संदेश।', 'ಪ್ರತಿ ಅಭಿಯಾನದ ಕಳುಹಿಸಿದ, ತಲುಪಿದ, ಓದಿದ ಮತ್ತು ವಿಫಲ ಸಂದೇಶಗಳು.'), {
  groupBy: ['campaign'], aggregates: [{ fn: 'count', label: 'Messages' }, { fn: 'pct_true', field: 'is_delivered', label: 'Delivered %' }, { fn: 'pct_true', field: 'is_read', label: 'Read %' }, { fn: 'pct_true', field: 'is_failed', label: 'Failed %' }], filters: [LAST_30('created_on')],
  formatting: [{ column: 'pct_true_is_failed', op: 'gt', value: 5, tone: 'red', style: 'text' }],
});
r('communication.channel', 'communication', 'communication', t('Delivery by channel', 'माध्यम के अनुसार वितरण', 'ಮಾಧ್ಯಮದ ಪ್ರಕಾರ ವಿತರಣೆ'), t('SMS, WhatsApp, email and app messages by status.', 'स्थिति के अनुसार एसएमएस, व्हाट्सऐप, ईमेल और ऐप संदेश।', 'ಸ್ಥಿತಿಯ ಪ್ರಕಾರ ಎಸ್‌ಎಂಎಸ್, ವಾಟ್ಸಾಪ್, ಇಮೇಲ್ ಮತ್ತು ಆಪ್ ಸಂದೇಶಗಳು.'), {
  groupBy: ['channel'], pivot: { column: 'status' }, aggregates: [{ fn: 'count' }], filters: [LAST_30('created_on')], chart: { type: 'stacked', x: 'channel' },
});

/** Every library report, parsed through the same schema the builder saves with. */
export const LIBRARY: LibraryReport[] = ALL.map((x) => {
  const ds = datasetByKey(x.dataset);
  if (!ds) throw new Error(`Library report ${x.key}: unknown dataset ${x.dataset}`);
  const definition = DefinitionSchema.parse(x.def);
  return { key: x.key, category: x.category, dataset: x.dataset, title: x.title, description: x.description, definition, roles: rolesAllowed(ds, definition) };
});

/** The library's own column names in Hindi and Kannada. */
const LABELS: Record<string, { hi: string; kn: string }> = {
  Absences: { hi: 'अनुपस्थितियाँ', kn: 'ಗೈರುಗಳು' },
  Appeared: { hi: 'उपस्थित हुए', kn: 'ಹಾಜರಾದವರು' },
  'Attendance %': { hi: 'उपस्थिति %', kn: 'ಹಾಜರಾತಿ %' },
  'Average %': { hi: 'औसत %', kn: 'ಸರಾಸರಿ %' },
  'Average SGPA': { hi: 'औसत एसजीपीए', kn: 'ಸರಾಸರಿ ಎಸ್‌ಜಿಪಿಎ' },
  'Average package': { hi: 'औसत पैकेज', kn: 'ಸರಾಸರಿ ಪ್ಯಾಕೇಜ್' },
  Beds: { hi: 'बिस्तर', kn: 'ಹಾಸಿಗೆಗಳು' },
  'Collected %': { hi: 'संग्रह %', kn: 'ಸಂಗ್ರಹ %' },
  'Conversion %': { hi: 'परिवर्तन %', kn: 'ಪರಿವರ್ತನೆ %' },
  'Days absent': { hi: 'अनुपस्थित दिन', kn: 'ಗೈರಾದ ದಿನಗಳು' },
  'Days on leave': { hi: 'अवकाश के दिन', kn: 'ರಜೆಯ ದಿನಗಳು' },
  'Days present': { hi: 'उपस्थित दिन', kn: 'ಹಾಜರಾದ ದಿನಗಳು' },
  'Delivered %': { hi: 'वितरित %', kn: 'ತಲುಪಿದ %' },
  'Enrolled %': { hi: 'नामांकित %', kn: 'ದಾಖಲಾದ %' },
  'Failed %': { hi: 'विफल %', kn: 'ವಿಫಲ %' },
  Failed: { hi: 'अनुत्तीर्ण', kn: 'ಅನುತ್ತೀರ್ಣ' },
  'Fines paid': { hi: 'भुगतान किया जुर्माना', kn: 'ಪಾವತಿಸಿದ ದಂಡ' },
  'Highest %': { hi: 'उच्चतम %', kn: 'ಗರಿಷ್ಠ %' },
  'Highest SGPA': { hi: 'उच्चतम एसजीपीए', kn: 'ಗರಿಷ್ಠ ಎಸ್‌ಜಿಪಿಎ' },
  'Highest package': { hi: 'उच्चतम पैकेज', kn: 'ಗರಿಷ್ಠ ಪ್ಯಾಕೇಜ್' },
  Invoices: { hi: 'चालान', kn: 'ಇನ್‌ವಾಯ್ಸ್‌ಗಳು' },
  Issues: { hi: 'निर्गम', kn: 'ವಿತರಣೆಗಳು' },
  'Lowest %': { hi: 'न्यूनतम %', kn: 'ಕನಿಷ್ಠ %' },
  'Lowest SGPA': { hi: 'न्यूनतम एसजीपीए', kn: 'ಕನಿಷ್ಠ ಎಸ್‌ಜಿಪಿಎ' },
  Marks: { hi: 'अंकन', kn: 'ಗುರುತುಗಳು' },
  Messages: { hi: 'संदेश', kn: 'ಸಂದೇಶಗಳು' },
  'Occupancy %': { hi: 'अधिभोग %', kn: 'ಭರ್ತಿ %' },
  Occupied: { hi: 'भरे', kn: 'ಭರ್ತಿ' },
  'Offered %': { hi: 'प्रस्तावित %', kn: 'ಆಫರ್ %' },
  Offers: { hi: 'ऑफ़र', kn: 'ಆಫರ್‌ಗಳು' },
  'Pass %': { hi: 'उत्तीर्ण %', kn: 'ತೇರ್ಗಡೆ %' },
  Passed: { hi: 'उत्तीर्ण', kn: 'ತೇರ್ಗಡೆ' },
  Payslips: { hi: 'वेतन पर्चियाँ', kn: 'ವೇತನ ಚೀಟಿಗಳು' },
  Periods: { hi: 'कालांश', kn: 'ಅವಧಿಗಳು' },
  'Read %': { hi: 'पढ़े गए %', kn: 'ಓದಿದ %' },
  Receipts: { hi: 'रसीदें', kn: 'ರಸೀದಿಗಳು' },
  Results: { hi: 'परिणाम', kn: 'ಫಲಿತಾಂಶಗಳು' },
  'Seats filled %': { hi: 'भरी सीटें %', kn: 'ಭರ್ತಿಯಾದ ಆಸನ %' },
  Seats: { hi: 'सीटें', kn: 'ಆಸನಗಳು' },
  'Students placed': { hi: 'प्लेस हुए छात्र', kn: 'ಉದ್ಯೋಗ ಪಡೆದ ವಿದ್ಯಾರ್ಥಿಗಳು' },
  Students: { hi: 'छात्र', kn: 'ವಿದ್ಯಾರ್ಥಿಗಳು' },
  Vacant: { hi: 'खाली', kn: 'ಖಾಲಿ' },
};

/** A library definition with its column names in the reader's language. */
export function localizeDefinition(def: Definition, lang: 'en' | 'hi' | 'kn'): Definition {
  if (lang === 'en') return def;
  const tr = (s?: string) => (s && LABELS[s] ? LABELS[s][lang] : s);
  return { ...def, aggregates: def.aggregates.map((a) => ({ ...a, label: tr(a.label) })), calculated: def.calculated.map((c) => ({ ...c, label: tr(c.label)! })) };
}

export const libraryByKey = (key: string): LibraryReport | undefined => LIBRARY.find((x) => x.key === key);
export const libraryFor = (roles: readonly RoleName[]): LibraryReport[] => LIBRARY.filter((x) => x.roles.some((r) => roles.includes(r)));
