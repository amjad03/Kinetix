/** Student accounts, outcome-based education (COs, POs, attainment), feedback surveys and the question bank. */
import { DEFAULT_ATTAINMENT_CONFIG } from '../../obe/attainment.js';
import { ObeService } from '../../obe/obe.service.js';
import { DOMAIN } from './data.js';
import type { Ctx, SectionRef, SubjectRef } from './ctx.js';
import { addDays, at, J } from './kit.js';
import { examState } from './exams.js';
import { service, withTenant } from './nest.js';

const OBE_PROGRAMS = ['BCM', 'BBA', 'BCA'];

/** Every student gets an account (phone/e-mail sign-in), so survey answers, submissions and the student app have owners. */
export async function studentAccounts(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const need = c.students.filter((s) => !s.userId);
  const users = await k.ins<{ id: string }>('users', need.map((s, i) => ({ fullName: s.name, email: `${s.rollNo.toLowerCase()}@students.${DOMAIN}`, phone: `+9190001${String(10000 + i).padStart(5, '0')}`, passwordHash: c.hash, status: 'active' })));
  await k.ins('user_roles', users.map((u) => ({ userId: u.id, role: 'student', campusId: c.campusId })), { returning: false });
  for (const [i, s] of need.entries()) s.userId = users[i].id;
  await k.q('update students s set user_id = x.uid from unnest($1::uuid[], $2::uuid[]) as x(sid, uid) where s.id = x.sid', [need.map((s) => s.id), users.map((u) => u.id)]);
}

const PO_TEXT = [
  ['PO1', 'Disciplinary knowledge', 'Apply the knowledge of the discipline to analyse and solve business problems.'],
  ['PO2', 'Critical thinking and problem solving', 'Analyse information, evaluate options and take reasoned decisions.'],
  ['PO3', 'Communication', 'Communicate effectively in writing and speech with peers, clients and the public.'],
  ['PO4', 'Digital and analytical skills', 'Use data and digital tools for business analysis and decision making.'],
  ['PO5', 'Ethics and sustainability', 'Practise professional ethics and take account of social and environmental impact.'],
  ['PO6', 'Teamwork and leadership', 'Work effectively as a member or leader of diverse teams.'],
];
const CO_VERBS = [
  (n: string) => `Explain the fundamental concepts and terminology of ${n}`,
  (n: string) => `Apply the techniques of ${n} to solve routine problems`,
  (n: string) => `Analyse cases and data using the methods of ${n}`,
  (n: string) => `Evaluate alternatives and prepare reports in the area of ${n}`,
];
const BLOOM = ['understand', 'apply', 'analyze', 'evaluate'];

export async function obe(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const hod = (dept: string) => c.byEmail[dept === 'Commerce' ? 'hod.commerce' : dept === 'Computer Applications' ? 'hod.computers' : 'hod.management'].id;
  for (const code of OBE_PROGRAMS) {
    const prog = c.programs[code];
    const pid = prog.id;
    const outs = await k.ins<{ id: string; code: string; kind: string }>('program_outcomes', [
      { programId: pid, kind: 'mission', code: 'MISSION', statement: 'To develop ethical, employable and socially responsible graduates through quality teaching, industry exposure and community engagement.', ord: 0 },
      { programId: pid, kind: 'vision', code: 'VISION', statement: 'To be a leading institution of Bengaluru for management and science education rooted in Karnataka’s values.', ord: 0 },
      ...[1, 2, 3].map((i) => ({ programId: pid, kind: 'peo', code: `PEO${i}`, statement: ['Graduates build successful careers in business, technology or public service.', 'Graduates pursue higher studies and lifelong learning.', 'Graduates contribute ethically to their communities.'][i - 1], ord: i })),
      ...PO_TEXT.map(([cd, , st], i) => ({ programId: pid, kind: 'po', code: cd, statement: st, ord: i + 1 })),
      ...[1, 2].map((i) => ({ programId: pid, kind: 'pso', code: `PSO${i}`, statement: `${prog.def.name}: ${['demonstrate specialised competence in the core areas of the programme', 'apply programme-specific tools in an industry setting'][i - 1]}.`, ord: i })),
    ]);
    const targets = outs.filter((o) => o.kind === 'po' || o.kind === 'pso');
    const sec = c.sections.find((s) => s.prog === code && s.term === 3)!;
    const session = examState.sessions!.find((s) => s.sec.id === sec.id)!;
    for (const sub of sec.subjects) {
      const set = await k.one<{ id: string }>('co_sets', { subjectId: sub.id, version: 1, status: 'active', note: 'Approved by the Board of Studies', createdBy: sub.teacherId, activatedAt: at('2026-08-04') });
      const cos = await k.ins<{ id: string }>('course_outcomes', CO_VERBS.map((f, i) => ({ coSetId: set.id, code: `CO${i + 1}`, statement: f(sub.name), bloomLevel: BLOOM[i], ord: i + 1 })));
      await k.ins('co_outcome_map', cos.flatMap((co, i) => [targets[(i + sec.subjects.indexOf(sub)) % 6], targets[(i + 3 + sec.subjects.indexOf(sub)) % 8]].map((o, j) => ({ coId: co.id, outcomeId: o.id, strength: 3 - ((i + j) % 3) }))), { returning: false });
      const [iat, iaa, iap, see] = session.assessmentIds[sub.id];
      await k.ins('assessment_co_map', [
        { assessmentId: iat, coId: cos[0].id, share: 0.5 }, { assessmentId: iat, coId: cos[1].id, share: 0.5 },
        { assessmentId: iaa, coId: cos[2].id, share: 1 }, { assessmentId: iap, coId: cos[3].id, share: 1 },
        ...cos.map((co) => ({ assessmentId: see, coId: co.id, share: 0.25 })),
      ], { returning: false });
    }
    await k.ins('obe_configs', { programId: pid, config: J(DEFAULT_ATTAINMENT_CONFIG), updatedBy: hod(prog.def.dept) }, { noTenant: false, returning: false });

    // Exit survey ratings against programme outcomes (indirect evidence), then attainment through the module.
    const survey = await k.one<{ id: string }>('obe_surveys', { programId: pid, academicYearId: c.years.cur, kind: 'graduate_exit', title: `${prog.def.name} graduate exit survey 2025-26`, scaleMax: 5, minResponses: 10, weight: 1, createdBy: hod(prog.def.dept) });
    await k.ins('obe_survey_ratings', targets.flatMap((o) => Array.from({ length: 12 }, () => ({ surveyId: survey.id, outcomeId: o.id, rating: r.int(3, 5) }))), { returning: false });
    const svc = await service(ObeService);
    await withTenant(c.tenantId, (tx) => svc.compute(tx, c.tenantId, hod(prog.def.dept), pid, c.years.cur));
    const unmet = await k.q<{ scope: string; targetId: string; code: string }>('select scope, target_id, code from attainment_snapshots where program_id = $1 and met = false order by computed_at desc limit 3', [pid]);
    await k.ins('improvement_actions', unmet.map((u, i) => ({ programId: pid, scope: u.scope, targetId: u.targetId, title: `Improve attainment of ${u.code}`, detail: ['Add two tutorial hours and a case study on the weak outcome.', 'Redesign the internal test to cover the outcome with more questions.', 'Bridge class for students below 40 percent.'][i], ownerId: hod(prog.def.dept), dueOn: addDays(c.today, 30 + i * 10), status: i === 0 ? 'in_progress' : 'open', createdBy: hod(prog.def.dept) })), { returning: false });
    await k.ins('obe_evidence', [{ programId: pid, scope: 'program', targetId: pid, title: 'IQAC review minutes, September 2026', note: 'Attainment tabled and actions agreed.', uploadedBy: hod(prog.def.dept) }, { programId: pid, scope: 'program', targetId: pid, title: 'Sample answer scripts for CO3', url: 'https://learn.soundarya.demo.kinetix.in/evidence/co3-scripts', uploadedBy: hod(prog.def.dept) }], { returning: false });
  }
}

export async function surveys(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principal = c.byEmail.principal.id;
  const sec = c.sections.find((s) => s.prog === 'BCM' && s.term === 3)!;
  const coFor = async (sub: SubjectRef) => (await k.q<{ id: string }>('select co.id from course_outcomes co join co_sets cs on cs.id = co.co_set_id where cs.subject_id = $1 order by co.ord', [sub.id])).map((x) => x.id);
  const defs: { sec: SectionRef; sub: SubjectRef; title: string; status: string }[] = [
    { sec, sub: sec.subjects[1], title: 'Course exit survey: Cost Accounting', status: 'closed' },
    { sec: c.sections.find((s) => s.prog === 'BCA' && s.term === 3)!, sub: c.sections.find((s) => s.prog === 'BCA' && s.term === 3)!.subjects[0], title: 'Course exit survey: Data Structures', status: 'open' },
  ];
  for (const d of defs) {
    const cos = await coFor(d.sub);
    const sv = await k.one<{ id: string }>('surveys', { title: d.title, description: 'Tell us how well the course helped you. Responses are anonymous and used for outcome attainment.', audience: 'section', sectionId: d.sec.id, anonymous: true, opensAt: at('2026-09-28'), closesAt: at(addDays(c.today, d.status === 'closed' ? -2 : 6)), status: d.status, createdBy: principal, closedAt: d.status === 'closed' ? at(addDays(c.today, -2)) : null });
    const qs = await k.ins<{ id: string; kind: string }>('survey_questions', [
      ...cos.map((co, i) => ({ surveyId: sv.id, ord: i + 1, kind: 'rating', prompt: `I can ${['explain the basic concepts', 'apply the methods to routine problems', 'analyse cases and data', 'evaluate alternatives and write reports'][i]} of this course.`, required: true, coId: co })),
      { surveyId: sv.id, ord: 5, kind: 'single', prompt: 'How was the pace of teaching?', options: J(['Too slow', 'Just right', 'Too fast']), required: true },
      { surveyId: sv.id, ord: 6, kind: 'text', prompt: 'What should the teacher continue or change?', required: false },
    ]);
    for (const st of d.sec.students.filter((_, i) => i % 6 !== 5)) {
      const resp = await k.one<{ id: string }>('survey_responses', { surveyId: sv.id, respondentId: st.userId, submittedAt: at(addDays(c.today, -r.int(2, 8)), '16:00') });
      await k.ins('survey_answers', qs.map((q) => ({ surveyId: sv.id, questionId: q.id, responseId: resp.id, rating: q.kind === 'rating' ? Math.min(5, Math.max(1, Math.round(r.gauss(3.4 + st.ability, 0.8)))) : null, choices: q.kind === 'single' ? J([['Too slow', 'Just right', 'Just right', 'Too fast'][r.int(0, 3)]]) : J([]), text: q.kind === 'text' ? r.pick(['More solved examples please.', 'Good explanations.', 'Share notes before class.', null as unknown as string]) : null })), { returning: false });
    }
  }
  const staffSurvey = await k.one<{ id: string }>('surveys', { title: 'Staff satisfaction survey, odd semester 2026', description: 'Facilities, workload and support. Anonymous.', audience: 'staff', anonymous: true, opensAt: at(addDays(c.today, -1)), closesAt: at(addDays(c.today, 13)), status: 'open', createdBy: principal });
  await k.ins('survey_questions', [{ surveyId: staffSurvey.id, ord: 1, kind: 'rating', prompt: 'The classrooms and labs support my teaching.', required: true }, { surveyId: staffSurvey.id, ord: 2, kind: 'rating', prompt: 'My workload is reasonable.', required: true }], { returning: false });
  await k.ins('surveys', { title: 'Guardian feedback: transport and hostel', description: 'Draft: to be sent in November.', audience: 'guardians', anonymous: false, status: 'draft', createdBy: principal }, { returning: false });
}

const TOPICS: Record<string, string[]> = {
  'BCA:Data Structures': ['arrays', 'linked lists', 'stacks', 'queues', 'binary trees', 'graph traversal'],
  'BCA:Database Management Systems': ['the relational model', 'normalisation', 'SQL joins', 'transactions', 'indexing', 'ER modelling'],
  'BCM:Corporate Accounting': ['issue of shares', 'forfeiture of shares', 'redemption of preference shares', 'amalgamation', 'company final accounts', 'buy-back of shares'],
  'BCM:Cost Accounting': ['material control', 'labour cost', 'overheads', 'job costing', 'process costing', 'marginal costing'],
  'BBA:Marketing Management': ['the marketing mix', 'market segmentation', 'product life cycle', 'pricing strategies', 'channels of distribution', 'branding'],
  'BBA:Human Resource Management': ['recruitment', 'selection', 'training and development', 'performance appraisal', 'compensation', 'industrial relations'],
};

export async function questionBank(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const moderator = c.byEmail['hod.commerce'].id;
  for (const [key, topics] of Object.entries(TOPICS)) {
    const [prog, name] = key.split(':');
    const sec = c.sections.find((s) => s.prog === prog && s.term === 3)!;
    const sub = sec.subjects.find((s) => s.name === name)!;
    const cos = (await k.q<{ id: string; code: string }>('select co.id, co.code from course_outcomes co join co_sets cs on cs.id = co.co_set_id where cs.subject_id = $1 order by co.ord', [sub.id]));
    const rows: Record<string, unknown>[] = [];
    topics.forEach((t, i) => {
      const co = cos[i % 4]?.id ?? null;
      const mk = (type: string, bloom: string, difficulty: string, marks: number, text: string, extra: Record<string, unknown> = {}) => rows.push({ subjectId: sub.id, unit: `Unit ${Math.floor(i / 2) + 1}`, topic: t, coId: co, bloom, difficulty, marks, type, text, status: 'approved', version: 1, authorId: sub.teacherId, reviewedBy: moderator, reviewedAt: at('2026-09-12'), approvedBy: moderator, approvedAt: at('2026-09-14'), ...extra });
      mk('mcq', 'remember', 'easy', 2, `Which of the following statements about ${t} is correct?`, { options: J([{ text: `It is a core idea in the study of ${name}`, correct: true }, { text: 'It applies only to large organisations', correct: false }, { text: 'It was removed from the BCU syllabus', correct: false }, { text: 'It has no practical use', correct: false }]), answer: `It is a core idea in the study of ${name}` });
      mk('short', 'understand', 'easy', 5, `Define ${t} and state its importance.`, { answer: `A definition of ${t} with two points on its importance.` });
      mk('short', 'analyze', 'medium', 5, `Distinguish between ${t} and a related concept, with an example.`);
      mk('long', i % 2 ? 'evaluate' : 'apply', i % 3 === 0 ? 'hard' : 'medium', 10, `Explain ${t} in detail with suitable illustrations or a worked example.`);
    });
    // A few not yet approved, to show the review queue.
    rows.push({ subjectId: sub.id, unit: 'Unit 3', topic: topics[0], coId: cos[0]?.id ?? null, bloom: 'apply', difficulty: 'medium', marks: 5, type: 'short', text: `Prepare a short note on a recent development related to ${topics[0]}.`, status: 'draft', version: 1, authorId: sub.teacherId }, { subjectId: sub.id, unit: 'Unit 3', topic: topics[1], coId: cos[1]?.id ?? null, bloom: 'analyze', difficulty: 'hard', marks: 10, type: 'long', text: `Critically examine the role of ${topics[1]} in a growing business.`, status: 'reviewed', version: 1, authorId: sub.teacherId, reviewedBy: moderator, reviewedAt: at(addDays(c.today, -2)) });
    const qs = await k.ins<{ id: string; type: string; marks: number; status: string; text: string; options: unknown; answer: string; bloom: string; difficulty: string; topic: string; unit: string; coId: string | null }>('qb_questions', rows);
    await k.ins('qb_question_versions', qs.slice(0, 3).map((q) => ({ questionId: q.id, version: 1, snapshot: J({ text: q.text, marks: q.marks }), editedBy: sub.teacherId })), { returning: false });
    const bp = await k.one<{ id: string }>('qb_blueprints', { subjectId: sub.id, title: `${name}: semester end paper (60 marks)`, totalMarks: 60, durationMinutes: 150, sections: J([{ name: 'Section A: multiple choice', count: 5, questionMarks: 2, type: 'mcq' }, { name: 'Section B: short answers', count: 4, questionMarks: 5, type: 'short' }, { name: 'Section C: long answers', count: 3, questionMarks: 10, type: 'long' }]), createdBy: moderator });
    const approved = qs.filter((q) => q.status === 'approved');
    const pick = (type: string, n: number, used: Set<string>) => approved.filter((q) => q.type === type && !used.has(q.id)).slice(0, n);
    const used = new Set<string>();
    const parts: [number, string, number][] = [[0, 'mcq', 5], [1, 'short', 4], [2, 'long', 3]];
    for (const [pi, [title, status]] of ([['Model paper, September 2026', 'locked'], ['Draft paper for the December SEE', 'draft']] as const).entries()) {
      const paper = await k.one<{ id: string }>('qb_papers', { blueprintId: bp.id, subjectId: sub.id, title: `${name}: ${title}`, seed: `soundarya-${pi}`, avoidLast: 3, repeats: pi, status, setterId: sub.teacherId, moderatorId: moderator, remarks: status === 'locked' ? 'Approved. Locked for printing.' : null, decidedAt: status === 'locked' ? at('2026-09-20') : null, lockedAt: status === 'locked' ? at('2026-09-21') : null, lockedBy: status === 'locked' ? moderator : null });
      const items: Record<string, unknown>[] = [];
      for (const [section, type, n] of parts) {
        const chosen = pick(type, n, new Set(pi === 0 ? [] : [...used]));
        chosen.forEach((q, position) => { if (pi === 0) used.add(q.id); items.push({ paperId: paper.id, questionId: q.id, section, position, marks: q.marks, snapshot: J({ text: q.text, options: q.options, answer: q.answer, type: q.type, bloom: q.bloom, difficulty: q.difficulty, topic: q.topic, unit: q.unit, coId: q.coId, coCode: cos.find((x) => x.id === q.coId)?.code ?? null, marks: q.marks, version: 1 }) }); });
      }
      await k.ins('qb_paper_items', items, { returning: false });
    }
    await k.ins('past_exam_questions', topics.slice(0, 3).map((t, i) => ({ subjectId: sub.id, question: `Explain ${t} with examples.`, exam: 'BCU Semester End Examination', year: 2023 + i, marks: 10 })), { returning: false });
    void r;
  }
  // Blueprint for a subject with no approved bank yet.
  await k.ins('qb_blueprints', { subjectId: c.sections.find((s) => s.prog === 'MBA' && s.term === 3)!.subjects[0].id, title: 'Strategic Management: semester end paper (70 marks)', totalMarks: 70, durationMinutes: 180, sections: J([{ name: 'Section A: short', count: 5, questionMarks: 6, type: 'short' }, { name: 'Section B: cases', count: 4, questionMarks: 10, type: 'long' }]), createdBy: moderator }, { returning: false });
}
