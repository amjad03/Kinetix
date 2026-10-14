import { describe, expect, it } from 'vitest';
import { cgpa, sgpa, subjectResult, type ComponentEvidence, type SchemeComponent } from '../exams/grading.js';
import { profileChecks } from '../exams/exams.service.js';
import { describeRules } from './describe.js';
import { buildMarksCard } from './marks-card.js';
import { applyGrace, classify, examPassed, graceNeeded, passOf, percentEquivalent, registerNoValid, scaleOf } from './maths.js';
import { PROFILES, catalogue, schemeOf } from './registry/index.js';
import { readResultSheet, toMigrationCsv } from './result-sheet.js';
import { applyOverrides, diffRules, minimalOverrides, RulesSchema, type ProfileRules } from './rules.js';
import { templateFromProfile } from './templates.js';

const rules = (profile: string, scheme?: string): ProfileRules => schemeOf(profile, scheme ?? null)!.scheme.rules;

/** Grades one subject under a profile from marks per component, given as [scored, max] in the layout's order. */
function grade(r: ProfileRules, marks: ([number, number] | 'AB')[], layout: 'theory' | 'practical' = 'theory') {
  const comps: SchemeComponent[] = (layout === 'theory' ? r.assessment.theoryComponents : r.assessment.practicalComponents!).map((c, i) => ({ ...c, id: `c${i}` }));
  const ev: ComponentEvidence[] = marks.map((m, i) => ({ componentId: `c${i}`, entries: [m === 'AB' ? { scored: null, max: 1, absent: true } : { scored: m[0], max: m[1], absent: false }] }));
  return profileChecks(subjectResult(comps, ev, passOf(r), scaleOf(r)), scaleOf(r), r);
}

describe('profile registry', () => {
  it('has every university, board and framework the owner listed, each with a default scheme', () => {
    const codes = PROFILES.map((p) => p.code);
    for (const c of ['bangalore-university', 'bengaluru-city-university', 'bengaluru-north-university', 'vtu', 'rguhs', 'university-of-mysore', 'mangalore-university', 'kslu', 'tumkur-university', 'davangere-university', 'kuvempu-university', 'karnatak-university', 'rani-channamma-university', 'akkamahadevi-womens-university', 'ugc', 'karnataka-state', 'autonomous', 'cbse', 'cisce', 'kseab-sslc', 'karnataka-puc'])
      expect(codes, c).toContain(c);
    expect(new Set(codes).size).toBe(codes.length);
    for (const p of PROFILES) expect(p.schemes.some((s) => s.code === p.defaultScheme), p.code).toBe(true);
    expect(catalogue().find((p) => p.code === 'vtu')!.schemes.map((s) => s.code)).toEqual(['2022', '2021']);
  });

  it('every scheme is valid rules data with sources, bands from 0% and component weights of 100', () => {
    for (const p of PROFILES)
      for (const s of p.schemes) {
        const label = `${p.code}/${s.code}`;
        expect(RulesSchema.safeParse(s.rules).success, label).toBe(true);
        expect(applyOverrides(s.rules, { attendance: { minPercent: s.rules.attendance.minPercent } }).ok, label).toBe(true);
        expect(s.sources.length, label).toBeGreaterThan(0);
        for (const src of s.sources) expect(src.url, label).toMatch(/^https:\/\//);
        expect(s.rules.grading.bands.some((b) => b.minPercent === 0 && !b.pass), label).toBe(true);
        expect(s.rules.assessment.theoryComponents.reduce((a, c) => a + c.weight, 0), label).toBe(100);
        expect(describeRules(s.rules).every((x) => x.lines.length > 0), label).toBe(true);
      }
  });

  it('keeps regulation years apart: SSLC 2024 (35%) and 2026 (30% + 33% aggregate), state NEP 2021 (IA 40) and SEP 2024 (IA 20)', () => {
    expect(rules('kseab-sslc', '2024').pass).toMatchObject({ minTotalPercent: 35, minAggregatePercent: null });
    expect(rules('kseab-sslc', '2026').pass).toMatchObject({ minTotalPercent: 30, minAggregatePercent: 33 });
    expect(rules('bangalore-university', 'nep-2021').assessment.theory).toMatchObject({ internal: 40, external: 60 });
    expect(rules('bangalore-university', 'sep-2024').assessment.theory).toMatchObject({ internal: 20, external: 80 });
    expect(schemeOf('autonomous', null)!.scheme.ruleAuthority).toBe('institution');
  });
});

describe('VTU 2022 scheme', () => {
  const vtu = rules('vtu', '2022');

  it('passes CIE 30/50 + SEE 45/100 (scaled 22.5/50) as 52.5, grade C, grade point 5', () => {
    const r = grade(vtu, [[15, 25], [15, 25], [45, 100]]);
    expect(r.percent).toBe(52.5);
    expect(r).toMatchObject({ passed: true, grade: 'C', gradePoint: 5 });
  });

  it('fails SEE 34/100 (17/50, under 35%) even with a 40+ total, and CIE under 20/50 is NE', () => {
    const see = grade(vtu, [[25, 25], [25, 25], [34, 100]]);
    expect(see.percent).toBe(67);
    expect(see).toMatchObject({ passed: false, grade: 'F', gradePoint: 0 });
    expect(see.reasons).toContain('external');
    const ne = grade(vtu, [[9, 25], [10, 25], [80, 100]]);
    expect(ne.passed).toBe(false);
    expect(ne.grade).toBe('NE');
    expect(ne.reasons).toEqual(expect.arrayContaining(['internal', 'not_eligible']));
    expect(grade(vtu, [[20, 25], [20, 25], 'AB'])).toMatchObject({ passed: false, grade: 'AB' });
  });

  it('computes SGPA 8.20, CGPA 7.98, percentage 79.8 and the class (distinction only at the first attempt)', () => {
    const term1 = sgpa(
      [4, 4, 3, 3, 3, 1, 1, 1].map((credits, i) => ({ credits, gradePoint: [9, 8, 10, 7, 6, 8, 9, 10][i], passed: true })),
      vtu.gpa.decimals,
      vtu.gpa,
    );
    expect(term1).toMatchObject({ sgpa: 8.2, creditsAttempted: 20, creditPoints: 164 });
    const overall = cgpa([term1, { creditsAttempted: 22, creditPoints: 171 }], vtu.gpa.decimals, vtu.gpa.rounding); // 335 / 42 = 7.976
    expect(overall).toBe(7.98);
    expect(percentEquivalent(vtu, { cgpa: overall, marksPercent: null })).toBe(79.8);
    expect(classify(vtu, { passed: true, cgpa: overall, percent: null, firstAttempt: true })).toBe('First Class with Distinction');
    expect(classify(vtu, { passed: true, cgpa: overall, percent: null, firstAttempt: false })).toBe('First Class');
    expect(classify(vtu, { passed: true, cgpa: 4.9, percent: null, firstAttempt: true })).toBeNull(); // below the 5.0 needed for the degree
  });

  it('checks the USN format', () => {
    expect(registerNoValid(vtu, '1RV22CS001')).toBe(true);
    expect(registerNoValid(vtu, '1rv22cs401')).toBe(true);
    expect(registerNoValid(vtu, '1RV22CS01')).toBe(false);
    expect(registerNoValid(rules('bangalore-university'), 'anything')).toBe(true);
  });
});

describe('Bangalore University NEP (Karnataka state framework)', () => {
  const bu = rules('bangalore-university', 'nep-2021');

  it('prints the percentage over ten as the grade point and passes at 40% in SEE and overall', () => {
    const r = grade(bu, [[12, 15], [8, 10], [4, 5], [4, 5], [5, 5], [45, 60]]); // IA 33 + SEE 45 = 78
    expect(r).toMatchObject({ percent: 78, grade: 'A', gradePoint: 7.8, passed: true });
    expect(grade(bu, [[15, 15], [10, 10], [5, 5], [5, 5], [5, 5], [23, 60]])).toMatchObject({ passed: false, grade: 'F' }); // SEE 38.3%
  });

  it('SGPA 116.2 / 16 = 7.26 (half up; 7.2625), and classes by CGPA', () => {
    const lines = [
      [4, 7.8],
      [4, 6.5],
      [3, 8.2],
      [3, 5.4],
      [2, 9.1],
    ].map(([credits, gradePoint]) => ({ credits, gradePoint, passed: true }));
    expect(sgpa(lines, 2, bu.gpa)).toMatchObject({ sgpa: 7.26, creditPoints: 116.2 });
    expect(sgpa(lines, 2, { rounding: 'truncate' }).sgpa).toBe(7.26);
    expect(sgpa([{ credits: 4, gradePoint: 7.2675, passed: true }], 2, { rounding: 'truncate' }).sgpa).toBe(7.26);
    expect(sgpa([{ credits: 4, gradePoint: 7.2675, passed: true }], 2, { rounding: 'half_up' }).sgpa).toBe(7.27);
    expect(classify(bu, { passed: true, cgpa: 7.26, percent: null, firstAttempt: false })).toBe('First Class with Distinction');
    expect(classify(bu, { passed: true, cgpa: 6.99, percent: null, firstAttempt: true })).toBe('First Class');
    expect(classify(bu, { passed: true, cgpa: 3.99, percent: null, firstAttempt: true })).toBeNull();
    expect(bu.credits.exits.map((e) => e.minCredits)).toEqual([48, 96, 140, 180]);
  });

  it('counts a failed subject in the SGPA denominator with grade point 0', () => {
    const r = sgpa([{ credits: 4, gradePoint: 8, passed: true }, { credits: 4, gradePoint: 3, passed: false }], 2, bu.gpa);
    expect(r).toMatchObject({ sgpa: 4, creditsEarned: 4, creditsAttempted: 8 });
  });
});

describe('school boards', () => {
  it('CBSE: 33% in theory and in internal assessment separately (26/80 + 20/20 is a compartment)', () => {
    const cbse = rules('cbse', 'secondary-2026');
    const comp = grade(cbse, [[5, 5], [5, 5], [5, 5], [5, 5], [26, 80]]);
    expect(comp.percent).toBe(46);
    expect(comp.passed).toBe(false);
    expect(comp.reasons).toEqual(['external']);
    expect(grade(cbse, [[5, 5], [5, 5], [5, 5], [5, 5], [27, 80]])).toMatchObject({ passed: true, grade: 'C2' });
    expect(cbse.attendance).toMatchObject({ minPercent: 75, condonableToPercent: 60 });
  });

  it('SSLC 2026: 30% a subject and 33% of the total; SSLC 2024: 35% a subject', () => {
    const s26 = rules('kseab-sslc', '2026');
    const s24 = rules('kseab-sslc', '2024');
    const subj = grade(s26, [[8, 20], [24, 80]]); // 32%
    expect(subj).toMatchObject({ passed: true, grade: 'C' });
    expect(grade(s24, [[8, 20], [24, 80]]).passed).toBe(false);
    // Six subjects at 32% pass each subject but not the 33% aggregate.
    expect(examPassed(s26, Array.from({ length: 6 }, () => ({ percent: 32, passed: true })))).toMatchObject({ passed: false, aggregate: 32, reasons: ['aggregate'] });
    expect(examPassed(s26, [...Array.from({ length: 5 }, () => ({ percent: 32, passed: true })), { percent: 40, passed: true }]).passed).toBe(true); // 33.33%
    expect(classify(s26, { passed: true, cgpa: null, percent: 86, firstAttempt: true })).toBe('Distinction');
    expect(classify(s26, { passed: true, cgpa: null, percent: 59.99, firstAttempt: true })).toBe('Second Class');
  });

  it('II PUC 2026: at least 30% in the theory paper (23/80 fails, 24/80 passes with internals)', () => {
    const puc = rules('karnataka-puc', '2026');
    expect(grade(puc, [[20, 20], [23, 80]]).passed).toBe(false);
    expect(grade(puc, [[20, 20], [24, 80]]).passed).toBe(true);
  });
});

describe('RGUHS, KSLU and grace marks', () => {
  const rg = rules('rguhs');

  it('RGUHS: theory and practical 40% each, 50% together; one grace mark cures one theory shortfall', () => {
    const r = grade(rg, [[39, 100], [70, 100]]); // theory 19.5/50, practical 35/50: 54.5% overall but theory under 40%
    expect(r.passed).toBe(false);
    expect(r.reasons).toEqual(['external']);
    expect(graceNeeded(r, passOf(rg), scaleOf(rg))).toBe(1);
    const [after] = applyGrace([{ result: r, pass: passOf(rg), scale: scaleOf(rg) }], rg.grace);
    expect(after.result).toMatchObject({ passed: true, grace: 1, percent: 55.5, grade: 'P' });
  });

  it('RGUHS: no grace when two subjects fail (one subject at most, and only if it clears every failure)', () => {
    const a = grade(rg, [[39, 100], [70, 100]]);
    const b = grade(rg, [[38, 100], [70, 100]]);
    const out = applyGrace([a, b].map((result) => ({ result, pass: passOf(rg), scale: scaleOf(rg) })), rg.grace);
    expect(out.every((x) => !x.result.passed && x.result.grace === 0)).toBe(true);
    expect(graceNeeded(grade(rg, ['AB', [70, 100]]), passOf(rg), scaleOf(rg))).toBeNull();
  });

  it('KSLU: 35% in the exam and 40% with IA; class by percentage; BCI attendance 70% condonable to 65%', () => {
    const k = rules('kslu');
    expect(grade(k, [[12, 20], [28, 80]])).toMatchObject({ passed: true, percent: 40 });
    expect(grade(k, [[20, 20], [27, 80]]).passed).toBe(false);
    expect(classify(k, { passed: true, cgpa: null, percent: 64.5, firstAttempt: true })).toBe('First Class');
    expect(classify(k, { passed: true, cgpa: null, percent: 72, firstAttempt: false })).toBe('First Class');
    expect(k.attendance).toEqual({ minPercent: 70, condonableToPercent: 65, basis: 'per_subject' });
  });
});

describe('overrides', () => {
  const bu = rules('bangalore-university', 'nep-2021');

  it('lays valid overrides over the preset, refuses invalid ones and keeps only real changes', () => {
    const ok = applyOverrides(bu, { attendance: { minPercent: 80 }, gpa: { rounding: 'truncate' } });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.rules.attendance).toMatchObject({ minPercent: 80, basis: 'per_subject' });
    expect(diffRules(bu, ok.rules).map((d) => d.path).sort()).toEqual(['attendance.minPercent', 'gpa.rounding']);
    expect(minimalOverrides(bu, ok.rules)).toEqual({ attendance: { minPercent: 80 }, gpa: { rounding: 'truncate' } });
    const bad = applyOverrides(bu, { attendance: { minPercent: 140 } });
    expect(bad.ok).toBe(false);
    expect(applyOverrides(bu, { grading: { bands: [{ grade: 'P', minPercent: 40, gradePoint: 4, pass: true }] } }).ok).toBe(false); // no 0% band
  });
});

describe('result formats and the marks card', () => {
  const vtu = rules('vtu', '2022');

  it('reads a VTU result sheet (USN, Internal Marks, External Marks, Result P/F/A) into the marks history layout', () => {
    const csv = ['USN,Student Name,Subject Code,Subject Name,Internal Marks,External Marks,Total,Result', '1RV22CS001,Asha,BCS301,Maths,40,35,75,P', '1RV22CS001,Asha,BCS302,DSA,30,,30,A', '1rv22cs002,Ravi,BCS301,Maths,15,10,25,Q'].join('\n');
    const sheet = readResultSheet(vtu, csv, { academicYear: '2025-26', term: 3 });
    expect(sheet.missing).toEqual([]);
    expect(sheet.rows.map((r) => [r.values.roll_no, r.values.subject_code, r.values.external_marks, r.values.result])).toEqual([
      ['1RV22CS001', 'BCS301', '35', 'pass'],
      ['1RV22CS001', 'BCS302', '', 'absent'],
    ]);
    expect(sheet.rows[0].values).toMatchObject({ max_internal: '50', max_external: '50', term: '3', academic_year: '2025-26' });
    expect(sheet.problems).toEqual([{ line: 4, message: expect.stringContaining('"Q"') }]);
    expect(toMigrationCsv(sheet.rows).split('\r\n')[0]).toBe('roll_no,academic_year,term,subject_code,subject_name,credits,internal_marks,external_marks,max_internal,max_external,grade,grade_point,result');
    expect(readResultSheet(vtu, 'Name,Marks\nA,1', { academicYear: '2025-26', term: 1 }).missing).toEqual(['registerNo', 'subjectCode', 'total']);
  });

  it('builds the tabulation register template from the profile', () => {
    const { profile, scheme } = schemeOf('vtu', '2022')!;
    const t = templateFromProfile(profile, scheme, vtu);
    expect(t.code).toBe('vtu-2022');
    expect(t.config.pass).toEqual({ minInternalPercent: 40, minExternalPercent: 35, minTotalPercent: 40 });
    expect(t.config.classes[0]).toEqual({ label: 'First Class with Distinction', minPercent: 70 });
    expect(t.config.layout.subjectCells).toEqual(['internal', 'external', 'total', 'result']);
  });

  it('gives the VTU grade card data: header in the card order, CIE/SEE columns, SGPA/CGPA, percentage and class', () => {
    const card = buildMarksCard({
      profile: { code: 'vtu', name: 'Visvesvaraya Technological University', shortName: 'VTU', scheme: '2022', schemeName: 'VTU 2022 scheme (OBE and CBCS)', version: 1 },
      rules: vtu,
      institution: { name: 'RV College of Engineering', code: '1RV', affiliationNo: null },
      student: { name: 'Asha K', registerNo: '1RV22CS001', programme: 'BE Computer Science', branch: 'CSE', className: 'CSE 3A', parentName: 'K Raman', medium: null },
      exam: { name: 'Nov 2026', term: 3, endsOn: '2026-11-20', kind: 'regular' },
      lines: [
        { code: 'BCS301', title: 'Mathematics', credits: 4, percent: 75, grade: 'A', gradePoint: 8, passed: true, grace: 0, absent: false, components: [{ kind: 'internal', weight: 25, weighted: 20 }, { kind: 'internal', weight: 25, weighted: 20 }, { kind: 'external', weight: 50, weighted: 35 }] },
        { code: 'BCS302', title: 'Data structures', credits: 3, percent: 90, grade: 'O', gradePoint: 10, passed: true, grace: 0, absent: false, components: [{ kind: 'internal', weight: 50, weighted: 45 }, { kind: 'external', weight: 50, weighted: 45 }] },
      ],
      sgpa: 8.86,
      cgpa: 8.5,
      creditsRegistered: 7,
      creditsEarned: 7,
      creditPoints: 62,
      firstAttempt: true,
      serialNo: 'GC/2026/0001',
      issuedOn: '2026-12-15',
    });
    expect(card.title).toBe('Grade Card');
    expect(card.header.map((h) => h.field)).toEqual(vtu.marksCard.fields);
    expect(card.header.find((h) => h.field === 'registerNo')).toEqual({ field: 'registerNo', label: 'University Seat Number', value: '1RV22CS001' });
    expect(card.header.find((h) => h.field === 'examMonthYear')!.value).toBe('November 2026');
    expect(card.columns.map((c) => c.label).slice(0, 4)).toEqual(['Code', 'Subject', 'CIE', 'SEE']);
    expect(card.subjects[0]).toMatchObject({ internal: 40, internalMax: 50, external: 35, externalMax: 50, total: 75, creditPoints: 32, result: 'pass' });
    expect(card.result).toMatchObject({ passed: true, classAwarded: 'First Class with Distinction', percentEquivalent: 85 });
    expect(card.summary.find((s) => s.field === 'sgpa')!.value).toBe(8.86);
  });

  it('leaves grade points out of a marks-only card (II PUC)', () => {
    const puc = rules('karnataka-puc', '2026');
    const card = buildMarksCard({
      profile: { code: 'karnataka-puc', name: 'Karnataka Pre-University Board (II PUC)', shortName: 'Karnataka PUC', scheme: '2026', schemeName: 'II PUC', version: 1 },
      rules: puc,
      institution: { name: 'X PU College', code: null, affiliationNo: null },
      student: { name: 'Ravi', registerNo: '2026001', programme: 'PCMB', branch: null, className: 'II PUC A', parentName: null, medium: 'English' },
      exam: { name: 'Annual 2026', term: 2, endsOn: '2026-03-20', kind: 'regular' },
      lines: [{ code: '33', title: 'Physics', credits: 1, percent: 88, grade: 'P', gradePoint: 0, passed: true, grace: 0, absent: false, components: [{ kind: 'practical', weight: 30, weighted: 28 }, { kind: 'external', weight: 70, weighted: 60 }] }],
      sgpa: 0,
      cgpa: 0,
      creditsRegistered: 1,
      creditsEarned: 1,
      creditPoints: 0,
      firstAttempt: true,
      serialNo: null,
      issuedOn: '2026-04-20',
    });
    expect(card.columns.some((c) => c.key === 'gradePoint')).toBe(false);
    expect(card.summary.some((s) => s.field === 'sgpa')).toBe(false);
    expect(card.result).toMatchObject({ passed: true, classAwarded: 'Distinction', percent: 88 });
  });
});
