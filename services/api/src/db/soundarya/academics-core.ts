/** Academics desk: module settings, approval requests at every stage, locked marks and lesson plans waiting for the head. */
import type { Ctx } from './ctx.js';
import { addDays, at, J, weekday } from './kit.js';

/** The first Wednesday after `today` (the period picked below is on Wednesdays). */
function nextWednesday(today: string): string {
  let d = addDays(today, 1);
  while (weekday(d) !== 3) d = addDays(d, 1);
  return d;
}

type Step = { key: string; state: string; by?: string; byName?: string; at?: string; note?: string };

export async function academicsCore(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const who = (e: string) => c.byEmail[e];
  const principal = who('principal');
  const hod = who('hod.commerce');
  const accounts = who('accounts');
  const done = (u: { id: string; name: string }, days: number, note?: string): Step => ({ key: '', state: 'done', by: u.id, byName: u.name, at: at(addDays(c.today, -days)).toISOString(), ...(note ? { note } : {}) });

  // Settings: the institution's own series and the Bengaluru City University internal assessment (40 marks).
  await k.ins('academic_settings', [
    { kind: 'numbering', value: J({ admission: { prefix: 'SIMS/ADM/{FY}/', next: 1243, pad: 4, suffix: '' }, roll: { prefix: '', next: 1, pad: 2, suffix: '' }, tc: { prefix: 'SIMS/TC/{FY}/', next: 37, pad: 3, suffix: '' }, request: { prefix: 'SIMS/AR/{FY}/', next: 7, pad: 4, suffix: '' }, rollPerSection: true }), updatedBy: principal.id },
    { kind: 'attendance', value: J({ minPercent: 75, warnPercent: 80, lateCountsAsPresent: true, correctionWindowDays: 7, maxCondonationPoints: 10, notifyGuardianOnAbsence: true }), updatedBy: principal.id },
    {
      kind: 'assessment',
      value: J({
        components: [
          { code: 'IA1', name: 'Internal test 1', weight: 30, maxMarks: 25 },
          { code: 'IA2', name: 'Internal test 2', weight: 30, maxMarks: 25 },
          { code: 'ASG', name: 'Assignment', weight: 20, maxMarks: 10 },
          { code: 'SEM', name: 'Seminar / presentation', weight: 20, maxMarks: 10 },
        ],
        lockBeforePublish: true,
        passPercent: 40,
      }),
      updatedBy: principal.id,
    },
    { kind: 'timetable', value: J({ periodsPerDay: 7, periodMinutes: 55, maxPeriodsPerTeacherPerDay: 5, maxPeriodsPerTeacherPerWeek: 24, changeNeedsApproval: true, substitutionNeedsApproval: true }), updatedBy: principal.id },
    { kind: 'registration', value: J({ minCredits: 20, maxCredits: 28, advisorApproval: true, addDropDays: 14, waitlist: true }), updatedBy: principal.id },
  ]);

  // Published marks were locked by the head first; one verified set waits to be locked.
  await k.q(`update assessments set locked_at = coalesce(published_at, now()) - interval '1 day', locked_by = $2 where tenant_id = $1 and published_at is not null and mark_status in ('verified','moderated')`, [c.tenantId, hod.id]);
  // Lesson plans: reviewed ones are approved; the latest few are waiting for the head.
  await k.q(`update lesson_plans set status = 'approved' where tenant_id = $1 and reviewed_at is not null`, [c.tenantId]);
  await k.q(
    `update lesson_plans set status = 'submitted', submitted_at = now() - interval '1 day' where id in (select id from lesson_plans where tenant_id = $1 and reviewed_at is null order by date desc limit 6)`,
    [c.tenantId],
  );

  // Requests at different stages.
  const bcom = c.sections.filter((s) => s.prog === 'BCM').sort((a, b) => a.term - b.term || a.label.localeCompare(b.label));
  const pair = bcom.find((s) => bcom.some((o) => o.term === s.term && o.id !== s.id));
  const other = pair && bcom.find((o) => o.term === pair.term && o.id !== pair.id);
  const studentsIn = (id: string) => c.students.filter((s) => s.sectionId === id);
  const pick = (id: string, n: number) => studentsIn(id)[n];
  const anyStudents = c.students.slice(40);
  const slot = (await k.q<{ id: string; section: string; subject: string; teacherId: string }>(`select ts.id, s.display_name as section, sb.name as subject, ts.teacher_id from timetable_slots ts join sections s on s.id = ts.section_id join subjects sb on sb.id = ts.subject_id where ts.tenant_id = $1 and ts.archived_at is null and ts.day_of_week = 3 order by ts.starts_at, s.display_name limit 2`, [c.tenantId]));
  const step = (key: string, s: Partial<Step>): Step => ({ key, state: 'upcoming', ...s });
  const reqs: Record<string, unknown>[] = [];
  let n = 1;
  const number = () => `SIMS/AR/2026-27/${String(n++).padStart(4, '0')}`;
  if (pair && other) {
    const a = pick(pair.id, 2);
    const b = pick(pair.id, 5);
    if (a) reqs.push({ number: number(), kind: 'section_change', studentId: a.id, title: `${a.name}: move to ${other.label}`, reason: 'Opted for the Kannada language group taught in the other section', payload: J({ sectionId: other.id }), status: 'pending', steps: J([step('hod', { state: 'current' }), step('principal', {})]), requestedBy: hod.id, createdAt: at(addDays(c.today, -2)) });
    if (b) reqs.push({ number: number(), kind: 'section_change', studentId: b.id, title: `${b.name}: move to ${other.label}`, reason: 'Wants to sit with a friend', payload: J({ sectionId: other.id }), status: 'rejected', steps: J([{ ...done(hod, 6, 'Not an academic reason; class strengths are balanced'), key: 'hod', state: 'rejected' }, step('principal', { state: 'skipped' })]), requestedBy: hod.id, decidedAt: at(addDays(c.today, -6)), createdAt: at(addDays(c.today, -8)) });
  }
  const leaver = anyStudents[3];
  if (leaver) {
    const parent = c.guardianOf.get(leaver.id)?.[0];
    reqs.push({ number: number(), kind: 'withdrawal', studentId: leaver.id, title: `Transfer certificate: ${leaver.name}`, reason: 'Family is moving to Mysuru', payload: J({ outcome: 'transferred', lastDay: addDays(c.today, 10) }), status: 'pending', steps: J([{ ...done(accounts, 1, 'No dues'), key: 'accounts' }, step('library', { state: 'current' }), step('principal', {})]), requestedBy: parent ?? principal.id, createdAt: at(addDays(c.today, -3)) });
  }
  if (slot[0]) reqs.push({ number: number(), kind: 'timetable_change', title: `Timetable change: ${slot[0].section} ${slot[0].subject}`, reason: 'The computer lab is booked for the BCA practical at this hour', payload: J({ slotId: slot[0].id, dayOfWeek: 4 }), status: 'pending', steps: J([{ ...done(hod, 1, 'Fine by the department'), key: 'hod' }, step('principal', { state: 'current' })]), requestedBy: slot[0].teacherId, createdAt: at(addDays(c.today, -2)) });
  if (slot[1]) {
    const sub = c.teachers.find((x) => x.id !== slot[1].teacherId)!;
    reqs.push({ number: number(), kind: 'substitution', title: `Substitute for ${slot[1].section} ${slot[1].subject}`, reason: 'Attending the university Board of Studies meeting', payload: J({ slotId: slot[1].id, date: nextWednesday(c.today), substituteTeacherId: sub.id }), status: 'pending', steps: J([step('principal', { state: 'current' })]), requestedBy: slot[1].teacherId, createdAt: at(addDays(c.today, -1)) });
  }
  const enrolled = await k.q<{ id: string; fullName: string; section: string }>(`select st.id, st.full_name, s.display_name as section from students st join sections s on s.id = st.section_id where st.tenant_id = $1 and st.status = 'enrolled' order by st.full_name limit 1`, [c.tenantId]);
  if (enrolled[0]) reqs.push({ number: number(), kind: 'admission_handover', studentId: enrolled[0].id, title: `Handover of ${enrolled[0].fullName} to ${enrolled[0].section}`, reason: 'Fees paid and documents verified', payload: J({}), status: 'pending', steps: J([step('academic_office', { state: 'current' }), step('class_teacher', {})]), requestedBy: who('admissions').id, createdAt: at(addDays(c.today, -1)) });
  const rows = await k.ins<{ id: string; requestedBy: string; kind: string; status: string; createdAt: Date }>('academic_requests', reqs);
  await k.ins(
    'audit_log',
    rows.map((r) => ({ actorType: 'user', actorId: r.requestedBy, action: 'academics.request_raised', subjectType: 'academic_request', subjectId: r.id, data: J({ kind: r.kind }), at: r.createdAt })),
    { returning: false },
  );
}
