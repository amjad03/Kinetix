/**
 * Outcome-based education showcase for the Soundarya demo (Bengaluru City University BCom, BCA and BBA, NAAC 2.6; MBA on
 * NBA management POs). Two stages:
 *
 * `obeStructure` (before the question bank): vision, mission, PEOs, UGC LOCF POs and programme PSOs, the PEO-mission
 *   matrix and published versions, frameworks, attainment policies with history (institution, programme and one
 *   course), OBE coordinators, approved COs with their review history and course articulation matrices for every
 *   course of semesters 1, 3 and 5, drafts waiting at each approval step, question papers tagged to COs and Bloom
 *   levels with question-wise marks that add up to the marks already entered, and a university-style SEE entered as
 *   totals for most courses (shared out by the paper's blueprint) and question-wise for two.
 * `obeAttainment` (after the feedback surveys and question bank): course exit surveys in the Student App, a programme
 *   exit survey for the final year, alumni and employer ratings, an LMS quiz tagged to COs, targets, the attainment
 *   calculated through the module, three earlier years of attainment for trends, batch-wise attainment, gaps with
 *   improvement actions and action-taken reports with evidence, and curricular gaps and content beyond the syllabus.
 */
import { DEFAULT_ATTAINMENT_CONFIG, programOutcomeAttainment, combinedAttainment, gapFor, round, type AttainmentConfig } from '../../obe/attainment.js';
import { ObeService } from '../../obe/obe.service.js';
import { OUTCOME_PRESETS } from '../../obe/presets.js';
import type { Ctx, SectionRef, SubjectRef } from './ctx.js';
import { addDays, at, J } from './kit.js';
import { service, withTenant } from './nest.js';

const SHOW = ['BCM', 'BCA'];
const ALL = ['BCM', 'BCA', 'BBA'];
type Bloom = 'Remember' | 'Understand' | 'Apply' | 'Analyse' | 'Evaluate' | 'Create';
type CoDef = [string, Bloom];

/** Course outcomes written for the showcase courses; other courses get outcomes from the generic pattern. */
const SPECIFIC: Record<string, CoDef[]> = {
  'Corporate Accounting': [
    ['Explain the provisions of the Companies Act, 2013 for the issue, forfeiture and reissue of shares', 'Understand'],
    ['Prepare journal entries and ledger accounts for the issue and redemption of shares and debentures', 'Apply'],
    ['Prepare the final accounts of a company as per Schedule III', 'Apply'],
    ['Analyse amalgamation and internal reconstruction schemes to compute the purchase consideration', 'Analyse'],
    ['Evaluate the effect of a buy-back of shares on the capital structure of a company', 'Evaluate'],
  ],
  'Cost Accounting': [
    ['Describe the elements of cost and the methods of costing used in industry', 'Understand'],
    ['Compute material and labour costs using pricing methods and incentive plans', 'Apply'],
    ['Calculate overhead absorption rates using suitable bases', 'Apply'],
    ['Prepare job, contract and process cost accounts', 'Apply'],
    ['Analyse cost behaviour with marginal costing for short-term decisions', 'Analyse'],
  ],
  'Financial Management': [
    ['Explain the goals, functions and scope of financial management', 'Understand'],
    ['Compute the time value of money and the cost of capital', 'Apply'],
    ['Evaluate capital budgeting proposals using discounted cash flow techniques', 'Evaluate'],
    ['Analyse leverage and capital structure decisions of a firm', 'Analyse'],
    ['Determine the working capital requirements of a business', 'Apply'],
  ],
  'Indian Financial System': [
    ['Describe the structure and components of the Indian financial system', 'Understand'],
    ['Explain the functions of the money market and the capital market', 'Understand'],
    ['Compare the roles of financial institutions and regulators such as RBI and SEBI', 'Analyse'],
    ['Evaluate financial services such as leasing, factoring and mutual funds', 'Evaluate'],
  ],
  'Data Structures': [
    ['Explain linear and non-linear data structures and the operations on them', 'Understand'],
    ['Implement stacks, queues and linked lists in C', 'Apply'],
    ['Apply searching and sorting algorithms and compare their efficiency', 'Apply'],
    ['Construct binary trees and traverse graphs to solve problems', 'Create'],
    ['Analyse the time and space complexity of algorithms', 'Analyse'],
  ],
  'Database Management Systems': [
    ['Describe the relational model and the architecture of a database system', 'Understand'],
    ['Design ER models and normalise relations up to the third normal form', 'Create'],
    ['Use SQL with joins, subqueries and aggregate functions to query databases', 'Apply'],
    ['Explain transactions, concurrency control and recovery', 'Understand'],
    ['Evaluate indexing choices for the performance of queries', 'Evaluate'],
  ],
  'Object Oriented Programming with Java': [
    ['Explain classes, objects, inheritance and polymorphism', 'Understand'],
    ['Develop Java programs using classes, interfaces and packages', 'Create'],
    ['Implement exception handling and multithreading in Java programs', 'Apply'],
    ['Design graphical user interfaces with Swing and event handling', 'Create'],
  ],
  'Computer Networks': [
    ['Describe the OSI and TCP/IP reference models', 'Understand'],
    ['Explain data link and medium access control protocols', 'Understand'],
    ['Compute IP addresses and subnets for a given network', 'Apply'],
    ['Analyse routing algorithms and congestion control techniques', 'Analyse'],
  ],
  'English III: Professional Communication': [
    ['Prepare professional letters, e-mails and reports', 'Apply'],
    ['Demonstrate effective presentation and group discussion skills', 'Apply'],
    ['Interpret business texts and summarise them accurately', 'Understand'],
    ['Use workplace vocabulary and grammar correctly', 'Apply'],
  ],
  'Constitution of India': [
    ['Describe the making and the salient features of the Constitution of India', 'Understand'],
    ['Explain the fundamental rights, duties and directive principles', 'Understand'],
    ['Distinguish the powers of the union and the state governments', 'Analyse'],
    ['Examine the role of constitutional bodies such as the Election Commission', 'Analyse'],
  ],
};
const lower = (s: string) => s.replace(/^(.)/, (m) => m.toLowerCase()).replace(/\s*\(.*\)$/, '');
const generic = (name: string, credits: number): CoDef[] => [
  [`Explain the concepts, terminology and framework of ${lower(name)}`, 'Understand'],
  [`Apply the principles of ${lower(name)} to solve routine problems`, 'Apply'],
  [`Analyse cases and data in ${lower(name)} to draw conclusions`, 'Analyse'],
  [`Evaluate alternatives and justify decisions in ${lower(name)}`, 'Evaluate'],
  ...(credits >= 4 ? ([[`Prepare reports on ${lower(name)} using appropriate tools`, 'Apply']] as CoDef[]) : []),
];
const cosFor = (s: SubjectRef): CoDef[] => SPECIFIC[s.name] ?? generic(s.name, s.credits);

/** How easily students score on a CO of each Bloom level (higher-order COs are harder). */
const EASE: Record<Bloom, number> = { Remember: 1.2, Understand: 1.12, Apply: 1, Analyse: 0.86, Evaluate: 0.8, Create: 0.86 };
/** How a student's total shares out over questions: higher-order questions score a little lower, not a cliff. */
const QEASE: Record<Bloom, number> = { Remember: 1.1, Understand: 1.06, Apply: 1, Analyse: 0.94, Evaluate: 0.92, Create: 0.94 };

/** CO-PO strengths: by Bloom level, with the communication and citizenship courses mapped to their own POs. */
function mapping(name: string, bloom: Bloom, i: number): [string, number][] {
  if (/English|Language|Kannada|Communication/i.test(name)) return [['PO2', 3], ['PO6', 2], ['PO10', 1]];
  if (/Constitution/i.test(name)) return [['PO8', 3], ['PO9', 3], ['PO3', 1]];
  if (/Digital Fluency|Cyber|Cloud|Web|Python/i.test(name) && i === 0) return [['PO7', 3], ['PO1', 2], ['PSO2', 2]];
  switch (bloom) {
    case 'Understand':
    case 'Remember':
      return [['PO1', 3], ['PO10', 1], ['PSO1', 1]];
    case 'Apply':
      return [['PO1', 2], ['PO4', 3], ['PSO1', 3]];
    case 'Analyse':
      return [['PO3', 3], ['PO4', 2], ['PO5', 2], ['PSO1', 2]];
    case 'Evaluate':
      return [['PO3', 3], ['PO8', 1], ['PSO2', 2]];
    case 'Create':
      return [['PO4', 3], ['PO5', 2], ['PO7', 2], ['PSO2', 3]];
  }
}

const VISION: Record<string, string> = {
  BCM: 'To be a centre of excellence in commerce education that produces ethical, analytical and globally employable professionals.',
  BCA: 'To nurture competent computing professionals who build reliable software for the benefit of society.',
  BBA: 'To develop responsible business leaders and entrepreneurs grounded in Karnataka’s values.',
};
const MISSION: Record<string, string[]> = {
  BCM: ['Impart sound knowledge of accounting, finance, taxation and business law through outcome-based teaching.', 'Build practical skills through internships, accounting software and industry interaction.', 'Inculcate integrity, social responsibility and a habit of life-long learning.'],
  BCA: ['Provide a strong foundation in programming, data and networks through outcome-based teaching.', 'Develop problem-solving and project skills with industry tools and internships.', 'Encourage ethical practice, teamwork and continuous learning.'],
  BBA: ['Impart knowledge of the functional areas of management through outcome-based teaching.', 'Develop managerial and entrepreneurial skills through projects and industry exposure.', 'Promote ethics, sustainability and life-long learning.'],
};
const PEOS: Record<string, string[]> = {
  BCM: ['Graduates build successful careers in accounting, banking, finance and taxation.', 'Graduates pursue professional and higher studies such as CA, CMA, CS and MCom.', 'Graduates act ethically and contribute to their communities.'],
  BCA: ['Graduates work as software developers, analysts and administrators in the IT industry.', 'Graduates pursue higher studies such as MCA and MSc and keep their skills current.', 'Graduates practise their profession ethically and work well in teams.'],
  BBA: ['Graduates build successful careers in business and management.', 'Graduates pursue higher studies such as the MBA.', 'Graduates start and lead ventures responsibly.'],
};
const PSO_PRESET: Record<string, string> = { BCM: 'pso_bcom', BCA: 'pso_bca', BBA: 'pso_bba' };

/** Split a total into question marks (multiples of 0.5, each within its maximum) by how easy each question is for the student. */
function split(total: number, qs: { max: number; ease: number }[], r: Ctx['r']): number[] {
  const w = qs.map((q) => q.max * q.ease * (0.6 + r.next() * 0.8));
  const sw = w.reduce((a, b) => a + b, 0);
  const out = qs.map((q, i) => Math.min(q.max, Math.round(((total * w[i]) / sw) * 2) / 2));
  let diff = Math.round((total - out.reduce((a, b) => a + b, 0)) * 2) / 2;
  for (let guard = 0; Math.abs(diff) >= 0.5 && guard < 400; guard++) {
    const i = guard % qs.length;
    if (diff > 0 && out[i] + 0.5 <= qs[i].max) {
      out[i] += 0.5;
      diff -= 0.5;
    } else if (diff < 0 && out[i] - 0.5 >= 0) {
      out[i] -= 0.5;
      diff += 0.5;
    }
  }
  return out;
}

interface Paper {
  no: string;
  part: string;
  max: number;
  bloom: Bloom;
  co: number[];
}
/** A 20-mark internal test: two short questions and one long one across the first COs. */
const iaPaper = (n: number, blooms: Bloom[]): Paper[] => [
  { no: '1', part: 'Part A', max: 5, bloom: blooms[0], co: [0] },
  { no: '2', part: 'Part A', max: 5, bloom: blooms[1 % n], co: [1 % n] },
  { no: '3', part: 'Part B', max: 10, bloom: blooms[2 % n], co: [2 % n, Math.min(n - 1, 3)].filter((v, i, a) => a.indexOf(v) === i) },
];
/** The BCU semester end paper (60 marks): Part A 5 x 2, Part B 4 x 5, Part C 3 x 10, spread over every CO. */
const seePaper = (n: number, blooms: Bloom[]): Paper[] => {
  const co = (i: number) => i % n;
  return [
    ...[0, 1, 2, 3, 4].map((i) => ({ no: String(i + 1), part: 'Part A', max: 2, bloom: (blooms[co(i)] === 'Understand' ? 'Remember' : 'Understand') as Bloom, co: [co(i)] })),
    ...[0, 1, 2, 3].map((i) => ({ no: String(i + 6), part: 'Part B', max: 5, bloom: blooms[co(i + 1)], co: [co(i + 1)] })),
    ...[0, 1, 2].map((i) => ({ no: String(i + 10), part: 'Part C', max: 10, bloom: blooms[co(n - 3 + i < 0 ? i : n - 3 + i)], co: [co(n - 3 + i < 0 ? i : n - 3 + i)] })),
  ];
};

interface CourseCos {
  sub: SubjectRef;
  setId: string;
  cos: { id: string; code: string; bloom: Bloom }[];
}
const state: { courses: Map<string, CourseCos>; outcomes: Map<string, { id: string; code: string; kind: string }[]>; coordinators: Record<string, string> } = { courses: new Map(), outcomes: new Map(), coordinators: {} };

export async function obeStructure(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const hodOf = (dept: string) => c.byEmail[dept === 'Commerce' ? 'hod.commerce' : dept === 'Computer Applications' ? 'hod.computers' : dept === 'Languages' ? 'hod.languages' : dept === 'Mathematics and Statistics' ? 'hod.maths' : 'hod.management']?.id ?? c.byEmail.principal.id;
  const iqac = c.byEmail.iqac.id;
  const principal = c.byEmail.principal.id;
  state.coordinators = { BCM: c.byEmail['sudhir.kamath'].id, BCA: c.byEmail['sowmya.reddy'].id, BBA: c.byEmail['deepa.nair'].id };

  // Institution-wide rules (the approved defaults), with the older rules kept as history.
  await k.ins('obe_policies', [
    { scope: 'institution', version: 1, config: J({ ...DEFAULT_ATTAINMENT_CONFIG, levels: [{ level: 3, minStudentsPercent: 70 }, { level: 2, minStudentsPercent: 60 }, { level: 1, minStudentsPercent: 50 }], evidenceWeights: { internal: 30, external: 70 } }), note: 'Rules adopted for the first NAAC cycle', effectiveFromYearId: null, createdBy: iqac, createdAt: at('2023-06-12') },
    { scope: 'institution', version: 2, config: J(DEFAULT_ATTAINMENT_CONFIG), note: 'IQAC resolution 4/2025: 60% threshold, levels at 40/50/60% of students, CIE 40 : SEE 60, direct 80 : indirect 20', createdBy: iqac, createdAt: at('2025-06-20') },
  ]);

  for (const code of ALL) {
    const prog = c.programs[code];
    const pid = prog.id;
    const dept = prog.def.dept;
    const outs = await k.ins<{ id: string; code: string; kind: string }>('program_outcomes', [
      { programId: pid, kind: 'vision', code: 'V1', statement: VISION[code], ord: 0 },
      ...MISSION[code].map((s, i) => ({ programId: pid, kind: 'mission', code: `M${i + 1}`, statement: s, ord: i + 1 })),
      ...PEOS[code].map((s, i) => ({ programId: pid, kind: 'peo', code: `PEO${i + 1}`, statement: s, ord: i + 1 })),
      ...OUTCOME_PRESETS.find((p) => p.key === 'ugc_locf')!.outcomes.map((o, i) => ({ programId: pid, kind: 'po', code: o.code, statement: o.statement, ord: i + 1 })),
      ...OUTCOME_PRESETS.find((p) => p.key === PSO_PRESET[code])!.outcomes.map((o, i) => ({ programId: pid, kind: 'pso', code: o.code, statement: o.statement, ord: i + 1 })),
    ]);
    state.outcomes.set(code, outs);
    const peos = outs.filter((o) => o.kind === 'peo');
    const missions = outs.filter((o) => o.kind === 'mission');
    await k.ins('peo_mission_map', peos.flatMap((p, i) => missions.map((m, j) => ({ programId: pid, peoId: p.id, missionId: m.id, strength: i === j ? 3 : (i + j) % 2 === 0 ? 2 : 1, justification: i === j ? `${p.code} realises mission element ${m.code} directly` : null }))), { returning: false });
    // PEO-PO/PSO matrix: each PEO is served strongly by every n-th PO (n = the number of PEOs) and by its own PSO.
    const pos = outs.filter((o) => o.kind === 'po');
    const psos = outs.filter((o) => o.kind === 'pso');
    await k.ins('peo_po_map', peos.flatMap((p, i) => [
      ...pos.filter((_, j) => j % peos.length === i).map((o) => ({ programId: pid, peoId: p.id, outcomeId: o.id, strength: 3, justification: `${o.code} is a graduate attribute ${p.code} depends on` })),
      ...pos.filter((_, j) => j % peos.length === (i + 1) % peos.length).slice(0, 1).map((o) => ({ programId: pid, peoId: p.id, outcomeId: o.id, strength: 1, justification: null })),
      ...(psos[i % Math.max(1, psos.length)] ? [{ programId: pid, peoId: p.id, outcomeId: psos[i % psos.length].id, strength: 2, justification: `${psos[i % psos.length].code} is the programme skill behind ${p.code}` }] : []),
    ]), { returning: false });
    const stmts = (await k.q<{ kind: string; code: string; statement: string }>('select kind::text, code, statement from program_outcomes where program_id = $1 order by kind, ord, code', [pid])).map((s) => ({ kind: s.kind, code: s.code, statement: s.statement }));
    await k.ins('program_outcome_versions', [
      { programId: pid, version: 1, effectiveFrom: '2023-24', note: 'Adopted with the NEP 2020 curriculum of Bengaluru City University', statements: J(stmts.map((s) => (s.code === 'V1' ? { ...s, statement: s.statement.replace('globally employable', 'employable') } : s))), publishedBy: principal, publishedAt: at('2023-07-10') },
      { programId: pid, version: 2, effectiveFrom: '2026-27', note: 'Vision revised after the stakeholder consultation of March 2026', statements: J(stmts), publishedBy: principal, publishedAt: at('2026-07-15') },
    ], { returning: false });
    await k.ins('obe_programs', { programId: pid, framework: 'naac', updatedBy: iqac });
    await k.ins('obe_assignments', { programId: pid, userId: state.coordinators[code], role: 'coordinator', note: 'Nominated by the IQAC for 2026-27' });
    // Programme rules: the institution's, kept as the programme's own version (BCA had stricter rules before).
    await k.ins('obe_configs', { programId: pid, config: J(DEFAULT_ATTAINMENT_CONFIG), updatedBy: iqac }, { returning: false });
    await k.ins('obe_policies', [
      ...(code === 'BCA' ? [{ scope: 'program', programId: pid, version: 1, config: J({ ...DEFAULT_ATTAINMENT_CONFIG, studentThresholdPercent: 65, coMethod: 'threshold', poMethod: 'co_weighted' }), note: 'Department rules before the IQAC resolution', createdBy: hodOf(dept), createdAt: at('2024-06-14') }] : []),
      { scope: 'program', programId: pid, version: code === 'BCA' ? 2 : 1, config: J(DEFAULT_ATTAINMENT_CONFIG), note: 'Aligned with IQAC resolution 4/2025', createdBy: iqac, createdAt: at('2025-06-24') },
    ], { returning: false });

    // COs, articulation matrices and their approval history for every course of the odd semesters.
    for (const sec of c.sections.filter((s) => s.prog === code && (SHOW.includes(code) || s.term === 3))) {
      for (const sub of sec.subjects) {
        if (state.courses.has(sub.id)) continue;
        const defs = cosFor(sub);
        // One course of BCA semester 5 has no approved COs yet (a dashboard gap).
        const missing = code === 'BCA' && sub.name === 'Cloud Computing';
        if (missing) {
          const d = await k.one<{ id: string }>('co_sets', { subjectId: sub.id, version: 1, status: 'draft', reviewStage: 'draft', note: 'New elective; outcomes being drafted', createdBy: sub.teacherId });
          await k.ins('course_outcomes', defs.slice(0, 3).map(([s, b], i) => ({ coSetId: d.id, code: `CO${i + 1}`, statement: i === 1 ? `Understand ${lower(s).replace(/^\w+\s/, '')}` : s, bloomLevel: b, ord: i + 1 })), { returning: false });
          continue;
        }
        const set = await k.one<{ id: string }>('co_sets', { subjectId: sub.id, version: 1, status: 'active', reviewStage: 'approved', note: 'Approved by the Board of Studies', createdBy: sub.teacherId, submittedBy: sub.teacherId, submittedAt: at('2024-06-10'), activatedAt: at('2024-06-21') });
        const cos = await k.ins<{ id: string; code: string; bloomLevel: Bloom }>('course_outcomes', defs.map(([s, b], i) => ({ coSetId: set.id, code: `CO${i + 1}`, statement: s, bloomLevel: b, ord: i + 1 })));
        state.courses.set(sub.id, { sub, setId: set.id, cos: cos.map((x) => ({ id: x.id, code: x.code, bloom: x.bloomLevel })) });
        const byCode = new Map(outs.map((o) => [o.code, o.id]));
        const cells = cos.flatMap((co, i) => mapping(sub.name, co.bloomLevel, i).filter(([po]) => byCode.has(po)).map(([po, s]) => ({ coId: co.id, outcomeId: byCode.get(po)!, strength: s, justification: s === 3 ? `${co.code} (${co.bloomLevel}) develops ${po} directly: ${defs[i][0].split(' ').slice(0, 6).join(' ').toLowerCase()} ...` : s === 2 ? `${co.code} supports ${po} through practice in assessments` : null })));
        await k.ins('co_outcome_map', cells, { returning: false });
        const head = hodOf(sub.dept);
        await k.ins('co_set_reviews', [
          { coSetId: set.id, stage: 'hod', decision: 'submitted', comment: 'COs for the NEP syllabus', actorId: sub.teacherId, createdAt: at('2024-06-10') },
          { coSetId: set.id, stage: 'hod', decision: 'approved', comment: 'Verbs and levels checked', actorId: head, createdAt: at('2024-06-14') },
          { coSetId: set.id, stage: 'coordinator', decision: 'approved', comment: 'CO-PO mapping consistent with the programme matrix', actorId: state.coordinators[code], createdAt: at('2024-06-18') },
          { coSetId: set.id, stage: 'iqac', decision: 'approved', comment: 'Approved', actorId: iqac, createdAt: at('2024-06-21') },
          { coSetId: set.id, stage: 'approved', decision: 'activated', comment: 'Approved by the IQAC', actorId: iqac, createdAt: at('2024-06-21') },
        ], { returning: false });
      }
    }
  }

  // Revised drafts waiting at each step of the approval workflow.
  const pending: [string, number, string, string, string | null][] = [
    ['BCA', 1, 'Problem Solving Techniques using C', 'hod', null],
    ['BCA', 1, 'Computer Architecture', 'coordinator', null],
    ['BCM', 1, 'Business Law', 'iqac', null],
    ['BCM', 5, 'Goods and Services Tax', 'returned', 'CO2: "know the GST rates" cannot be measured; use "compute the GST payable".'],
  ];
  for (const [prog, term, name, stage, comment] of pending) {
    const sec = c.sections.find((s) => s.prog === prog && s.term === term)!;
    const sub = sec.subjects.find((s) => s.name === name)!;
    const cur = state.courses.get(sub.id)!;
    const d = await k.one<{ id: string }>('co_sets', { subjectId: sub.id, version: 2, status: 'draft', reviewStage: stage, note: 'Revised after the 2025-26 attainment review', createdBy: sub.teacherId, submittedBy: sub.teacherId, submittedAt: at(addDays(c.today, -9)) });
    const defs = cosFor(sub);
    const cos = await k.ins<{ id: string; code: string }>('course_outcomes', defs.map(([s, b], i) => ({ coSetId: d.id, code: `CO${i + 1}`, statement: stage === 'returned' && i === 1 ? 'Know the GST rates applicable to goods and services' : i === 0 ? `${s}, with recent amendments` : s, bloomLevel: b, ord: i + 1 })));
    const old = await k.q<{ coId: string; outcomeId: string; strength: number; justification: string | null }>('select m.co_id, m.outcome_id, m.strength, m.justification from co_outcome_map m join course_outcomes co on co.id = m.co_id where co.co_set_id = $1', [cur.setId]);
    const codeOf = new Map(cur.cos.map((x) => [x.id, x.code]));
    await k.ins('co_outcome_map', old.map((m) => ({ coId: cos.find((x) => x.code === codeOf.get(m.coId))!.id, outcomeId: m.outcomeId, strength: m.strength, justification: m.justification })), { returning: false });
    const head = hodOf(sub.dept);
    const steps: Record<string, unknown>[] = [{ coSetId: d.id, stage: 'hod', decision: 'submitted', comment: 'Revised wording after the attainment review', actorId: sub.teacherId, createdAt: at(addDays(c.today, -9)) }];
    if (stage === 'coordinator' || stage === 'iqac') steps.push({ coSetId: d.id, stage: 'hod', decision: 'approved', comment: 'Fine', actorId: head, createdAt: at(addDays(c.today, -7)) });
    if (stage === 'iqac') steps.push({ coSetId: d.id, stage: 'coordinator', decision: 'approved', comment: 'Mapping reviewed with the programme matrix', actorId: state.coordinators[prog], createdAt: at(addDays(c.today, -4)) });
    if (stage === 'returned') steps.push({ coSetId: d.id, stage: 'hod', decision: 'returned', comment, coId: cos[1].id, actorId: head, createdAt: at(addDays(c.today, -6)) });
    await k.ins('co_set_reviews', steps, { returning: false });
  }

  // The MBA reports to NBA (management): its POs from the NBA preset and approved COs for semester 3.
  const mba = c.programs.MBA;
  if (mba) {
    const mout = await k.ins<{ id: string; code: string }>('program_outcomes', [
      { programId: mba.id, kind: 'vision', code: 'V1', statement: 'To develop ethical managers and entrepreneurs for a changing economy.', ord: 0 },
      { programId: mba.id, kind: 'mission', code: 'M1', statement: 'Impart management education through case-based, outcome-based teaching and industry engagement.', ord: 1 },
      ...OUTCOME_PRESETS.find((p) => p.key === 'nba_management')!.outcomes.map((o, i) => ({ programId: mba.id, kind: o.kind, code: o.code, statement: o.statement, ord: i + 1 })),
    ]);
    await k.ins('obe_programs', { programId: mba.id, framework: 'nba_management', updatedBy: iqac }, { returning: false });
    const sec = c.sections.find((s) => s.prog === 'MBA' && s.term === 3);
    for (const sub of sec?.subjects ?? []) {
      const set = await k.one<{ id: string }>('co_sets', { subjectId: sub.id, version: 1, status: 'active', reviewStage: 'approved', createdBy: sub.teacherId, activatedAt: at('2025-07-02') });
      const cos = await k.ins<{ id: string; bloomLevel: Bloom }>('course_outcomes', generic(sub.name, sub.credits).map(([s, b], i) => ({ coSetId: set.id, code: `CO${i + 1}`, statement: s, bloomLevel: b, ord: i + 1 })));
      const po = (code: string) => mout.find((o) => o.code === code)!.id;
      await k.ins('co_outcome_map', cos.flatMap((co) => (co.bloomLevel === 'Understand' ? [[po('PO1'), 3], [po('PO4'), 2]] : co.bloomLevel === 'Apply' ? [[po('PO1'), 2], [po('PO2'), 2], [po('PO5'), 1]] : [[po('PO2'), 3], [po('PO3'), 2]]).map(([outcomeId, strength]) => ({ coId: co.id, outcomeId, strength }))), { returning: false });
    }
  }

  // A course policy: the Java course weights its lab-based CIE equally with the SEE.
  const java = c.sections.find((s) => s.prog === 'BCA' && s.term === 3)!.subjects.find((s) => s.name.startsWith('Object Oriented'))!;
  await k.ins('obe_policies', { scope: 'subject', programId: java.programId, subjectId: java.id, version: 1, config: J({ ...DEFAULT_ATTAINMENT_CONFIG, evidenceWeights: { internal: 50, external: 50 } }), note: 'Laboratory course: CIE 50 : SEE 50 (Board of Studies, July 2026)', createdBy: c.byEmail['hod.computers'].id, createdAt: at('2026-07-20') }, { returning: false });
  await k.ins('obe_assignments', [{ programId: java.programId, userId: java.teacherId, role: 'course_coordinator', subjectId: java.id, note: 'Two sections share the course' }], { returning: false });

  // Question papers tagged to COs, with question-wise marks adding up to the marks already entered.
  for (const sec of c.sections.filter((s) => ALL.includes(s.prog) && (SHOW.includes(s.prog) || s.term === 3))) {
    for (const sub of sec.subjects) {
      const course = state.courses.get(sub.id);
      if (!course) continue;
      const blooms = course.cos.map((x) => x.bloom);
      const n = course.cos.length;
      const asm = await k.q<{ id: string; title: string; maxMarks: number; kind: string }>(`select id, title, max_marks::float as max_marks, kind::text from assessments where section_id = $1 and subject_id = $2 order by held_on`, [sec.id, sub.id]);
      for (const a of asm) {
        let paper: Paper[] | null = null;
        let questionWise = true;
        if (/^(Internal test|Internal Assessment 1)/.test(a.title) && a.maxMarks === 20) paper = iaPaper(n, blooms);
        else if (/^(Seminar \/ assignment|Assignment)/.test(a.title) && a.maxMarks === 10) paper = [{ no: '1', part: '', max: 10, bloom: blooms[n - 1], co: [n - 1] }];
        else if (/^Model semester exam/.test(a.title) && a.maxMarks === 60) {
          paper = seePaper(n, blooms);
          questionWise = ['Corporate Accounting', 'Data Structures'].includes(sub.name);
        }
        if (!paper) continue;
        const qs = await k.ins<{ id: string }>('assessment_questions', paper.map((p, i) => ({ assessmentId: a.id, no: p.no, part: p.part, maxMarks: p.max, bloomLevel: p.bloom, ord: i })));
        await k.ins('assessment_question_cos', paper.flatMap((p, i) => p.co.map((ci) => ({ questionId: qs[i].id, coId: course.cos[ci].id, weight: 1 }))), { returning: false });
        if (!questionWise) continue;
        const totals = await k.q<{ studentId: string; marks: number | null; absent: boolean }>('select student_id, marks::float as marks, absent from marks where assessment_id = $1', [a.id]);
        const rows: Record<string, unknown>[] = [];
        for (const t of totals) {
          if (t.absent || t.marks === null) continue;
          const parts = split(t.marks, paper.map((p) => ({ max: p.max, ease: QEASE[p.bloom] * Math.max(0.9, 1 - 0.02 * p.co[0]) })), r);
          parts.forEach((m, i) => rows.push({ assessmentId: a.id, questionId: qs[i].id, studentId: t.studentId, marks: m, updatedBy: sub.teacherId }));
        }
        await k.ins('question_marks', rows, { returning: false });
      }
    }
  }
  void r;
}

const OBE_YEARS: [string, string, string, number][] = [
  ['2023-24', '2023-08-01', '2024-05-31', 1.72],
  ['2024-25', '2024-08-01', '2025-05-31', 1.86],
];

export async function obeAttainment(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const iqac = c.byEmail.iqac.id;
  const svc = await service(ObeService);

  // The two course exit surveys of the feedback stage count as OBE instruments too.
  await k.q(`update surveys s set obe_kind = 'course_exit', subject_id = x.subject_id, program_id = x.program_id, academic_year_id = $1 from (select distinct q.survey_id, cs.subject_id, sj.program_id from survey_questions q join course_outcomes co on co.id = q.co_id join co_sets cs on cs.id = co.co_set_id join subjects sj on sj.id = cs.subject_id) x where x.survey_id = s.id and s.title like 'Course exit survey:%'`, [c.years.cur]);
  await k.q(`update surveys set last_reminded_at = $1 where title like 'Course exit survey:%' and status = 'open'`, [at(addDays(c.today, -1), '09:00')]);
  const have = new Set((await k.q<{ subjectId: string }>(`select subject_id from surveys where obe_kind = 'course_exit' and subject_id is not null`)).map((x) => x.subjectId));

  for (const code of SHOW) {
    const pid = c.programs[code].id;
    const outs = state.outcomes.get(code)!;
    // Course exit surveys for the semester 3 courses, answered in the Student App (anonymous).
    const sec3 = c.sections.find((s) => s.prog === code && s.term === 3)!;
    for (const sub of sec3.subjects) {
      const course = state.courses.get(sub.id);
      if (!course || have.has(sub.id)) continue;
      const sv = await k.one<{ id: string }>('surveys', { title: `Course exit survey: ${sub.name}`, description: 'Rate each statement from 1 (not at all) to 5 (fully). Your answers are anonymous and are used for outcome attainment.', audience: 'section', sectionId: sec3.id, anonymous: true, opensAt: at(addDays(c.today, -12)), closesAt: at(addDays(c.today, -2)), status: 'closed', closedAt: at(addDays(c.today, -2)), createdBy: sub.teacherId, obeKind: 'course_exit', programId: pid, subjectId: sub.id, academicYearId: c.years.cur });
      const qs = await k.ins<{ id: string; coId: string | null }>('survey_questions', [...course.cos.map((co, i) => ({ surveyId: sv.id, ord: i + 1, kind: 'rating', prompt: `${co.code}: I can ${lower(cosFor(sub)[i][0])}.`, required: true, coId: co.id })), { surveyId: sv.id, ord: course.cos.length + 1, kind: 'text', prompt: 'What should be continued or changed?', required: false }]);
      const ans: Record<string, unknown>[] = [];
      for (const st of sec3.students.filter(() => r.chance(0.82))) {
        const resp = await k.one<{ id: string }>('survey_responses', { surveyId: sv.id, respondentId: st.userId!, submittedAt: at(addDays(c.today, -r.int(3, 10)), '17:00') });
        void resp;
        for (const qq of qs) {
          const co = course.cos.find((x) => x.id === qq.coId);
          ans.push({ surveyId: sv.id, questionId: qq.id, responseId: null, rating: co ? Math.min(5, Math.max(1, Math.round(r.gauss(2.9 + st.ability * 1.4 * EASE[co.bloom], 0.7)))) : null, text: co ? null : r.pick(['More case studies, please.', 'Good pace.', 'Share the model answers.', 'Extra classes before the exam helped.']), choices: J([]) });
        }
      }
      await k.ins('survey_answers', ans, { returning: false });
    }
    // Programme exit survey for the final-year class (open, with a reminder sent).
    const sec5 = c.sections.find((s) => s.prog === code && s.term === 5)!;
    const pos = outs.filter((o) => o.kind === 'po' || o.kind === 'pso');
    const ex = await k.one<{ id: string }>('surveys', { title: `Programme exit survey: ${c.programs[code].def.name} 2026-27`, description: 'Rate each statement from 1 (not at all) to 5 (fully). Your answers are anonymous and are used for outcome attainment.', audience: 'section', sectionId: sec5.id, anonymous: true, opensAt: at(addDays(c.today, -6)), closesAt: at(addDays(c.today, 2)), status: 'open', createdBy: state.coordinators[code], obeKind: 'programme_exit', programId: pid, academicYearId: c.years.cur, lastRemindedAt: at(addDays(c.today, -1), '09:00') });
    const eq = await k.ins<{ id: string; outcomeId: string }>('survey_questions', pos.map((o, i) => ({ surveyId: ex.id, ord: i + 1, kind: 'rating', prompt: `${o.code}: How well did the programme prepare you for this?`, required: true, outcomeId: o.id })));
    const exAns: Record<string, unknown>[] = [];
    for (const st of sec5.students.filter(() => r.chance(0.64))) {
      await k.ins('survey_responses', { surveyId: ex.id, respondentId: st.userId!, submittedAt: at(addDays(c.today, -r.int(1, 5)), '18:00') }, { returning: false });
      for (const qq of eq) exAns.push({ surveyId: ex.id, questionId: qq.id, rating: Math.min(5, Math.max(1, Math.round(r.gauss(3.6 + st.ability * 0.8, 0.7)))), choices: J([]) });
    }
    await k.ins('survey_answers', exAns, { returning: false });
    // Alumni and employer ratings of the POs (collected on paper and entered by the coordinator).
    for (const [kind, title, n, mean] of [['alumni', 'Alumni survey 2026 (batch 2023-26)', 26, 3.9], ['employer', 'Employer feedback 2026', 11, 3.7]] as const) {
      const s = await k.one<{ id: string }>('obe_surveys', { programId: pid, academicYearId: c.years.cur, kind, title, scaleMax: 5, minResponses: kind === 'alumni' ? 10 : 5, weight: 1, createdBy: state.coordinators[code] });
      await k.ins('obe_survey_ratings', pos.flatMap((o) => Array.from({ length: n }, () => ({ surveyId: s.id, outcomeId: o.id, rating: Math.min(5, Math.max(1, Math.round(r.gauss(mean + (o.code === 'PO5' ? -0.5 : 0), 0.8)))) }))), { returning: false });
    }
    // CO and PO targets for the year: core courses aim higher.
    const targets: Record<string, unknown>[] = [];
    for (const course of [...state.courses.values()].filter((x) => x.sub.prog === code && x.sub.term === 3 && /Accounting|Data Structures|Database/.test(x.sub.name)))
      for (const co of course.cos) targets.push({ programId: pid, academicYearId: c.years.cur, scope: 'co', targetId: co.id, code: `${course.sub.code}/${co.code}`, targetLevel: 2.2, rationale: 'Core course: target raised after meeting 2.0 in 2025-26', setBy: state.coordinators[code] });
    for (const po of pos.filter((o) => ['PO1', 'PO4'].includes(o.code))) targets.push({ programId: pid, academicYearId: c.years.cur, scope: 'po', targetId: po.id, code: po.code, targetLevel: 2.2, rationale: 'Raised by the IQAC for 2026-27', setBy: iqac });
    await k.ins('obe_targets', targets, { returning: false });
  }

  // An LMS quiz on Data Structures with questions tagged to COs.
  const bca3 = c.sections.find((s) => s.prog === 'BCA' && s.term === 3)!;
  const ds = state.courses.get(bca3.subjects.find((s) => s.name === 'Data Structures')!.id)!;
  const quiz = await k.one<{ id: string }>('lms_quizzes', { sectionId: bca3.id, subjectId: ds.sub.id, title: 'Stacks, queues and sorting', instructions: 'Ten minutes, one attempt.', opensAt: at(addDays(c.today, -20)), closesAt: at(addDays(c.today, -18)), durationMin: 10, maxAttempts: 1, status: 'closed', createdBy: ds.sub.teacherId });
  const qdefs: [string, number][] = [['Which structure follows last in, first out?', 1], ['A circular queue avoids which problem?', 1], ['Insertion sort is best on which input?', 2], ['The worst case of quick sort is', 2]];
  const lq = await k.ins<{ id: string; marks: number }>('lms_quiz_questions', qdefs.map(([text, co], i) => ({ quizId: quiz.id, position: i, kind: 'mcq', text, options: J([{ text: 'Option A', correct: true }, { text: 'Option B', correct: false }]), marks: 2, coId: ds.cos[co].id })));
  await k.ins('lms_quiz_attempts', bca3.students.filter(() => r.chance(0.9)).map((st) => {
    const results: Record<string, { correct: boolean; marks: number }> = {};
    for (const q of lq) {
      const correct = r.chance(0.35 + st.ability * 0.55);
      results[q.id] = { correct, marks: correct ? 2 : 0 };
    }
    const score = Object.values(results).reduce((s, x) => s + x.marks, 0);
    return { quizId: quiz.id, studentId: st.id, attemptNo: 1, questionIds: lq.map((q) => q.id), answers: J({}), results: J(results), score, maxScore: 8, startedAt: at(addDays(c.today, -19), '11:00'), dueAt: at(addDays(c.today, -19), '11:10'), submittedAt: at(addDays(c.today, -19), '11:08') };
  }), { returning: false });

  // Earlier years: snapshots for the trend and the batches (the same courses and COs, offered each year).
  const yearIds: Record<string, string> = {};
  for (const [label, s, e] of OBE_YEARS) yearIds[label] = (await k.one<{ id: string }>('academic_years', { label, startsOn: s, endsOn: e, isCurrent: false })).id;
  yearIds['2025-26'] = c.years.prev;
  const BIAS: Record<Bloom, number> = { Remember: 0.3, Understand: 0.22, Apply: 0.08, Analyse: -0.18, Evaluate: -0.26, Create: -0.12 };
  for (const code of SHOW) {
    const pid = c.programs[code].id;
    const outs = state.outcomes.get(code)!;
    const pos = outs.filter((o) => o.kind === 'po' || o.kind === 'pso');
    const cells = await k.q<{ coId: string; outcomeId: string; strength: number }>(`select m.co_id, m.outcome_id, m.strength from co_outcome_map m join course_outcomes co on co.id = m.co_id join co_sets cs on cs.id = co.co_set_id join subjects s on s.id = cs.subject_id where s.program_id = $1 and cs.status = 'active'`, [pid]);
    const courseNoise = new Map<string, number>();
    for (const [label, , , base0] of [...OBE_YEARS, ['2025-26', '', '', 2.0] as [string, string, string, number]]) {
      const base = base0 - (code === 'BCA' ? 0.05 : 0);
      const computedAt = at(`${Number(label.slice(0, 4)) + 1}-06-${label === '2025-26' ? '18' : '20'}`, '16:00');
      const rows: Record<string, unknown>[] = [];
      const level = new Map<string, number>();
      const subjectOf = new Map<string, string>();
      for (const course of [...state.courses.values()].filter((x) => x.sub.prog === code)) {
        if (!courseNoise.has(course.sub.id)) courseNoise.set(course.sub.id, r.gauss(0, 0.14));
        for (const co of course.cos) {
          const v = Math.min(3, Math.max(0.6, base + BIAS[co.bloom] + courseNoise.get(course.sub.id)! + r.gauss(0, 0.1)));
          const direct = round(Math.min(3, Math.max(0.5, v - 0.05)), 2);
          const indirect = round(Math.min(3, Math.max(1, v + 0.25 + r.gauss(0, 0.1))), 2);
          const combined = combinedAttainment(direct, indirect, DEFAULT_ATTAINMENT_CONFIG)!;
          level.set(co.id, combined);
          subjectOf.set(co.id, course.sub.id);
          const g = gapFor(combined, 2);
          rows.push({ programId: pid, academicYearId: yearIds[label], scope: 'co', targetId: co.id, code: `${course.sub.code}/${co.code}`, subjectId: course.sub.id, direct, indirect, combined, target: 2, gap: g.gap, met: g.met, detail: J({ method: 'threshold', byKind: [], weakItems: [], imported: true }), computedBy: iqac, computedAt });
        }
      }
      for (const po of pos) {
        const mine = cells.filter((x) => x.outcomeId === po.id);
        const agg = programOutcomeAttainment(mine.map((x) => ({ coId: x.coId, strength: x.strength, coAttainment: level.get(x.coId) ?? null, courseId: subjectOf.get(x.coId) })), DEFAULT_ATTAINMENT_CONFIG as AttainmentConfig);
        const indirect = round(Math.min(3, 2.15 + (base - 1.8) * 0.6 + r.gauss(0, 0.08)), 2);
        const combined = combinedAttainment(agg.level, indirect, DEFAULT_ATTAINMENT_CONFIG);
        const g = gapFor(combined, 2);
        rows.push({ programId: pid, academicYearId: yearIds[label], scope: 'po', targetId: po.id, code: po.code, direct: agg.level, indirect, combined, target: 2, gap: g.gap, met: g.met, detail: J({ coverage: agg.coverage, contributors: agg.contributors, byCourse: agg.byCourse, kind: po.kind, method: 'course_weighted', imported: true }), computedBy: iqac, computedAt });
      }
      await k.ins('attainment_snapshots', rows, { returning: false });
    }
  }

  // This year's attainment through the module, then the batches.
  for (const code of ALL) {
    const pid = c.programs[code].id;
    await withTenant(c.tenantId, (tx) => svc.compute(tx, c.tenantId, iqac, pid, c.years.cur));
  }
  for (const code of SHOW) for (const y of ['2023-24', '2024-25', '2025-26']) await withTenant(c.tenantId, (tx) => svc.computeBatch(tx, c.tenantId, iqac, c.programs[code].id, yearIds[y]));

  // Gaps: last year's actions closed with their action-taken report and evidence; this year's opened from the gaps.
  for (const code of SHOW) {
    const pid = c.programs[code].id;
    const hod = c.byEmail[code === 'BCM' ? 'hod.commerce' : 'hod.computers'].id;
    const prevGaps = await k.q<{ targetId: string; code: string; combined: number; subjectId: string | null; scope: string }>(`select target_id, code, combined::float, subject_id, scope from attainment_snapshots where program_id = $1 and academic_year_id = $2 and not met order by gap desc limit 4`, [pid, c.years.prev]);
    const done = await k.ins<{ id: string }>('improvement_actions', prevGaps.map((g, i) => ({ programId: pid, scope: g.scope, targetId: g.targetId, code: g.code, subjectId: g.subjectId, academicYearId: c.years.prev, title: `Close the attainment gap of ${g.code}`, detail: 'Raised at the IQAC review of June 2026.', rootCause: ['Few practice problems on higher-order questions in the internal tests', 'Students struggled with case analysis; little time for discussion', 'Long absence of the regular faculty in the second half of the semester', 'Part C questions were set above the Bloom level of the CO'][i], actionTaken: ['Two extra tutorial hours a week with graded problem sets; question bank enriched with 30 analysis questions.', 'Case discussions every Friday; peer-review rubric used for assignments.', 'Bridge classes in the first month of the next offering; recorded lectures shared on the LMS.', 'Blueprint revised: Part C now tests the CO at its own level; paper moderated by the HoD.'][i], takenOn: addDays(c.today, -100 + i * 9), ownerId: hod, dueOn: addDays(c.today, -60), status: 'done', baselineValue: g.combined, targetValue: 2, remeasureOn: addDays(c.today, -5), remeasuredValue: round(Math.min(3, g.combined + 0.25 + i * 0.05), 2), remeasureNote: 'Measured on the 2026-27 internal tests.', remeasuredAt: at(addDays(c.today, -5)), closedAt: at(addDays(c.today, -5)), createdBy: iqac, createdAt: at('2026-06-25') })));
    await k.ins('obe_evidence', done.flatMap((a, i) => [{ programId: pid, scope: 'action', targetId: a.id, title: ['Tutorial attendance register and problem sets', 'Case discussion schedule and rubric', 'Bridge class timetable and LMS recordings', 'Revised blueprint and moderation report'][i], url: `https://soundarya.example.edu/obe/atr/${code.toLowerCase()}-${i + 1}.pdf`, uploadedBy: hod }]), { returning: false });
    const cur = await k.q<{ targetId: string; code: string; combined: number; subjectId: string | null; scope: string; target: number }>(`select target_id, code, combined::float, subject_id, scope, target::float from attainment_snapshots where program_id = $1 and academic_year_id = $2 and not met and combined is not null and computed_at = (select max(computed_at) from attainment_snapshots where program_id = $1 and academic_year_id = $2) order by gap desc limit 6`, [pid, c.years.cur]);
    await k.ins('improvement_actions', cur.map((g, i) => ({ programId: pid, scope: g.scope, targetId: g.targetId, code: g.code, subjectId: g.subjectId, academicYearId: c.years.cur, title: `Close the attainment gap of ${g.code} (${g.combined} against a target of ${g.target})`, detail: i % 2 ? 'Remedial sessions before the SEE.' : 'Revise the internal test blueprint for this CO.', rootCause: i < 2 ? ['Higher-order questions answered poorly in the internal test', 'Low participation in the course exit survey'][i] : null, ownerId: i % 2 ? hod : state.coordinators[code], dueOn: addDays(c.today, 20 + i * 7), status: i === 0 ? 'in_progress' : 'open', baselineValue: g.combined, targetValue: g.target, createdBy: state.coordinators[code] })), { returning: false });
  }

  // Curricular gaps and content beyond the syllabus (NBA 2.1, NAAC 1.3).
  const s3 = (prog: string, name: string) => c.sections.find((s) => s.prog === prog && s.term === 3)!.subjects.find((x) => x.name === name)?.id ?? null;
  const gaps: [string, string, string, string | null, string[], string, string, string, number, string][] = [
    ['BCM', 'gap', 'GST return filing on the GST portal is not part of the syllabus', null, ['po4', 'po7', 'pso2'], 'workshop', '2026-08-28', 'CA Nandini Rao, GST practitioner', 58, 'done'],
    ['BCM', 'gap', 'Accounting software practice (Tally Prime) is missing', null, ['po7', 'pso3'], 'value_added_course', '2026-09-05', 'Tally Education, Bengaluru (30 hours)', 64, 'done'],
    ['BCM', 'beyond_syllabus', 'Ind AS 115: revenue from contracts with customers', s3('BCM', 'Corporate Accounting'), ['po1', 'pso1'], 'guest_lecture', '2026-09-18', 'CA Ramesh Iyer, Partner, Iyer & Co.', 30, 'done'],
    ['BCM', 'beyond_syllabus', 'Industrial visit to the National Stock Exchange regional office', s3('BCM', 'Indian Financial System'), ['po1', 'po9'], 'industrial_visit', '2026-10-03', 'NSE Investor Awareness team', 42, 'done'],
    ['BCM', 'gap', 'Financial modelling in spreadsheets', null, ['po4', 'po7'], 'workshop', '2026-11-12', 'Prof. Sudhir Kamath', 0, 'planned'],
    ['BCA', 'gap', 'Version control with Git is not taught', null, ['po7', 'pso1'], 'workshop', '2026-08-22', 'Mr. Arjun Hegde, Senior Engineer', 24, 'done'],
    ['BCA', 'gap', 'Cloud deployment practice', null, ['pso2', 'po10'], 'value_added_course', '2026-09-15', 'AWS Academy Cloud Foundations', 18, 'done'],
    ['BCA', 'beyond_syllabus', 'Graph databases (Neo4j)', s3('BCA', 'Database Management Systems'), ['po1', 'pso1'], 'seminar', '2026-09-25', 'Dr. Meera Pai, IISc Bengaluru', 24, 'done'],
    ['BCA', 'beyond_syllabus', 'Competitive programming contest', s3('BCA', 'Data Structures'), ['po4', 'pso1'], 'lab_session', '2026-10-06', 'Coding club with HackerRank', 20, 'done'],
  ];
  await k.ins('obe_curriculum_gaps', gaps.map(([prog, kind, title, subjectId, codes, method, heldOn, person, n, status], i) => ({ programId: c.programs[prog].id, kind, title, description: kind === 'gap' ? `Identified at the department review against the POs; addressed through a ${method.replace(/_/g, ' ')}.` : 'Delivered to strengthen the POs beyond what the university syllabus covers.', subjectId, academicYearId: c.years.cur, outcomeCodes: codes, method, heldOn, resourcePerson: person, beneficiaries: n || null, status, evidenceUrl: status === 'done' ? `https://soundarya.example.edu/obe/cbs/${i + 1}.pdf` : null, sortOrder: i, createdBy: state.coordinators[prog] })), { returning: false });
  void J;
}

export type { SectionRef };
