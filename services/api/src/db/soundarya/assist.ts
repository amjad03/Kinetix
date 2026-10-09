/** Sample records for probation, staff transfers, AI marking drafts, freehand ink on a script and CO-tagged board polls (migration 0115). */
import type { Ctx } from './ctx.js';
import { addDays, J } from './kit.js';

export async function assistSamples(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const hr = c.byEmail.hr.id;

  // Probation: three people on probation at different points of the review.
  const probationers = c.teachers.slice(-3);
  const joined = [-175, -60, -185];
  for (const [i, t] of probationers.entries()) {
    await k.q("update staff_profiles set employment_type = 'probation', date_of_joining = $2 where user_id = $1", [t.id, addDays(c.today, joined[i])]);
  }
  if (probationers.length === 3) {
    const [a, , b] = probationers;
    await k.ins(
      'probation_reviews',
      [
        { userId: a.id, dueOn: addDays(c.today, joined[0] + 183), status: 'recommended', hodId: hr, recommendation: 'confirm', hodRemarks: 'Handles two sections well; feedback from students is good.', recommendedAt: new Date() },
        { userId: b.id, dueOn: addDays(c.today, -3), status: 'pending' },
      ],
      { returning: false },
    );
  }

  // Transfers: one applied last term, one scheduled for next month.
  const [x, y] = c.teachers;
  const depts = Object.values(c.departments);
  if (x && y && depts.length > 1) {
    await k.ins(
      'staff_transfers',
      [
        { userId: x.id, fromDepartmentId: depts[0], toDepartmentId: depts[1], effectiveOn: addDays(c.today, -120), reason: 'Moved to teach the new BBA Aviation papers.', status: 'applied', createdBy: hr, appliedAt: new Date(`${addDays(c.today, -120)}T09:00:00+05:30`) },
        { userId: y.id, fromDepartmentId: depts[1], toDepartmentId: depts[0], effectiveOn: addDays(c.today, 30), reason: 'Department head requested cover for the second semester.', status: 'scheduled', createdBy: hr },
      ],
      { returning: false },
    );
  }

  // Ink on the first page of a script that already has ticks and comments.
  const [ann] = await k.q<{ scriptId: string; allocationId: string; createdBy: string }>('select script_id, allocation_id, created_by from eval_annotations where tenant_id = $1 and kind = $2 limit 1', [c.tenantId, 'tick']);
  if (ann) {
    await k.ins('eval_annotations', {
      scriptId: ann.scriptId,
      allocationId: ann.allocationId,
      pageIndex: 0,
      kind: 'ink',
      x: 0.2,
      y: 0.7,
      w: 0.3,
      h: 0.05,
      strokes: J([[[0.2, 0.72], [0.28, 0.7], [0.36, 0.74], [0.44, 0.7], [0.5, 0.73]], [[0.2, 0.75], [0.5, 0.75]]]),
      createdBy: ann.createdBy,
    }, { returning: false });
  }

  // AI marking drafts: one open and one accepted for an evaluation, one edited for homework.
  const [alloc] = await k.q<{ id: string; examinerId: string; questionId: string; maxMarks: number }>(
    "select a.id, a.examiner_id, q.id as question_id, q.max_marks::float as max_marks from eval_allocations a join eval_scripts s on s.id = a.script_id join eval_questions q on q.paper_id = s.paper_id where a.tenant_id = $1 and a.status <> 'submitted' order by a.created_at, q.ord limit 2",
    [c.tenantId],
  );
  if (alloc) {
    const half = Math.round(alloc.maxMarks / 2);
    await k.ins('grade_suggestions', {
      kind: 'eval',
      allocationId: alloc.id,
      questionId: alloc.questionId,
      maxMarks: alloc.maxMarks,
      suggestedMarks: half,
      rationale: 'Preview only. Connect the KINETIX AI server to get a marking draft. Mark this answer yourself.',
      criteria: J([{ criterion: 'Overall answer', max: alloc.maxMarks, awarded: half, comment: 'Preview only: nothing was read.' }]),
      preview: true,
      requestedBy: alloc.examinerId,
    }, { returning: false });
  }
  const [hw] = await k.q<{ homeworkId: string; studentId: string; createdBy: string }>('select s.homework_id, s.student_id, h.created_by from homework_submissions s join homework h on h.id = s.homework_id where s.tenant_id = $1 limit 1', [c.tenantId]);
  if (hw) {
    await k.ins('grade_suggestions', {
      kind: 'homework',
      homeworkId: hw.homeworkId,
      studentId: hw.studentId,
      maxMarks: 5,
      suggestedMarks: 3,
      rationale: 'The answer states the definition but gives no example.',
      criteria: J([{ criterion: 'Definition', max: 3, awarded: 3, comment: 'Correct and complete.' }, { criterion: 'Example', max: 2, awarded: 0, comment: 'No example given.' }]),
      status: 'edited',
      finalMarks: 3.5,
      requestedBy: hw.createdBy,
      decidedBy: hw.createdBy,
      decidedAt: new Date(),
    }, { returning: false });
  }

  // Board polls tagged with the course outcome of their subject, so they can feed attainment.
  // The demo polls were asked on subjects that have no outcome set yet, so three of them are moved to a subject of the same programme that has one.
  const moved = await k.q<{ pollId: string; subjectId: string }>(
    `select distinct on (p.id) p.id as poll_id, sub.id as subject_id from polls p
       join sections sec on sec.id = p.section_id
       join subjects sub on sub.program_id = sec.program_id
       join co_sets cs on cs.subject_id = sub.id and cs.status = 'active'
      where p.tenant_id = $1 and p.closed_at is not null and p.correct is not null order by p.id, sub.code limit 3`,
    [c.tenantId],
  );
  for (const m of moved) await k.q('update polls set subject_id = $2 where id = $1', [m.pollId, m.subjectId]);
  const tagged = await k.q<{ pollId: string; coId: string; teacherId: string }>(
    'select distinct on (p.id) p.id as poll_id, co.id as co_id, p.teacher_id from polls p join co_sets cs on cs.subject_id = p.subject_id and cs.status = $2 join course_outcomes co on co.co_set_id = cs.id where p.tenant_id = $1 and p.closed_at is not null and p.correct is not null order by p.id, co.ord limit 8',
    [c.tenantId, 'active'],
  );
  if (tagged.length) await k.ins('poll_co_map', tagged.map((t) => ({ pollId: t.pollId, coId: t.coId, createdBy: t.teacherId })), { returning: false });
}
