/** Grade scale, assessment schemes and published model-examination results (BCom, BBA and BCA Sem 3). */
import { ExamsService } from '../../exams/exams.service.js';
import { GRADE_SCALE_PRESETS, SCHEME_PRESETS } from '../../exams/grading.js';
import type { Ctx, SectionRef } from './ctx.js';
import { addDays, at, J } from './kit.js';
import { service, withTenant } from './nest.js';
import { EXAM_SECTIONS } from './academics.js';

export interface ExamCtx {
  sessions: { id: string; sec: SectionRef; paperIds: Record<string, string>; assessmentIds: Record<string, string[]> }[];
  gradeScaleId: string;
}
export const examState: Partial<ExamCtx> = {};

export async function exams(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const scale = await k.one<{ id: string }>('grade_scales', { name: GRADE_SCALE_PRESETS['bu-nep'].name, rules: J({ bands: GRADE_SCALE_PRESETS['bu-nep'].bands, pointsMode: 'percentOver10', decimals: 2 }), isDefault: true });
  const preset = SCHEME_PRESETS['bu-nep'];
  const hod = c.byEmail['hod.commerce'].id;
  const sessions: ExamCtx['sessions'] = [];
  const hall = c.rooms.find((x) => x.name === 'Examination Hall')!;
  const seminar = c.rooms.find((x) => x.name === 'Seminar Hall')!;

  for (const sec of c.sections.filter((s) => EXAM_SECTIONS.has(`${s.prog}:${s.term}`))) {
    const session = await k.one<{ id: string }>('exam_sessions', {
      academicYearId: c.years.cur, programId: sec.programId, term: sec.term, name: `${sec.def.name} Semester ${sec.term}: Model Examination, September 2026`, kind: 'regular',
      startsOn: '2026-09-28', endsOn: '2026-10-05', status: 'scheduled', createdBy: hod,
    });
    const paperIds: Record<string, string> = {};
    const assessmentIds: Record<string, string[]> = {};
    const seats: Record<string, unknown>[] = [];
    let day = 0;
    for (const sub of sec.subjects) {
      const scheme = await k.one<{ id: string }>('assessment_schemes', { subjectId: sub.id, academicYearId: c.years.cur, name: preset.name, credits: sub.credits, passRules: J(preset.pass), gradeScaleId: scale.id, createdBy: hod });
      const comps = await k.ins<{ id: string; code: string }>('scheme_components', preset.components.map((p, ord) => ({ schemeId: scheme.id, code: p.code, name: p.name, kind: p.kind, weight: p.weight, ord })));
      const spec: Record<string, { title: string; kind: string; max: number; date: string }> = {
        'IA-T': { title: `Internal test: ${sub.name}`, kind: 'test', max: 20, date: '2026-09-22' },
        'IA-A': { title: `Seminar / assignment: ${sub.name}`, kind: 'assignment', max: 10, date: '2026-09-10' },
        'IA-P': { title: `Attendance and participation: ${sub.name}`, kind: 'internal', max: 10, date: '2026-09-25' },
        SEE: { title: `Model semester exam: ${sub.name}`, kind: 'exam', max: 60, date: addDays('2026-09-28', Math.min(day, 6)) },
      };
      const asm = await k.ins<{ id: string; componentId: string }>(
        'assessments',
        comps.map((cm) => ({ sectionId: sec.id, subjectId: sub.id, title: spec[cm.code].title, kind: spec[cm.code].kind, maxMarks: spec[cm.code].max, heldOn: spec[cm.code].date, publishedAt: at('2026-10-07'), createdBy: sub.teacherId, componentId: cm.id, markStatus: 'verified', submittedAt: at('2026-10-06'), verifiedBy: hod, verifiedAt: at('2026-10-06', '15:00') })),
      );
      assessmentIds[sub.id] = asm.map((a) => a.id);
      const marks: Record<string, unknown>[] = [];
      sec.students.forEach((st, si) => {
        for (const [i, a] of asm.entries()) {
          const max = spec[comps[i].code].max;
          const struggling = comps[i].code === 'SEE' && ((si * 7 + sub.credits + day) % 17 === 0 || (st.ability < 0.4 && r.chance(0.5)));
          const pct = struggling ? r.int(18, 36) / 100 * 1 : Math.min(0.98, Math.max(0.3, r.gauss(st.ability * 0.8 + 0.18, 0.08)));
          marks.push({ assessmentId: a.id, studentId: st.id, marks: Math.round(pct * max * 2) / 2, absent: false });
        }
      });
      await k.ins('marks', marks, { returning: false });
      const paper = await k.one<{ id: string }>('exam_papers', { sessionId: session.id, subjectId: sub.id, sectionId: sec.id, examDate: addDays('2026-09-28', Math.min(day, 6)), startsAt: '10:00', endsAt: '13:00', maxMarks: 60, assessmentId: asm.find((a) => a.componentId === comps.find((x) => x.code === 'SEE')!.id)!.id });
      paperIds[sub.id] = paper.id;
      sec.students.forEach((st, i) => seats.push({ paperId: paper.id, studentId: st.id, roomId: sec.students.length > 25 ? hall.id : seminar.id, seatNo: i + 1 }));
      day++;
    }
    await k.ins('exam_seats', seats, { returning: false });
    await k.ins('hall_tickets', sec.students.map((st, i) => ({ sessionId: session.id, studentId: st.id, ticketNo: `SIMS/${sec.prog}${sec.term}/${String(i + 1).padStart(3, '0')}`, blocked: false })), { returning: false });
    await k.ins('exam_result_rules', { sessionId: session.id, graceMaxPerSubject: 3, graceMaxTotal: 6, progressionMinCredits: 14, progressionMaxBacklogs: 2 }, { noTenant: false, returning: false });
    sessions.push({ id: session.id, sec, paperIds, assessmentIds });
  }

  // Process through the module so the results, grades and credit points are its own figures, then publish.
  const svc = await service(ExamsService);
  for (const s of sessions) {
    await withTenant(c.tenantId, async (tx) => {
      const row = await svc.session(tx, s.id);
      const results = await svc.compute(tx, row, undefined);
      await svc.store(tx, c.tenantId, row, results);
    });
    await k.q("update exam_sessions set status = 'published', processed_at = $2, published_at = $3 where id = $1", [s.id, at('2026-10-06'), at('2026-10-08', '11:00')]);
  }
  Object.assign(examState, { sessions, gradeScaleId: scale.id });

  // Grace marks, revaluation requests, and a supplementary session for those who failed.
  const principal = c.byEmail.principal.id;
  const bcm = sessions.find((s) => s.sec.prog === 'BCM')!;
  const failed = await k.q<{ studentId: string; subjectId: string }>(
    `select r.student_id, l.subject_id from exam_result_lines l join exam_results r on r.id = l.result_id where r.session_id = $1 and l.passed = false order by r.student_id limit 12`,
    [bcm.id],
  );
  if (failed.length) {
    await k.ins('revaluation_requests', failed.slice(0, 4).map((f, i) => ({ sessionId: bcm.id, studentId: f.studentId, subjectId: f.subjectId, status: ['requested', 'requested', 'accepted', 'rejected'][i], reason: 'I expect more marks in the answer on theory of the unit. Please recheck.', previousPercent: 33 + i, newPercent: i === 2 ? 41 : null, decisionNote: i === 3 ? 'No change after revaluation.' : i === 2 ? 'Totalling error corrected.' : null, requestedBy: f.studentId ? c.byEmail.principal.id : principal, decidedBy: i >= 2 ? hod : null, decidedAt: i >= 2 ? at('2026-10-09', '10:00') : null })), { returning: false });
    const supp = await k.one<{ id: string }>('exam_sessions', { academicYearId: c.years.cur, programId: bcm.sec.programId, term: 3, name: 'BCom Semester 3: Supplementary Examination, January 2027', kind: 'supplementary', startsOn: '2027-01-18', endsOn: '2027-01-25', status: 'draft', createdBy: hod });
    await k.ins('supplementary_registrations', failed.slice(0, 8).map((f) => ({ sessionId: supp.id, studentId: f.studentId, subjectId: f.subjectId, failedInSessionId: bcm.id, registeredBy: principal })), { returning: false });
  }
}
