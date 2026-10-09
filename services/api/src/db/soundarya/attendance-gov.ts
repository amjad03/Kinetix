/** Today's attendance, attendance governance samples (correction, condonation), institution profile and buildings. */
import type { Ctx } from './ctx.js';
import { addDays, at, J, weekday } from './kit.js';

interface TodaySlot {
  id: string;
  sectionId: string;
  startsAt: string;
  teacherId: string;
}

export async function attendanceGovernance(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principal = c.byEmail.principal.id;

  // Rules: registers lock 48 hours after the day ends, 75 percent needed.
  await k.q("update tenants set settings = settings || $2::jsonb where id = $1", [c.tenantId, JSON.stringify({ attendanceLockHours: 48, attendanceThresholdPct: 75 })]);

  // Today: every period that has started (India time), with a handful of absentees and late arrivals.
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const nowHm = ist.toISOString().slice(11, 16);
  const today = c.today;
  if (weekday(today) !== 7 && !c.holidays.has(today)) {
    const slots = await k.q<TodaySlot>("select id, section_id, to_char(starts_at, 'HH24:MI') as starts_at, teacher_id from timetable_slots where tenant_id = $1 and day_of_week = $2 and starts_at <= $3::time", [c.tenantId, weekday(today), nowHm]);
    const rows: Record<string, unknown>[] = [];
    for (const sec of c.sections) {
      const secSlots = slots.filter((x) => x.sectionId === sec.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      if (!secSlots.length) continue;
      for (const st of sec.students) {
        const dayAbsent = !r.chance(Math.min(0.97, st.presence + 0.04));
        // Late arrivals miss the first period only.
        const lateArrival = !dayAbsent && r.chance(0.04);
        secSlots.forEach((sl, i) => {
          const status = dayAbsent ? 'absent' : lateArrival && i === 0 ? 'absent' : i === 0 && r.chance(0.02) ? 'late' : 'present';
          rows.push({ studentId: st.id, sectionId: sec.id, date: today, timetableSlotId: sl.id, status, markedBy: sl.teacherId, occurredAt: at(today, sl.startsAt) });
        });
      }
    }
    await k.ins('attendance_records', rows, { returning: false });
  }

  // A pending correction (a teacher says an earlier absence was a late arrival) and one already approved.
  const absences = await k.q<{ id: string; studentId: string; sectionId: string; timetableSlotId: string; date: string; teacherId: string }>(
    `select a.id, a.student_id, a.section_id, a.timetable_slot_id, a.date::text as date, s.teacher_id from attendance_records a join timetable_slots s on s.id = a.timetable_slot_id
     where a.tenant_id = $1 and a.status = 'absent' and a.date <> $2::date order by a.date desc, a.student_id limit 40`,
    [c.tenantId, today],
  );
  const hod = c.byEmail['hod.commerce'].id;
  const [pend, done] = [absences[3], absences[11]];
  if (pend && done) {
    await k.ins('attendance_corrections', [
      { studentId: pend.studentId, sectionId: pend.sectionId, timetableSlotId: pend.timetableSlotId, date: pend.date, fromStatus: 'absent', toStatus: 'late', reason: 'Student reached after the roll call because the college bus broke down. Driver confirmed.', requestedBy: pend.teacherId, status: 'pending' },
      { studentId: done.studentId, sectionId: done.sectionId, timetableSlotId: done.timetableSlotId, date: done.date, fromStatus: 'absent', toStatus: 'present', reason: 'Marked absent by mistake; the student presented the lab record in the same period.', requestedBy: done.teacherId, status: 'approved', decidedBy: hod, decidedAt: at(addDays(c.today, -1), '15:00'), decisionNote: 'Checked with the teacher and the lab register.' },
    ], { returning: false });
    await k.q("update attendance_records set status = 'present', marked_by = $2, occurred_at = $3 where id = $1", [done.id, hod, at(addDays(c.today, -1), '15:00')]);
  }

  // Condonation: the three students with the lowest attendance each have a request in a different state.
  const low = await k.q<{ studentId: string }>(
    `select student_id from attendance_records where tenant_id = $1 and status <> 'excused' group by student_id having count(*) > 20
     order by count(*) filter (where status in ('present','late'))::float / count(*) asc limit 3`,
    [c.tenantId],
  );
  const ref = new Map(c.students.map((s) => [s.id, s]));
  const conds = [
    { kind: 'medical', reason: 'Typhoid with two weeks of bed rest. Medical certificate from the hospital attached.', status: 'pending', approvedPoints: 0, hasDoc: false },
    { kind: 'medical', reason: 'Dengue fever treated at Victoria Hospital for ten days.', status: 'approved', approvedPoints: 8, hasDoc: false, note: 'Certificate verified with the hospital.' },
    { kind: 'other', reason: 'Represented the university at the state athletics meet.', status: 'rejected', approvedPoints: 0, hasDoc: false, note: 'Sports leave is already approved separately and counted.' },
  ];
  await k.ins(
    'attendance_condonations',
    low.slice(0, 3).map(({ studentId }, i) => ({
      studentId,
      kind: conds[i].kind,
      reason: conds[i].reason,
      requestedBy: ref.get(studentId)?.userId ?? principal,
      status: conds[i].status,
      approvedPoints: conds[i].approvedPoints,
      decidedBy: conds[i].status === 'pending' ? null : principal,
      decidedAt: conds[i].status === 'pending' ? null : at(addDays(c.today, -2), '12:00'),
      decisionNote: conds[i].note ?? null,
    })),
    { returning: false },
  );

  // Institution profile and the academic model; an undergraduate college has no early-years module.
  await k.ins(
    'institution_profiles',
    {
      legalName: 'Soundarya Educational Trust (Soundarya Institute of Management and Science)',
      affiliationBody: 'Bangalore University',
      affiliationNo: 'BU/AFF/2004/117',
      aisheCode: 'C-45678',
      naacGrade: 'A',
      establishedYear: 2004,
      addressLine: 'Soundarya Campus, Sidedahalli, Bagalagunte, Hesaraghatta Main Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560073',
      phone: '+91 80 2839 0000',
      email: 'office@soundarya.example',
      website: 'https://soundarya.example',
      academicModel: 'ug',
      boardOrUniversity: 'Bangalore University',
      disabledModules: J(['earlyYears']),
    },
    { returning: false },
  );

  // Buildings: two blocks, rooms spread across the floors.
  const blocks = await k.ins<{ id: string }>('buildings', [
    { campusId: c.campusId, name: 'Main Block', code: 'MB' },
    { campusId: c.campusId, name: 'Management Block', code: 'MGT' },
  ]);
  const floors = await k.ins<{ id: string; buildingId: string }>('building_floors', [
    { buildingId: blocks[0].id, level: 0, label: 'Ground floor' },
    { buildingId: blocks[0].id, level: 1, label: 'First floor' },
    { buildingId: blocks[0].id, level: 2, label: 'Second floor' },
    { buildingId: blocks[1].id, level: 0, label: 'Ground floor' },
    { buildingId: blocks[1].id, level: 1, label: 'First floor' },
  ]);
  // Leave the last two rooms unplaced so the "place a room" step shows in the demo.
  for (const [i, room] of c.rooms.slice(0, -2).entries()) await k.q('update rooms set floor_id = $2 where id = $1', [room.id, floors[i % floors.length].id]);
}
