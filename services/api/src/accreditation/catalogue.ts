// Metric catalogues for NAAC (7 criteria), NBA (Tier-I/II SAR) and NIRF (TLR, RP, GO, OI, PR), plus the scoring estimators.
// NAAC key indicators and criterion totals follow the revised manual of 21 Dec 2022 for affiliated UG colleges (1: 100, 2: 350,
// 3: 110, 4: 100, 5: 140, 6: 100, 7: 100). NAAC announced binary accreditation and maturity-based graded levels in 2025; check the
// manual in force for your cycle.
// Codes follow the published manuals' numbering (criterion.key indicator.metric); titles are our own wording, so check each
// against the manual in force for your cycle before filing. Weights are indicative.

export type Body = 'naac' | 'nba' | 'nirf';
export const BODIES: Body[] = ['naac', 'nba', 'nirf'];

export interface MetricDef {
  code: string;
  /** Criterion (NAAC/NBA) or parameter group (NIRF) the metric belongs to. */
  group: string;
  /** QnM = quantitative (a figure or table), QlM = qualitative (a narrative of up to about 500 words). */
  kind: 'QnM' | 'QlM';
  title: string;
  unit: string;
  /** Key of an automatic computation from ERP data; empty = entered by hand. */
  auto: string;
  /** Value at which the metric earns the full 4 points. */
  bench?: number;
  /** 'low' when a smaller figure is better (for example student-teacher ratio). */
  dir?: 'high' | 'low';
  /** Columns of the data template the institution fills in and uploads as evidence. */
  columns: string[];
}

const m = (code: string, kind: 'QnM' | 'QlM', title: string, unit = '', o: Partial<Pick<MetricDef, 'auto' | 'bench' | 'dir' | 'columns'>> = {}): Omit<MetricDef, 'group'> => ({
  code,
  kind,
  title,
  unit,
  auto: o.auto ?? '',
  bench: o.bench,
  dir: o.dir,
  columns: o.columns ?? (kind === 'QlM' ? [] : ['Year', 'Particulars', 'Count or amount', 'Supporting document']),
});

const NAAC_ITEMS: Omit<MetricDef, 'group'>[] = [
  // Criterion 1 - Curricular aspects
  m('1.1.1', 'QlM', 'How the institution plans and delivers the curriculum, including the calendar and the teaching plan'),
  m('1.1.2', 'QnM', 'Programmes whose syllabus was revised in the cycle', '%', { bench: 100, columns: ['Programme code', 'Programme name', 'Year of introduction', 'Year of last revision', 'Revision percentage'] }),
  m('1.1.3', 'QnM', 'Courses that build employability, entrepreneurship or skills', '%', { bench: 100, columns: ['Course code', 'Course name', 'Programme', 'Skill focus', 'Year'] }),
  m('1.2.1', 'QnM', 'Programmes that follow a choice-based credit system with electives', '%', { bench: 100, columns: ['Programme', 'Year of CBCS start', 'Elective courses offered'] }),
  m('1.2.2', 'QnM', 'Add-on or certificate courses offered', 'courses', { bench: 10, columns: ['Course name', 'Course code', 'Year', 'Duration (hours)', 'Students enrolled', 'Students completed'] }),
  m('1.3.1', 'QlM', 'How the curriculum covers gender, environment, human values and professional ethics'),
  m('1.3.2', 'QnM', 'Students enrolled in value-added courses', '%', { bench: 50, columns: ['Course name', 'Year', 'Students enrolled', 'Students completed'] }),
  m('1.3.3', 'QnM', 'Students doing projects, field work or internships', '%', { bench: 100, columns: ['Programme', 'Project or internship title', 'Student', 'Year'] }),
  m('1.4.1', 'QlM', 'Structured feedback gathered from students, teachers, employers and alumni', '', { auto: 'feedback_surveys' }),
  m('1.4.2', 'QlM', 'Feedback analysed and the action taken, communicated to stakeholders', '', { auto: 'feedback_atr' }),
  // Criterion 2 - Teaching-learning and evaluation
  m('2.1.1', 'QnM', 'Students enrolled in the year (sanctioned seats against admitted)', 'students', { auto: 'students', columns: ['Programme', 'Sanctioned seats', 'Students admitted', 'Year'] }),
  m('2.1.2', 'QnM', 'Seats filled against the seats reserved by government rules', '%', { bench: 100, columns: ['Category', 'Seats reserved', 'Seats filled', 'Year'] }),
  m('2.2.1', 'QlM', 'How slow and advanced learners are identified and supported'),
  m('2.2.2', 'QnM', 'Students per full-time teacher', 'ratio', { auto: 'student_teacher_ratio', bench: 20, dir: 'low' }),
  m('2.3.1', 'QlM', 'Student-centred methods: experiential learning, participative learning, problem solving'),
  m('2.3.2', 'QnM', 'Teachers using ICT tools and e-resources for teaching', '%', { bench: 100 }),
  m('2.3.3', 'QnM', 'Students per mentor for personal and academic guidance', 'ratio', { auto: 'mentor_ratio', bench: 25, dir: 'low' }),
  m('2.4.1', 'QnM', 'Full-time teachers in the year', 'teachers', { auto: 'fulltime_teachers', columns: ['Teacher', 'PAN or ID', 'Designation', 'Year of appointment', 'Nature of appointment'] }),
  m('2.4.2', 'QnM', 'Full-time teachers with Ph.D., D.M., M.Ch., D.N.B. or NET/SET', '%', { auto: 'phd_teachers', bench: 50, columns: ['Teacher', 'Qualification', 'Year of award', 'Recognised by'] }),
  m('2.4.3', 'QnM', 'Average teaching experience of full-time teachers', 'years', { auto: 'avg_experience', bench: 8 }),
  m('2.5.1', 'QnM', 'Average days from the last exam day to declaring the result', 'days', { bench: 30, dir: 'low', columns: ['Programme', 'Last exam date', 'Result date', 'Days'] }),
  m('2.5.2', 'QnM', 'Examination-related grievances as a share of students appearing', '%', { bench: 1, dir: 'low' }),
  m('2.6.1', 'QlM', 'Programme and course outcomes stated, displayed and communicated', '', { auto: 'cos_defined' }),
  m('2.6.2', 'QlM', 'Attainment of programme and course outcomes is measured and evaluated', '', { auto: 'outcomes_met' }),
  m('2.6.3', 'QnM', 'Pass percentage of students who appeared in the final examination', '%', { auto: 'pass_rate', bench: 100, columns: ['Programme', 'Students appeared', 'Students passed', 'Year'] }),
  m('2.7.1', 'QnM', 'Online satisfaction survey on teaching-learning (average rating)', 'of 5', { auto: 'feedback_rating', bench: 5 }),
  // Criterion 3 - Research, innovations and extension
  m('3.2.1', 'QnM', 'Grants from government and non-government bodies for research', 'INR lakhs', { auto: 'grants_lakhs', columns: ['Project', 'Principal investigator', 'Funding agency', 'Year of award', 'Amount (INR lakhs)', 'Duration'] }),
  m('3.2.2', 'QnM', 'Teachers recognised as research guides or holding research projects', 'teachers', { auto: 'research_teachers' }),
  m('3.3.1', 'QlM', 'Ecosystem for innovations: incubation centre, innovation council, knowledge transfer'),
  m('3.3.2', 'QnM', 'Workshops and seminars on intellectual property and entrepreneurship', 'events', { bench: 4, columns: ['Event', 'Date', 'Participants', 'Resource person'] }),
  m('3.3.3', 'QnM', 'Patents filed or granted', 'patents', { auto: 'patents', bench: 3 }),
  m('3.4.1', 'QnM', 'Research papers in listed journals per teacher', 'papers per teacher', { auto: 'papers_per_teacher', bench: 2, columns: ['Paper title', 'Authors', 'Department', 'Journal', 'Year', 'ISSN', 'Link to the paper'] }),
  m('3.4.2', 'QnM', 'Books, chapters and conference papers per teacher', 'items per teacher', { auto: 'books_per_teacher', bench: 2, columns: ['Title', 'Authors', 'Publisher or proceedings', 'Year', 'ISBN or ISSN'] }),
  m('3.6.1', 'QnM', 'Extension activities with community, NSS or NCC', 'activities', { bench: 10, columns: ['Activity', 'Organising unit', 'Date', 'Students taking part'] }),
  m('3.6.2', 'QnM', 'Awards and recognition for extension work', 'awards', { bench: 2, columns: ['Award', 'Awarding body', 'Year'] }),
  m('3.7.1', 'QnM', 'Collaborative activities for research, faculty exchange or student exchange', 'activities', { bench: 5, columns: ['Collaborating agency', 'Title of activity', 'Year', 'Duration'] }),
  m('3.7.2', 'QnM', 'Functional MoUs with institutions and industry', 'MoUs', { bench: 5, columns: ['Organisation', 'Purpose', 'Year signed', 'Duration', 'Participants'] }),
  // Criterion 4 - Infrastructure and learning resources
  m('4.1.1', 'QlM', 'Adequacy of classrooms, labs, sports, cultural and ICT facilities', '', { auto: 'rooms_summary' }),
  m('4.1.2', 'QnM', 'Spend on augmenting infrastructure (excluding salary)', 'INR lakhs', { bench: 20, columns: ['Year', 'Head of expenditure', 'Amount (INR lakhs)'] }),
  m('4.2.1', 'QlM', 'Library automation and its use', '', { auto: 'library_summary' }),
  m('4.2.2', 'QnM', 'E-resources and databases subscribed to', 'resources', { auto: 'eresources', bench: 5 }),
  m('4.2.3', 'QnM', 'Spend on books, journals and e-resources', 'INR lakhs', { bench: 3, columns: ['Year', 'Head', 'Amount (INR lakhs)'] }),
  m('4.2.4', 'QnM', 'Average daily library use (loans)', 'per day', { auto: 'library_use', bench: 30 }),
  m('4.3.1', 'QlM', 'IT facilities, Wi-Fi and classrooms with smart teaching aids', '', { auto: 'it_summary' }),
  m('4.3.2', 'QnM', 'Students per computer', 'ratio', { bench: 5, dir: 'low' }),
  m('4.3.3', 'QnM', 'Internet bandwidth', 'Mbps', { bench: 500 }),
  m('4.4.1', 'QnM', 'Spend on maintaining physical and academic facilities', 'INR lakhs', { bench: 10, columns: ['Year', 'Head', 'Amount (INR lakhs)'] }),
  m('4.4.2', 'QlM', 'Systems and procedures for maintaining and using facilities'),
  // Criterion 5 - Student support and progression
  m('5.1.1', 'QnM', 'Students benefiting from scholarships and freeships', 'students', { auto: 'scholarship_schemes', columns: ['Scheme', 'Awarding body', 'Students benefited', 'Amount (INR)', 'Year'] }),
  m('5.1.2', 'QnM', 'Capacity-building and skill-enhancement programmes (soft skills, language, life skills)', 'programmes', { bench: 5, columns: ['Programme', 'Date', 'Students enrolled'] }),
  m('5.1.3', 'QnM', 'Students counselled or guided for careers and competitive exams', 'students', { auto: 'counselled' }),
  m('5.1.4', 'QlM', 'Mechanisms for grievance redressal, anti-ragging and prevention of sexual harassment', '', { auto: 'grievance_resolution' }),
  m('5.2.1', 'QnM', 'Students placed during the year', '%', { auto: 'placement_rate', bench: 60, columns: ['Student', 'Programme', 'Employer', 'Package (LPA)', 'Year'] }),
  m('5.2.2', 'QnM', 'Students progressing to higher education', '%', { bench: 25, columns: ['Student', 'Programme', 'Institution joined', 'Programme joined', 'Year'] }),
  m('5.2.3', 'QnM', 'Students qualifying in state or national examinations', 'students', { bench: 10, columns: ['Student', 'Examination', 'Registration number', 'Year'] }),
  m('5.3.1', 'QnM', 'Awards won by students in sports and cultural events', 'awards', { bench: 10, columns: ['Award', 'Event', 'Level', 'Student', 'Year'] }),
  m('5.3.2', 'QlM', 'Student representation and participation in academic and administrative bodies'),
  m('5.4.1', 'QlM', 'Alumni association and its contribution', '', { auto: 'alumni' }),
  // Criterion 6 - Governance, leadership and management
  m('6.1.1', 'QlM', 'Vision, mission and how governance puts them into practice, including decentralisation'),
  m('6.2.1', 'QlM', 'Perspective plan and its deployment, with the organisational structure'),
  m('6.2.2', 'QnM', 'Areas run with e-governance (administration, finance, admissions, exams)', 'areas', { auto: 'erp_areas', bench: 5 }),
  m('6.3.1', 'QlM', 'Welfare measures for teaching and non-teaching staff'),
  m('6.3.2', 'QnM', 'Teachers given financial support for conferences and workshops', 'teachers', { bench: 5, columns: ['Teacher', 'Event', 'Amount (INR)', 'Year'] }),
  m('6.3.3', 'QnM', 'Professional development programmes attended by teachers (FDPs)', 'programmes', { auto: 'fdp_count', bench: 20 }),
  m('6.4.1', 'QlM', 'Mobilisation and optimal use of financial resources', '', { auto: 'fees_collected' }),
  m('6.4.2', 'QnM', 'Funds or grants received from non-government bodies and individuals', 'INR lakhs', { bench: 5, columns: ['Year', 'Source', 'Amount (INR lakhs)'] }),
  m('6.5.1', 'QlM', 'IQAC contribution to quality assurance and institutionalised practices', '', { auto: 'iqac_meetings' }),
  m('6.5.2', 'QnM', 'Quality assurance initiatives: conferences, audits, NIRF participation, accreditation', 'initiatives', { bench: 4, columns: ['Initiative', 'Year', 'Outcome'] }),
  // Criterion 7 - Institutional values and best practices
  m('7.1.1', 'QnM', 'Initiatives for gender equity and sensitisation in the year', 'initiatives', { bench: 4, columns: ['Initiative', 'Date', 'Participants'] }),
  m('7.1.2', 'QlM', 'Energy conservation and renewable energy'),
  m('7.1.3', 'QlM', 'Waste management: solid, liquid, e-waste, hazardous'),
  m('7.1.4', 'QlM', 'Water conservation: rainwater harvesting, recycling, borewell recharge'),
  m('7.1.5', 'QlM', 'Green campus: restricted vehicle entry, pedestrian-friendly pathways, tree planting'),
  m('7.1.6', 'QnM', 'Quality audits on environment and energy', 'audits', { bench: 2, columns: ['Audit', 'Agency', 'Year'] }),
  m('7.1.7', 'QlM', 'Inclusive environment: harmony of culture, region, language, communities'),
  m('7.2.1', 'QlM', 'Two best practices in the prescribed format', '', { auto: 'best_practices' }),
  m('7.3.1', 'QlM', 'Distinctiveness of the institution in its priority and thrust area', '', { auto: 'distinctiveness' }),
];

const NAAC_GROUPS: Record<string, { title: string; weight: number }> = {
  '1': { title: 'Curricular aspects', weight: 100 },
  '2': { title: 'Teaching-learning and evaluation', weight: 350 },
  '3': { title: 'Research, innovations and extension', weight: 110 },
  '4': { title: 'Infrastructure and learning resources', weight: 100 },
  '5': { title: 'Student support and progression', weight: 140 },
  '6': { title: 'Governance, leadership and management', weight: 100 },
  '7': { title: 'Institutional values and best practices', weight: 100 },
};

const NBA_ITEMS: Omit<MetricDef, 'group'>[] = [
  m('1.1', 'QlM', 'Vision and mission of the institute and department, and how they are published and shared'),
  m('1.2', 'QlM', 'Programme educational objectives, and how they were set with stakeholders'),
  m('2.1', 'QnM', 'Curriculum: courses mapped to programme outcomes, and the share that are electives', '%', { auto: 'nba_courses_mapped', bench: 100 }),
  m('2.2', 'QlM', 'Teaching-learning processes: lesson plans, course files, student-centred methods', '', { auto: 'nba_course_files' }),
  m('3.1', 'QnM', 'Course outcomes defined and mapped to programme outcomes and PSOs', 'COs', { auto: 'nba_cos' }),
  m('3.2', 'QnM', 'Attainment of course outcomes (courses that met their target)', '%', { auto: 'nba_co_attain', bench: 100 }),
  m('3.3', 'QnM', 'Attainment of programme outcomes and PSOs (those that met their target)', '%', { auto: 'nba_po_attain', bench: 100 }),
  m('4.1', 'QnM', 'Enrolment ratio: students admitted against sanctioned intake', '%', { bench: 100 }),
  m('4.2', 'QnM', 'Success rate: students graduating without backlog in the stipulated time', '%', { auto: 'pass_rate', bench: 100 }),
  m('4.3', 'QnM', 'Placement, higher studies and entrepreneurship', '%', { auto: 'placement_rate', bench: 60 }),
  m('4.4', 'QnM', 'Professional activities: student chapters, competitions, technical events', 'activities', { bench: 8, columns: ['Activity', 'Date', 'Level', 'Students'] }),
  m('5.1', 'QnM', 'Student-faculty ratio', 'ratio', { auto: 'student_teacher_ratio', bench: 15, dir: 'low' }),
  m('5.2', 'QnM', 'Faculty with Ph.D. or equivalent', '%', { auto: 'phd_teachers', bench: 60 }),
  m('5.3', 'QnM', 'Faculty research publications and sponsored projects', 'items', { auto: 'publications', bench: 30 }),
  m('5.4', 'QnM', 'Faculty development: FDPs, workshops and industry exposure', 'programmes', { auto: 'fdp_count', bench: 20 }),
  m('6.1', 'QlM', 'Laboratories and workshops adequate for the curriculum', '', { auto: 'rooms_summary' }),
  m('6.2', 'QlM', 'Technical manpower support and its development'),
  m('7.1', 'QlM', 'Continuous improvement: actions taken on attainment gaps and their effect', '', { auto: 'cqi_actions' }),
  m('8.1', 'QlM', 'First-year academics: curriculum, teaching and student support in the first year'),
  m('9.1', 'QlM', 'Student support: mentoring, remedial teaching, grievance redressal', '', { auto: 'grievance_resolution' }),
  m('10.1', 'QlM', 'Governance, institutional support and financial resources', '', { auto: 'fees_collected' }),
];
const NBA_GROUPS: Record<string, { title: string; weight: number }> = {
  '1': { title: 'Vision, mission and programme educational objectives', weight: 60 },
  '2': { title: 'Programme curriculum and teaching-learning processes', weight: 120 },
  '3': { title: 'Course outcomes and programme outcomes', weight: 120 },
  '4': { title: 'Students\' performance', weight: 150 },
  '5': { title: 'Faculty contributions', weight: 200 },
  '6': { title: 'Facilities and technical support', weight: 80 },
  '7': { title: 'Continuous improvement', weight: 75 },
  '8': { title: 'First-year academics', weight: 50 },
  '9': { title: 'Student support systems', weight: 50 },
  '10': { title: 'Governance, institutional support and financial resources', weight: 120 },
};

const NIRF_ITEMS: (Omit<MetricDef, 'group'> & { group: string })[] = [
  { ...m('TLR.SS', 'QnM', 'Student strength including doctoral students', 'students', { auto: 'students' }), group: 'TLR' },
  { ...m('TLR.FSR', 'QnM', 'Faculty-student ratio (students per faculty)', 'ratio', { auto: 'student_teacher_ratio', bench: 15, dir: 'low' }), group: 'TLR' },
  { ...m('TLR.FQE', 'QnM', 'Faculty with doctoral qualification', '%', { auto: 'phd_teachers', bench: 95 }), group: 'TLR' },
  { ...m('TLR.FRU', 'QnM', 'Financial resources and their utilisation: fee income collected', 'INR lakhs', { auto: 'fees_lakhs' }), group: 'TLR' },
  { ...m('RP.PU', 'QnM', 'Combined metric for publications', 'papers', { auto: 'publications', bench: 100 }), group: 'RP' },
  { ...m('RP.QP', 'QnM', 'Quality of publications (indexed in Scopus, Web of Science)', 'papers', { auto: 'indexed_publications', bench: 50 }), group: 'RP' },
  { ...m('RP.IPR', 'QnM', 'IPR and patents published and granted', 'patents', { auto: 'patents', bench: 10 }), group: 'RP' },
  { ...m('RP.FPPP', 'QnM', 'Footprint of projects and professional practice: sponsored research', 'INR lakhs', { auto: 'grants_lakhs', bench: 50 }), group: 'RP' },
  { ...m('GO.GPH', 'QnM', 'Graduates placed or going for higher studies', '%', { auto: 'placement_rate', bench: 80 }), group: 'GO' },
  { ...m('GO.GUE', 'QnM', 'University examinations: share of students graduating in the stipulated time', '%', { auto: 'pass_rate', bench: 95 }), group: 'GO' },
  { ...m('GO.MS', 'QnM', 'Median salary of placed graduates', 'LPA', { auto: 'median_salary', bench: 6 }), group: 'GO' },
  { ...m('GO.GPHD', 'QnM', 'Graduating students going into Ph.D.', 'students', { bench: 5, columns: ['Student', 'Programme', 'Institution joined', 'Year'] }), group: 'GO' },
  { ...m('OI.RD', 'QnM', 'Students from other states and countries', '%', { bench: 20, columns: ['Region', 'Students'] }), group: 'OI' },
  { ...m('OI.WD', 'QnM', 'Women among students and faculty', '%', { auto: 'women_students', bench: 50 }), group: 'OI' },
  { ...m('OI.ESCS', 'QnM', 'Economically and socially challenged students', '%', { bench: 20, columns: ['Category', 'Students'] }), group: 'OI' },
  { ...m('OI.PCS', 'QnM', 'Facilities for persons with disabilities', 'facilities', { bench: 5, columns: ['Facility', 'Available (yes/no)'] }), group: 'OI' },
  { ...m('PR.PR', 'QnM', 'Perception: average stakeholder rating collected by the institution', 'of 5', { auto: 'feedback_rating', bench: 5 }), group: 'PR' },
];
const NIRF_GROUPS: Record<string, { title: string; weight: number }> = {
  TLR: { title: 'Teaching, learning and resources', weight: 30 },
  RP: { title: 'Research and professional practice', weight: 30 },
  GO: { title: 'Graduation outcomes', weight: 20 },
  OI: { title: 'Outreach and inclusivity', weight: 10 },
  PR: { title: 'Perception', weight: 10 },
};

export interface GroupDef {
  id: string;
  title: string;
  weight: number;
}

export function catalogue(body: Body): { groups: GroupDef[]; metrics: MetricDef[] } {
  if (body === 'nirf') return { groups: Object.entries(NIRF_GROUPS).map(([id, g]) => ({ id, ...g })), metrics: NIRF_ITEMS };
  const [items, groups] = body === 'naac' ? [NAAC_ITEMS, NAAC_GROUPS] : [NBA_ITEMS, NBA_GROUPS];
  return { groups: Object.entries(groups).map(([id, g]) => ({ id, ...g })), metrics: items.map((i) => ({ ...i, group: i.code.split('.')[0] })) };
}

/** Points out of 4 for one metric: the institution's own marking if given, else the figure against the benchmark; null when it cannot be scored. */
export function metricScore(def: MetricDef, value: number | null, selfScore: number | null): number | null {
  if (selfScore !== null && selfScore !== undefined) return Math.max(0, Math.min(4, selfScore));
  if (value === null || def.bench === undefined || def.bench <= 0) return null;
  const ratio = def.dir === 'low' ? (value <= 0 ? 1 : def.bench / value) : value / def.bench;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 4 * 100) / 100;
}

export const NAAC_BANDS: { min: number; grade: string }[] = [
  { min: 3.51, grade: 'A++' },
  { min: 3.26, grade: 'A+' },
  { min: 3.01, grade: 'A' },
  { min: 2.76, grade: 'B++' },
  { min: 2.51, grade: 'B+' },
  { min: 2.01, grade: 'B' },
  { min: 1.51, grade: 'C' },
];
export const naacGrade = (cgpa: number | null): string => (cgpa === null ? '-' : (NAAC_BANDS.find((b) => cgpa >= b.min)?.grade ?? 'D'));

export interface GroupScore {
  id: string;
  title: string;
  weight: number;
  metrics: number;
  scored: number;
  /** Mean points out of 4 over the scored metrics. */
  mean: number | null;
}

/**
 * Predicts the NAAC CGPA. The estimate weighs each criterion's mean metric score by the key-indicator weightage over the
 * criteria that have at least one scored metric; the floor counts every unscored metric as zero. Both are indicative: NAAC
 * peer-team marks on qualitative metrics and DVV can move the final grade.
 */
export function estimate(groups: GroupDef[], scores: Map<string, number | null>, defs: MetricDef[]): { groups: GroupScore[]; estimate: number | null; floor: number; grade: string; floorGrade: string } {
  const out: GroupScore[] = groups.map((g) => {
    const mine = defs.filter((d) => d.group === g.id);
    const got = mine.map((d) => scores.get(d.code) ?? null).filter((x): x is number => x !== null);
    return { id: g.id, title: g.title, weight: g.weight, metrics: mine.length, scored: got.length, mean: got.length ? Math.round((got.reduce((a, b) => a + b, 0) / got.length) * 100) / 100 : null };
  });
  const total = groups.reduce((a, g) => a + g.weight, 0);
  const scoredW = out.filter((g) => g.mean !== null).reduce((a, g) => a + g.weight, 0);
  const num = out.reduce((a, g) => a + (g.mean ?? 0) * g.weight, 0);
  const est = scoredW === 0 ? null : Math.round((num / scoredW) * 100) / 100;
  const floorV = Math.round(((out.reduce((a, g) => a + (g.mean !== null ? (g.mean * g.weight * g.scored) / Math.max(g.metrics, 1) : 0), 0)) / total) * 100) / 100;
  return { groups: out, estimate: est, floor: floorV, grade: naacGrade(est), floorGrade: naacGrade(floorV) };
}
