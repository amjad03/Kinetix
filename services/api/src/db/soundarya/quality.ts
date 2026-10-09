/** Semester-end exam logistics (seating, invigilation, malpractice), on-screen evaluation, course files, academic audit and CBCS registration. */
import { CourseFilesService } from '../../course-files/course-files.service.js';
import { courseFilePdf } from '../../course-files/course-file-pdf.js';
import { bufferStream, ObjectStorage } from '../../storage/storage.service.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J } from './kit.js';
import { examState } from './exams.js';
import { service, withTenant } from './nest.js';

export async function semesterEndSession(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const hod = c.byEmail['hod.commerce'].id;
  const sec = c.sections.find((s) => s.prog === 'BCM' && s.term === 5)!;
  const session = await k.one<{ id: string }>('exam_sessions', { academicYearId: c.years.cur, programId: sec.programId, term: 5, name: 'BCom Semester 5: Semester End Examination, December 2026', kind: 'regular', startsOn: '2026-12-21', endsOn: '2026-12-30', status: 'scheduled', createdBy: hod });
  const hall = c.rooms.find((x) => x.name === 'Examination Hall')!;
  const seminar = c.rooms.find((x) => x.name === 'Seminar Hall')!;
  const papers = await k.ins<{ id: string }>('exam_papers', sec.subjects.map((sub, i) => ({ sessionId: session.id, subjectId: sub.id, sectionId: sec.id, examDate: addDays('2026-12-21', i + (i > 2 ? 1 : 0)), startsAt: '10:00', endsAt: '13:00', maxMarks: 60 })));
  await k.ins('exam_seats', papers.flatMap((p) => sec.students.map((st, i) => ({ paperId: p.id, studentId: st.id, roomId: i < 20 ? hall.id : seminar.id, seatNo: (i % 20) + 1 }))), { returning: false });
  await k.ins('hall_tickets', sec.students.map((st, i) => ({ sessionId: session.id, studentId: st.id, ticketNo: `SIMS/BCM5/${String(i + 1).padStart(3, '0')}`, blocked: st.presence < 0.72, blockedReason: st.presence < 0.72 ? 'Attendance below the 75 percent required by BCU' : null })), { returning: false });
  // Invigilation duty roster across the exam days.
  const teachers = c.teachers.filter((t) => !t.email.startsWith('hod.'));
  const duties: Record<string, unknown>[] = [];
  papers.forEach((p, pi) => {
    const date = addDays('2026-12-21', pi + (pi > 2 ? 1 : 0));
    [hall, seminar].forEach((room, ri) => {
      for (let j = 0; j < 2; j++) duties.push({ sessionId: session.id, staffId: teachers[(pi * 4 + ri * 2 + j) % teachers.length].id, roomId: room.id, dutyDate: date, startsAt: '09:30', endsAt: '13:15', role: j === 0 ? 'chief' : 'invigilator', status: pi === 1 && ri === 0 && j === 1 ? 'substituted' : 'assigned', createdBy: hod });
    });
  });
  await k.ins('invigilation_duties', duties, { returning: false });

  // A malpractice report from the model examination.
  const bcm = examState.sessions!.find((s) => s.sec.prog === 'BCM')!;
  const cand = bcm.sec.students.find((s) => s.ability < 0.5) ?? bcm.sec.students[3];
  await k.ins('malpractice_cases', { sessionId: bcm.id, paperId: Object.values(bcm.paperIds)[0], studentId: cand.id, roomId: hall.id, description: 'A handwritten chit with formulae was found in the geometry box during the Corporate Accounting paper.', reportedBy: c.teachers[3].id, status: 'under_review' }, { returning: false });
  void r;
}

export async function evaluation(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const bca = examState.sessions!.find((s) => s.sec.prog === 'BCA')!;
  const sub = bca.sec.subjects[0];
  const paperId = bca.paperIds[sub.id];
  const hod = c.byEmail['hod.computers'].id;
  const examiners = c.teachers.filter((t) => t.dept === 'Computer Applications' && t.id !== sub.teacherId).slice(0, 3);
  await k.ins('eval_configs', { paperId, perExaminerCap: 15, secondSharePercent: 25, thresholdMarks: 6, finalisedAt: null }, { returning: false });
  const qs = await k.ins<{ id: string }>('eval_questions', Array.from({ length: 6 }, (_, i) => ({ paperId, no: `Q${i + 1}`, maxMarks: 10, ord: i })));
  const learners = bca.sec.students.slice(0, 18);
  const scripts = await k.ins<{ id: string }>('eval_scripts', learners.map((st, i) => ({ paperId, studentId: st.id, dummyNo: `D${String(48200 + i * 37)}`, files: J([{ key: `seed/eval/${paperId}/${i}.pdf`, name: `script-${i + 1}.pdf`, mime: 'application/pdf', bytes: 1800000 + i * 9000 }]), status: i < 10 ? 'finalised' : i < 14 ? 'valued' : i < 16 ? 'allocated' : i === 16 ? 'needs_third' : 'uploaded', secondRequired: i < 4 || i === 16, thirdRequired: i === 16, uploadedBy: hod })));
  const allocs: Record<string, unknown>[] = [];
  const marksFor = (ability: number) => qs.map(() => Math.min(10, Math.max(0, Math.round(r.gauss(ability * 8 + 1.5, 1.6) * 2) / 2)));
  const marks: Record<string, unknown>[] = [];
  for (const [i, sc] of scripts.entries()) {
    const rounds = i < 4 ? 2 : i === 16 ? 2 : 1;
    for (let round = 1; round <= rounds; round++) {
      const status = i >= 14 && i < 16 ? 'pending' : i === 17 ? 'pending' : 'submitted';
      allocs.push({ scriptId: sc.id, paperId, examinerId: examiners[(i + round) % examiners.length].id, round, status, _marks: status === 'submitted' ? marksFor(learners[i].ability + (i === 16 ? (round === 1 ? -0.25 : 0.25) : 0)) : null, submittedAt: status === 'submitted' ? at(addDays(c.today, -3), '15:00') : null });
    }
  }
  const rows = await k.ins<{ id: string }>('eval_allocations', allocs.map(({ _marks, ...a }) => ({ ...a, total: _marks ? (_marks as number[]).reduce((x, y) => x + y, 0) : null })));
  rows.forEach((row, i) => {
    const m = allocs[i]._marks as number[] | null;
    if (m) m.forEach((v, qi) => marks.push({ allocationId: row.id, questionId: qs[qi].id, marks: v, comment: v < 3 ? 'Concept is incomplete' : null }));
  });
  await k.ins('eval_marks', marks, { returning: false });
  await k.q("update eval_scripts s set final_marks = (select round(avg(total)) from eval_allocations a where a.script_id = s.id and a.status = 'submitted') where s.status = 'finalised' and s.paper_id = $1", [paperId]);
}

export async function courseFiles(c: Ctx): Promise<void> {
  const svc = await service(CourseFilesService);
  const storage = await service(ObjectStorage);
  const pairs = c.sections.filter((s) => ['BCM', 'BCA', 'BBA'].includes(s.prog) && s.term === 3).flatMap((s) => s.subjects.slice(0, 3).map((sub) => ({ sec: s, sub })));
  for (const [i, { sec, sub }] of pairs.entries()) {
    await withTenant(c.tenantId, async (tx) => {
      const { data, summary } = await svc.collect(tx, { sectionId: sec.id, subjectId: sub.id, version: 1, generatedBy: sub.teacherId });
      const pdf = courseFilePdf(data);
      const [row] = await c.kit.ins<{ id: string }>('course_files', { sectionId: sec.id, subjectId: sub.id, version: 1, storageKey: 'pending', sizeBytes: pdf.length, summary: J(summary), generatedBy: sub.teacherId, generatedAt: at(addDays(c.today, -(i % 6) - 1), '14:00'), reviewedBy: i % 3 === 0 ? c.byEmail['hod.commerce'].id : null, reviewedAt: i % 3 === 0 ? at(addDays(c.today, -1), '11:00') : null, reviewRemark: i % 3 === 0 ? 'Complete. Add the CO attainment sheet after IA 2.' : null });
      const key = `tenants/${c.tenantId}/course-files/${row.id}.pdf`;
      await storage.put(key, bufferStream(pdf), 20 * 1024 * 1024, 'application/pdf');
      await c.kit.q('update course_files set storage_key = $2 where id = $1', [row.id, key]);
    });
  }
}

export async function academicAudit(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const iqac = c.byEmail.principal.id;
  const items: [string, string][] = [
    ['Teaching plan', 'Year plan and lesson plans are prepared and followed'], ['Teaching plan', 'Syllabus coverage is on schedule against the academic calendar'], ['Assessment', 'Internal assessments are conducted as scheduled'], ['Assessment', 'Marks are entered and published within 7 days'],
    ['Assessment', 'Question papers map to course outcomes'], ['Records', 'Attendance is recorded for every period'], ['Records', 'Course file is complete and up to date'], ['Student support', 'Remedial classes are held for low performers'], ['Student support', 'Mentoring sessions are recorded'], ['Infrastructure', 'Classroom and lab equipment is working'],
  ];
  const tpl = await k.one<{ id: string }>('audit_templates', { name: 'Departmental academic audit (IQAC)', description: 'Annual review of teaching, assessment and records for each department', active: true, createdBy: iqac });
  await k.ins('audit_template_items', items.map(([category, text], ord) => ({ templateId: tpl.id, ord, category, text })), { returning: false });
  const deptNames = ['Commerce', 'Computer Applications', 'Management Studies'];
  for (const [di, dn] of deptNames.entries()) {
    const done = di < 2;
    const audit = await k.one<{ id: string }>('academic_audits', { templateId: tpl.id, departmentId: c.departments[dn], academicTermId: c.termId, title: `${dn}: academic audit, odd semester 2026`, status: done ? 'completed' : 'in_progress', auditorUserId: iqac, conductedOn: addDays(c.today, -(12 + di * 5)), completedAt: done ? at(addDays(c.today, -(10 + di * 5))) : null });
    const results = await k.ins<{ id: string; itemText: string; result: string | null }>('academic_audit_results', items.map(([category, itemText], ord) => ({ auditId: audit.id, ord, category, itemText, result: !done && ord > 5 ? null : r.pick(['compliant', 'compliant', 'compliant', 'partial', 'non_compliant']), remark: r.chance(0.3) ? 'Evidence checked in the course file.' : null })));
    const bad = results.filter((x) => x.result && x.result !== 'compliant').slice(0, 3);
    await k.ins('audit_non_conformities', bad.map((x, i) => ({ auditId: audit.id, resultId: x.id, description: `${x.itemText}: ${x.result === 'partial' ? 'partly met' : 'not met'}`, severity: x.result === 'partial' ? 'minor' : 'major', correctiveAction: i === 0 ? 'Update the records weekly and have the HoD sign monthly.' : null, ownerUserId: c.byEmail[di === 0 ? 'hod.commerce' : 'hod.computers'].id, dueOn: addDays(c.today, 20 + i * 7), status: i === 0 ? 'in_progress' : i === 1 && di === 0 ? 'closed' : 'open', closureNote: i === 1 && di === 0 ? 'Corrected and verified at re-audit.' : null, closedBy: i === 1 && di === 0 ? iqac : null, closedAt: i === 1 && di === 0 ? at(addDays(c.today, -2)) : null })), { returning: false });
  }
}

export async function cbcs(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const bcm = c.programs['BCM'].id;
  // Open electives and skill courses are listed under BCom, open to every undergraduate programme.
  const extra = await k.ins<{ id: string }>('subjects', [['OE-301', 'Financial Literacy for Everyone'], ['OE-302', 'Introduction to Python (Open Elective)'], ['SK-301', 'Business Etiquette and Soft Skills'], ['SK-302', 'Data Visualisation with Spreadsheets']].map(([code, name]) => ({ programId: bcm, term: 3, code, name, departmentId: c.departments['Commerce'] })));
  const ug = ['BBA', 'BCM', 'BCA', 'BAV'].map((x) => c.programs[x].id);
  const sec3 = c.sections.filter((s) => s.term === 3 && s.def.level === 'ug');
  await k.ins('registration_windows', { termId: c.termId, programId: null, opensAt: at(addDays(c.today, -10), '09:00'), closesAt: at(addDays(c.today, 5), '17:00'), addDropUntil: at(addDays(c.today, 9), '17:00'), minCredits: 18, maxCredits: 26, allocationRule: 'cgpa' }, { returning: false });
  const offerDefs = [
    ...extra.map((s, i) => ({ subjectId: s.id, category: i < 2 ? 'open_elective' : 'skill', credits: i < 2 ? 3 : 2, seatCap: i === 1 ? 20 : 45, facultyId: c.teachers[i + 6].id, eligibleProgramIds: ug, eligibleSemesters: [3, 5] })),
    ...[sec3.find((s) => s.prog === 'BCM')!.subjects[3], sec3.find((s) => s.prog === 'BBA')!.subjects[3]].map((s) => ({ subjectId: s.id, category: 'elective', credits: 4, seatCap: 35, facultyId: s.teacherId, eligibleProgramIds: [s.programId], eligibleSemesters: [3] })),
  ];
  const offers = await k.ins<{ id: string; seatCap: number }>('course_offerings', offerDefs.map((o) => ({ termId: c.termId, status: 'open', version: 1, prerequisiteSubjectId: null, slotIds: [], ...o })));
  const regs: Record<string, unknown>[] = [];
  const students = sec3.flatMap((s) => s.students);
  offers.forEach((o, oi) => {
    const pool = students.filter((_, i) => (i + oi) % (oi === 1 ? 3 : 4) === 0);
    pool.forEach((st, i) => {
      const registered = i < o.seatCap;
      regs.push({ offeringId: o.id, studentId: st.id, termId: c.termId, status: registered ? 'registered' : 'waitlisted', preferenceRank: (oi % 3) + 1, waitlistPos: registered ? null : i - o.seatCap + 1, autoCore: false, approval: registered ? (i % 4 === 0 ? 'pending' : 'approved') : null, decidedBy: registered && i % 4 !== 0 ? c.byEmail['hod.commerce'].id : null, decidedAt: registered && i % 4 !== 0 ? at(addDays(c.today, -2)) : null, version: 1 });
    });
  });
  await k.ins('course_registrations', regs, { returning: false });
  void r;
}
