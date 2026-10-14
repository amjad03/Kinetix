/**
 * Building blocks of the code-defined profiles: rule sets shared by many universities (Karnataka state
 * universities follow one State Higher Education Council framework, then add their own regulations).
 * Each profile file lays its own differences over these with `deepMerge`.
 */
import { deepMerge, type ProfileRules } from '../rules.js';

/** UGC 10-point letter grades (O to F) with the Karnataka state-university percentage bands. */
export const KARNATAKA_BANDS: ProfileRules['grading']['bands'] = [
  { grade: 'O', minPercent: 90, gradePoint: 10, pass: true },
  { grade: 'A+', minPercent: 80, gradePoint: 9, pass: true },
  { grade: 'A', minPercent: 70, gradePoint: 8, pass: true },
  { grade: 'B+', minPercent: 60, gradePoint: 7, pass: true },
  { grade: 'B', minPercent: 55, gradePoint: 6, pass: true },
  { grade: 'C', minPercent: 50, gradePoint: 5, pass: true },
  { grade: 'P', minPercent: 40, gradePoint: 4, pass: true },
  { grade: 'F', minPercent: 0, gradePoint: 0, pass: false },
];

/**
 * UGC CBCS (2015) guidelines: relative grading by the class's mean and standard deviation for classes large enough to
 * have a distribution; the bottom pass grade P starts at the absolute pass mark.
 */
export const UGC_RELATIVE: NonNullable<ProfileRules['grading']['relative']> = {
  allowed: true,
  minClassSize: 30,
  maxShift: 5,
  bands: [
    { grade: 'O', gradePoint: 10, minZ: 1.5 },
    { grade: 'A+', gradePoint: 9, minZ: 1 },
    { grade: 'A', gradePoint: 8, minZ: 0.5 },
    { grade: 'B+', gradePoint: 7, minZ: 0 },
    { grade: 'B', gradePoint: 6, minZ: -0.5 },
    { grade: 'C', gradePoint: 5, minZ: -1 },
    { grade: 'P', gradePoint: 4, minZ: -1.5 },
  ],
};

/** The UGC CBCS (2015) model bands. */
export const UGC_BANDS: ProfileRules['grading']['bands'] = [
  { grade: 'O', minPercent: 90, gradePoint: 10, pass: true },
  { grade: 'A+', minPercent: 80, gradePoint: 9, pass: true },
  { grade: 'A', minPercent: 70, gradePoint: 8, pass: true },
  { grade: 'B+', minPercent: 60, gradePoint: 7, pass: true },
  { grade: 'B', minPercent: 50, gradePoint: 6, pass: true },
  { grade: 'C', minPercent: 45, gradePoint: 5, pass: true },
  { grade: 'P', minPercent: 40, gradePoint: 4, pass: true },
  { grade: 'F', minPercent: 0, gradePoint: 0, pass: false },
];

const UNIVERSITY_SHEET: ProfileRules['resultSheet'] = {
  columns: {
    registerNo: ['Register Number', 'Reg No', 'Reg. No.', 'Register No', 'UUCMS No', 'USN'],
    name: ['Name', 'Student Name', 'Name of the Candidate'],
    subjectCode: ['Subject Code', 'Paper Code', 'Course Code', 'QP Code'],
    subjectName: ['Subject Name', 'Paper Name', 'Course Title', 'Subject'],
    credits: ['Credits', 'Credit'],
    internal: ['IA', 'IA Marks', 'Internal', 'Internal Marks', 'CIA'],
    external: ['SEE', 'SEE Marks', 'Exam', 'External', 'Theory', 'Exam Marks'],
    total: ['Total', 'Total Marks', 'Marks Obtained'],
    maxInternal: ['IA Max', 'Max IA'],
    maxExternal: ['SEE Max', 'Max SEE', 'Exam Max'],
    grade: ['Grade', 'Letter Grade', 'Alpha Sign Grade'],
    gradePoint: ['Grade Point', 'GP', 'Grade Points'],
    result: ['Result', 'Status', 'Remarks'],
  },
  resultCodes: { P: 'pass', PASS: 'pass', F: 'fail', FAIL: 'fail', AB: 'absent', ABS: 'absent', A: 'absent', ABSENT: 'absent', W: 'withheld', WH: 'withheld', NE: 'not_eligible', NC: 'not_eligible' },
};

/**
 * Karnataka state universities, NEP-2020 UG regulations (four-year multidisciplinary UG, 2021-22 to 2023-24
 * admissions): IA 40 + SEE 60 in theory, 50:50 in practicals, 40% in SEE and in the total, grade point =
 * percentage ÷ 10 as the marks cards print it.
 */
export function karnatakaNep(): ProfileRules {
  return {
    terminology: { term: 'semester', termLabel: 'Semester', internal: 'Internal Assessment', internalShort: 'IA', external: 'Semester End Examination', externalShort: 'SEE', registerNo: 'Register Number', marksCard: 'Marks Card', sgpa: 'SGPA', cgpa: 'CGPA' },
    registerNumber: { pattern: null, example: null, description: 'Issued by the university through UUCMS (Unified University and College Management System) at registration.' },
    assessment: {
      theory: { internal: 40, external: 60, externalPaperMax: 60, examHours: 2.5 },
      practical: { internal: 25, external: 25 },
      theoryComponents: [
        { code: 'IA-T', name: 'Internal tests', kind: 'internal', weight: 20 },
        { code: 'IA-A', name: 'Assignment / seminar', kind: 'internal', weight: 10 },
        { code: 'IA-P', name: 'Activity / participation', kind: 'internal', weight: 10 },
        { code: 'SEE', name: 'Semester End Examination', kind: 'external', weight: 60 },
      ],
      practicalComponents: [
        { code: 'IA-L', name: 'Practical internal assessment', kind: 'internal', weight: 50 },
        { code: 'SEE-P', name: 'Practical examination', kind: 'external', weight: 50 },
      ],
    },
    pass: { minInternalPercent: null, minExternalPercent: 40, minTotalPercent: 40, minAggregatePercent: null, internalEligibilityPercent: null },
    grace: { enabled: false, maxPerSubject: 0, maxTotal: 0, maxSubjects: null, allOrNothing: true },
    grading: { mode: 'absolute', bands: KARNATAKA_BANDS, pointsMode: 'percentOver10', absentGrade: 'AB' },
    gpa: { enabled: true, decimals: 2, rounding: 'half_up', includeFailedCredits: true },
    percentage: { basis: 'marks', cgpaMultiplier: 10, cgpaSubtract: 0 },
    classification: {
      basis: 'cgpa',
      classes: [
        { label: 'First Class with Distinction', min: 7, firstAttemptOnly: false },
        { label: 'First Class', min: 6, firstAttemptOnly: false },
        { label: 'Second Class', min: 5, firstAttemptOnly: false },
        { label: 'Pass Class', min: 4, firstAttemptOnly: false },
      ],
      minForAward: 4,
    },
    credits: {
      degreeTotal: 180,
      perTermTypical: 24,
      exits: [
        { afterTerms: 2, award: 'Certificate', minCredits: 48 },
        { afterTerms: 4, award: 'Diploma', minCredits: 96 },
        { afterTerms: 6, award: 'Basic Bachelor Degree', minCredits: 140 },
        { afterTerms: 8, award: 'Bachelor Degree with Honours', minCredits: 180 },
      ],
    },
    attendance: { minPercent: 75, condonableToPercent: null, basis: 'per_subject' },
    examApplication: { fields: ['Register Number', 'Name as in the SSLC marks card', 'Programme and semester', 'Papers applied (regular and repeater)', 'Medium of answering', 'Fee paid and receipt number', 'Photo and signature'], lateFeeAllowed: true },
    revaluation: { revaluation: true, retotalling: false, photocopy: true, windowDays: null, changeThresholdPercent: null },
    marksCard: {
      title: 'Marks Card',
      fields: ['universityName', 'institutionName', 'institutionCode', 'programme', 'term', 'examMonthYear', 'studentName', 'registerNo', 'medium', 'serialNo', 'issuedOn'],
      subjectColumns: ['code', 'title', 'internal', 'external', 'total', 'credits', 'gradePoint', 'creditPoints', 'grade', 'result'],
      summary: ['totalMarks', 'percent', 'creditsRegistered', 'creditsEarned', 'creditPoints', 'sgpa', 'cgpa', 'result', 'class'],
      footnotes: ['Grade point = percentage of marks ÷ 10. SGPA = Σ (credits × grade point) ÷ Σ credits.'],
    },
    resultSheet: UNIVERSITY_SHEET,
  };
}

/**
 * Karnataka State Education Policy (SEP) framework for state universities from the 2024-25 batch: three-year
 * UG with the optional fourth year dropped and internal assessment cut to 20 marks.
 */
export function karnatakaSep(): ProfileRules {
  return deepMerge(karnatakaNep(), {
    assessment: {
      theory: { internal: 20, external: 80, externalPaperMax: 80, examHours: 3 },
      theoryComponents: [
        { code: 'IA-T', name: 'Internal tests', kind: 'internal', weight: 10 },
        { code: 'IA-A', name: 'Assignment / seminar', kind: 'internal', weight: 10 },
        { code: 'SEE', name: 'Semester End Examination', kind: 'external', weight: 80 },
      ],
    },
    pass: { minExternalPercent: 35 },
    credits: { degreeTotal: 140, exits: [{ afterTerms: 6, award: 'Bachelor Degree', minCredits: 140 }] },
  });
}

/** UGC CBCS (2015) model regulations: 10-point grades, credit-weighted SGPA and CGPA, CGPA × 10 as a percentage. */
export function ugcCbcs(): ProfileRules {
  return deepMerge(karnatakaNep(), {
    terminology: { internal: 'Continuous Internal Assessment', internalShort: 'CIA', external: 'End Semester Examination', externalShort: 'ESE', marksCard: 'Grade Card' },
    registerNumber: { pattern: null, example: null, description: 'As the university or the autonomous college assigns.' },
    assessment: {
      theory: { internal: 30, external: 70, externalPaperMax: 70, examHours: 3 },
      theoryComponents: [
        { code: 'CIA-T', name: 'Internal tests', kind: 'internal', weight: 20 },
        { code: 'CIA-A', name: 'Assignments / seminar', kind: 'internal', weight: 10 },
        { code: 'ESE', name: 'End Semester Examination', kind: 'external', weight: 70 },
      ],
      practical: { internal: 50, external: 50 },
    },
    pass: { minExternalPercent: 40 },
    grading: { bands: UGC_BANDS, pointsMode: 'band', relative: UGC_RELATIVE },
    percentage: { basis: 'cgpa', cgpaMultiplier: 10, cgpaSubtract: 0 },
    classification: {
      basis: 'cgpa',
      classes: [
        { label: 'First Class with Distinction', min: 7.5, firstAttemptOnly: true },
        { label: 'First Class', min: 6, firstAttemptOnly: false },
        { label: 'Second Class', min: 5, firstAttemptOnly: false },
        { label: 'Pass', min: 4, firstAttemptOnly: false },
      ],
      minForAward: 4,
    },
    credits: { degreeTotal: 132, perTermTypical: 22, exits: [] },
    marksCard: { title: 'Grade Card', subjectColumns: ['code', 'title', 'credits', 'internal', 'external', 'total', 'grade', 'gradePoint', 'creditPoints', 'result'], summary: ['creditsRegistered', 'creditsEarned', 'creditPoints', 'sgpa', 'cgpa', 'percentEquivalent', 'result', 'class'], footnotes: ['SGPA and CGPA are credit-weighted averages of grade points (UGC CBCS). Percentage equivalent = CGPA × 10.'] },
  });
}

/** School boards: annual exam of a class, marks out of 100 per subject, no grade point averages. */
export function schoolBoard(): ProfileRules {
  return {
    terminology: { term: 'year', termLabel: 'Class', internal: 'Internal Assessment', internalShort: 'IA', external: 'Board Examination', externalShort: 'Theory', registerNo: 'Roll Number', marksCard: 'Marks Statement', sgpa: 'GPA', cgpa: 'CGPA' },
    registerNumber: { pattern: null, example: null, description: 'Issued by the board on the admit card.' },
    assessment: {
      theory: { internal: 20, external: 80, externalPaperMax: 80, examHours: 3 },
      practical: { internal: 30, external: 70 },
      theoryComponents: [
        { code: 'IA', name: 'Internal assessment', kind: 'internal', weight: 20 },
        { code: 'BE', name: 'Board examination', kind: 'external', weight: 80 },
      ],
      practicalComponents: [
        { code: 'PR', name: 'Practical', kind: 'practical', weight: 30 },
        { code: 'BE', name: 'Board examination (theory)', kind: 'external', weight: 70 },
      ],
    },
    pass: { minInternalPercent: null, minExternalPercent: null, minTotalPercent: 33, minAggregatePercent: null, internalEligibilityPercent: null },
    grace: { enabled: false, maxPerSubject: 0, maxTotal: 0, maxSubjects: null, allOrNothing: true },
    grading: { mode: 'marks', bands: [{ grade: 'P', minPercent: 33, gradePoint: 0, pass: true }, { grade: 'F', minPercent: 0, gradePoint: 0, pass: false }], pointsMode: 'band', absentGrade: 'AB' },
    gpa: { enabled: false, decimals: 2, rounding: 'half_up', includeFailedCredits: true },
    percentage: { basis: 'marks', cgpaMultiplier: 10, cgpaSubtract: 0 },
    classification: { basis: 'percent', classes: [], minForAward: null },
    credits: { degreeTotal: null, perTermTypical: null, exits: [] },
    attendance: { minPercent: 75, condonableToPercent: null, basis: 'overall' },
    examApplication: { fields: ['Name as in the school admission register', 'Date of birth', 'Father / mother / guardian name', 'Subjects and languages offered', 'Medium', 'Category', 'Photo and signature', 'Fee paid'], lateFeeAllowed: true },
    revaluation: { revaluation: true, retotalling: true, photocopy: true, windowDays: null, changeThresholdPercent: null },
    marksCard: {
      title: 'Marks Statement',
      fields: ['universityName', 'institutionName', 'institutionCode', 'examMonthYear', 'studentName', 'registerNo', 'parentName', 'medium', 'issuedOn'],
      subjectColumns: ['code', 'title', 'external', 'internal', 'total', 'grade', 'result'],
      summary: ['totalMarks', 'percent', 'result', 'class'],
      footnotes: [],
    },
    resultSheet: {
      columns: {
        registerNo: ['Roll No', 'Roll Number', 'Reg No', 'Register Number'],
        name: ['Name', 'Candidate Name'],
        subjectCode: ['Subject Code', 'Sub Code'],
        subjectName: ['Subject', 'Subject Name'],
        internal: ['Internal', 'IA', 'Internal Assessment', 'Practical'],
        external: ['Theory', 'External', 'Written'],
        total: ['Total', 'Marks'],
        grade: ['Grade', 'Positional Grade'],
        result: ['Result', 'Status'],
      },
      resultCodes: { P: 'pass', PASS: 'pass', F: 'fail', FAIL: 'fail', COMP: 'fail', ESSENTIAL_REPEAT: 'fail', ER: 'fail', AB: 'absent', ABS: 'absent', W: 'withheld', RW: 'withheld' },
    },
  };
}
