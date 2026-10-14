// NBA Self Assessment Reports beyond Tier-II UG engineering: UG engineering programmes in Tier-I institutions
// (autonomous institutions and university departments, ten criteria, 1000 marks: programme-level criteria 1-7 for 780
// marks and institution-level criteria 8-10 for 220) and postgraduate management programmes (MBA / PGDM, ten criteria,
// 1000 marks in the February 2023 format). Criterion marks follow the published formats; the split of a criterion's
// marks across its sub-criteria is our reading and can be overridden per institution (accreditation_settings).
import { define, pct, per, ql, qn, type FrameworkDef, type InputDef } from './types.js';

const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** NBA works on the three previous academic years (CAY, CAYm1, CAYm2). */
const Y3 = { years: 3 } as const;
const one = { combine: 'latest' as const, years: 1 };

const students: InputDef = { key: 'students', label: 'Students in the programme', source: 'students_on_roll' };
const faculty: InputDef = { key: 'faculty', label: 'Regular faculty in the programme', source: 'teachers_fulltime' };

/** Enrolment ratio bands shared by the engineering formats: >= 90% full marks, >= 80% 90%, >= 70% 80%, >= 60% 60%, >= 50% 40%. */
const enrolBand = (v: number, w: number) => (w * (v >= 90 ? 20 : v >= 80 ? 18 : v >= 70 ? 16 : v >= 60 ? 12 : v >= 50 ? 8 : 0)) / 20;
const enrolment = (code: string, w: number, title = 'Enrolment ratio in the first year') =>
  qn(code, title, '%', w, { ...Y3, inputs: [{ key: 'admitted', label: 'N1: students admitted in the first year', source: 'students_admitted' }, { key: 'intake', label: 'N: sanctioned intake', source: 'seats_sanctioned' }], calc: pct('admitted', 'intake'), bench: 90, formula: 'Enrolment ratio = N1 / N x 100, average of three years: >= 90% full marks, >= 80% 90%, >= 70% 80%, >= 60% 60%, >= 50% 40%, otherwise 0', marks: (v, _b, _i, wt) => enrolBand(v, wt), columns: ['Item', 'CAY', 'CAYm1', 'CAYm2'], evidence: ['Approval letters with sanctioned intake', 'Admission records'] });
const successIndex = (code: string, w: number, title: string) =>
  qn(code, title, 'index', w, { ...Y3, inputs: [{ key: 'graduated', label: 'Students graduating in the stipulated period', source: 'final_passed' }, { key: 'admitted', label: 'Students admitted in the batch (including lateral entry)', source: 'final_appeared' }], calc: per('graduated', 'admitted'), bench: 1, formula: 'Success index SI = students graduated in the stipulated period / students admitted in that batch; marks = criterion marks x mean SI of the three latest graduating batches', marks: (v, _b, _i, wt) => wt * clamp(v), columns: ['Year of entry', 'N1 + N2 + N3 (admitted)', 'Graduated in the stipulated period', 'Success index'], evidence: ['Batch-wise result statements from the university'] });
const api = (code: string, w: number, year: string) =>
  qn(code, `Academic performance index (API) of ${year} students`, 'API', w, { ...Y3, inputs: [{ key: 'cgpa', label: `Mean CGPA / SGPA of ${year} students (out of 10)` }, { key: 'passed', label: `Successful ${year} students` }, { key: 'appeared', label: `${year[0].toUpperCase()}${year.slice(1)} students appeared` }], calc: (v) => (v.appeared ? (v.cgpa ?? 0) * ((v.passed ?? 0) / v.appeared) : null), bench: 10, formula: 'API = mean CGPA (on a 10-point scale) x successful students / students appeared; marks pro rata to an API of 10, mean of three years', marks: (v, _b, _i, wt) => (wt * Math.min(10, v)) / 10, columns: ['Academic year', 'Mean CGPA', 'Successful students', 'Students appeared', 'API'], evidence: [`${year[0].toUpperCase()}${year.slice(1)} result statements`] });
const placementIndex = (code: string, w: number, title = 'Placement, higher studies and entrepreneurship (assessment index)') =>
  qn(code, title, '%', w, { ...Y3, inputs: [{ key: 'placed', label: 'X: students placed', source: 'placed' }, { key: 'higher', label: 'Y: students admitted to higher studies' }, { key: 'entrepreneurs', label: 'Z: students turned entrepreneurs' }, { key: 'final', label: 'N: final-year students', source: 'final_appeared' }], calc: (v) => (v.final ? (100 * ((v.placed ?? 0) + (v.higher ?? 0) + (v.entrepreneurs ?? 0))) / v.final : null), bench: 100, formula: 'Assessment index = (X + Y + Z) / N x 100; marks = criterion marks x mean index of three years / 100', marks: (v, _b, _i, wt) => wt * clamp(v / 100), rowsSource: 'placed', columns: ['Student', 'Employer / institution / venture', 'Appointment letter or admission reference', 'Year'], evidence: ['Appointment letters', 'Admission letters for higher studies', 'Registration documents of ventures'] });
const sfr = (code: string, w: number, bench: number, cutoff: number) =>
  qn(code, 'Student-faculty ratio (SFR)', 'ratio', w, { ...Y3, inputs: [students, faculty], calc: per('students', 'faculty'), bench, dir: 'low', formula: `SFR = students / faculty; marks = criterion marks x ${bench} / mean SFR (capped); zero when SFR exceeds ${cutoff}`, marks: (v, b, _i, wt) => (v > cutoff || v <= 0 ? 0 : wt * clamp((b || bench) / v)), rowsSource: 'teachers_fulltime', columns: ['Year', 'Students', 'Faculty (F)', 'SFR'], evidence: ['Faculty list with appointment letters', 'Student roll lists'] });
const cadre = (code: string, w: number, ratio: number) =>
  qn(code, 'Faculty cadre proportion (professors : associate professors : assistant professors against 1 : 2 : 6)', 'index', w, { ...Y3, inputs: [{ key: 'prof', label: 'AF1: professors', source: 'teachers_professor' }, { key: 'assoc', label: 'AF2: associate professors', source: 'teachers_associate' }, { key: 'asst', label: 'AF3: assistant professors', source: 'teachers_assistant' }, students], calc: (v) => { const f = (v.students ?? 0) / ratio; if (!f) return null; return 12.5 * (Math.min(1, (v.prof ?? 0) / (f / 9)) + 0.6 * Math.min(1, (v.assoc ?? 0) / ((2 * f) / 9)) + 0.4 * Math.min(1, (v.asst ?? 0) / ((6 * f) / 9))); }, bench: 25, formula: `Cadre ratio marks = (AF1/RF1 + 0.6 x AF2/RF2 + 0.4 x AF3/RF3) x 12.5, with required faculty F = students / ${ratio} split RF1 : RF2 : RF3 = 1 : 2 : 6 (each ratio capped at 1); scaled to this criterion's marks`, marks: (v, _b, _i, wt) => wt * clamp(v / 25), columns: ['Year', 'Required F1 / available', 'Required F2 / available', 'Required F3 / available'], evidence: ['Appointment and promotion orders'] });
const retention = (code: string, w: number) =>
  qn(code, 'Faculty retention', '%', w, { ...Y3, inputs: [faculty, { key: 'left', label: 'Faculty who left during the year', source: 'teachers_left' }], calc: (v) => (v.faculty ? (100 * (v.faculty - (v.left ?? 0))) / v.faculty : null), bench: 90, formula: 'Faculty retained / faculty x 100: >= 90% full marks, pro rata below', marks: (v, b, _i, wt) => wt * clamp(v / (b || 90)), rowsSource: 'teachers_left', columns: ['Year', 'Faculty at the start', 'Faculty who left', 'Retained %'], evidence: ['Faculty joining and relieving records'] });
const fdp = (code: string, w: number) =>
  qn(code, 'Faculty as participants in faculty development and training activities', '%', w, { ...Y3, inputs: [{ key: 'trained', label: 'Faculty who attended FDPs or training', source: 'teachers_fdp' }, faculty], calc: pct('trained', 'faculty'), bench: 100, formula: 'Faculty attending at least one FDP / STTP / training of a week or more / faculty x 100 (marks pro rata)', rowsSource: 'fdp_programmes', columns: ['Faculty', 'Programme', 'Organiser', 'Duration'], evidence: ['FDP certificates'] });
const sponsored = (code: string, w: number, bench: number) =>
  qn(code, 'Sponsored research funding received (INR lakhs)', 'INR lakhs', w, { ...Y3, inputs: [{ key: 'lakhs', label: 'Sponsored research funding (INR lakhs)', source: 'grants_lakhs' }], combine: 'sum', bench, formula: `Funding over three years: INR ${bench} lakhs or more earns full marks (pro rata)`, rowsSource: 'grants_lakhs', columns: ['Project title', 'Principal investigator', 'Funding agency', 'Amount (INR lakhs)', 'Duration'], evidence: ['Sanction letters'] });
const consultancy = (code: string, w: number, bench: number, title = 'Consultancy and industry-sponsored projects (INR lakhs)') =>
  qn(code, title, 'INR lakhs', w, { ...Y3, inputs: [{ key: 'lakhs', label: 'Consultancy revenue (INR lakhs)', source: 'consultancy_lakhs', fromRows: { op: 'sum', column: 'Amount (INR lakhs)' } }], combine: 'sum', bench, formula: `Consultancy over three years: INR ${bench} lakhs or more earns full marks (pro rata)`, rowsSource: 'consultancy_lakhs', columns: ['Project title', 'Faculty', 'Client', 'Amount (INR lakhs)', 'Year'], evidence: ['Consultancy agreements and receipts'] });
const research = (code: string, w: number, bench: number) =>
  qn(code, 'Academic research: papers in indexed journals, books, chapters and Ph.D.s guided per faculty', 'per faculty', w, { ...Y3, inputs: [{ key: 'papers', label: 'Papers in indexed journals', source: 'papers_indexed' }, { key: 'books', label: 'Books and chapters', source: 'books_chapters' }, { key: 'phd', label: 'Ph.D.s awarded under the faculty', source: 'phd_awarded' }, { ...faculty, pool: 'avg' }], calc: (v) => (v.faculty ? ((v.papers ?? 0) + (v.books ?? 0) + 2 * (v.phd ?? 0)) / v.faculty : null), combine: 'pool', bench, formula: `(Indexed papers + books and chapters + 2 x Ph.D.s guided) over three years / mean faculty; marks pro rata to ${bench} per faculty`, rowsSource: 'papers_indexed', columns: ['Faculty', 'Title', 'Journal / publisher', 'Year', 'Indexing'], evidence: ['First pages of papers', 'Ph.D. award notifications'] });
const patents = (code: string, w: number) =>
  qn(code, 'Patents published or granted, and IPR', 'patents', w, { ...Y3, inputs: [{ key: 'published', label: 'Patents published', source: 'patents_published' }, { key: 'granted', label: 'Patents granted', source: 'patents_granted' }], calc: (v) => (v.published ?? 0) + 2 * (v.granted ?? 0), combine: 'sum', bench: 6, formula: 'Patents published + 2 x patents granted over three years: 6 or more earns full marks (pro rata)', rowsSource: 'patents_filed', columns: ['Title', 'Inventors', 'Application no.', 'Status', 'Date'], evidence: ['Patent publication or grant documents'] });
const mentoring = (code: string, w: number) =>
  qn(code, 'Mentoring system to help at the individual level', 'ratio', w, { inputs: [{ key: 'mentees', label: 'Students with a mentor', source: 'mentees' }, { key: 'mentors', label: 'Mentors', source: 'mentors' }], calc: per('mentees', 'mentors'), ...one, bench: 20, dir: 'low', formula: 'Students per mentor: 20 or fewer earns full marks (pro rata above)', columns: ['Mentor', 'Students'], evidence: ['Mentor allocation lists and mentoring records'] });
const careerGuidance = (code: string, w: number) =>
  qn(code, 'Career guidance, training and placement support', '%', w, { ...Y3, inputs: [{ key: 'guided', label: 'Students given career guidance or training', source: 'counselled' }, students], calc: pct('guided', 'students'), bench: 60, formula: 'Students given career guidance or placement training / students x 100 (marks pro rata to 60%)', rowsSource: 'counselled', columns: ['Programme', 'Students', 'Date'], evidence: ['Training reports'] });
const events = (code: string, w: number) =>
  qn(code, 'Co-curricular and extra-curricular activities', 'events', w, { ...Y3, inputs: [{ key: 'events', label: 'Events held', source: 'sports_cultural_events' }], bench: 10, formula: 'Sports, cultural and technical events per year: 10 or more earns full marks (pro rata)', rowsSource: 'sports_cultural_events', columns: ['Event', 'Date', 'Participants'], evidence: ['Event reports'] });

export const NBA_UG_ENGG_T1: FrameworkDef = define({
  key: 'nba-ug-eng-t1',
  body: 'nba',
  title: 'NBA SAR - UG Engineering (Tier-I)',
  variant: 'UG engineering programme, Tier-I institution (autonomous institution or university department)',
  source: 'NBA SAR format for UG engineering programmes, Tier-I institutions: ten criteria, 1000 marks (programme level 780, institution level 220)',
  scoring: 'nba',
  years: 3,
  criteria: [
    { id: '1', title: 'Vision, mission and programme educational objectives', indicators: [
      { id: '1.1', title: 'Vision and mission', metrics: [ql('1.1', 'State the vision and mission of the department and the institute', 5, { evidence: ['Vision and mission statements'] })] },
      { id: '1.2', title: 'Programme educational objectives', metrics: [ql('1.2', 'State the programme educational objectives (PEOs), three to five', 5, { evidence: ['PEO statements'] })] },
      { id: '1.3', title: 'Dissemination', metrics: [ql('1.3', 'Where the vision, mission and PEOs are published and how they are disseminated among stakeholders', 15, { evidence: ['Website pages, notice boards, curriculum books and department brochures showing the statements'] })] },
      { id: '1.4', title: 'Process for defining vision, mission and PEOs', metrics: [ql('1.4', 'Process for defining the vision and mission of the department and the PEOs of the programme, with stakeholder involvement', 15, { evidence: ['Minutes of the Department Advisory Board (DAB) and Programme Assessment Committee (PAC) meetings'] })] },
      { id: '1.5', title: 'Consistency of PEOs with mission', metrics: [ql('1.5', 'Mapping of programme educational objectives with the elements of the department mission (PEO-mission matrix) with justification', 10, { narrative: 'peo_mission', evidence: ['PEO-mission consistency matrix'] })] },
    ] },
    { id: '2', title: 'Programme curriculum and teaching-learning processes', indicators: [
      { id: '2.1', title: 'Programme curriculum', metrics: [ql('2.1', 'Programme curriculum: structure and components, the process used to identify the extent of compliance with the POs and PSOs, and actions to bridge curricular gaps', 20, { evidence: ['Curriculum structure with credits', 'Curricular gap analysis'] })] },
      { id: '2.2', title: 'Teaching-learning processes', metrics: [
        ql('2.2.1', 'Process for improving the quality of the teaching-learning process', 25, { narrative: 'nba_course_files' }),
        ql('2.2.2', 'Quality of end-semester examination question papers, assignments and evaluation', 20),
        ql('2.2.3', 'Quality of student projects: identification, allotment, review and assessment against POs', 20),
        ql('2.2.4', 'Initiatives related to industry interaction, industry internship and summer training', 15),
      ] },
    ] },
    { id: '3', title: 'Course outcomes and programme outcomes', indicators: [
      { id: '3.1', title: 'Correlation between courses and POs / PSOs', metrics: [qn('3.1', 'Course outcomes mapped to programme outcomes and programme-specific outcomes (course articulation matrices)', '%', 25, { inputs: [{ key: 'mapped', label: 'Course outcomes mapped to a PO or PSO', source: 'obe_cos_mapped' }, { key: 'cos', label: 'Course outcomes defined', source: 'obe_cos' }], calc: pct('mapped', 'cos'), ...one, bench: 100, formula: 'Course outcomes mapped to at least one PO / PSO / course outcomes x 100 (marks pro rata)', narrative: 'nba_courses_mapped', columns: ['Course code', 'Course name', 'CO', 'PO1 .. PO12', 'PSO1 .. PSO3'], evidence: ['Course articulation matrices and the programme articulation matrix'] })] },
      { id: '3.2', title: 'Attainment of course outcomes', metrics: [qn('3.2', 'Course outcomes that met the attainment target, from the assessment tools and processes', '%', 75, { inputs: [{ key: 'met', label: 'Course outcomes that met the target', source: 'obe_co_met' }, { key: 'cos', label: 'Course outcomes assessed', source: 'obe_co_assessed' }], calc: pct('met', 'cos'), ...one, bench: 100, formula: 'Course outcomes attained / course outcomes assessed x 100 (marks pro rata); attainment levels from internal and university examinations', narrative: 'nba_co_attain', columns: ['Course', 'CO', 'Direct attainment', 'Indirect attainment', 'Final attainment', 'Target', 'Met'], evidence: ['Attainment calculation sheets for each course', 'Description of assessment tools'] })] },
      { id: '3.3', title: 'Attainment of programme outcomes', metrics: [qn('3.3', 'Programme outcomes and PSOs that met the attainment target (direct and indirect)', '%', 75, { inputs: [{ key: 'met', label: 'POs and PSOs that met the target', source: 'obe_po_met' }, { key: 'pos', label: 'POs and PSOs', source: 'obe_po_assessed' }], calc: pct('met', 'pos'), ...one, bench: 100, formula: 'POs / PSOs attained / POs and PSOs x 100 (marks pro rata); direct attainment through the CO-PO matrix, indirect through exit, alumni and employer surveys', narrative: 'outcomes_met', columns: ['PO / PSO', 'Direct attainment', 'Indirect attainment', 'Final attainment', 'Target', 'Met'], evidence: ['PO attainment sheets', 'Survey analyses'] })] },
    ] },
    { id: '4', title: 'Students\' performance', indicators: [
      { id: '4.1', title: 'Enrolment ratio', metrics: [enrolment('4.1', 20)] },
      { id: '4.2', title: 'Success rate', metrics: [successIndex('4.2', 20, 'Success rate in the stipulated period of the programme (success index)')] },
      { id: '4.3', title: 'Academic performance in the second year', metrics: [api('4.3', 10, 'second-year')] },
      { id: '4.4', title: 'Placement, higher studies and entrepreneurship', metrics: [placementIndex('4.4', 30)] },
      { id: '4.5', title: 'Professional activities', metrics: [ql('4.5', 'Professional societies and chapters, technical events, publications (magazines, newsletters) and student participation in inter-institute events', 20)] },
    ] },
    { id: '5', title: 'Faculty information and contributions', indicators: [
      { id: '5.1', title: 'Student-faculty ratio', metrics: [sfr('5.1', 20, 20, 25)] },
      { id: '5.2', title: 'Faculty cadre proportion', metrics: [cadre('5.2', 20, 20)] },
      { id: '5.3', title: 'Faculty qualification', metrics: [qn('5.3', 'Faculty qualification index (FQ)', 'index', 25, { ...Y3, inputs: [{ key: 'phd', label: 'X: faculty with Ph.D.', source: 'teachers_doctorate' }, { key: 'pg', label: 'Y: faculty with M.E. / M.Tech.', source: 'teachers_pg' }, students], calc: (v) => { const f = (v.students ?? 0) / 20; return f ? 2.5 * ((10 * (v.phd ?? 0) + 4 * (v.pg ?? 0)) / f) : null; }, bench: 25, formula: 'FQ = 2.5 x (10X + 4Y) / F, with F = students / 20 (faculty required at 20 : 1); marks = mean FQ of three years capped at 25, scaled to this criterion\'s marks', marks: (v, _b, _i, wt) => wt * clamp(v / 25), rowsSource: 'teachers_doctorate', columns: ['Year', 'X (Ph.D.)', 'Y (M.E. / M.Tech.)', 'F (required)', 'FQ'], evidence: ['Degree certificates of faculty'] })] },
      { id: '5.4', title: 'Faculty retention', metrics: [retention('5.4', 10)] },
      { id: '5.5', title: 'Innovations in teaching and learning', metrics: [ql('5.5', 'Innovations by the faculty in teaching and learning, made available for peer review', 10)] },
      { id: '5.6', title: 'Faculty development', metrics: [fdp('5.6', 15)] },
      { id: '5.7', title: 'Research and development', metrics: [research('5.7.1', 20, 1.5), sponsored('5.7.2', 20, 50), ql('5.7.3', 'Development activities: product development, research laboratories, instructional materials, working models', 15), consultancy('5.7.4', 20, 10)] },
      { id: '5.8', title: 'Faculty performance appraisal', metrics: [ql('5.8', 'Faculty performance appraisal and development system (FPADS): its standards, implementation and effectiveness', 15)] },
      { id: '5.9', title: 'Visiting and adjunct faculty', metrics: [qn('5.9', 'Visiting / adjunct / emeritus faculty and industry experts', 'hours', 10, { ...Y3, inputs: [{ key: 'hours', label: 'Hours of teaching by visiting faculty and industry experts' }], bench: 50, formula: 'At least 50 hours of interaction per year earns full marks (pro rata)', columns: ['Name', 'Organisation', 'Course or topic', 'Hours'], evidence: ['Appointment letters of visiting faculty', 'Attendance of sessions'] })] },
    ] },
    { id: '6', title: 'Facilities and technical support', indicators: [
      { id: '6.1', title: 'Laboratories', metrics: [ql('6.1', 'Adequate, well-equipped laboratories and technical manpower', 40, { narrative: 'rooms_summary', evidence: ['List of laboratories with equipment, batch size and weekly utilisation'] })] },
      { id: '6.2', title: 'Additional facilities', metrics: [ql('6.2', 'Additional facilities created for improving the quality of learning experience in laboratories', 20, { narrative: 'research_facilities' })] },
      { id: '6.3', title: 'Laboratories for projects', metrics: [ql('6.3', 'Laboratories maintenance and overall ambience; project laboratory', 10)] },
      { id: '6.4', title: 'Safety', metrics: [ql('6.4', 'Safety measures in laboratories', 10)] },
    ] },
    { id: '7', title: 'Continuous improvement', indicators: [
      { id: '7.1', title: 'Actions on PO / PSO attainment', metrics: [ql('7.1', 'Actions taken on the results of evaluation of each PO and PSO, and their effect', 30, { narrative: 'cqi_actions' })] },
      { id: '7.2', title: 'Academic audit', metrics: [ql('7.2', 'Academic audit and the actions taken on its findings', 15)] },
      { id: '7.3', title: 'Improvement in placement', metrics: [ql('7.3', 'Improvement in placement, higher studies and entrepreneurship', 10)] },
      { id: '7.4', title: 'Quality of students admitted', metrics: [ql('7.4', 'Improvement in the quality of students admitted to the programme (entrance ranks and qualifying marks)', 20)] },
    ] },
    { id: '8', title: 'First year academics', indicators: [
      { id: '8.1', title: 'First-year student-faculty ratio', metrics: [qn('8.1', 'First-year student-faculty ratio (FYSFR)', 'ratio', 5, { ...Y3, inputs: [{ key: 'students', label: 'First-year students (sanctioned intake of all UG programmes)' }, { key: 'faculty', label: 'Faculty teaching first-year courses' }], calc: per('students', 'faculty'), bench: 20, dir: 'low', formula: 'FYSFR = first-year students / faculty teaching them: <= 20 full marks, <= 25 60%, otherwise 0', marks: (v, _b, _i, wt) => (v <= 0 ? 0 : v <= 20 ? wt : v <= 25 ? wt * 0.6 : 0), columns: ['Year', 'First-year students', 'Faculty teaching first year', 'FYSFR'], evidence: ['First-year timetable with faculty'] })] },
      { id: '8.2', title: 'Qualification of first-year faculty', metrics: [qn('8.2', 'Qualification of faculty teaching first-year common courses', 'index', 5, { ...Y3, inputs: [{ key: 'phd', label: 'X: regular faculty with Ph.D.' }, { key: 'pg', label: 'Y: regular faculty with a postgraduate degree' }, { key: 'required', label: 'RF: faculty required at 20 : 1' }], calc: (v) => (v.required ? (5 * (v.phd ?? 0) + 3 * (v.pg ?? 0)) / v.required : null), bench: 5, formula: 'Assessment of qualification = (5X + 3Y) / RF, mean of three years, capped at 5', marks: (v, _b, _i, wt) => wt * clamp(v / 5), columns: ['Year', 'X (Ph.D.)', 'Y (PG)', 'RF', 'Assessment'], evidence: ['Qualification certificates'] })] },
      { id: '8.3', title: 'First-year academic performance', metrics: [api('8.3', 10, 'first-year')] },
      { id: '8.4', title: 'Attainment of first-year course outcomes', metrics: [ql('8.4', 'Attainment of course outcomes of first-year courses: assessment processes and results', 10, { narrative: 'nba_co_attain' })] },
      { id: '8.5', title: 'Attainment of POs from first-year courses', metrics: [ql('8.5', 'Attainment of programme outcomes from first-year courses: results and actions taken', 20, { narrative: 'nba_po_attain' })] },
    ] },
    { id: '9', title: 'Student support systems', indicators: [
      { id: '9.1', title: 'Mentoring', metrics: [mentoring('9.1', 5)] },
      { id: '9.2', title: 'Feedback analysis', metrics: [ql('9.2', 'Feedback analysis and reward / corrective measures taken', 10, { narrative: 'feedback_atr' })] },
      { id: '9.3', title: 'Feedback on facilities', metrics: [ql('9.3', 'Feedback on facilities and actions taken', 5, { narrative: 'feedback_surveys' })] },
      { id: '9.4', title: 'Self-learning', metrics: [ql('9.4', 'Self-learning: facilities, materials and the scope for self-learning beyond the syllabus', 5)] },
      { id: '9.5', title: 'Career guidance', metrics: [careerGuidance('9.5', 10)] },
      { id: '9.6', title: 'Entrepreneurship cell', metrics: [ql('9.6', 'Entrepreneurship cell and its activities', 5)] },
      { id: '9.7', title: 'Co-curricular and extra-curricular', metrics: [events('9.7', 10)] },
    ] },
    { id: '10', title: 'Governance, institutional support and financial resources', indicators: [
      { id: '10.1', title: 'Organisation, governance and transparency', metrics: [ql('10.1', 'Vision and mission of the institute, governing body and administrative set-up, decentralisation, delegation of powers, transparency and statutory committees', 40, { evidence: ['Governing body minutes', 'Service rules and policies', 'Statutory committee lists'] })] },
      { id: '10.2', title: 'Budget and public accounting', metrics: [ql('10.2', 'Budget allocation, utilisation and public accounting at institute level', 30, { narrative: 'fees_collected', evidence: ['Audited statements of accounts', 'Budget and actual expenditure for CFY and CFYm1 to CFYm3'] })] },
      { id: '10.3', title: 'Programme budget', metrics: [ql('10.3', 'Programme-specific budget allocation, utilisation', 30)] },
      { id: '10.4', title: 'Library and internet', metrics: [ql('10.4', 'Library and internet: quality of learning resources, e-resources, digital library and bandwidth', 20, { narrative: 'library_summary' })] },
    ] },
  ],
});

/** Management programmes: SFR 1 : 15 (AICTE), the faculty criterion carries the largest share of marks. */
export const NBA_PG_MGMT: FrameworkDef = define({
  key: 'nba-pg-mgmt',
  aliases: ['nba-mba', 'nba-pgdm'],
  body: 'nba',
  title: 'NBA SAR - PG Management (MBA / PGDM)',
  variant: 'Postgraduate management programme (MBA or PGDM)',
  source: 'NBA SAR format for postgraduate management programmes (February 2023): ten criteria, 1000 marks; pre-qualifiers of three graduating batches, 20% faculty with Ph.D. and 60% admissions against sanctioned intake',
  scoring: 'nba',
  years: 3,
  criteria: [
    { id: '1', title: 'Vision, mission and programme educational objectives', indicators: [
      { id: '1.1', title: 'Vision and mission', metrics: [ql('1.1', 'Vision and mission of the institute and how they were defined with stakeholders', 10)] },
      { id: '1.2', title: 'Programme educational objectives', metrics: [ql('1.2', 'Programme educational objectives (PEOs) and the process of defining them', 15)] },
      { id: '1.3', title: 'Dissemination', metrics: [ql('1.3', 'Dissemination of the vision, mission and PEOs among stakeholders', 10)] },
      { id: '1.4', title: 'Consistency of PEOs with mission', metrics: [ql('1.4', 'Mapping of PEOs with the mission statements, with justification', 15, { narrative: 'peo_mission' })] },
    ] },
    { id: '2', title: 'Governance, leadership and financial resources', indicators: [
      { id: '2.1', title: 'Governance', metrics: [ql('2.1', 'Governing body, academic council and statutory committees: composition, meetings and decisions', 25)] },
      { id: '2.2', title: 'Leadership', metrics: [ql('2.2', 'Leadership: qualification and experience of the director, decentralisation and faculty participation in decisions', 20)] },
      { id: '2.3', title: 'Transparency and grievance redressal', metrics: [ql('2.3', 'Transparency, public disclosure, grievance redressal and anti-ragging mechanisms', 15)] },
      { id: '2.4', title: 'Financial resources', metrics: [ql('2.4', 'Budget allocation and utilisation for the last three years, audited accounts and financial sustainability', 40, { narrative: 'fees_collected', evidence: ['Audited statements of accounts for three years', 'Budget and actual expenditure'] })] },
    ] },
    { id: '3', title: 'Programme outcomes and course outcomes', indicators: [
      { id: '3.1', title: 'Course outcomes and mapping', metrics: [qn('3.1', 'Course outcomes defined and mapped to programme outcomes', '%', 30, { inputs: [{ key: 'mapped', label: 'Course outcomes mapped to a PO', source: 'obe_cos_mapped' }, { key: 'cos', label: 'Course outcomes defined', source: 'obe_cos' }], calc: pct('mapped', 'cos'), ...one, bench: 100, formula: 'Course outcomes mapped to at least one PO / course outcomes x 100 (marks pro rata)', narrative: 'nba_courses_mapped', columns: ['Course code', 'Course name', 'CO', 'PO1 .. PO7'], evidence: ['CO-PO mapping matrices'] })] },
      { id: '3.2', title: 'Attainment of course outcomes', metrics: [qn('3.2', 'Course outcomes that met the attainment target', '%', 30, { inputs: [{ key: 'met', label: 'Course outcomes that met the target', source: 'obe_co_met' }, { key: 'cos', label: 'Course outcomes assessed', source: 'obe_co_assessed' }], calc: pct('met', 'cos'), ...one, bench: 100, formula: 'Course outcomes attained / course outcomes assessed x 100 (marks pro rata)', narrative: 'nba_co_attain', columns: ['Course', 'CO', 'Direct attainment', 'Indirect attainment', 'Final attainment', 'Target', 'Met'], evidence: ['Attainment calculation sheets'] })] },
      { id: '3.3', title: 'Attainment of programme outcomes', metrics: [qn('3.3', 'Programme outcomes that met the attainment target (direct and indirect)', '%', 40, { inputs: [{ key: 'met', label: 'POs that met the target', source: 'obe_po_met' }, { key: 'pos', label: 'POs assessed', source: 'obe_po_assessed' }], calc: pct('met', 'pos'), ...one, bench: 100, formula: 'POs attained / POs assessed x 100 (marks pro rata); indirect attainment from exit, alumni and recruiter surveys', narrative: 'outcomes_met', columns: ['PO', 'Direct attainment', 'Indirect attainment', 'Final attainment', 'Target', 'Met'], evidence: ['PO attainment sheets', 'Survey analyses'] })] },
    ] },
    { id: '4', title: 'Curriculum and learning process', indicators: [
      { id: '4.1', title: 'Curriculum', metrics: [ql('4.1', 'Curriculum structure, its relevance to the POs, and the process of designing and revising it with industry input', 35)] },
      { id: '4.2', title: 'Pedagogy', metrics: [ql('4.2', 'Pedagogical initiatives: case method, simulations, live projects, flipped classrooms and use of ICT', 30, { narrative: 'nba_course_files' })] },
      { id: '4.3', title: 'Experiential learning', metrics: [qn('4.3', 'Students completing the summer internship and live projects', '%', 30, { ...Y3, inputs: [{ key: 'doing', label: 'Students with a summer internship or live project', source: 'internships' }, students], calc: pct('doing', 'students'), bench: 100, formula: 'Students with an internship or live project / students x 100 (average of three years, marks pro rata)', rowsSource: 'internships', columns: ['Student', 'Organisation', 'Title', 'Duration', 'Evaluation'], evidence: ['Internship certificates and reports'] })] },
      { id: '4.4', title: 'Assessment quality', metrics: [ql('4.4', 'Quality of examination papers, assignments and evaluation: mapping to COs and Bloom\'s levels', 30)] },
    ] },
    { id: '5', title: 'Student quality and performance', indicators: [
      { id: '5.1', title: 'Enrolment ratio', metrics: [enrolment('5.1', 20)] },
      { id: '5.2', title: 'Quality of admitted students', metrics: [ql('5.2', 'Quality of students admitted: admission test (CAT, XAT, MAT, CMAT, GMAT, state tests) scores and percentile ranges', 20)] },
      { id: '5.3', title: 'Success rate', metrics: [successIndex('5.3', 20, 'Success rate: students graduating in the stipulated two years (success index)')] },
      { id: '5.4', title: 'Placement and higher studies', metrics: [placementIndex('5.4', 25, 'Placement, higher studies and entrepreneurship (assessment index)')] },
      { id: '5.5', title: 'Median salary', metrics: [qn('5.5', 'Median salary of placed students', 'INR lakhs a year', 15, { ...Y3, inputs: [{ key: 'median', label: 'Median salary (INR lakhs a year)', source: 'median_salary' }], bench: 10, formula: 'Median salary averaged over three years: INR 10 lakhs a year or more earns full marks (pro rata)', marks: (v, b, _i, wt) => wt * clamp(v / (b || 10)), rowsSource: 'median_salary', columns: ['Academic year', 'Median salary of placed graduates (INR)'], evidence: ['Offer letters showing CTC'] })] },
    ] },
    { id: '6', title: 'Faculty attributes and contributions', indicators: [
      { id: '6.1', title: 'Student-faculty ratio', metrics: [sfr('6.1', 30, 15, 20)] },
      { id: '6.2', title: 'Faculty cadre', metrics: [cadre('6.2', 25, 15)] },
      { id: '6.3', title: 'Faculty qualification', metrics: [qn('6.3', 'Faculty with a Ph.D.', '%', 30, { ...Y3, inputs: [{ key: 'phd', label: 'Faculty with Ph.D.', source: 'teachers_doctorate' }, faculty], calc: pct('phd', 'faculty'), bench: 60, formula: 'Faculty with a Ph.D. / regular faculty x 100: 60% or more earns full marks (pro rata); at least 20% is a pre-qualifier', marks: (v, b, _i, wt) => (v < 20 ? 0 : wt * clamp(v / (b || 60))), rowsSource: 'teachers_doctorate', columns: ['Year', 'Faculty with Ph.D.', 'Regular faculty', '%'], evidence: ['Ph.D. degree certificates'] })] },
      { id: '6.4', title: 'Faculty retention', metrics: [retention('6.4', 15)] },
      { id: '6.5', title: 'Faculty development', metrics: [fdp('6.5', 20)] },
      { id: '6.6', title: 'Research publications', metrics: [research('6.6', 50, 2)] },
      { id: '6.7', title: 'Sponsored research and consultancy', metrics: [sponsored('6.7.1', 20, 25), consultancy('6.7.2', 25, 25, 'Consultancy, management development and executive education programmes (INR lakhs)')] },
      { id: '6.8', title: 'Case studies and teaching material', metrics: [ql('6.8', 'Case studies, teaching notes, books and learning material developed by faculty', 15)] },
      { id: '6.9', title: 'Faculty performance appraisal', metrics: [ql('6.9', 'Faculty performance appraisal and development system', 20)] },
    ] },
    { id: '7', title: 'Industry and international connect', indicators: [
      { id: '7.1', title: 'Industry interaction', metrics: [ql('7.1', 'Industry interaction: guest lectures, advisory board, industry visits, live projects and industry-sponsored chairs', 40)] },
      { id: '7.2', title: 'Collaborations', metrics: [qn('7.2', 'Functional MoUs and collaborations with industry and institutions', 'MoUs', 30, { ...Y3, inputs: [{ key: 'mous', label: 'Functional MoUs', source: 'mous_functional', fromRows: { op: 'count' } }], combine: 'latest', bench: 10, formula: 'Functional MoUs with activities in the year: 10 or more earns full marks (pro rata)', rowsSource: 'mous_functional', columns: ['Partner', 'Kind', 'Signed on', 'Valid until', 'Activities in the year'], evidence: ['Copies of MoUs', 'Reports of activities under each MoU'] })] },
      { id: '7.3', title: 'International exposure', metrics: [ql('7.3', 'International exposure: exchange programmes, international faculty and immersion programmes', 30)] },
    ] },
    { id: '8', title: 'Infrastructure', indicators: [
      { id: '8.1', title: 'Classrooms and facilities', metrics: [ql('8.1', 'Classrooms, tutorial rooms, seminar halls and faculty rooms', 25, { narrative: 'rooms_summary' })] },
      { id: '8.2', title: 'Library and e-resources', metrics: [ql('8.2', 'Library: titles, journals, databases (such as CMIE Prowess, Capitaline, EBSCO) and usage', 30, { narrative: 'library_summary' })] },
      { id: '8.3', title: 'IT infrastructure', metrics: [ql('8.3', 'Computing facilities, software, bandwidth and Wi-Fi', 20, { narrative: 'it_summary' })] },
    ] },
    { id: '9', title: 'Alumni performance and connect', indicators: [
      { id: '9.1', title: 'Alumni association', metrics: [ql('9.1', 'Alumni association and its activities', 20, { narrative: 'alumni' })] },
      { id: '9.2', title: 'Alumni contribution', metrics: [qn('9.2', 'Alumni contribution: guest lectures, mentoring, placements and funds (INR lakhs)', 'INR lakhs', 30, { ...Y3, inputs: [{ key: 'lakhs', label: 'Alumni contribution (INR lakhs)', source: 'alumni_contribution_lakhs' }], combine: 'sum', bench: 10, formula: 'Alumni financial contribution over three years: INR 10 lakhs or more earns full marks (pro rata); other contributions described', rowsSource: 'alumni_contribution_lakhs', columns: ['Donor', 'Received on', 'Amount (INR lakhs)'], evidence: ['Receipts', 'Reports of alumni sessions'] })] },
    ] },
    { id: '10', title: 'Continuous improvement', indicators: [
      { id: '10.1', title: 'Actions on attainment', metrics: [ql('10.1', 'Actions taken on the attainment of POs and their effect', 25, { narrative: 'cqi_actions' })] },
      { id: '10.2', title: 'Academic audit and improvement', metrics: [ql('10.2', 'Academic audit, improvement in placement and in the quality of students admitted', 25)] },
    ] },
  ],
});
