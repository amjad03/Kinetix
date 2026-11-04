import { describe, expect, it } from 'vitest';
import { categoryForCtc, checkEligibility, countBacklogHistory, priorProfile } from './eligibility.js';
import { aicteCredits, creditStanding, draftResume, monthsBetween, NATS_DEFAULTS, naac52, natsGovtSharePaise, natsMinimumPaise, parseCsv, parseResultsCsv } from './placement-pass.logic.js';

const drive = { status: 'open', minCgpa: 0, maxBacklogs: 0, programIds: [], registrationClosesOn: null };
const ok = { cgpa: 7, backlogs: 0, programId: 'p1' };

describe('further eligibility', () => {
  it('checks gender, class 10 and 12, gap years, backlog history and documents', () => {
    expect(checkEligibility({ ...drive, genders: ['female'] }, { ...ok, gender: 'male' }, '2026-10-01').reasons).toEqual(['gender_not_eligible']);
    expect(checkEligibility({ ...drive, genders: ['female'] }, { ...ok, gender: null }, '2026-10-01').reasons).toEqual(['gender_not_eligible']);
    expect(checkEligibility({ ...drive, minTenthPct: 60, minTwelfthPct: 60 }, { ...ok, tenthPct: 60, twelfthPct: 59.99 }, '2026-10-01').reasons).toEqual(['twelfth_below']);
    // A percentage asked for but not on record keeps the student out once.
    expect(checkEligibility({ ...drive, minTenthPct: 60, minTwelfthPct: 60 }, { ...ok }, '2026-10-01').reasons).toEqual(['no_prior_marks']);
    expect(checkEligibility({ ...drive, maxGapYears: 1 }, { ...ok, gapYears: 1 }, '2026-10-01').eligible).toBe(true);
    expect(checkEligibility({ ...drive, maxGapYears: 0 }, { ...ok, gapYears: 1 }, '2026-10-01').reasons).toEqual(['gap_exceeded']);
    expect(checkEligibility({ ...drive, maxBacklogHistory: 0 }, { ...ok, backlogHistory: 2 }, '2026-10-01').reasons).toEqual(['backlog_history_exceeded']);
    expect(checkEligibility({ ...drive, requireVerifiedDocs: true }, { ...ok, docsVerified: false }, '2026-10-01').reasons).toEqual(['documents_not_verified']);
    expect(checkEligibility({ ...drive, maxGapYears: null, maxBacklogHistory: null }, { ...ok, gapYears: 9, backlogHistory: 9 }, '2026-10-01').eligible).toBe(true);
  });
  it('counts every subject ever failed, once', () => {
    expect(countBacklogHistory([{ subjectId: 'a', passed: false }, { subjectId: 'a', passed: true }, { subjectId: 'b', passed: false }, { subjectId: 'b', passed: false }, { subjectId: 'c', passed: true }])).toBe(2);
  });
  it('reads class 10 and 12 marks and the years of gap', () => {
    const p = [{ level: 'secondary', passingYear: 2019, percentage: 82 }, { level: 'puc', passingYear: 2022, percentage: 71.5 }];
    // 2019 to 2022 is one year more than the two of PUC; 2022 to joining in 2023 is one more: two.
    expect(priorProfile(p, 2023)).toEqual({ tenthPct: 82, twelfthPct: 71.5, gapYears: 2 });
    expect(priorProfile(p, null)).toEqual({ tenthPct: 82, twelfthPct: 71.5, gapYears: 1 });
    expect(priorProfile([], 2023)).toEqual({ tenthPct: null, twelfthPct: null, gapYears: null });
    // A diploma after class 10 (lateral entry): the gap runs from the diploma.
    expect(priorProfile([{ level: 'secondary', passingYear: 2019, percentage: 70 }, { level: 'other', passingYear: 2022, percentage: 75 }], 2022)).toMatchObject({ twelfthPct: null, gapYears: 0 });
  });
  it('puts a package in its category by the settings lines', () => {
    const lines = { dreamMinLpa: 6, superDreamMinLpa: 10 };
    expect([categoryForCtc(5.99, lines), categoryForCtc(6, lines), categoryForCtc(9.99, lines), categoryForCtc(10, lines), categoryForCtc(null, lines)]).toEqual(['regular', 'dream', 'dream', 'super_dream', 'regular']);
    expect(categoryForCtc(50, { dreamMinLpa: 0, superDreamMinLpa: 0 })).toBe('regular');
  });
});

describe('AICTE credits and NATS stipends', () => {
  it('gives a credit for every 45 hours, whole credits only', () => {
    expect([aicteCredits(44), aicteCredits(45), aicteCredits(89.9), aicteCredits(630), aicteCredits(null), aicteCredits(120, 40)]).toEqual([0, 1, 1, 14, 0, 3]);
    expect(creditStanding(9, 14)).toEqual({ earned: 9, required: 14, short: 5, met: false });
    expect(creditStanding(16, 14)).toMatchObject({ short: 0, met: true });
  });
  it('works out the Government share as half the statutory minimum, never more than half what is paid', () => {
    expect(natsMinimumPaise('graduate', NATS_DEFAULTS)).toBe(1_230_000);
    expect(natsGovtSharePaise('graduate', 1_500_000, NATS_DEFAULTS)).toBe(615_000);
    expect(natsGovtSharePaise('diploma', 1_100_000, NATS_DEFAULTS)).toBe(545_000);
    // Paid ₹9,000 (the employer's problem, but the share is at most half of it): ₹4,500.
    expect(natsGovtSharePaise('graduate', 900_000, NATS_DEFAULTS)).toBe(450_000);
    // A 50% share of ₹10,901 rounds down to the rupee: ₹5,450.
    expect(natsGovtSharePaise('diploma', 2_000_000, { ...NATS_DEFAULTS, minDiploma: 10_901 })).toBe(545_000);
  });
  it('lists the months an apprenticeship runs through', () => {
    expect(monthsBetween('2026-11-15', '2027-02-01')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
    expect(monthsBetween('2026-11-15', '2026-11-20')).toEqual(['2026-11-01']);
  });
});

describe('results import', () => {
  it('parses quoted CSV with either line ending', () => {
    expect(parseCsv('a,"b, c",d\r\n"say ""hi""",,x\n\n')).toEqual([['a', 'b, c', 'd'], ['say "hi"', '', 'x']]);
  });
  it('finds the roll number and result columns and says what is wrong with each line', () => {
    const r = parseResultsCsv('﻿USN,Status,Remarks\nR1,Selected,ok\nR2,Not selected,\n,pass,\nR1,pass,\nR3,AB,\nR4,later,');
    expect(r.error).toBeNull();
    expect(r.lines.map((l) => [l.rollNo, l.result, l.error])).toEqual([
      ['R1', 'pass', null],
      ['R2', 'fail', null],
      ['', 'pass', 'No roll number'],
      ['R1', 'pass', 'This roll number is listed twice'],
      ['R3', 'absent', null],
      ['R4', null, 'Unknown result "later": use pass, fail or absent'],
    ]);
    expect(parseResultsCsv('Roll no\nR7').lines[0]).toMatchObject({ rollNo: 'R7', result: 'pass' });
    expect(parseResultsCsv('Name\nA').error).toBe('No roll number column: name it "Roll no"');
    expect(parseResultsCsv('Roll no').error).toBe('The file needs a header row and at least one student');
  });
});

describe('NAAC 5.2', () => {
  it('averages the yearly percentages over the years', () => {
    const r = naac52([
      { year: 2024, outgoing: 120, placed: 72, higherStudies: 18, qualified: 6 },
      { year: 2025, outgoing: 100, placed: 70, higherStudies: 20, qualified: 5 },
    ]);
    // 72/120 = 60%, 70/100 = 70%: average 65. Higher: 15% and 20%: 17.5. Qualified: 5% and 5%: 5.
    expect(r.averages).toEqual({ m521: 65, m522: 17.5, m523: 5 });
    expect(naac52([{ year: 2024, outgoing: 0, placed: 0, higherStudies: 0, qualified: 0 }]).rows[0].placedPct).toBe(0);
  });
});

describe('resume from the record', () => {
  it('lists the degree with CGPA, prior education newest first, internships, apprenticeships and skills', () => {
    const r = draftResume({
      programme: 'BCA', institution: 'Soundarya Institute', batchYear: 2027, cgpa: 8.123,
      prior: [{ level: 'secondary', institution: 'KV Hebbal', board: 'CBSE', passingYear: 2021, percentage: 91 }, { level: 'puc', institution: 'Soundarya PU', board: null, passingYear: 2023, percentage: 88.5 }],
      internships: [{ orgName: 'Bosch', title: 'Software intern', startsOn: '2026-05-01', endsOn: '2026-06-30', status: 'completed' }, { orgName: 'X', title: 'y', startsOn: '2026-01-01', endsOn: '2026-01-02', status: 'cancelled' }],
      apprenticeships: [{ establishment: 'HAL', role: 'Graduate apprentice', startsOn: '2027-07-01', endsOn: '2028-06-30' }],
      projects: [{ title: 'Library app', summary: 'Flutter app for the college library' }],
      skills: ['Python', 'SQL', 'Python'], trainings: [{ title: 'Java bootcamp', kind: 'technical' }, { title: 'Aptitude', kind: 'aptitude' }],
    });
    expect(r.headline).toBe('BCA student, class of 2027');
    expect(r.education.map((e) => [e.degree, e.years, e.score])).toEqual([['BCA', 'Graduating 2027', 'CGPA 8.12'], ['Class 12 / PUC', '2023', '88.5%'], ['Class 10 (CBSE)', '2021', '91%']]);
    expect(r.experience).toEqual([{ org: 'Bosch', role: 'Software intern (internship)', years: '2026' }, { org: 'HAL', role: 'Graduate apprentice (apprentice)', years: '2027–2028' }]);
    expect(r.skills).toEqual(['Python', 'SQL', 'Java bootcamp']);
  });
});
