/**
 * Sample data for every document type: what template previews, gallery thumbnails and the
 * editor render with, and (flattened) the catalogue of bindings a template can use.
 */
import { DOC_TYPES, type DocType } from './doc-layout.js';

/** A document's data: nested values and lists, read by `{{path}}` bindings and table sources. */
export type DocData = { [key: string]: DocValue };
export type DocValue = string | number | boolean | null | DocData | DocData[];

const institution = {
  name: 'Soundarya Institute of Management and Science',
  legalName: 'Soundarya Educational Trust',
  tagline: 'Affiliated to Bangalore University  |  NAAC A+',
  address: 'Soundarya Nagar, Sidedahalli, Nagasandra Post',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560073',
  phone: '+91 80 2839 4455',
  email: 'office@soundarya.edu.in',
  website: 'www.soundarya.edu.in',
  affiliation: 'Bangalore University (BU/AFF/2004/117)',
  code: 'C-41873',
  board: 'Bangalore University',
  established: '2004',
  gstin: '29AABTS1234K1Z9',
};

const signatory = {
  principal: { name: 'Dr. Meenakshi Rao', designation: 'Principal' },
  registrar: { name: 'Prof. S. Narayan', designation: 'Registrar' },
  controller: { name: 'Dr. K. Prakash', designation: 'Controller of Examinations' },
  finance: { name: 'Mr. Vinay Hegde', designation: 'Finance Officer' },
  hr: { name: 'Ms. Lakshmi Iyer', designation: 'HR Manager' },
};

const student = {
  name: 'Ananya Raghavendra',
  rollNo: '21BCA014',
  admissionNo: 'ADM/2021/0147',
  className: 'BCA Semester 6 - A',
  program: 'Bachelor of Computer Applications',
  department: 'Computer Science',
  academicYear: '2026-27',
  dob: '14 March 2005',
  gender: 'Female',
  bloodGroup: 'B+',
  fatherName: 'K. Raghavendra',
  motherName: 'Sujatha Raghavendra',
  guardianName: 'K. Raghavendra',
  phone: '+91 98450 12345',
  emergencyContact: 'K. Raghavendra (Father)',
  emergencyPhone: '+91 98450 12345',
  address: '42, 3rd Cross, Vijayanagar, Bengaluru 560040',
  enrolledOn: '2 August 2021',
  validUntil: 'June 2027',
  nationality: 'Indian',
  religionCaste: 'Hindu - General',
};

const staff = {
  name: 'Dr. Arvind Kulkarni',
  employeeCode: 'EMP-0231',
  designation: 'Associate Professor',
  department: 'Computer Science',
  dateOfJoining: '1 July 2019',
  bloodGroup: 'O+',
  phone: '+91 99001 22334',
  email: 'arvind.k@soundarya.edu.in',
  emergencyContact: 'Shruti Kulkarni (Spouse)',
  emergencyPhone: '+91 99001 55667',
  address: '18, MG Layout, Malleswaram, Bengaluru 560003',
  validUntil: 'March 2028',
  pan: 'ABCPK1234D',
  uan: '100987654321',
  bankAccount: 'XXXXXX4521 (SBI)',
};

const common = (title: string, serial: string): DocData => ({
  institution,
  signatory,
  doc: { title, serial, issuedOn: '14 October 2026', fingerprint: '7F3A-91C2-04BE', purpose: 'Higher studies' },
  verify: { url: `https://erp.zynetix.app/verify/soundarya/9f2c4e7a1b3d5f60718293a4b5c6d7e8` },
});

const marksRows: DocData[] = [
  { code: 'BCA601', subject: 'Cloud Computing', credits: 4, internal: 38, external: 52, total: 90, max: 100, percent: '90.00', grade: 'O', gradePoint: '10.00', result: 'Pass' },
  { code: 'BCA602', subject: 'Machine Learning', credits: 4, internal: 35, external: 47, total: 82, max: 100, percent: '82.00', grade: 'A+', gradePoint: '9.00', result: 'Pass' },
  { code: 'BCA603', subject: 'Mobile Application Development', credits: 3, internal: 36, external: 41, total: 77, max: 100, percent: '77.00', grade: 'A', gradePoint: '8.00', result: 'Pass' },
  { code: 'BCA604', subject: 'Software Testing', credits: 3, internal: 31, external: 39, total: 70, max: 100, percent: '70.00', grade: 'A', gradePoint: '8.00', result: 'Pass' },
  { code: 'BCA605', subject: 'Cyber Security Essentials', credits: 3, internal: 33, external: 44, total: 77, max: 100, percent: '77.00', grade: 'A', gradePoint: '8.00', result: 'Pass' },
  { code: 'BCA6P1', subject: 'Major Project and Viva Voce', credits: 6, internal: 45, external: 48, total: 93, max: 100, percent: '93.00', grade: 'O', gradePoint: '10.00', result: 'Pass' },
];

const terms: DocData[] = [
  { label: 'Semester 1 (Dec 2021)', sgpa: '8.42', creditsEarned: 22, creditsAttempted: 22, result: 'Pass' },
  { label: 'Semester 2 (May 2022)', sgpa: '8.65', creditsEarned: 22, creditsAttempted: 22, result: 'Pass' },
  { label: 'Semester 3 (Dec 2022)', sgpa: '8.90', creditsEarned: 23, creditsAttempted: 23, result: 'Pass' },
  { label: 'Semester 4 (May 2023)', sgpa: '9.04', creditsEarned: 23, creditsAttempted: 23, result: 'Pass' },
  { label: 'Semester 5 (Dec 2023)', sgpa: '9.12', creditsEarned: 23, creditsAttempted: 23, result: 'Pass' },
  { label: 'Semester 6 (May 2024)', sgpa: '9.13', creditsEarned: 23, creditsAttempted: 23, result: 'Pass' },
];

const transcriptRows: DocData[] = [
  ['Semester 1', 'BCA101', 'Programming in C', 4, 'A+'],
  ['Semester 1', 'BCA102', 'Digital Electronics', 4, 'A'],
  ['Semester 1', 'BCA103', 'Discrete Mathematics', 4, 'A+'],
  ['Semester 2', 'BCA201', 'Data Structures', 4, 'O'],
  ['Semester 2', 'BCA202', 'Database Management Systems', 4, 'A+'],
  ['Semester 3', 'BCA301', 'Object Oriented Programming', 4, 'O'],
  ['Semester 3', 'BCA302', 'Operating Systems', 4, 'A+'],
  ['Semester 4', 'BCA401', 'Computer Networks', 4, 'A+'],
  ['Semester 4', 'BCA402', 'Web Technologies', 4, 'O'],
  ['Semester 5', 'BCA501', 'Design and Analysis of Algorithms', 4, 'A+'],
  ['Semester 5', 'BCA502', 'Artificial Intelligence', 4, 'O'],
  ['Semester 6', 'BCA601', 'Cloud Computing', 4, 'O'],
  ['Semester 6', 'BCA602', 'Machine Learning', 4, 'A+'],
  ['Semester 6', 'BCA6P1', 'Major Project and Viva Voce', 6, 'O'],
].map(([term, code, subject, credits, grade]) => ({ term, code, subject, credits, grade, gradePoint: grade === 'O' ? '10.00' : grade === 'A+' ? '9.00' : '8.00', result: 'Pass' }) as DocData);

/** Sample data for each document type (common blocks included). */
export const DOC_SAMPLES: Record<DocType, DocData> = {
  student_id_card: { ...common('Student Identity Card', 'SID/2026-27/00147'), student },
  staff_id_card: { ...common('Staff Identity Card', 'EID/2026-27/00231'), staff },
  marks_card: {
    ...common('Statement of Marks', 'MC/2026-27/01482'),
    student,
    exam: { session: 'Even Semester Examinations, May 2026', term: '6', semester: 'Semester 6', monthYear: 'May 2026', sgpa: '9.13', cgpa: '8.88', creditsAttempted: 23, creditsEarned: 23, totalMarks: 489, maxMarks: 600, percentage: '81.50', result: 'PASS', classification: 'First Class with Distinction' },
    marks: { rows: marksRows },
  },
  transcript: {
    ...common('Consolidated Marks Memo', 'TR/2026-27/00318'),
    student,
    transcript: { cgpa: '8.88', creditsEarned: 136, creditsAttempted: 136, result: 'PASSED', classification: 'First Class with Distinction', percentage: '88.80', completedOn: 'May 2024', terms, rows: transcriptRows },
  },
  hall_ticket: {
    ...common('Hall Ticket', 'HT/2026-27/04519'),
    student,
    exam: { session: 'Even Semester Examinations, May 2026', ticketNo: 'HT-2026-04519', centre: 'Main Campus, Block A', reportingTime: '30 minutes before each paper', instructions: 'Carry this hall ticket and your college ID card to every paper. Mobile phones, smart watches and programmable calculators are not allowed in the examination hall. Candidates will not be admitted 30 minutes after the paper starts.' },
    papers: [
      { date: '18 May 2026', day: 'Monday', time: '10:00 - 13:00', code: 'BCA601', subject: 'Cloud Computing', room: 'A-204', seat: '17' },
      { date: '20 May 2026', day: 'Wednesday', time: '10:00 - 13:00', code: 'BCA602', subject: 'Machine Learning', room: 'A-204', seat: '17' },
      { date: '22 May 2026', day: 'Friday', time: '10:00 - 13:00', code: 'BCA603', subject: 'Mobile Application Development', room: 'A-206', seat: '09' },
      { date: '25 May 2026', day: 'Monday', time: '14:00 - 17:00', code: 'BCA604', subject: 'Software Testing', room: 'A-206', seat: '09' },
      { date: '27 May 2026', day: 'Wednesday', time: '10:00 - 13:00', code: 'BCA605', subject: 'Cyber Security Essentials', room: 'B-101', seat: '23' },
    ],
  },
  fee_receipt: {
    ...common('Fee Receipt', 'RCT/2026-27/03821'),
    student,
    receipt: { no: 'RCT/2026-27/03821', date: '14 October 2026', mode: 'UPI', reference: 'UPI 428193746512', amount: 'Rs. 42,500.00', amountWords: 'Rupees Forty-Two Thousand Five Hundred Only', balance: 'Rs. 0.00', towards: 'Tuition and other fees, Semester 6', period: 'Odd semester 2026-27', receivedBy: 'Accounts Office', total: 'Rs. 42,500.00' },
    fee: {
      lines: [
        { no: 1, head: 'Tuition fee', amount: 'Rs. 35,000.00' },
        { no: 2, head: 'Laboratory fee', amount: 'Rs. 4,000.00' },
        { no: 3, head: 'Library and e-resources', amount: 'Rs. 1,500.00' },
        { no: 4, head: 'Examination fee', amount: 'Rs. 2,000.00' },
      ],
    },
  },
  fee_invoice: {
    ...common('Tax Invoice', 'INV/2026-27/01207'),
    student,
    invoice: {
      no: 'INV/2026-27/01207', date: '1 October 2026', dueDate: '31 October 2026', period: 'Odd semester 2026-27', placeOfSupply: 'Karnataka (29)', billTo: 'K. Raghavendra (parent of Ananya Raghavendra)', subtotal: 'Rs. 48,500.00', cgst: 'Rs. 270.00', sgst: 'Rs. 270.00', igst: 'Rs. 0.00', taxTotal: 'Rs. 540.00', total: 'Rs. 49,040.00', totalWords: 'Rupees Forty-Nine Thousand Forty Only', paid: 'Rs. 0.00', balance: 'Rs. 49,040.00',
      note: 'Education services by an educational institution to its students are exempt from GST (Notification 12/2017-CT(Rate), entry 66). GST applies only to the optional services marked.',
      lines: [
        { no: 1, head: 'Tuition fee', sac: '999293', qty: '1', rate: '35,000.00', taxable: '35,000.00', gstRate: 'Exempt', tax: '0.00', amount: '35,000.00' },
        { no: 2, head: 'Laboratory fee', sac: '999293', qty: '1', rate: '4,000.00', taxable: '4,000.00', gstRate: 'Exempt', tax: '0.00', amount: '4,000.00' },
        { no: 3, head: 'Examination fee', sac: '999293', qty: '1', rate: '2,000.00', taxable: '2,000.00', gstRate: 'Exempt', tax: '0.00', amount: '2,000.00' },
        { no: 4, head: 'Hostel mess (optional)', sac: '996331', qty: '1', rate: '4,500.00', taxable: '4,500.00', gstRate: '5%', tax: '225.00', amount: '4,725.00' },
        { no: 5, head: 'Industrial visit transport (optional)', sac: '996601', qty: '1', rate: '3,000.00', taxable: '3,000.00', gstRate: '5%', tax: '150.00', amount: '3,150.00' },
      ],
    },
  },
  bonafide_certificate: {
    ...common('Bonafide Certificate', 'BON/2026-27/00412'),
    student,
    doc: { title: 'Bonafide Certificate', serial: 'BON/2026-27/00412', issuedOn: '14 October 2026', fingerprint: '7F3A-91C2-04BE', purpose: 'applying for an education loan', body: 'This is to certify that **Ananya Raghavendra** (Roll No. 21BCA014), daughter of Sri K. Raghavendra, is a bonafide student of Soundarya Institute of Management and Science, studying in BCA Semester 6 (Bachelor of Computer Applications) in the academic year 2026-27. Her conduct and character are good.\n\nThis certificate is issued at her request for the purpose of applying for an education loan.', fields: [] },
  },
  transfer_certificate: {
    ...common('Transfer Certificate', 'TC/2026-27/00057'),
    student,
    doc: {
      title: 'Transfer Certificate', serial: 'TC/2026-27/00057', issuedOn: '14 October 2026', fingerprint: '7F3A-91C2-04BE', purpose: 'admission to higher studies',
      body: 'Certified that the above particulars are true as per the records of the institution. All dues have been cleared and the student is free to join another institution.',
      fields: [
        { label: 'Name of the student', value: 'Ananya Raghavendra' },
        { label: "Father's / guardian's name", value: 'K. Raghavendra' },
        { label: "Mother's name", value: 'Sujatha Raghavendra' },
        { label: 'Date of birth', value: '14 March 2005' },
        { label: 'Nationality', value: 'Indian' },
        { label: 'Admission number and date', value: 'ADM/2021/0147, 2 August 2021' },
        { label: 'Class last studied', value: 'BCA Semester 6' },
        { label: 'Programme', value: 'Bachelor of Computer Applications' },
        { label: 'Whether qualified for promotion', value: 'Yes, passed the final examination' },
        { label: 'Date of leaving', value: '31 May 2026' },
        { label: 'Reason for leaving', value: 'Completed the programme' },
        { label: 'Conduct and character', value: 'Very good' },
        { label: 'All dues paid', value: 'Yes' },
      ],
    },
  },
  conduct_certificate: {
    ...common('Conduct Certificate', 'CON/2026-27/00198'),
    student,
    doc: { title: 'Conduct Certificate', serial: 'CON/2026-27/00198', issuedOn: '14 October 2026', fingerprint: '7F3A-91C2-04BE', purpose: 'passport verification', body: 'This is to certify that **Ananya Raghavendra** (Roll No. 21BCA014), a student of BCA Semester 6 at Soundarya Institute of Management and Science in the academic year 2026-27, bears **very good** moral character and conduct, as far as the records of the institution show. She has not been subject to any disciplinary action during her studies here.\n\nThis certificate is issued for passport verification.', fields: [] },
  },
  course_completion_certificate: {
    ...common('Course Completion Certificate', 'CC/2026-27/00088'),
    student,
    doc: { title: 'Certificate of Course Completion', serial: 'CC/2026-27/00088', issuedOn: '14 October 2026', fingerprint: '7F3A-91C2-04BE', purpose: 'employment', body: 'This is to certify that **Ananya Raghavendra** (Roll No. 21BCA014) has successfully completed the **Bachelor of Computer Applications** programme at Soundarya Institute of Management and Science, from August 2021 to May 2024, securing a CGPA of 8.88 and placed in First Class with Distinction.', fields: [] },
    course: { name: 'Bachelor of Computer Applications', duration: 'August 2021 to May 2024', completedOn: '31 May 2024', grade: 'CGPA 8.88 - First Class with Distinction' },
    award: { title: 'Certificate of Course Completion', recipient: 'Ananya Raghavendra', citation: 'has successfully completed the **Bachelor of Computer Applications** programme from August 2021 to May 2024, securing a CGPA of **8.88** and placed in First Class with Distinction.', event: 'Convocation 2026', date: '14 October 2026', position: '' },
  },
  degree_certificate: {
    ...common('Degree Certificate', 'DEG/2026-27/00412'),
    student: { ...student, registerNo: 'U19SI21S0147' },
    degree: { name: 'Bachelor of Computer Applications', short: 'BCA', classification: 'First Class with Distinction', cgpa: '8.88', examination: 'May 2024', convocation: 'Twelfth Annual Convocation, 14 October 2026', university: 'Bengaluru City University', citation: 'having passed the examination held in **May 2024** and fulfilled the requirements of the programme, has been admitted to the degree of **Bachelor of Computer Applications** in **First Class with Distinction** (CGPA 8.88).' },
  },
  migration_certificate: {
    ...common('Migration Certificate', 'MIG/2026-27/00031'),
    student,
    doc: {
      title: 'Migration Certificate', serial: 'MIG/2026-27/00031', issuedOn: '14 October 2026', fingerprint: '7F3A-91C2-04BE', purpose: 'admission to another university',
      body: 'The institution has no objection to the student named above migrating to another university or board to continue studies. This certificate does not by itself entitle the student to admission there.',
      fields: [
        { label: 'Name of the student', value: 'Ananya Raghavendra' },
        { label: "Father's / guardian's name", value: 'K. Raghavendra' },
        { label: 'Register number', value: 'U19SI21S0147' },
        { label: 'Programme', value: 'Bachelor of Computer Applications' },
        { label: 'University', value: 'Bengaluru City University' },
        { label: 'Year of admission', value: '2021' },
        { label: 'Last examination passed', value: 'BCA Semester 6, May 2024' },
        { label: 'Result', value: 'Passed, First Class with Distinction' },
        { label: 'Migrating to', value: 'University of Mysore' },
      ],
    },
  },
  medium_of_instruction_certificate: {
    ...common('Medium of Instruction Certificate', 'MOI/2026-27/00064'),
    student,
    doc: { title: 'Medium of Instruction Certificate', serial: 'MOI/2026-27/00064', issuedOn: '14 October 2026', fingerprint: '7F3A-91C2-04BE', purpose: 'admission to a university abroad', medium: 'English', body: 'This is to certify that **Ananya Raghavendra** (Roll No. 21BCA014) studied the **Bachelor of Computer Applications** programme at Soundarya Institute of Management and Science from August 2021 to May 2024. The medium of instruction and examination throughout the programme was **English**.\n\nThis certificate is issued at her request for admission to a university abroad.', fields: [] },
  },
  salary_slip: {
    ...common('Salary Slip', 'PAY/2026-27/02215'),
    staff,
    pay: {
      month: 'September 2026', payslipNo: 'PAY/2026-27/02215', daysInMonth: 30, paidDays: 30, lopDays: 0, taxRegime: 'New',
      gross: 'Rs. 1,18,400.00', deductions: 'Rs. 14,860.00', net: 'Rs. 1,03,540.00', netWords: 'Rupees One Lakh Three Thousand Five Hundred Forty Only',
      employerPf: 'Rs. 1,800.00', employerEsi: 'Rs. 0.00', annualTax: 'Rs. 98,800.00',
      rows: [
        { earning: 'Basic pay', earningAmount: '68,000.00', deduction: 'Provident fund', deductionAmount: '1,800.00' },
        { earning: 'Dearness allowance', earningAmount: '27,200.00', deduction: 'Professional tax', deductionAmount: '200.00' },
        { earning: 'House rent allowance', earningAmount: '13,600.00', deduction: 'Income tax (TDS)', deductionAmount: '8,233.00' },
        { earning: 'Transport allowance', earningAmount: '3,200.00', deduction: 'Staff welfare fund', deductionAmount: '500.00' },
        { earning: 'Academic allowance', earningAmount: '6,400.00', deduction: 'Loan recovery', deductionAmount: '4,127.00' },
      ],
    },
  },
  offer_letter: {
    ...common('Offer of Appointment', 'OFR/2026-27/00034'),
    offer: { no: 'OFR/2026-27/00034', date: '14 October 2026', candidateName: 'Ms. Priya Venkatesh', candidateAddress: '27, 5th Main, Jayanagar 4th Block, Bengaluru 560011', position: 'Assistant Professor', department: 'Commerce', ctc: 'Rs. 9,60,000', ctcWords: 'Rupees Nine Lakh Sixty Thousand only', joiningDate: '3 November 2026', validUntil: '24 October 2026', terms: 'You will be on probation for one year from the date of joining. Either party may end the employment with one month of notice or salary in lieu during probation, and three months thereafter. You will follow the service rules of the institution as amended from time to time.' },
  },
  appointment_letter: {
    ...common('Letter of Appointment', 'APT/2026-27/00029'),
    staff,
    appointment: { no: 'APT/2026-27/00029', date: '14 October 2026', name: 'Dr. Arvind Kulkarni', position: 'Associate Professor', department: 'Computer Science', payScale: 'Academic Level 13A (Rs. 1,31,400 - 2,17,100)', joiningDate: '1 November 2026', probation: 'one year', reportingTo: 'Head of the Department, Computer Science', terms: 'Your appointment is subject to verification of your original certificates and a satisfactory medical examination. You will be governed by the service rules of the institution and the regulations of the affiliating university as amended from time to time.' },
  },
  report_cover: {
    ...common('Annual Quality Assurance Report', 'RPT/2026-27/00012'),
    report: { title: 'Annual Quality Assurance Report', subtitle: 'Internal Quality Assurance Cell', period: 'Academic year 2025-26', preparedBy: 'IQAC Coordinator', preparedFor: 'National Assessment and Accreditation Council', date: '14 October 2026', confidentiality: 'For official use', criterion: 'Criteria I to VII', filters: 'All departments' },
  },
  generic_certificate: {
    ...common('Certificate of Merit', 'CRT/2026-27/00562'),
    student,
    award: { title: 'Certificate of Merit', kind: 'Merit', recipient: 'Ananya Raghavendra', citation: 'for securing the **First Rank** in the Bachelor of Computer Applications programme and for her outstanding contribution to the college coding club.', event: 'Annual Day 2026', date: '14 October 2026', position: 'First Rank' },
  },
};

/** One binding a template can use: `{{key}}` for values, `source` for tables and field lists. */
export interface DocBinding {
  key: string;
  label: string;
  kind: 'value' | 'list';
  sample: string;
  /** For lists: the keys of each item (`{{row.<key>}}`). */
  itemKeys?: string[];
}

const humanize = (path: string) => {
  const last = path.split('.').slice(-1)[0];
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return `${path.split('.')[0].replace(/^./, (c) => c.toUpperCase())}: ${words}`;
};

/** Flattens sample data into the binding catalogue. */
function bindingsOf(data: DocData, prefix = ''): DocBinding[] {
  const out: DocBinding[] = [];
  for (const [k, v] of Object.entries(data)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) out.push({ key, label: humanize(key), kind: 'list', sample: `${v.length} items`, itemKeys: v[0] ? Object.keys(v[0]) : [] });
    else if (v && typeof v === 'object') out.push(...bindingsOf(v, key));
    else out.push({ key, label: humanize(key), kind: 'value', sample: v === null ? '' : String(v) });
  }
  return out;
}

/** Every binding each document type offers (for the template editor's data panel). */
export const DOC_BINDINGS: Record<DocType, DocBinding[]> = Object.fromEntries(DOC_TYPES.map((t) => [t, bindingsOf(DOC_SAMPLES[t])])) as Record<DocType, DocBinding[]>;
