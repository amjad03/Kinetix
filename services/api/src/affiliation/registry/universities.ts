/**
 * Karnataka universities. Sources are the regulations and the circulars we could reach; where only an
 * affiliated college's copy or a news report was available, the scheme's notes say what to confirm.
 */
import { deepMerge, type AffiliationProfile, type ProfileRules, type ProfileScheme } from '../rules.js';
import { karnatakaNep, karnatakaSep, KARNATAKA_BANDS } from './common.js';

const REVISED = '2026-10-14';

const STATE_SOURCES = [
  { title: 'Model Curriculum and Credit Framework for four-year UG programmes in Karnataka (KSHEC, 21-01-2023)', url: 'https://raichuruniversity.ac.in/wp-content/uploads/2023/02/Model-Curriculum-Credit-Framework-for-4YUGP-in-Karnataka_21-01-2023.pdf' },
  { title: 'NEP effect: theory internal assessment marks raised to 40 for UG courses (Udayavani)', url: 'https://www.udayavani.com/english-news/nep-effect-theory-internal-assessment-marks-raised-to-40-for-ug-courses' },
  { title: 'UG regulations NEP 2021-22 (state university copy)', url: 'https://kscd.ac.in/resources/UG REGULATIONS NEP 2021-22.pdf' },
];

const NEP_NOTES = [
  'Pass rule, grade bands and class boundaries follow the State Higher Education Council framework the university adopted; confirm against the current ordinance and amendments.',
  'Attendance condonation is decided by the university each semester; no condonation floor is set here.',
  'Revaluation and photocopy windows and fees are notified with each result.',
];
const SEP_NOTES = [
  'SEP (State Education Policy) rules for the 2024-25 batch onward: three-year degree, IA 20 + SEE 80 and SEE minimum 35% as notified; confirm against the university\'s SEP regulations.',
];

interface StateUniversity {
  code: string;
  name: string;
  shortName: string;
  headquarters: string;
  website: string | null;
  jurisdiction: string;
  sources?: { title: string; url: string }[];
  nep?: unknown;
  sep?: unknown;
  notes?: string[];
}

/** A Karnataka state university with its NEP-2021 and SEP-2024 schemes. */
function stateUniversity(u: StateUniversity): AffiliationProfile {
  const sources = [...(u.website ? [{ title: `${u.name}: regulations and circulars`, url: u.website }] : []), ...(u.sources ?? []), ...STATE_SOURCES];
  const nep: ProfileScheme = {
    code: 'nep-2021',
    name: `${u.shortName} NEP-2020 UG regulations (2021)`,
    effectiveFrom: '2021-22',
    effectiveTo: '2023-24',
    appliesTo: ['BA', 'BSc', 'BCom', 'BBA', 'BCA', 'BSW'],
    version: 1,
    revisedOn: REVISED,
    ruleAuthority: 'university',
    rules: deepMerge<ProfileRules>(karnatakaNep(), u.nep),
    sources,
    notes: [...NEP_NOTES, ...(u.notes ?? [])],
  };
  const sep: ProfileScheme = {
    code: 'sep-2024',
    name: `${u.shortName} SEP UG regulations (2024)`,
    effectiveFrom: '2024-25',
    effectiveTo: null,
    appliesTo: ['BA', 'BSc', 'BCom', 'BBA', 'BCA', 'BSW'],
    version: 1,
    revisedOn: REVISED,
    ruleAuthority: 'university',
    rules: deepMerge<ProfileRules>(karnatakaSep(), u.sep),
    sources,
    notes: [...SEP_NOTES, ...NEP_NOTES.slice(1), ...(u.notes ?? [])],
  };
  return { code: u.code, name: u.name, shortName: u.shortName, kind: 'university', category: 'State university (affiliating)', headquarters: u.headquarters, website: u.website, jurisdiction: u.jurisdiction, defaultScheme: 'sep-2024', schemes: [sep, nep] };
}

const BU_INTERNALS = [
  { code: 'IA-T', name: 'Internal tests', kind: 'internal', weight: 15 },
  { code: 'IA-C', name: 'Community / project presentation', kind: 'internal', weight: 10 },
  { code: 'IA-A', name: 'Assignment', kind: 'internal', weight: 5 },
  { code: 'IA-O', name: 'Open-book test', kind: 'internal', weight: 5 },
  { code: 'IA-P', name: 'Class participation', kind: 'internal', weight: 5 },
  { code: 'SEE', name: 'Semester End Examination', kind: 'external', weight: 60 },
];

export const UNIVERSITY_PROFILES: AffiliationProfile[] = [
  stateUniversity({
    code: 'bangalore-university',
    name: 'Bangalore University',
    shortName: 'BU',
    headquarters: 'Jnanabharathi, Bengaluru',
    website: 'https://bangaloreuniversity.karnataka.gov.in',
    jurisdiction: 'Bengaluru Urban (western zone, after the 2017 trifurcation)',
    sources: [
      { title: 'St Claret College (BU): NEP implementation, IA 40 / SEE 60 and exits', url: 'https://www.claretcollege.edu.in/NEP_Implementation' },
      { title: 'ISME (BU affiliate): UG examination procedure, NEP internal assessment split', url: 'https://isme.in/NAAC/6_Criterion%20VI%20-%20Governance%2C%20Leadership%20and%20Management%20(100)/6.2%20Strategy%20Development%20and%20Deployment%20%20(12)/6.2.1_QLM_Strategy%20Development%20%26%20Deployment/Latest%206.2.1/4.%20Procedures/UG%20-%20Examination%20Procedure%20and%20Guidelines.pdf' },
    ],
    nep: { assessment: { theoryComponents: BU_INTERNALS }, marksCard: { footnotes: ['Grade point = marks percentage ÷ 10 (BU NEP). SGPA = Σ (credits × grade point) ÷ Σ credits.'] } },
    notes: ['BU NEP internal assessment as its affiliated colleges publish it: tests 15, community project 10, assignment 5, open-book test 5, participation 5.'],
  }),
  stateUniversity({
    code: 'bengaluru-city-university',
    name: 'Bengaluru City University',
    shortName: 'BCU',
    headquarters: 'Central College campus, Bengaluru',
    website: 'https://www.bcu.ac.in',
    jurisdiction: 'Bengaluru city (central zone)',
    sources: [{ title: 'BCU: regulations governing NEP-2020 UG courses (calendar of events notification)', url: 'https://www.bcu.ac.in/documents/academics/2021/10/Revised%20notification%20-%20UG%20calendar%20of%20events.pdf' }],
  }),
  stateUniversity({
    code: 'bengaluru-north-university',
    name: 'Bengaluru North University',
    shortName: 'BNU',
    headquarters: 'Tamaka, Kolar',
    website: null,
    jurisdiction: 'Kolar, Chikkaballapur and Bengaluru Rural districts',
  }),
  stateUniversity({
    code: 'university-of-mysore',
    name: 'University of Mysore',
    shortName: 'UoM',
    headquarters: 'Manasagangotri, Mysuru',
    website: 'https://uni-mysore.ac.in',
    jurisdiction: 'Mysuru, Mandya, Chamarajanagar and Hassan districts',
  }),
  stateUniversity({
    code: 'mangalore-university',
    name: 'Mangalore University',
    shortName: 'MU',
    headquarters: 'Mangalagangothri, Konaje',
    website: 'https://mangaloreuniversity.ac.in',
    jurisdiction: 'Dakshina Kannada and Udupi districts',
  }),
  stateUniversity({
    code: 'tumkur-university',
    name: 'Tumkur University',
    shortName: 'TU',
    headquarters: 'Tumakuru',
    website: 'https://tumkuruniversity.ac.in',
    jurisdiction: 'Tumakuru district',
  }),
  stateUniversity({
    code: 'davangere-university',
    name: 'Davangere University',
    shortName: 'DU',
    headquarters: 'Shivagangotri, Davanagere',
    website: 'https://davangereuniversity.ac.in',
    jurisdiction: 'Davanagere and Chitradurga districts',
  }),
  stateUniversity({
    code: 'kuvempu-university',
    name: 'Kuvempu University',
    shortName: 'KU',
    headquarters: 'Jnana Sahyadri, Shankaraghatta',
    website: 'https://kuvempu.ac.in',
    jurisdiction: 'Shivamogga and Chikkamagaluru districts',
  }),
  stateUniversity({
    code: 'karnatak-university',
    name: 'Karnatak University, Dharwad',
    shortName: 'KUD',
    headquarters: 'Pavate Nagar, Dharwad',
    website: 'https://kud.ac.in',
    jurisdiction: 'Dharwad, Gadag, Haveri and Uttara Kannada districts',
  }),
  stateUniversity({
    code: 'rani-channamma-university',
    name: 'Rani Channamma University, Belagavi',
    shortName: 'RCU',
    headquarters: 'Vidya Sangama, Belagavi',
    website: 'https://rcub.ac.in',
    jurisdiction: 'Belagavi, Vijayapura and Bagalkot districts',
  }),
  stateUniversity({
    code: 'akkamahadevi-womens-university',
    name: "Karnataka State Akkamahadevi Women's University",
    shortName: 'KSAWU',
    headquarters: 'Jnanashakti campus, Vijayapura',
    website: 'https://kswu.ac.in',
    jurisdiction: "Women's colleges across Karnataka",
  }),

  // ---- Visvesvaraya Technological University ---------------------------------------------------
  (() => {
    const vtu: ProfileRules = deepMerge<ProfileRules>(karnatakaNep(), {
      terminology: { internal: 'Continuous Internal Evaluation', internalShort: 'CIE', external: 'Semester End Examination', externalShort: 'SEE', registerNo: 'University Seat Number', marksCard: 'Grade Card' },
      registerNumber: { pattern: '^[1-4][A-Z]{2}\\d{2}[A-Z]{2}\\d{3}$', example: '1RV22CS001', description: 'USN: region digit, two-letter college code, year of admission, two-letter branch code and a three-digit roll number. Lateral-entry students have rolls from 400.' },
      assessment: {
        theory: { internal: 50, external: 50, externalPaperMax: 100, examHours: 3 },
        practical: { internal: 50, external: 50 },
        theoryComponents: [
          { code: 'CIE-T', name: 'CIE tests (average of two, scaled)', kind: 'internal', weight: 25 },
          { code: 'CIE-A', name: 'Assignments / comprehensive continuous assessment', kind: 'internal', weight: 25 },
          { code: 'SEE', name: 'Semester End Examination (100 scaled to 50)', kind: 'external', weight: 50 },
        ],
        practicalComponents: [
          { code: 'CIE-L', name: 'Laboratory CIE (records, tests)', kind: 'internal', weight: 50 },
          { code: 'SEE-L', name: 'Laboratory SEE', kind: 'external', weight: 50 },
        ],
      },
      pass: { minInternalPercent: 40, minExternalPercent: 35, minTotalPercent: 40, internalEligibilityPercent: 40 },
      grading: { bands: KARNATAKA_BANDS, pointsMode: 'band' },
      percentage: { basis: 'cgpa', cgpaMultiplier: 10, cgpaSubtract: 0 },
      classification: {
        basis: 'cgpa',
        classes: [
          { label: 'First Class with Distinction', min: 7, firstAttemptOnly: true },
          { label: 'First Class', min: 6, firstAttemptOnly: false },
          { label: 'Second Class', min: 5, firstAttemptOnly: false },
        ],
        minForAward: 5,
      },
      credits: { degreeTotal: 160, perTermTypical: 20, exits: [] },
      attendance: { minPercent: 85, condonableToPercent: 75, basis: 'per_subject' },
      examApplication: { fields: ['USN', 'Name', 'Semester', 'Courses registered (regular, backlog with earlier CIE)', 'CIE eligibility (not NE)', 'Exam fee and receipt'], lateFeeAllowed: true },
      revaluation: { revaluation: true, retotalling: false, photocopy: true, windowDays: null, changeThresholdPercent: null },
      marksCard: {
        title: 'Grade Card',
        fields: ['universityName', 'institutionName', 'institutionCode', 'programme', 'branch', 'scheme', 'term', 'examMonthYear', 'studentName', 'registerNo', 'serialNo', 'issuedOn'],
        subjectColumns: ['code', 'title', 'internal', 'external', 'total', 'grade', 'gradePoint', 'credits', 'creditPoints', 'result'],
        summary: ['creditsRegistered', 'creditsEarned', 'creditPoints', 'sgpa', 'cgpa', 'percentEquivalent', 'result', 'class'],
        footnotes: ['SEE is written for 100 marks and scaled to 50. Pass: CIE ≥ 40% (20/50), SEE ≥ 35% (18/50), CIE + SEE ≥ 40/100.', 'Percentage equivalent of CGPA = CGPA × 10 (2021 scheme onward).'],
      },
      resultSheet: {
        columns: {
          registerNo: ['USN', 'University Seat Number'],
          name: ['Student Name', 'Name'],
          subjectCode: ['Subject Code', 'Course Code'],
          subjectName: ['Subject Name', 'Course Name', 'Course Title'],
          credits: ['Credits'],
          internal: ['Internal Marks', 'CIE', 'IA'],
          external: ['External Marks', 'SEE'],
          total: ['Total', 'Total Marks'],
          grade: ['Grade', 'Letter Grade'],
          gradePoint: ['Grade Point', 'GP'],
          result: ['Result'],
        },
        resultCodes: { P: 'pass', F: 'fail', A: 'absent', AB: 'absent', W: 'withheld', X: 'not_eligible', NE: 'not_eligible' },
      },
    });
    const sources = [
      { title: 'VTU: regulations, schemes and circulars', url: 'https://vtu.ac.in' },
      { title: 'VTU 2022 scheme regulations (college copy)', url: 'https://www.acsce.edu.in/acsce/wp-content/uploads/2025/08/View-2022-Scheme-Regulations.pdf' },
      { title: 'VTU 2022 scheme amendment circular (RVCE copy)', url: 'https://rvce.edu.in/sites/default/files/5.%202022%20scheme%20VTU%20NEW%20AMENDMENT%20CIRCULAR.pdf' },
      { title: 'Circular on attendance and CIE marks, Sept 2023 (JSSATE)', url: 'https://www.jssateb.ac.in/assets/Circular on Attendance and CIE Marks_Sept. 2023.pdf' },
      { title: 'VTU CGPA to percentage by scheme', url: 'https://academic.exammint.in/tools/vtu-cgpa-to-percentage-converter' },
    ];
    const notes = ['A student short of attendance or of the CIE minimum gets NE (not eligible) and re-registers the course.', 'Class boundaries and the first-attempt condition for distinction: confirm against the regulations of the batch.'];
    return {
      code: 'vtu',
      name: 'Visvesvaraya Technological University',
      shortName: 'VTU',
      kind: 'university' as const,
      category: 'State technological university (affiliating)',
      headquarters: 'Jnana Sangama, Belagavi',
      website: 'https://vtu.ac.in',
      jurisdiction: 'Engineering, architecture, MBA and MCA colleges across Karnataka',
      defaultScheme: '2022',
      schemes: [
        { code: '2022', name: 'VTU 2022 scheme (OBE and CBCS)', effectiveFrom: '2022-23', effectiveTo: null, appliesTo: ['BE', 'BTech', 'BArch', 'MBA', 'MCA', 'MTech'], version: 1, revisedOn: REVISED,
    ruleAuthority: 'university', rules: vtu, sources, notes },
        {
          code: '2021',
          name: 'VTU 2021 scheme (OBE and CBCS)',
          effectiveFrom: '2021-22',
          effectiveTo: '2021-22',
          appliesTo: ['BE', 'BTech', 'MBA', 'MCA'],
          version: 1,
          revisedOn: REVISED,
    ruleAuthority: 'university',
          rules: vtu,
          sources,
          notes: [...notes, 'The 2021 scheme uses the same evaluation rules as 2022; course structure and credits differ by branch.'],
        },
      ],
    };
  })(),

  // ---- Rajiv Gandhi University of Health Sciences ------------------------------------------------
  (() => {
    const rules: ProfileRules = deepMerge<ProfileRules>(karnatakaNep(), {
      terminology: { term: 'year', termLabel: 'Professional year', internal: 'Internal Assessment', internalShort: 'IA', external: 'University Examination', externalShort: 'Theory', registerNo: 'Register Number', marksCard: 'Statement of Marks' },
      registerNumber: { pattern: null, example: null, description: 'Allotted by RGUHS on the admission ticket.' },
      assessment: {
        theory: { internal: 0, external: 50, externalPaperMax: 100, examHours: 3 },
        practical: { internal: 0, external: 50 },
        theoryComponents: [
          { code: 'TH', name: 'Theory (university papers)', kind: 'external', weight: 50 },
          { code: 'PR', name: 'Practical / clinical and viva', kind: 'practical', weight: 50 },
        ],
        practicalComponents: null,
      },
      // NMC (GMER 2023): 40% in theory and 40% in practical/clinical separately, 50% together; IA (50% with 40% in each) only decides eligibility.
      pass: { minInternalPercent: 40, minExternalPercent: 40, minTotalPercent: 50, internalEligibilityPercent: 50 },
      grace: { enabled: true, maxPerSubject: 5, maxTotal: 5, maxSubjects: 1, allOrNothing: true },
      grading: { mode: 'marks', bands: [{ grade: 'D', minPercent: 75, gradePoint: 0, pass: true }, { grade: 'P', minPercent: 50, gradePoint: 0, pass: true }, { grade: 'F', minPercent: 0, gradePoint: 0, pass: false }], pointsMode: 'band' },
      gpa: { enabled: false },
      percentage: { basis: 'marks' },
      classification: { basis: 'percent', classes: [{ label: 'Distinction', min: 75, firstAttemptOnly: true }, { label: 'Pass', min: 50, firstAttemptOnly: false }], minForAward: null },
      credits: { degreeTotal: null, perTermTypical: null, exits: [] },
      attendance: { minPercent: 75, condonableToPercent: null, basis: 'per_subject' },
      examApplication: { fields: ['Register Number', 'Name', 'Professional year', 'Subjects', 'Internal assessment eligibility (theory and practical)', 'Attendance certificate (75% theory, 80% practical)', 'Exam fee'], lateFeeAllowed: true },
      revaluation: { revaluation: true, retotalling: true, photocopy: true, windowDays: null, changeThresholdPercent: null },
      marksCard: {
        title: 'Statement of Marks',
        fields: ['universityName', 'institutionName', 'institutionCode', 'programme', 'term', 'examMonthYear', 'studentName', 'registerNo', 'serialNo', 'issuedOn'],
        subjectColumns: ['code', 'title', 'external', 'internal', 'total', 'grace', 'result'],
        summary: ['totalMarks', 'percent', 'result', 'class'],
        footnotes: ['Theory and practical/clinical are passed separately (40% each) and together (50%). Internal assessment marks decide eligibility only.'],
      },
    });
    return {
      code: 'rguhs',
      name: 'Rajiv Gandhi University of Health Sciences',
      shortName: 'RGUHS',
      kind: 'university' as const,
      category: 'State health sciences university (affiliating)',
      headquarters: 'Jayanagar, Bengaluru',
      website: 'https://www.rguhs.ac.in',
      jurisdiction: 'Medical, dental, AYUSH, nursing, pharmacy and allied health colleges across Karnataka',
      defaultScheme: 'cbme-2023',
      schemes: [
        {
          code: 'cbme-2023',
          name: 'MBBS competency-based (NMC GMER 2023)',
          effectiveFrom: '2023-24',
          effectiveTo: null,
          appliesTo: ['MBBS'],
          version: 1,
          revisedOn: REVISED,
    ruleAuthority: 'university',
          rules,
          sources: [
            { title: 'RGUHS: ordinances and regulations', url: 'https://www.rguhs.ac.in' },
            { title: 'NMC Graduate Medical Education Regulations 2023', url: 'https://www.nmc.org.in' },
          ],
          notes: ['Attendance: 75% in theory and 80% in practicals/clinical postings for each subject; only the first is modelled as the threshold.', 'Grace of up to 5 marks in one subject when it makes the candidate pass; confirm the current RGUHS rule. Nursing, AHS and AYUSH programmes have their own schemes; set them per programme.'],
        },
      ],
    };
  })(),

  // ---- Karnataka State Law University -----------------------------------------------------------
  (() => {
    const rules: ProfileRules = deepMerge<ProfileRules>(karnatakaNep(), {
      terminology: { internal: 'Internal Assessment', internalShort: 'IA', external: 'Semester Examination', externalShort: 'Exam', registerNo: 'Register Number', marksCard: 'Marks Card' },
      registerNumber: { pattern: null, example: null, description: 'Allotted by KSLU at registration.' },
      assessment: {
        theory: { internal: 20, external: 80, externalPaperMax: 80, examHours: 3 },
        practical: { internal: 0, external: 100 },
        theoryComponents: [
          { code: 'IA', name: 'Internal assessment (tests, assignments, moot / seminar)', kind: 'internal', weight: 20 },
          { code: 'SE', name: 'Semester examination', kind: 'external', weight: 80 },
        ],
        practicalComponents: [{ code: 'CL', name: 'Clinical course (record, viva, moot)', kind: 'practical', weight: 100 }],
      },
      pass: { minInternalPercent: null, minExternalPercent: 35, minTotalPercent: 40 },
      grading: { mode: 'marks', bands: [{ grade: 'P', minPercent: 40, gradePoint: 0, pass: true }, { grade: 'F', minPercent: 0, gradePoint: 0, pass: false }], pointsMode: 'band' },
      gpa: { enabled: false },
      percentage: { basis: 'marks' },
      classification: {
        basis: 'percent',
        classes: [
          { label: 'First Class with Distinction', min: 70, firstAttemptOnly: true },
          { label: 'First Class', min: 60, firstAttemptOnly: false },
          { label: 'Second Class', min: 50, firstAttemptOnly: false },
          { label: 'Pass Class', min: 40, firstAttemptOnly: false },
        ],
        minForAward: null,
      },
      credits: { degreeTotal: null, perTermTypical: null, exits: [] },
      // Bar Council of India Rules of Legal Education 2008, rule 12: 70% in each subject, the principal may condone to 65%.
      attendance: { minPercent: 70, condonableToPercent: 65, basis: 'per_subject' },
      examApplication: { fields: ['Register Number', 'Name', 'Programme (3-year LLB / 5-year integrated)', 'Semester', 'Papers (regular and repeater)', 'Attendance certificate', 'Exam fee'], lateFeeAllowed: true },
      marksCard: { title: 'Marks Card', subjectColumns: ['code', 'title', 'internal', 'external', 'total', 'result'], summary: ['totalMarks', 'percent', 'result', 'class'], footnotes: ['Pass: 35% in the semester examination and 40% with internal assessment in each paper.'] },
    });
    return {
      code: 'kslu',
      name: 'Karnataka State Law University',
      shortName: 'KSLU',
      kind: 'university' as const,
      category: 'State law university (affiliating)',
      headquarters: 'Navanagar, Hubballi',
      website: 'https://kslu.karnataka.gov.in',
      jurisdiction: 'Law colleges across Karnataka',
      defaultScheme: 'llb-2023',
      schemes: [
        {
          code: 'llb-2023',
          name: 'KSLU LLB / integrated LLB (semester scheme)',
          effectiveFrom: '2023-24',
          effectiveTo: null,
          appliesTo: ['LLB', 'BA LLB', 'BBA LLB', 'BCom LLB', 'LLM'],
          version: 1,
          revisedOn: REVISED,
    ruleAuthority: 'university',
          rules,
          sources: [
            { title: 'KSLU: regulations and notifications', url: 'https://kslu.karnataka.gov.in' },
            { title: 'Bar Council of India Rules of Legal Education 2008 (rule 12, attendance)', url: 'https://www.barcouncilofindia.org/info/legal-education' },
            { title: 'Karnataka High Court on the KSLU 40% aggregate rule (LiveLaw)', url: 'https://www.livelaw.in/amp/news-updates/llb-karnataka-high-court-directs-kslu-to-pass-law-students-on-50-50-formula-quashes-clause-for-assessment-based-entirely-on-previous-semester-marks-182464' },
          ],
          notes: ['Pass minimums and class boundaries are as KSLU marks cards show them; confirm against the current regulations.'],
        },
      ],
    };
  })(),
];
