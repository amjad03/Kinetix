/** UGC frameworks, the autonomous-college profile and the school boards (CBSE, CISCE, KSEAB SSLC, Karnataka PU). */
import { deepMerge, type AffiliationProfile, type ProfileRules } from '../rules.js';
import { karnatakaNep, karnatakaSep, schoolBoard, ugcCbcs } from './common.js';

const REVISED = '2026-10-14';

const ugcNep: ProfileRules = deepMerge<ProfileRules>(ugcCbcs(), {
  credits: {
    degreeTotal: 160,
    perTermTypical: 20,
    exits: [
      { afterTerms: 2, award: 'UG Certificate (with a 4-credit summer vocational course)', minCredits: 40 },
      { afterTerms: 4, award: 'UG Diploma (with a 4-credit summer vocational course)', minCredits: 80 },
      { afterTerms: 6, award: '3-year UG Degree', minCredits: 120 },
      { afterTerms: 8, award: '4-year UG Degree (Honours / Honours with Research)', minCredits: 160 },
    ],
  },
});

const sslcBands = (cMin: number): ProfileRules['grading']['bands'] => [
  { grade: 'A+', minPercent: 90, gradePoint: 0, pass: true },
  { grade: 'A', minPercent: 80, gradePoint: 0, pass: true },
  { grade: 'B+', minPercent: 70, gradePoint: 0, pass: true },
  { grade: 'B', minPercent: 60, gradePoint: 0, pass: true },
  { grade: 'C+', minPercent: 50, gradePoint: 0, pass: true },
  { grade: 'C', minPercent: cMin, gradePoint: 0, pass: true },
  { grade: 'F', minPercent: 0, gradePoint: 0, pass: false },
];

const karnatakaBoardClasses = (pass: number): ProfileRules['classification'] => ({
  basis: 'percent',
  classes: [
    { label: 'Distinction', min: 85, firstAttemptOnly: false },
    { label: 'First Class', min: 60, firstAttemptOnly: false },
    { label: 'Second Class', min: 50, firstAttemptOnly: false },
    { label: 'Pass Class', min: pass, firstAttemptOnly: false },
  ],
  minForAward: null,
});

const KSEAB_SOURCES = [
  { title: 'Karnataka School Examination and Assessment Board', url: 'https://kseab.karnataka.gov.in' },
  { title: 'Karnataka lowers SSLC and II PUC pass marks from the 2025-26 session (Careers360)', url: 'https://news.careers360.com/karnataka-revises-sslc-2nd-puc-passing-marks-starting-from-2026-board-exams-at-par-cbse-other-state-boards/amp' },
  { title: 'Karnataka proposes 206 out of 625 as SSLC pass marks (Deccan Herald)', url: 'https://www.deccanherald.com/amp/story/education%2Fkarnataka-proposes-206-out-of-625-as-pass-marks-in-class-10-exam-3647333' },
];

const sslcBase: ProfileRules = deepMerge<ProfileRules>(schoolBoard(), {
  terminology: { termLabel: 'Class 10', external: 'SSLC Examination', registerNo: 'Register Number', marksCard: 'SSLC Marks Card' },
  registerNumber: { pattern: null, example: null, description: 'The register number on the SSLC admission ticket, issued by KSEAB.' },
  marksCard: {
    title: 'Secondary School Leaving Certificate Marks Card',
    fields: ['universityName', 'institutionName', 'institutionCode', 'examMonthYear', 'studentName', 'registerNo', 'parentName', 'medium', 'serialNo', 'issuedOn'],
    subjectColumns: ['title', 'external', 'internal', 'total', 'grade', 'result'],
    summary: ['totalMarks', 'percent', 'result', 'class'],
    footnotes: ['First language: 100 + 25 internal; other subjects: 80 + 20 internal; 625 in all.'],
  },
});

const pucBase: ProfileRules = deepMerge<ProfileRules>(schoolBoard(), {
  terminology: { termLabel: 'II PUC', external: 'II PUC Annual Examination', registerNo: 'Register Number', marksCard: 'II PUC Marks Card' },
  registerNumber: { pattern: null, example: null, description: 'The register number on the II PUC admission ticket, issued by KSEAB.' },
  marksCard: {
    title: 'Pre-University Examination Marks Card',
    fields: ['universityName', 'institutionName', 'institutionCode', 'examMonthYear', 'studentName', 'registerNo', 'parentName', 'medium', 'serialNo', 'issuedOn'],
    subjectColumns: ['code', 'title', 'external', 'internal', 'total', 'result'],
    summary: ['totalMarks', 'percent', 'result', 'class'],
    footnotes: ['Subjects without practicals: 80 theory + 20 internal; with practicals: 70 theory + 30 practical.'],
  },
});

const cbseBase: ProfileRules = deepMerge<ProfileRules>(schoolBoard(), {
  terminology: { external: 'Board Examination', externalShort: 'Theory', registerNo: 'Roll Number', marksCard: 'Marks Statement cum Certificate' },
  registerNumber: { pattern: null, example: null, description: 'The board roll number on the CBSE admit card.' },
  pass: { minInternalPercent: 33, minExternalPercent: 33, minTotalPercent: 33 },
  grading: {
    mode: 'positional',
    pointsMode: 'band',
    bands: [
      { grade: 'A1', minPercent: 91, gradePoint: 10, pass: true },
      { grade: 'A2', minPercent: 81, gradePoint: 9, pass: true },
      { grade: 'B1', minPercent: 71, gradePoint: 8, pass: true },
      { grade: 'B2', minPercent: 61, gradePoint: 7, pass: true },
      { grade: 'C1', minPercent: 51, gradePoint: 6, pass: true },
      { grade: 'C2', minPercent: 41, gradePoint: 5, pass: true },
      { grade: 'D', minPercent: 33, gradePoint: 4, pass: true },
      { grade: 'E', minPercent: 0, gradePoint: 0, pass: false },
    ],
  },
  attendance: { minPercent: 75, condonableToPercent: 60, basis: 'overall' },
  revaluation: { revaluation: true, retotalling: true, photocopy: true, windowDays: null, changeThresholdPercent: null },
  marksCard: {
    title: 'Marks Statement cum Certificate',
    fields: ['universityName', 'institutionName', 'institutionCode', 'examMonthYear', 'studentName', 'registerNo', 'parentName', 'issuedOn'],
    subjectColumns: ['code', 'title', 'external', 'internal', 'total', 'grade', 'result'],
    summary: ['result'],
    footnotes: ['Board grades are positional: the board places the top one-eighth of passed candidates in each subject in A1, the next in A2, and so on. School-computed grades here use the fixed bands CBSE gives for school-based assessment.'],
  },
});

const CBSE_SOURCES = [
  { title: 'CBSE: examination bye-laws and circulars', url: 'https://www.cbse.gov.in' },
  { title: 'CBSE academic: scheme of studies and assessment', url: 'https://cbseacademic.nic.in' },
  { title: 'CBSE pass criteria: theory and internal assessment separately (Physics Wallah)', url: 'https://www.pw.live/news/what-is-the-passing-marks-in-cbse-class-10-2026-new-rules' },
];

const cisceBase: ProfileRules = deepMerge<ProfileRules>(schoolBoard(), {
  terminology: { external: 'Council Examination', externalShort: 'Exam', registerNo: 'Unique ID', marksCard: 'Statement of Marks' },
  registerNumber: { pattern: null, example: null, description: 'The Unique ID (index number) the Council allots to each candidate.' },
  marksCard: { title: 'Statement of Marks', subjectColumns: ['title', 'total', 'result'], summary: ['result'], footnotes: ['A pass certificate needs passes in at least five subjects, English included.'] },
});

const CISCE_SOURCES = [
  { title: 'CISCE: regulations and syllabuses', url: 'https://cisce.org' },
  { title: 'ICSE grading system and marking scheme (Careers360)', url: 'https://school.careers360.com/boards/cisce/icse-class-10-grading-system-marking-scheme' },
  { title: 'ICSE passing marks (GetMyUni)', url: 'https://getmyuni.com/articles/icse-passing-marks' },
];

export const BOARD_AND_FRAMEWORK_PROFILES: AffiliationProfile[] = [
  {
    code: 'karnataka-state',
    name: 'Karnataka State NEP / SEP (state framework)',
    shortName: 'Karnataka NEP/SEP',
    kind: 'framework',
    category: 'State framework for universities not listed separately',
    headquarters: null,
    website: 'https://kshec.karnataka.gov.in',
    jurisdiction: 'Any Karnataka state university following the State Higher Education Council framework',
    defaultScheme: 'sep-2024',
    schemes: [
      { code: 'sep-2024', name: 'Karnataka SEP UG (2024)', effectiveFrom: '2024-25', effectiveTo: null, appliesTo: ['BA', 'BSc', 'BCom', 'BBA', 'BCA'], version: 1, revisedOn: REVISED, ruleAuthority: 'university', rules: karnatakaSep(), sources: [{ title: 'Karnataka State Higher Education Council', url: 'https://kshec.karnataka.gov.in' }], notes: ['Confirm SEP evaluation numbers against your university\'s regulations.'] },
      { code: 'nep-2021', name: 'Karnataka NEP-2020 UG (2021)', effectiveFrom: '2021-22', effectiveTo: '2023-24', appliesTo: ['BA', 'BSc', 'BCom', 'BBA', 'BCA'], version: 1, revisedOn: REVISED, ruleAuthority: 'university', rules: karnatakaNep(), sources: [{ title: 'Model Curriculum and Credit Framework for 4YUGP in Karnataka', url: 'https://raichuruniversity.ac.in/wp-content/uploads/2023/02/Model-Curriculum-Credit-Framework-for-4YUGP-in-Karnataka_21-01-2023.pdf' }], notes: [] },
    ],
  },
  {
    code: 'ugc',
    name: 'UGC CBCS / NEP-2020 (generic)',
    shortName: 'UGC',
    kind: 'framework',
    category: 'National model regulations',
    headquarters: 'New Delhi',
    website: 'https://www.ugc.gov.in',
    jurisdiction: 'Universities and colleges following the UGC model',
    defaultScheme: 'ccfup-2022',
    schemes: [
      {
        code: 'ccfup-2022',
        name: 'UGC Curriculum and Credit Framework for UG Programmes (2022)',
        effectiveFrom: '2023-24',
        effectiveTo: null,
        appliesTo: ['UG'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: ugcNep,
        sources: [{ title: 'UGC Curriculum and Credit Framework for UG Programmes, December 2022', url: 'https://www.ugc.gov.in/pdfnews/7193743_FYUGP.pdf' }],
        notes: ['UGC does not fix the internal/external split or the percentage bands; the 30/70 split and bands here are the CBCS model. Set your university\'s numbers as overrides.'],
      },
      {
        code: 'cbcs-2015',
        name: 'UGC Choice Based Credit System (2015)',
        effectiveFrom: '2015-16',
        effectiveTo: '2022-23',
        appliesTo: ['UG', 'PG'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: ugcCbcs(),
        sources: [{ title: 'UGC guidelines on adoption of CBCS (2015)', url: 'https://www.ugc.gov.in/pdfnews/8023719_Guidelines-for-CBCS.pdf' }, { title: 'Choice Based Credit System (Vikaspedia)', url: 'https://vikaspedia.in/education/policies-and-schemes/choice-based-credit-system-cbcs' }],
        notes: [],
      },
    ],
  },
  {
    code: 'autonomous',
    name: 'Autonomous college (own regulations)',
    shortName: 'Autonomous',
    kind: 'framework',
    category: 'Autonomous college under an affiliating university',
    headquarters: null,
    website: null,
    jurisdiction: 'The college conducts its own examinations; the degree is awarded by the parent university',
    defaultScheme: 'own',
    schemes: [
      {
        code: 'own',
        name: 'Own regulations (UGC CBCS defaults)',
        effectiveFrom: '2015-16',
        effectiveTo: null,
        appliesTo: ['UG', 'PG'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'institution',
        rules: ugcCbcs(),
        sources: [{ title: 'UGC (Conferment of Autonomous Status upon Colleges) Regulations, 2023', url: 'https://www.ugc.gov.in' }],
        notes: ['The Academic Council\'s regulations govern. Subject schemes saved by the college are used as they are; set your award and attendance rules as overrides.'],
      },
    ],
  },
  {
    code: 'cbse',
    name: 'Central Board of Secondary Education',
    shortName: 'CBSE',
    kind: 'board',
    category: 'Central school board',
    headquarters: 'New Delhi (Regional Office: Bengaluru)',
    website: 'https://www.cbse.gov.in',
    jurisdiction: 'Affiliated schools across India',
    defaultScheme: 'secondary-2026',
    schemes: [
      {
        code: 'secondary-2026',
        name: 'CBSE Secondary (Class X) 2025-26',
        effectiveFrom: '2025-26',
        effectiveTo: null,
        appliesTo: ['Class 9', 'Class 10'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: deepMerge<ProfileRules>(cbseBase, {
          terminology: { termLabel: 'Class 10' },
          assessment: {
            theoryComponents: [
              { code: 'PT', name: 'Periodic tests', kind: 'internal', weight: 5 },
              { code: 'MA', name: 'Multiple assessment', kind: 'internal', weight: 5 },
              { code: 'PF', name: 'Portfolio', kind: 'internal', weight: 5 },
              { code: 'SEA', name: 'Subject enrichment activity', kind: 'internal', weight: 5 },
              { code: 'BE', name: 'Board examination', kind: 'external', weight: 80 },
            ],
          },
        }),
        sources: CBSE_SOURCES,
        notes: ['Up to two subjects may be cleared in the supplementary examination. Grace marks are not published by the board.'],
      },
      {
        code: 'senior-secondary-2026',
        name: 'CBSE Senior Secondary (Class XII) 2025-26',
        effectiveFrom: '2025-26',
        effectiveTo: null,
        appliesTo: ['Class 11', 'Class 12'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: deepMerge<ProfileRules>(cbseBase, {
          terminology: { termLabel: 'Class 12' },
          assessment: { theoryComponents: [{ code: 'IA', name: 'Internal assessment / project', kind: 'internal', weight: 20 }, { code: 'BE', name: 'Board examination', kind: 'external', weight: 80 }] },
        }),
        sources: CBSE_SOURCES,
        notes: ['Subjects with practicals are 70 theory + 30 practical; theory and practical are passed separately (33% each). One subject may be cleared in the supplementary examination.'],
      },
    ],
  },
  {
    code: 'cisce',
    name: 'Council for the Indian School Certificate Examinations (ICSE / ISC)',
    shortName: 'CISCE',
    kind: 'board',
    category: 'National school board',
    headquarters: 'New Delhi',
    website: 'https://cisce.org',
    jurisdiction: 'Affiliated schools across India',
    defaultScheme: 'icse-2026',
    schemes: [
      {
        code: 'icse-2026',
        name: 'ICSE (Class X) 2026',
        effectiveFrom: '2025-26',
        effectiveTo: null,
        appliesTo: ['Class 9', 'Class 10'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: deepMerge<ProfileRules>(cisceBase, { terminology: { termLabel: 'Class 10' }, pass: { minTotalPercent: 33 } }),
        sources: CISCE_SOURCES,
        notes: ['Group I and II subjects: 80 exam + 20 internal; Group III: 50 + 50. Pass mark 33% per subject (raised from 35% before 2025): confirm in the Council\'s current regulations.'],
      },
      {
        code: 'isc-2026',
        name: 'ISC (Class XII) 2026',
        effectiveFrom: '2025-26',
        effectiveTo: null,
        appliesTo: ['Class 11', 'Class 12'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: deepMerge<ProfileRules>(cisceBase, {
          terminology: { termLabel: 'Class 12' },
          pass: { minTotalPercent: 35 },
          grading: { bands: [{ grade: 'P', minPercent: 35, gradePoint: 0, pass: true }, { grade: 'F', minPercent: 0, gradePoint: 0, pass: false }] },
        }),
        sources: CISCE_SOURCES,
        notes: ['Subjects with practicals: 70 theory + 30 practical. Pass mark 35% per subject: confirm in the Council\'s current regulations.'],
      },
    ],
  },
  {
    code: 'kseab-sslc',
    name: 'Karnataka School Examination and Assessment Board (SSLC)',
    shortName: 'KSEAB SSLC',
    kind: 'board',
    category: 'State school board',
    headquarters: 'Malleshwaram, Bengaluru',
    website: 'https://kseab.karnataka.gov.in',
    jurisdiction: 'State-syllabus high schools in Karnataka',
    defaultScheme: '2026',
    schemes: [
      {
        code: '2026',
        name: 'SSLC from the 2025-26 examination',
        effectiveFrom: '2025-26',
        effectiveTo: null,
        appliesTo: ['Class 10'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: deepMerge<ProfileRules>(sslcBase, {
          pass: { minTotalPercent: 30, minAggregatePercent: 33 },
          grading: { bands: sslcBands(30) },
          classification: karnatakaBoardClasses(33),
        }),
        sources: KSEAB_SOURCES,
        notes: ['Government order of October 2025: 30% in each subject (internal and external together) and 33% of the total (206 of 625). Confirm the bands and class labels in the board\'s notification.'],
      },
      {
        code: '2024',
        name: 'SSLC up to the 2024-25 examination',
        effectiveFrom: '2015-16',
        effectiveTo: '2024-25',
        appliesTo: ['Class 10'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: deepMerge<ProfileRules>(sslcBase, { pass: { minTotalPercent: 35 }, grading: { bands: sslcBands(35) }, classification: karnatakaBoardClasses(35) }),
        sources: KSEAB_SOURCES,
        notes: ['35% in each subject, internal and external together (219 of 625 overall).'],
      },
    ],
  },
  {
    code: 'karnataka-puc',
    name: 'Karnataka Pre-University Board (II PUC)',
    shortName: 'Karnataka PUC',
    kind: 'board',
    category: 'State pre-university board (KSEAB)',
    headquarters: 'Malleshwaram, Bengaluru',
    website: 'https://kseab.karnataka.gov.in',
    jurisdiction: 'Pre-university colleges in Karnataka',
    defaultScheme: '2026',
    schemes: [
      {
        code: '2026',
        name: 'II PUC from the 2025-26 examination',
        effectiveFrom: '2025-26',
        effectiveTo: null,
        appliesTo: ['I PUC', 'II PUC'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: deepMerge<ProfileRules>(pucBase, { pass: { minExternalPercent: 30, minTotalPercent: 30, minAggregatePercent: 33 }, grading: { bands: [{ grade: 'P', minPercent: 30, gradePoint: 0, pass: true }, { grade: 'F', minPercent: 0, gradePoint: 0, pass: false }] }, classification: karnatakaBoardClasses(33) }),
        sources: [...KSEAB_SOURCES, { title: 'Karnataka 2nd PUC 2026 passing marks (Collegedunia)', url: 'https://collegedunia.com/articles/e-762-karnataka-2nd-puc-exam-2026-passing-marks' }],
        notes: ['30% in each subject with at least 30% in the theory paper (24/80 or 21/70) and 33% of the total.'],
      },
      {
        code: '2024',
        name: 'II PUC up to the 2024-25 examination',
        effectiveFrom: '2023-24',
        effectiveTo: '2024-25',
        appliesTo: ['I PUC', 'II PUC'],
        version: 1,
        revisedOn: REVISED,
        ruleAuthority: 'university',
        rules: deepMerge<ProfileRules>(pucBase, { pass: { minExternalPercent: 30, minTotalPercent: 35 }, grading: { bands: [{ grade: 'P', minPercent: 35, gradePoint: 0, pass: true }, { grade: 'F', minPercent: 0, gradePoint: 0, pass: false }] }, classification: karnatakaBoardClasses(35) }),
        sources: [...KSEAB_SOURCES, { title: 'Karnataka 2nd PUC result 2024: passing marks and grading (Careers360)', url: 'https://news.careers360.com/karnataka-2nd-puc-result-2024-today-at-karresultsnicin-passing-marks-grading-system/amp' }, { title: 'PU internal assessment of 20 marks from 2023-24', url: 'https://amkresourceinfo.com/dept-of-pre-university-released-guidelines-to-allot-20-internal-marks-for-pu-exams-in-subjects-without-practicals/' }],
        notes: ['35% in each subject; 20 internal marks in subjects without practicals from 2023-24.'],
      },
    ],
  },
];
