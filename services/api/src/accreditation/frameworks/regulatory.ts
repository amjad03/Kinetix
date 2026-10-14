// Regulatory data returns that are filed, not scored:
// - AICTE: the data an institution enters on the AICTE portal for extension of approval (EoA) under the Approval Process
//   Handbook, with the norms the handbook checks (faculty-student ratio 1 : 20 for UG engineering, 1 : 15 for MBA / PGDM,
//   cadre ratio 1 : 2 : 6, built-up and instructional area, computers, library, bandwidth, mandatory committees and the
//   mandatory disclosure).
// - UGC: the public self-disclosure HEIs must keep on their website (UGC guidelines approved on 15 May 2024: about,
//   accreditation and ranking, administration, academics, admissions and fees, research, student support, finance and
//   infrastructure) together with the grievance and anti-ragging compliance the UGC asks for.
// - CBSE: the affiliated school's OASIS annual data and the Appendix IX mandatory public disclosure (general information,
//   documents and information, results and academics, staff, school infrastructure) under the affiliation bye-laws.
import { choice, define, pct, per, ql, qn, type FrameworkDef } from './types.js';

const one = { combine: 'latest' as const, years: 1 };

export const AICTE_EOA: FrameworkDef = define({
  key: 'aicte-eoa',
  aliases: ['aicte'],
  body: 'aicte',
  title: 'AICTE - Extension of approval data',
  variant: 'Technical institution (engineering, management, pharmacy, architecture) applying for extension of approval',
  source: 'AICTE Approval Process Handbook 2024-27: institution, land and built-up area, programmes and intake, faculty norms, facilities, mandatory committees and disclosure',
  scoring: 'none',
  years: 1,
  criteria: [
    { id: '1', title: 'Institution and applicant', weight: 0, indicators: [{ id: '1', title: 'Institution and applicant', metrics: [
      ql('AICTE-1.1', 'Name, permanent ID, address, type (government, government-aided, private), minority status, affiliating university and year of establishment', 0, { narrative: 'institution_profile', formula: 'From the institution profile', evidence: ['Earlier approval letters (LoA and EoA)', 'Affiliation letter of the university or board'] }),
      ql('AICTE-1.2', 'Applicant: trust, society or company, registration number and date, and the authorised signatory', 0, { formula: 'Entered from the trust or society records', evidence: ['Registration certificate of the trust, society or company', 'Resolution authorising the signatory'] }),
    ] }] },
    { id: '2', title: 'Land and buildings', weight: 0, indicators: [{ id: '2', title: 'Land and buildings', metrics: [
      qn('AICTE-2.1', 'Land area held by the institution', 'acres', 0, { ...one, inputs: [{ key: 'v', label: 'Land area (acres)' }], formula: 'Land in the name of the applicant, as in the land use and conversion documents', columns: ['Survey no.', 'Area (acres)', 'Land use', 'Registered in the name of', 'Document reference'], evidence: ['Land documents', 'Land use certificate'] }),
      qn('AICTE-2.2', 'Built-up area', 'sq m', 0, { ...one, inputs: [{ key: 'v', label: 'Built-up area (sq m)' }], formula: 'Total built-up area as in the building completion certificate', columns: ['Block', 'Floors', 'Built-up area (sq m)', 'Occupancy certificate reference'], evidence: ['Building completion and occupancy certificates', 'Approved building plan'] }),
      qn('AICTE-2.3', 'Instructional area: classrooms, tutorial rooms, laboratories, workshops and drawing halls', 'rooms', 0, { ...one, inputs: [{ key: 'rooms', label: 'Classrooms and halls', source: 'classrooms' }], calc: (v) => v.rooms ?? null, rowsSource: 'classrooms', formula: 'Rooms recorded as classrooms or halls; the area of each is checked against the handbook (classroom 66 sq m, tutorial room 33 sq m, laboratory 66 sq m for UG engineering)', columns: ['Room', 'Kind', 'Capacity', 'Carpet area (sq m)'], evidence: ['Floor plans showing instructional rooms'] }),
    ] }] },
    { id: '3', title: 'Programmes and intake', weight: 0, indicators: [{ id: '3', title: 'Programmes and intake', metrics: [
      qn('AICTE-3.1', 'Programmes and courses run (level, shift, duration)', 'programmes', 0, { ...one, inputs: [{ key: 'v', label: 'Programmes', source: 'programmes' }], rowsSource: 'programmes', formula: 'Programmes in the ERP', columns: ['Programme', 'Level', 'Code', 'Semesters'], evidence: ['Earlier EoA letter listing approved courses'] }),
      qn('AICTE-3.2', 'Approved intake', 'seats', 0, { ...one, inputs: [{ key: 'v', label: 'Approved intake', source: 'seats_sanctioned' }], rowsSource: 'seats_sanctioned', formula: 'Seats of the admission cycles that opened in the year', columns: ['Admission cycle', 'Programme', 'Seats'], evidence: ['EoA letter with approved intake per course'] }),
      qn('AICTE-3.3', 'Students admitted against the approved intake', '%', 0, { ...one, inputs: [{ key: 'admitted', label: 'Students admitted', source: 'students_admitted' }, { key: 'intake', label: 'Approved intake', source: 'seats_sanctioned' }], calc: pct('admitted', 'intake'), rowsSource: 'students_admitted', formula: 'Admitted / approved intake x 100; where admissions average 50% or less over three years the handbook allows the faculty requirement to be computed on actual admissions', columns: ['Roll no.', 'Student', 'Programme', 'Category', 'Enrolled on'], evidence: ['Admission approval from the state admission authority'] }),
    ] }] },
    { id: '4', title: 'Faculty', weight: 0, indicators: [{ id: '4', title: 'Faculty', metrics: [
      qn('AICTE-4.1', 'Regular faculty in position', 'faculty', 0, { ...one, inputs: [{ key: 'v', label: 'Regular faculty', source: 'teachers_fulltime' }], rowsSource: 'teachers_fulltime', formula: 'Teachers and heads in service in the year, other than visiting faculty; each needs a unique faculty ID on the AICTE portal', columns: ['Teacher', 'PAN', 'Department', 'Designation', 'Nature of appointment', 'Date of joining'], evidence: ['Appointment orders', 'Salary statements through bank'] }),
      qn('AICTE-4.2', 'Faculty-student ratio', 'students per faculty', 0, { ...one, inputs: [{ key: 'students', label: 'Students on roll', source: 'students_on_roll' }, { key: 'faculty', label: 'Regular faculty', source: 'teachers_fulltime' }], calc: per('students', 'faculty'), bench: 20, dir: 'low', formula: 'Students / regular faculty; the norm is 1 : 20 for UG engineering and 1 : 15 for MBA / PGDM and for autonomous or accredited institutions at UG level', columns: ['Programme', 'Students', 'Faculty', 'Ratio'], evidence: ['Faculty list', 'Student roll list'] }),
      qn('AICTE-4.3', 'Cadre ratio (professors : associate professors : assistant professors)', 'faculty', 0, { ...one, inputs: [{ key: 'prof', label: 'Professors', source: 'teachers_professor' }, { key: 'assoc', label: 'Associate professors', source: 'teachers_associate' }, { key: 'asst', label: 'Assistant professors', source: 'teachers_assistant' }], calc: (v) => (v.prof ?? 0) + (v.assoc ?? 0) + (v.asst ?? 0), formula: 'Faculty by cadre against the 1 : 2 : 6 norm (not for diploma)', columns: ['Cadre', 'Required', 'Available'], evidence: ['Appointment and promotion orders'] }),
      qn('AICTE-4.4', 'Faculty with a Ph.D.', 'faculty', 0, { ...one, inputs: [{ key: 'v', label: 'Faculty with a Ph.D.', source: 'teachers_doctorate' }], rowsSource: 'teachers_doctorate', formula: 'Regular faculty with a doctoral degree recorded', columns: ['Teacher', 'Department', 'Degree', 'University', 'Year'], evidence: ['Ph.D. degree certificates'] }),
      qn('AICTE-4.5', 'Non-teaching and technical staff', 'staff', 0, { ...one, inputs: [{ key: 'v', label: 'Non-teaching staff', source: 'staff_nonteaching' }], rowsSource: 'staff_nonteaching', formula: 'Staff without a teaching role in service in the year', columns: ['Name', 'Department', 'Designation', 'Gender', 'Nature of appointment'] }),
    ] }] },
    { id: '5', title: 'Facilities', weight: 0, indicators: [{ id: '5', title: 'Facilities', metrics: [
      qn('AICTE-5.1', 'Computers for students', 'students per computer', 0, { ...one, inputs: [{ key: 'students', label: 'Students on roll', source: 'students_on_roll' }, { key: 'computers', label: 'Computers', source: 'computers' }], calc: per('students', 'computers'), dir: 'low', rowsSource: 'computers', formula: 'Students per computer available to students, checked against the handbook norm for the programme', columns: ['Tag', 'Asset', 'Location'], evidence: ['Stock register of computers'] }),
      qn('AICTE-5.2', 'Internet bandwidth', 'Mbps', 0, { ...one, inputs: [{ key: 'v', label: 'Leased-line bandwidth (Mbps)' }], formula: 'Dedicated internet bandwidth as in the service provider\'s bill', columns: ['Provider', 'Bandwidth (Mbps)', 'Contract until'], evidence: ['Bandwidth bill or agreement'] }),
      qn('AICTE-5.3', 'Library: volumes and titles', 'books', 0, { ...one, inputs: [{ key: 'v', label: 'Copies', source: 'library_titles' }], rowsSource: 'library_titles', formula: 'Copies catalogued in the library', columns: ['Title', 'Author', 'ISBN', 'Copies'], evidence: ['Accession register'] }),
      qn('AICTE-5.4', 'E-journals and e-resources subscribed', 'resources', 0, { ...one, inputs: [{ key: 'v', label: 'E-resources', source: 'eresources' }], rowsSource: 'eresources', formula: 'E-resources registered and active (the handbook expects e-journal packages such as those of the AICTE e-consortium)', columns: ['Resource', 'Kind', 'Publisher', 'Licence until'], evidence: ['Subscription invoices'] }),
    ] }] },
    { id: '6', title: 'Committees and compliance', weight: 0, indicators: [{ id: '6', title: 'Committees and compliance', metrics: [
      choice('AICTE-6.1', 'Committees, cells and facilities the handbook makes mandatory', 0, ['Anti-ragging committee and squad', 'Internal Complaints Committee', 'Committee for SC / ST', 'Grievance redressal committee with an ombudsperson', 'Student counselling system', 'Institution Innovation Council', 'Barrier-free access for persons with disabilities', 'Feedback facility for students on the AICTE portal', 'Mandatory disclosure on the website', 'Bank account for fees with online payment'], { formula: 'Committees and facilities in place', evidence: ['Orders constituting each committee with members', 'Minutes of meetings'] }),
      qn('AICTE-6.2', 'Student grievances received and resolved', 'grievances', 0, { ...one, inputs: [{ key: 'received', label: 'Grievances received', source: 'grievances' }, { key: 'resolved', label: 'Grievances resolved', source: 'grievances_resolved' }], calc: (v) => v.received ?? null, rowsSource: 'grievances', formula: 'Grievances received in the year; resolution shown alongside', columns: ['Ticket', 'Category', 'Raised on', 'Status'], evidence: ['Grievance register'] }),
    ] }] },
    { id: '7', title: 'Finance and disclosure', weight: 0, indicators: [{ id: '7', title: 'Finance and disclosure', metrics: [
      qn('AICTE-7.1', 'Fees collected (INR lakhs)', 'INR lakhs', 0, { ...one, inputs: [{ key: 'v', label: 'Fees collected (INR lakhs)', source: 'fees_lakhs' }], rowsSource: 'fees_lakhs', formula: 'Fees collected in the year; fees charged must be those approved by the state fee regulatory committee', columns: ['Head', 'Amount (INR)'], evidence: ['Fee approval order of the fee regulatory committee', 'Audited statement of accounts'] }),
      ql('AICTE-7.2', 'Mandatory disclosure: the information the handbook requires on the institution\'s website, kept up to date', 0, { evidence: ['Link to the mandatory disclosure page'] }),
      ql('AICTE-7.3', 'Affidavit and undertaking on compliance with the norms, and the deficiencies the institution reports', 0, { evidence: ['Notarised affidavit in the handbook\'s format'] }),
    ] }] },
  ],
});

export const UGC_DISCLOSURE: FrameworkDef = define({
  key: 'ugc-disclosure',
  aliases: ['ugc'],
  body: 'ugc',
  title: 'UGC - Public self-disclosure and returns',
  variant: 'University or college under the UGC (website self-disclosure, grievance and anti-ragging compliance)',
  source: 'UGC guidelines on public self-disclosure by higher education institutions (approved 15 May 2024); UGC (Redress of Grievances of Students) Regulations 2023; UGC anti-ragging regulations',
  scoring: 'none',
  years: 1,
  criteria: [
    { id: '1', title: 'About the institution', weight: 0, indicators: [{ id: '1', title: 'About', metrics: [
      ql('UGC-1.1', 'Overview, the Act and statutes or memorandum of association, and the institutional development plan (IDP)', 0, { narrative: 'institution_profile', formula: 'From the institution profile and the documents uploaded', evidence: ['Act and statutes or memorandum of association', 'Institutional development plan'] }),
      ql('UGC-1.2', 'Recognition under sections 2(f) and 12(B) of the UGC Act, and constituent, affiliated and off-campus colleges or centres', 0, { evidence: ['UGC recognition letters'] }),
    ] }] },
    { id: '2', title: 'Accreditation and ranking', weight: 0, indicators: [{ id: '2', title: 'Accreditation and ranking', metrics: [
      ql('UGC-2.1', 'NAAC accreditation status and grade with validity, NBA accreditation of programmes, NIRF rank', 0, { narrative: 'institution_profile', evidence: ['NAAC certificate', 'NBA accreditation letters', 'NIRF rank page'] }),
    ] }] },
    { id: '3', title: 'Administration', weight: 0, indicators: [{ id: '3', title: 'Administration', metrics: [
      ql('UGC-3.1', 'Governing bodies (board of management, academic council, finance committee) with members, and the officers of the institution', 0, { evidence: ['Lists of members of each body', 'Minutes of meetings'] }),
      choice('UGC-3.2', 'Statutory committees, cells and officers', 0, ['Students\' grievance redressal committee', 'Ombudsperson', 'Anti-ragging committee and squad', 'Internal Complaints Committee', 'Socio-Economically Disadvantaged Groups (SEDG) cell', 'Equal opportunity cell', 'SC / ST and OBC cell', 'Student counselling and well-being centre', 'Anti-discrimination officer', 'Internal Quality Assurance Cell'], { formula: 'Committees in place and disclosed', evidence: ['Notification of each committee with members and contact details'] }),
      qn('UGC-3.3', 'Statutory committees that met in the year', 'committees', 0, { ...one, inputs: [{ key: 'v', label: 'Committees that met', source: 'statutory_committees' }], rowsSource: 'statutory_committees', formula: 'Statutory committees with a meeting recorded in the year', columns: ['Committee', 'Meetings'], evidence: ['Minutes of committee meetings'] }),
    ] }] },
    { id: '4', title: 'Academics', weight: 0, indicators: [{ id: '4', title: 'Academics', metrics: [
      qn('UGC-4.1', 'Academic programmes offered', 'programmes', 0, { ...one, inputs: [{ key: 'v', label: 'Programmes', source: 'programmes' }], rowsSource: 'programmes', formula: 'Programmes in the ERP', columns: ['Programme', 'Level', 'Code', 'Semesters'], evidence: ['Ordinances and regulations of each programme'] }),
      qn('UGC-4.2', 'Teachers by department, with qualification and designation', 'teachers', 0, { ...one, inputs: [{ key: 'v', label: 'Teachers', source: 'teachers_all' }], rowsSource: 'teachers_all', formula: 'Teachers in service in the year', columns: ['Name', 'Department', 'Designation', 'Nature of appointment', 'Gender', 'Social category', 'Highest qualification'], evidence: ['Department-wise faculty lists with photographs'] }),
      qn('UGC-4.3', 'Students on roll', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students', source: 'students_on_roll' }], rowsSource: 'students_on_roll', formula: 'Students on roll in the year', columns: ['Roll no.', 'Student', 'Programme', 'Gender', 'Category', 'Status', 'Enrolled on', 'Class / section'] }),
      ql('UGC-4.4', 'Academic calendar, statutes and ordinances on academics and examinations', 0, { evidence: ['Academic calendar', 'Examination ordinances'] }),
    ] }] },
    { id: '5', title: 'Admissions and fees', weight: 0, indicators: [{ id: '5', title: 'Admissions and fees', metrics: [
      ql('UGC-5.1', 'Prospectus, admission process and guidelines, and the seat matrix', 0, { evidence: ['Prospectus of the year', 'Admission notification'] }),
      ql('UGC-5.2', 'Fee structure and the fee refund policy (as per the UGC notification on refund of fees)', 0, { evidence: ['Fee structure', 'Refund policy'] }),
      qn('UGC-5.3', 'Fees collected (INR lakhs)', 'INR lakhs', 0, { ...one, inputs: [{ key: 'v', label: 'Fees collected (INR lakhs)', source: 'fees_lakhs' }], rowsSource: 'fees_lakhs', formula: 'Fees collected in the year', columns: ['Head', 'Amount (INR)'] }),
    ] }] },
    { id: '6', title: 'Research', weight: 0, indicators: [{ id: '6', title: 'Research', metrics: [
      qn('UGC-6.1', 'Research papers published', 'papers', 0, { ...one, inputs: [{ key: 'v', label: 'Papers', source: 'papers_journal' }], rowsSource: 'papers_journal', formula: 'Journal papers of the year', columns: ['Title of paper', 'Name of the author(s)', 'Name of journal', 'Year of publication', 'ISSN number', 'Indexed in'] }),
      qn('UGC-6.2', 'Research projects', 'projects', 0, { ...one, inputs: [{ key: 'v', label: 'Projects', source: 'research_projects' }], rowsSource: 'research_projects', formula: 'Research projects starting in the year', columns: ['Project', 'Principal investigator', 'Sponsor', 'Start', 'Status'] }),
      qn('UGC-6.3', 'Ph.D.s awarded', 'scholars', 0, { ...one, inputs: [{ key: 'v', label: 'Ph.D.s awarded', source: 'phd_awarded' }], rowsSource: 'phd_awarded', formula: 'Research scholars awarded in the year (theses to be uploaded on Shodhganga)', columns: ['Scholar', 'Thesis', 'Guide', 'Awarded on'] }),
    ] }] },
    { id: '7', title: 'Student support', weight: 0, indicators: [{ id: '7', title: 'Student support', metrics: [
      qn('UGC-7.1', 'Students receiving scholarships', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students benefited', source: 'scholarship_students' }], rowsSource: 'scholarship_students', formula: 'Students with an approved scholarship or concession in the year' }),
      qn('UGC-7.2', 'Students placed', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students placed', source: 'placed' }], rowsSource: 'placed', formula: 'Students with a standing placement offer made in the year', columns: ['Name of student placed', 'Programme', 'Name of the employer', 'Pay package (LPA)', 'Offered on'] }),
      qn('UGC-7.3', 'Student grievances received and resolved', '%', 0, { ...one, inputs: [{ key: 'resolved', label: 'Grievances resolved', source: 'grievances_resolved' }, { key: 'received', label: 'Grievances received', source: 'grievances' }], calc: pct('resolved', 'received'), rowsSource: 'grievances', formula: 'Resolved / received x 100; the regulations ask for grievances to be settled within the time they set and reported to the UGC', columns: ['Ticket', 'Category', 'Raised on', 'Status'], evidence: ['Grievance register and the ombudsperson\'s reports'] }),
      choice('UGC-7.4', 'Anti-ragging compliance', 0, ['Anti-ragging affidavits collected from every student and parent online', 'Anti-ragging committee and squad notified', 'Posters and helpline numbers displayed', 'Anti-ragging day and week observed', 'Compliance report uploaded on the UGC portal'], { formula: 'Compliance steps taken', evidence: ['Affidavit acknowledgements', 'Compliance report'] }),
    ] }] },
    { id: '8', title: 'Finance and infrastructure', weight: 0, indicators: [{ id: '8', title: 'Finance and infrastructure', metrics: [
      ql('UGC-8.1', 'Annual report and audited annual accounts', 0, { evidence: ['Annual report', 'Audited accounts'] }),
      qn('UGC-8.2', 'Classrooms and seminar halls', 'rooms', 0, { ...one, inputs: [{ key: 'v', label: 'Rooms', source: 'classrooms' }], rowsSource: 'classrooms', formula: 'Rooms recorded as classrooms or halls', columns: ['Room', 'Kind', 'Capacity'] }),
      qn('UGC-8.3', 'Library books', 'books', 0, { ...one, inputs: [{ key: 'v', label: 'Copies', source: 'library_titles' }], rowsSource: 'library_titles', formula: 'Copies catalogued', columns: ['Title', 'Author', 'ISBN', 'Copies'] }),
    ] }] },
  ],
});

export const CBSE_OASIS: FrameworkDef = define({
  key: 'cbse-oasis',
  aliases: ['cbse'],
  body: 'cbse',
  title: 'CBSE - OASIS data and mandatory disclosure',
  variant: 'School affiliated to the CBSE (OASIS annual data and Appendix IX mandatory public disclosure)',
  source: 'CBSE affiliation bye-laws and the SARAS handbook: OASIS (Online Affiliated School Information System) and Appendix IX mandatory public disclosure (sections A to E)',
  scoring: 'none',
  years: 1,
  criteria: [
    { id: 'A', title: 'General information', weight: 0, indicators: [{ id: 'A', title: 'General information', metrics: [
      ql('CBSE-A.1', 'Name of the school, affiliation number, school code, complete address with pin code, principal\'s name and qualification, school e-mail and contact numbers', 0, { narrative: 'institution_profile', formula: 'From the institution profile', evidence: ['Affiliation letter'] }),
    ] }] },
    { id: 'B', title: 'Documents and information', weight: 0, indicators: [{ id: 'B', title: 'Documents and information', metrics: [
      choice('CBSE-B.1', 'Documents to upload with the disclosure (self-attested)', 0, ['Copies of the affiliation or upgradation letter and the recent extension of affiliation', 'Copies of the societies, trust or company registration and renewal certificate', 'Copy of the no objection certificate issued by the state government', 'Copies of the recognition certificate under the RTE Act, 2009 and its renewal', 'Copy of the valid building safety certificate', 'Copy of the valid fire safety certificate', 'Copy of the DEO certificate submitted for affiliation or the self-certification by the school', 'Copies of valid water, health and sanitation certificates'], { formula: 'Documents uploaded', evidence: ['Each document listed'] }),
    ] }] },
    { id: 'C', title: 'Results and academics', weight: 0, indicators: [{ id: 'C', title: 'Results and academics', metrics: [
      ql('CBSE-C.1', 'Fee structure, annual academic calendar, list of the school management committee (SMC) and of the parent-teacher association (PTA) members', 0, { narrative: 'fees_collected', evidence: ['Fee structure', 'Academic calendar', 'SMC list', 'PTA list'] }),
      qn('CBSE-C.2', 'Class X board examination results, last three years', '%', 0, { years: 3, inputs: [{ key: 'passed', label: 'Students passed', fromRows: { op: 'sum', column: 'Passed' } }, { key: 'registered', label: 'Students registered', fromRows: { op: 'sum', column: 'Registered' } }], calc: pct('passed', 'registered'), formula: 'Pass percentage = passed / registered x 100, year by year', columns: ['Year', 'Registered', 'Passed', 'Pass percentage', 'Remarks'], evidence: ['CBSE result gazette of the school'] }),
      qn('CBSE-C.3', 'Class XII board examination results, last three years', '%', 0, { years: 3, inputs: [{ key: 'passed', label: 'Students passed', fromRows: { op: 'sum', column: 'Passed' } }, { key: 'registered', label: 'Students registered', fromRows: { op: 'sum', column: 'Registered' } }], calc: pct('passed', 'registered'), formula: 'Pass percentage = passed / registered x 100, year by year', columns: ['Year', 'Registered', 'Passed', 'Pass percentage', 'Remarks'], evidence: ['CBSE result gazette of the school'] }),
    ] }] },
    { id: 'D', title: 'Staff (teaching)', weight: 0, indicators: [{ id: 'D', title: 'Staff', metrics: [
      qn('CBSE-D.1', 'Teachers: PGT, TGT and PRT', 'teachers', 0, { ...one, inputs: [{ key: 'v', label: 'Teachers', source: 'teachers_all' }, { key: 'pgt', label: 'PGT' }, { key: 'tgt', label: 'TGT' }, { key: 'prt', label: 'PRT' }], calc: (v) => v.v ?? ((v.pgt ?? 0) + (v.tgt ?? 0) + (v.prt ?? 0) || null), rowsSource: 'teachers_all', formula: 'Teachers in service; the split into post-graduate, trained graduate and primary teachers is entered', columns: ['Name', 'Department', 'Designation', 'Nature of appointment', 'Gender', 'Social category', 'Highest qualification'], evidence: ['Appointment letters', 'Qualification certificates'] }),
      qn('CBSE-D.2', 'Teacher-section ratio', 'teachers per section', 0, { ...one, inputs: [{ key: 'teachers', label: 'Teachers', source: 'teachers_all' }, { key: 'sections', label: 'Sections', source: 'school_sections' }], calc: per('teachers', 'sections'), bench: 1.5, formula: 'Teachers / sections; the bye-laws ask for 1.5 teachers per section', rowsSource: 'school_sections', columns: ['Class', 'Section', 'Students'], evidence: ['Section-wise enrolment'] }),
      qn('CBSE-D.3', 'Special educator, counsellor and wellness teacher', 'staff', 0, { ...one, inputs: [{ key: 'special', label: 'Special educators' }, { key: 'counsellor', label: 'Counsellors and wellness teachers' }], calc: (v) => (v.special ?? 0) + (v.counsellor ?? 0), formula: 'Entered from the staff records', columns: ['Name', 'Role', 'Qualification'], evidence: ['Appointment letters'] }),
      qn('CBSE-D.4', 'Teachers with in-service training in the year', 'teachers', 0, { ...one, inputs: [{ key: 'v', label: 'Teachers trained', source: 'teachers_trained' }], rowsSource: 'teachers_trained', formula: 'Teachers with a training record in the year (the bye-laws ask for at least 50 hours of capacity building a year)', columns: ['Teacher', 'Programmes'] }),
    ] }] },
    { id: 'E', title: 'School infrastructure', weight: 0, indicators: [{ id: 'E', title: 'Infrastructure', metrics: [
      qn('CBSE-E.1', 'Total campus area of the school', 'sq m', 0, { ...one, inputs: [{ key: 'v', label: 'Campus area (sq m)' }], formula: 'Entered from the land records', columns: ['Item', 'Area (sq m)'], evidence: ['Land documents'] }),
      qn('CBSE-E.2', 'Classrooms (number and size)', 'rooms', 0, { ...one, inputs: [{ key: 'v', label: 'Classrooms', source: 'classrooms' }], rowsSource: 'classrooms', formula: 'Rooms recorded as classrooms', columns: ['Room', 'Kind', 'Capacity', 'Size (sq m)'] }),
      qn('CBSE-E.3', 'Laboratories, including computer laboratories (number and size)', 'labs', 0, { ...one, inputs: [{ key: 'v', label: 'Laboratories' }], formula: 'Entered', columns: ['Laboratory', 'Size (sq m)'] }),
      qn('CBSE-E.4', 'Toilets for girls and for boys', 'toilets', 0, { ...one, inputs: [{ key: 'girls', label: 'Girls\' toilets' }, { key: 'boys', label: 'Boys\' toilets' }], calc: (v) => (v.girls ?? 0) + (v.boys ?? 0), formula: 'Girls\' plus boys\' toilets', columns: ['Type', 'Number'] }),
      choice('CBSE-E.5', 'Facilities', 0, ['Internet facility', 'Library', 'Playground', 'CCTV coverage', 'Ramps and disabled-friendly toilets', 'Medical room', 'Drinking water (RO)'], { formula: 'Facilities ticked' }),
      ql('CBSE-E.6', 'Link to the video of the school inspection (on YouTube)', 0, { evidence: ['Video link'] }),
    ] }] },
    { id: 'F', title: 'OASIS annual data', weight: 0, indicators: [{ id: 'F', title: 'OASIS', metrics: [
      qn('CBSE-F.1', 'Students by class and section', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students', source: 'students_on_roll' }], rowsSource: 'students_on_roll', formula: 'Students on roll in the year', columns: ['Roll no.', 'Student', 'Programme', 'Gender', 'Category', 'Status', 'Enrolled on', 'Class / section'] }),
      qn('CBSE-F.2', 'Girls enrolled', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Girls', source: 'students_women' }], rowsSource: 'students_women', formula: 'Students whose gender is female' }),
      qn('CBSE-F.3', 'Non-teaching staff', 'staff', 0, { ...one, inputs: [{ key: 'v', label: 'Non-teaching staff', source: 'staff_nonteaching' }], rowsSource: 'staff_nonteaching', formula: 'Staff without a teaching role' }),
      qn('CBSE-F.4', 'Library books', 'books', 0, { ...one, inputs: [{ key: 'v', label: 'Copies', source: 'library_titles' }], rowsSource: 'library_titles', formula: 'Copies catalogued', columns: ['Title', 'Author', 'ISBN', 'Copies'] }),
    ] }] },
  ],
});
