// Statutory returns that are filed, not scored: the AISHE Data Capture Format II for colleges (Ministry of Education,
// All India Survey on Higher Education) and UDISE+ for schools (Unified District Information System for Education Plus,
// school profile and facilities, teacher profile and student profile). The catalogue lists the items each return asks
// for, filled from ERP data where it exists; the export lays them out in the return's own blocks.
import { choice, define, pct, ql, qn, type FrameworkDef } from './types.js';

const one = { combine: 'latest' as const, years: 1 };

export const AISHE_DCF2: FrameworkDef = define({
  key: 'aishe-dcf2',
  aliases: ['aishe'],
  body: 'aishe',
  title: 'AISHE - DCF-II (college)',
  variant: 'College (Data Capture Format II)',
  source: 'All India Survey on Higher Education, Data Capture Format II (college form), Ministry of Education',
  scoring: 'none',
  years: 1,
  criteria: [
    { id: '1', title: 'Basic information', weight: 0, indicators: [{ id: '1', title: 'Basic information', metrics: [
      ql('AISHE-1.1', 'AISHE code, name and address, location (rural / urban), type, management, affiliating university, year of establishment and accreditation status', 0, { narrative: 'institution_profile', formula: 'From the institution profile: legal name, AISHE code, address, affiliating body, year of establishment, NAAC grade', evidence: ['Affiliation letter', 'NAAC certificate'] }),
    ] }] },
    { id: '2', title: 'Programmes and departments', weight: 0, indicators: [{ id: '2', title: 'Programmes and departments', metrics: [
      qn('AISHE-2.1', 'Programmes offered (level, discipline, duration, intake)', 'programmes', 0, { ...one, inputs: [{ key: 'v', label: 'Programmes', source: 'programmes' }], rowsSource: 'programmes', formula: 'Programmes in the ERP', columns: ['Faculty', 'Department', 'Level', 'Programme', 'Discipline', 'Duration (years)', 'Intake', 'Mode'] }),
    ] }] },
    { id: '3', title: 'Teaching staff', weight: 0, indicators: [{ id: '3', title: 'Teaching staff', metrics: [
      qn('AISHE-3.1', 'Teaching staff in position (by designation, gender and social category)', 'teachers', 0, { ...one, inputs: [{ key: 'v', label: 'Teachers', source: 'teachers_all' }], rowsSource: 'teachers_all', formula: 'Teachers in service in the survey year (teacher information format)', columns: ['Name', 'Department', 'Designation', 'Nature of appointment', 'Gender', 'Social category', 'Highest qualification'] }),
      qn('AISHE-3.2', 'Women teaching staff', 'teachers', 0, { ...one, inputs: [{ key: 'v', label: 'Women teachers', source: 'teachers_women' }], rowsSource: 'teachers_women', formula: 'Women among full-time teachers' }),
    ] }] },
    { id: '4', title: 'Non-teaching staff', weight: 0, indicators: [{ id: '4', title: 'Non-teaching staff', metrics: [
      qn('AISHE-4.1', 'Non-teaching staff in position (group, gender and social category)', 'staff', 0, { ...one, inputs: [{ key: 'v', label: 'Non-teaching staff', source: 'staff_nonteaching' }], rowsSource: 'staff_nonteaching', formula: 'Staff without a teaching role in service in the survey year', columns: ['Group (A / B / C / D)', 'Sanctioned strength', 'Male', 'Female', 'Transgender', 'SC', 'ST', 'OBC', 'PwD'] }),
    ] }] },
    { id: '5', title: 'Student enrolment', weight: 0, indicators: [{ id: '5', title: 'Student enrolment', metrics: [
      qn('AISHE-5.1', 'Students enrolled in all programmes and years (by gender and social category)', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students', source: 'students_on_roll' }], rowsSource: 'students_on_roll', formula: 'Students on roll in the survey year', columns: ['Programme', 'Year', 'General', 'EWS', 'SC', 'ST', 'OBC', 'Total (male)', 'Total (female)', 'Total (transgender)'] }),
      qn('AISHE-5.2', 'Women students enrolled', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Women students', source: 'students_women' }], rowsSource: 'students_women', formula: 'Students on roll whose gender is female' }),
      qn('AISHE-5.3', 'Students from SC, ST, OBC and EWS categories', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students from reserved categories', source: 'students_reserved' }], rowsSource: 'students_reserved', formula: 'Students on roll admitted under a reserved category' }),
      qn('AISHE-5.4', 'Persons with disabilities, Muslim minority and other minority students', 'students', 0, { ...one, inputs: [{ key: 'pwd', label: 'Students with disabilities' }, { key: 'muslim', label: 'Muslim minority students' }, { key: 'other', label: 'Other minority students' }], calc: (v) => (v.pwd ?? 0) + (v.muslim ?? 0) + (v.other ?? 0), formula: 'Entered from the admission records (the ERP does not record disability or religion)', columns: ['Programme', 'PwD (male)', 'PwD (female)', 'Muslim minority (male)', 'Muslim minority (female)', 'Other minority (male)', 'Other minority (female)'] }),
      qn('AISHE-5.5', 'Foreign students enrolled (by country)', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Foreign students', fromRows: { op: 'count' } }], formula: 'Entered by country', columns: ['Country', 'Programme', 'Male', 'Female', 'Transgender'] }),
    ] }] },
    { id: '6', title: 'Examination results', weight: 0, indicators: [{ id: '6', title: 'Examination results', metrics: [
      qn('AISHE-6.1', 'Students appeared in the final-year examination', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Appeared', source: 'final_appeared' }], rowsSource: 'final_appeared', formula: 'Final-semester results published in the survey year', columns: ['Programme', 'Appeared (male)', 'Appeared (female)', 'Passed (male)', 'Passed (female)', 'Passed with 60% or above'] }),
      qn('AISHE-6.2', 'Students passed in the final-year examination', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Passed', source: 'final_passed' }], rowsSource: 'final_passed', formula: 'Of those, the students who passed' }),
    ] }] },
    { id: '7', title: 'Financial information', weight: 0, indicators: [{ id: '7', title: 'Financial information', metrics: [
      qn('AISHE-7.1', 'Receipts: fees, government grants and other income (INR lakhs)', 'INR lakhs', 0, { ...one, inputs: [{ key: 'fees', label: 'Fees collected (INR lakhs)', source: 'fees_lakhs' }, { key: 'grants', label: 'Grants from central and state government (INR lakhs)' }, { key: 'other', label: 'Other receipts (INR lakhs)' }], calc: (v) => (v.fees ?? 0) + (v.grants ?? 0) + (v.other ?? 0), rowsSource: 'fees_lakhs', formula: 'Fees + government grants + other receipts', columns: ['Head', 'Amount (INR)'] }),
      qn('AISHE-7.2', 'Expenditure: salaries, library, laboratories, infrastructure and other (INR lakhs)', 'INR lakhs', 0, { ...one, inputs: [{ key: 'opex', label: 'Operational expenditure including salaries (INR lakhs)', source: 'opex_lakhs' }, { key: 'capex', label: 'Capital expenditure (INR lakhs)', source: 'capex_lakhs' }], calc: (v) => (v.opex ?? 0) + (v.capex ?? 0), rowsSource: 'opex_lakhs', formula: 'Operational plus capital expenditure', columns: ['Head', 'Amount (INR)'] }),
    ] }] },
    { id: '8', title: 'Infrastructure', weight: 0, indicators: [{ id: '8', title: 'Infrastructure', metrics: [
      qn('AISHE-8.1', 'Classrooms, laboratories and seminar halls', 'rooms', 0, { ...one, inputs: [{ key: 'v', label: 'Classrooms and halls', source: 'classrooms' }], rowsSource: 'classrooms', formula: 'Rooms recorded as classrooms or halls' }),
      qn('AISHE-8.2', 'Computers for academic use', 'computers', 0, { ...one, inputs: [{ key: 'v', label: 'Computers', source: 'computers' }], rowsSource: 'computers', formula: 'Computer assets in use' }),
      qn('AISHE-8.3', 'Books in the library', 'books', 0, { ...one, inputs: [{ key: 'v', label: 'Copies', source: 'library_titles' }], rowsSource: 'library_titles', formula: 'Copies catalogued in the library' }),
      choice('AISHE-8.4', 'Facilities available on campus', 0, ['Playground', 'Auditorium', 'Theatre', 'Library', 'Laboratory', 'Conference hall', 'Health centre', 'Gymnasium', 'Indoor sports', 'Common room', 'Cafeteria', 'Hostel', 'Ramps / lifts for persons with disabilities', 'Solar power', 'Rain water harvesting', 'Wi-Fi'], { formula: 'Facilities ticked' }),
    ] }] },
    { id: '9', title: 'Scholarships, fellowships and loans', weight: 0, indicators: [{ id: '9', title: 'Scholarships', metrics: [
      qn('AISHE-9.1', 'Students receiving scholarships (central government, state government, institution, private)', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students benefited', source: 'scholarship_students' }], rowsSource: 'scholarship_students', formula: 'Students with an approved scholarship or concession in the year', columns: ['Scheme', 'Awarding body', 'Male', 'Female', 'Transgender'] }),
      qn('AISHE-9.2', 'Women among students receiving scholarships', '%', 0, { ...one, inputs: [{ key: 'women', label: 'Women receiving scholarships' }, { key: 'v', label: 'Students receiving scholarships', source: 'scholarship_students' }], calc: pct('women', 'v'), formula: 'Women scholarship holders / scholarship holders x 100' }),
    ] }] },
  ],
});

export const UDISE_PLUS: FrameworkDef = define({
  key: 'udise-plus',
  aliases: ['udise'],
  body: 'udise',
  title: 'UDISE+ - School data capture',
  variant: 'School (profile and facilities, teacher profile, student profile)',
  source: 'UDISE+ data capture formats, Department of School Education and Literacy, Ministry of Education',
  scoring: 'none',
  years: 1,
  criteria: [
    { id: 'P', title: 'School profile', weight: 0, indicators: [{ id: 'P', title: 'School profile', metrics: [
      ql('UDISE-1.1', 'UDISE code, school name, location, category (classes offered), management, medium of instruction, affiliation board and year of establishment', 0, { narrative: 'institution_profile', formula: 'From the institution profile', evidence: ['Recognition certificate', 'Affiliation letter'] }),
      qn('UDISE-1.2', 'Instructional days in the previous academic year', 'days', 0, { ...one, inputs: [{ key: 'v', label: 'Instructional days' }], formula: 'Days on which classes were held', columns: ['Academic year', 'Instructional days', 'Average school hours (students)', 'Average working hours (teachers)'] }),
    ] }] },
    { id: 'F', title: 'Physical facilities and equipment', weight: 0, indicators: [{ id: 'F', title: 'Facilities', metrics: [
      qn('UDISE-2.1', 'Classrooms in good condition used for instruction', 'rooms', 0, { ...one, inputs: [{ key: 'v', label: 'Classrooms', source: 'classrooms' }], rowsSource: 'classrooms', formula: 'Classrooms recorded in the ERP', columns: ['Room', 'Condition (good / minor repair / major repair)', 'Used for instruction'] }),
      qn('UDISE-2.2', 'Functional computers and digital devices for teaching (desktops, laptops, tablets, smart boards)', 'devices', 0, { ...one, inputs: [{ key: 'computers', label: 'Computers', source: 'computers' }, { key: 'boards', label: 'Smart classrooms', source: 'ict_rooms' }], calc: (v) => (v.computers ?? 0) + (v.boards ?? 0), rowsSource: 'computers', formula: 'Computers in use plus rooms with a smart board' }),
      qn('UDISE-2.3', 'Functional toilets (boys, girls, CWSN-friendly)', 'toilets', 0, { ...one, inputs: [{ key: 'boys', label: 'Toilets for boys' }, { key: 'girls', label: 'Toilets for girls' }, { key: 'cwsn', label: 'CWSN-friendly toilets' }], calc: (v) => (v.boys ?? 0) + (v.girls ?? 0) + (v.cwsn ?? 0), formula: 'Toilets by type', columns: ['Type', 'Total', 'Functional'] }),
      qn('UDISE-2.4', 'Books in the school library', 'books', 0, { ...one, inputs: [{ key: 'v', label: 'Copies', source: 'library_titles' }], rowsSource: 'library_titles', formula: 'Copies catalogued' }),
      choice('UDISE-2.5', 'Facilities available in the school', 0, ['Electricity', 'Drinking water', 'Hand-wash facility', 'Library', 'Playground', 'Ramps with hand-rails', 'Medical check-up', 'Internet', 'Kitchen garden', 'Solar panel', 'Boundary wall', 'Rain water harvesting'], { formula: 'Facilities ticked' }),
    ] }] },
    { id: 'T', title: 'Teacher profile', weight: 0, indicators: [{ id: 'T', title: 'Teachers', metrics: [
      qn('UDISE-3.1', 'Teachers in position (regular, contract, part-time)', 'teachers', 0, { ...one, inputs: [{ key: 'v', label: 'Teachers', source: 'teachers_all' }], rowsSource: 'teachers_all', formula: 'Teachers in service in the year', columns: ['Teacher name', 'Gender', 'Date of birth', 'Social category', 'Nature of appointment', 'Date of joining', 'Academic qualification', 'Professional qualification', 'Classes taught', 'Subjects taught', 'In-service training received'] }),
      qn('UDISE-3.2', 'Women teachers', 'teachers', 0, { ...one, inputs: [{ key: 'v', label: 'Women teachers', source: 'teachers_women' }], rowsSource: 'teachers_women', formula: 'Women among teachers' }),
      qn('UDISE-3.3', 'Teachers who received in-service training', 'teachers', 0, { ...one, inputs: [{ key: 'v', label: 'Teachers trained', source: 'teachers_trained' }], rowsSource: 'teachers_trained', formula: 'Teachers with a training record in the year' }),
      qn('UDISE-3.4', 'Non-teaching staff', 'staff', 0, { ...one, inputs: [{ key: 'v', label: 'Non-teaching staff', source: 'staff_nonteaching' }], rowsSource: 'staff_nonteaching', formula: 'Staff without a teaching role' }),
    ] }] },
    { id: 'E', title: 'Enrolment and student profile', weight: 0, indicators: [{ id: 'E', title: 'Enrolment', metrics: [
      qn('UDISE-4.1', 'Students enrolled by class, gender and social category', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students', source: 'students_on_roll' }], rowsSource: 'students_on_roll', formula: 'Students on roll on 30 September of the year', columns: ['Student name', 'Gender', 'Date of birth', 'Mother\'s name', 'Father\'s name', 'Social category', 'Minority group', 'BPL', 'CWSN (type of impairment)', 'Class', 'Section', 'Roll no.', 'Admission number', 'Date of admission', 'Medium of instruction', 'PEN'] }),
      qn('UDISE-4.2', 'Girls enrolled', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Girls', source: 'students_women' }], rowsSource: 'students_women', formula: 'Students whose gender is female' }),
      qn('UDISE-4.3', 'Students from SC, ST and OBC categories', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students from these categories', source: 'students_reserved' }], rowsSource: 'students_reserved', formula: 'Students admitted under a reserved category' }),
      qn('UDISE-4.4', 'Children with special needs (CWSN) enrolled', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'CWSN students' }], formula: 'Entered from the student profiles (the ERP does not record impairments)', columns: ['Class', 'Type of impairment', 'Boys', 'Girls'] }),
      qn('UDISE-4.5', 'Students receiving incentives (free textbooks, uniforms, scholarships)', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Students with incentives', source: 'scholarship_students' }], rowsSource: 'scholarship_students', formula: 'Students with an approved scholarship or concession' }),
    ] }] },
    { id: 'R', title: 'Examination results', weight: 0, indicators: [{ id: 'R', title: 'Results', metrics: [
      qn('UDISE-5.1', 'Students appeared in the board examination (classes 10 and 12)', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Appeared', source: 'final_appeared' }], rowsSource: 'final_appeared', formula: 'Students in final-class results published in the year', columns: ['Class', 'Stream', 'Appeared (boys)', 'Appeared (girls)', 'Passed (boys)', 'Passed (girls)', 'Passed with 60% or more'] }),
      qn('UDISE-5.2', 'Students passed in the board examination', 'students', 0, { ...one, inputs: [{ key: 'v', label: 'Passed', source: 'final_passed' }], rowsSource: 'final_passed', formula: 'Of those, the students who passed' }),
    ] }] },
  ],
});
