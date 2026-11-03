/**
 * Attendance pass demo data: the QR geofence and SMS alerts in the office settings, attendance templates in
 * Communication, today's QR scans (accepted, held for review, refused) with bound phones, a face terminal in a
 * classroom with taps for the teacher to confirm, a teacher absent today who needs cover, and a published detention
 * list (plus a draft) that the hall tickets read.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { UserPrincipal } from '../../auth/principal.js';
import { DetentionController } from '../../attendance-desk/detention.controller.js';
import { deviceHashOf } from '../../attendance-governance/qr-guard.js';
import type { Ctx } from './ctx.js';
import { at, J, weekday } from './kit.js';
import { service } from './nest.js';

/** The campus at Sidedahalli, Nagasandra Post (approximate). */
const CAMPUS = { lat: 13.0573, lng: 77.5016 };

export async function attendancePass(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const principalId = c.byEmail.principal.id;
  const as = (id: string, roles: UserPrincipal['roles']): UserPrincipal => ({ kind: 'user', tenantId: c.tenantId, userId: id, roles });

  // 1. Office settings: SMS alongside the apps; QR self-marking checks the phone is on the campus.
  await k.q(
    `update academic_settings set value = value || $2::jsonb where tenant_id = $1 and kind = 'attendance'`,
    [c.tenantId, JSON.stringify({ alertChannels: ['app', 'sms'], qr: { enabled: true, requireLocation: true, ...CAMPUS, radiusM: 300, maxAccuracyM: 120, lateMinutes: 15, bindDevice: true } })],
  );

  // 2. Communication templates for attendance (DLT-registered SMS, and a WhatsApp absence message).
  const tpl = [
    { key: 'attendance_absence', channel: 'sms', body: '{{student}} was absent on {{date}} for {{absent}} of {{held}} periods ({{subjects}}). {{institution}}', dltTemplateId: '1107172600000001' },
    { key: 'attendance_shortage', channel: 'sms', body: 'Attendance alert: {{student}} is at {{pct}}% in {{subject}}; {{threshold}}% is needed to write the examination. {{institution}}', dltTemplateId: '1107172600000002' },
    { key: 'attendance_detention', channel: 'sms', body: '{{student}} is on the detention list "{{list}}" ({{pct}}% against {{threshold}}%). Meet the principal. {{institution}}', dltTemplateId: '1107172600000003' },
    { key: 'attendance_absence', channel: 'whatsapp', body: 'Namaskara. {{student}} was absent on {{date}} for {{absent}} of {{held}} periods. - {{institution}}', dltTemplateId: null },
  ];
  for (const t of tpl) {
    const [have] = await k.q<{ id: string }>('select id from message_templates where tenant_id = $1 and key = $2 and channel = $3', [c.tenantId, t.key, t.channel]);
    if (!have) await k.ins('message_templates', [{ ...t, locale: 'en', subject: 'Attendance', active: t.channel === 'sms' }], { returning: false });
  }
  // Half of the shortage alerts already sent went by SMS too.
  await k.q(`update attendance_alerts set channels = '{app,sms}' where tenant_id = $1 and kind = 'shortage' and (abs(hashtext(id::text)) % 2) = 0`, [c.tenantId]);

  // Marking compliance: about one period in fifteen of the last month was entered the next day.
  await k.q(
    `update attendance_records ar set occurred_at = ar.occurred_at + interval '1 day' from timetable_slots ts
     where ar.tenant_id = $1 and ts.id = ar.timetable_slot_id and ar.date >= $2::date and ar.date < $3::date and abs(hashtext(ts.teacher_id::text || ar.date::text || ts.id::text)) % 15 = 0`,
    [c.tenantId, c.workingDays[Math.max(0, c.workingDays.length - 26)] ?? c.today, c.today],
  );

  // The day the demo shows: today when classes met, else the last working day.
  const [{ n: today }] = await k.q<{ n: number }>('select count(*)::int as n from attendance_records where tenant_id = $1 and date = $2', [c.tenantId, c.today]);
  const day = today > 0 ? c.today : c.workingDays[c.workingDays.length - 1];
  if (!day) return;
  const sec = c.sections.find((s) => s.def.code === 'BCM' && s.term === 3) ?? c.sections[0];
  const roster = c.students.filter((s) => s.sectionId === sec.id).sort((a, b) => a.rollNo.localeCompare(b.rollNo));
  const slots = await k.q<{ id: string; startsAt: string; roomId: string | null; teacherId: string }>(
    `select id, to_char(starts_at, 'HH24:MI') as starts_at, room_id, teacher_id from timetable_slots where tenant_id = $1 and section_id = $2 and day_of_week = $3 and archived_at is null order by starts_at`,
    [c.tenantId, sec.id, weekday(day)],
  );
  if (slots.length < 2 || roster.length < 14) return;

  // 3. QR scans in the first period: eight from their own phones on campus, three held, one refused (a shared phone).
  const [p1, p2] = slots;
  const t0 = new Date(at(day, p1.startsAt)).getTime();
  const near = (i: number) => ({ lat: CAMPUS.lat + ((i % 5) - 2) * 0.0002, lng: CAMPUS.lng + ((i % 3) - 1) * 0.0002 });
  const phone = (i: number) => deviceHashOf(c.tenantId, `soundarya-demo-phone-${roster[i].rollNo}`)!;
  const scans: Record<string, unknown>[] = [];
  const bindings: Record<string, unknown>[] = [];
  for (let i = 0; i < 8; i++) {
    scans.push({ studentId: roster[i].id, timetableSlotId: p1.id, date: day, deviceHash: phone(i), ...near(i), accuracyM: 12 + i, distanceM: 20 + i * 9, outcome: 'accepted', reasons: [], createdAt: new Date(t0 + (2 + i) * 60_000) });
    bindings.push({ studentId: roster[i].id, deviceHash: phone(i), boundAt: new Date(t0 - 30 * 86_400_000) });
  }
  // Held: one from 1.8 km away, one from a new phone, one 22 minutes into the period.
  scans.push({ studentId: roster[8].id, timetableSlotId: p1.id, date: day, deviceHash: phone(8), lat: CAMPUS.lat + 0.0162, lng: CAMPUS.lng, accuracyM: 18, distanceM: 1801, outcome: 'flagged', reasons: ['outside_campus'], createdAt: new Date(t0 + 4 * 60_000) });
  bindings.push({ studentId: roster[8].id, deviceHash: phone(8), boundAt: new Date(t0 - 20 * 86_400_000) });
  scans.push({ studentId: roster[9].id, timetableSlotId: p1.id, date: day, deviceHash: deviceHashOf(c.tenantId, 'soundarya-demo-new-phone'), ...near(9), accuracyM: 25, distanceM: 41, outcome: 'flagged', reasons: ['new_device'], createdAt: new Date(t0 + 6 * 60_000) });
  bindings.push({ studentId: roster[9].id, deviceHash: phone(9), boundAt: new Date(t0 - 40 * 86_400_000) });
  scans.push({ studentId: roster[10].id, timetableSlotId: p1.id, date: day, deviceHash: phone(10), ...near(10), accuracyM: 30, distanceM: 52, outcome: 'flagged', reasons: ['late_scan'], createdAt: new Date(t0 + 22 * 60_000) });
  bindings.push({ studentId: roster[10].id, deviceHash: phone(10), boundAt: new Date(t0 - 25 * 86_400_000) });
  // Refused: roster[11] tried from roster[0]'s phone.
  scans.push({ studentId: roster[11].id, timetableSlotId: p1.id, date: day, deviceHash: phone(0), ...near(0), accuracyM: 14, distanceM: 22, outcome: 'refused', reasons: ['device_used_for_another', 'device_bound_to_another'], createdAt: new Date(t0 + 9 * 60_000) });
  // Yesterday's review: one accepted, one rejected by the teacher.
  const prev = c.workingDays.filter((d) => d < day).pop();
  const prevSlot = prev ? (await k.q<{ id: string; startsAt: string }>(`select id, to_char(starts_at, 'HH24:MI') as starts_at from timetable_slots where tenant_id = $1 and section_id = $2 and day_of_week = $3 and archived_at is null order by starts_at limit 1`, [c.tenantId, sec.id, weekday(prev)]))[0] : undefined;
  if (prev && prevSlot) {
    const pt = new Date(at(prev, prevSlot.startsAt)).getTime();
    scans.push({ studentId: roster[12].id, timetableSlotId: prevSlot.id, date: prev, deviceHash: phone(12), ...near(12), accuracyM: 160, distanceM: 64, outcome: 'flagged', reasons: ['poor_accuracy'], decision: 'accepted', decidedBy: p1.teacherId, decidedAt: new Date(pt + 50 * 60_000), decisionNote: 'Was in the front row', createdAt: new Date(pt + 5 * 60_000) });
    scans.push({ studentId: roster[13].id, timetableSlotId: prevSlot.id, date: prev, deviceHash: phone(13), lat: CAMPUS.lat + 0.03, lng: CAMPUS.lng + 0.01, accuracyM: 9, distanceM: 3480, outcome: 'flagged', reasons: ['outside_campus'], decision: 'rejected', decidedBy: p1.teacherId, decidedAt: new Date(pt + 52 * 60_000), decisionNote: 'Not in class', createdAt: new Date(pt + 7 * 60_000) });
  }
  await k.ins('attendance_qr_scans', scans, { returning: false });
  await k.ins('attendance_device_bindings', bindings, { returning: false });
  // The held students have no mark for that period yet (the teacher decides in QR review).
  await k.q('delete from attendance_records where tenant_id = $1 and timetable_slot_id = $2 and date = $3 and student_id = any($4::uuid[])', [c.tenantId, p1.id, day, [roster[8].id, roster[9].id, roster[10].id]]);

  // 4. A face terminal in the second period's room: taps for most of the class, for the teacher to confirm.
  const room = p2.roomId ?? sec.roomId;
  const key = createHash('sha256').update(randomBytes(24)).digest('hex');
  const [face] = await k.ins<{ id: string }>('access_devices', [{ kind: 'face_terminal', vendor: 'zkteco', serial: `ZK-FACE-${sec.label.replace(/\W+/g, '')}`, name: `${sec.label} classroom face terminal`, purpose: 'attendance', location: sec.label, config: J({ roomId: room, tzOffsetMinutes: 330 }), keyHash: key, createdBy: principalId, lastSeenAt: new Date() }]);
  await k.ins('credential_tags', roster.map((s, i) => ({ kind: 'biometric_pin', value: `F${2500 + i}`, subjectType: 'student', subjectId: s.id })), { returning: false });
  const t2 = new Date(at(day, p2.startsAt)).getTime();
  await k.ins(
    'device_events',
    roster.slice(0, roster.length - 4).map((s, i) => ({ deviceId: face.id, tagKind: 'biometric_pin', tagValue: `F${2500 + i}`, eventAt: new Date(t2 - 4 * 60_000 + i * 17_000), direction: 'in', outcome: 'period_tap', detail: J({ date: day, slotId: p2.id, verify: i % 9 === 0 ? 'card' : 'face' }), subjectType: 'student', subjectId: s.id })),
    { returning: false },
  );

  // 5. A teacher reported absent today without leave: their periods show under "needs cover".
  const absentee = c.byEmail['sudhir.kamath']?.id;
  if (absentee) {
    await k.q('delete from staff_attendance where tenant_id = $1 and user_id = $2 and date = $3', [c.tenantId, absentee, c.today]);
    await k.ins('staff_attendance', [{ userId: absentee, date: c.today, status: 'absent', source: 'manual', markedBy: c.byEmail.hr?.id ?? principalId }], { returning: false });
  }

  // 6. Detention lists: the BCom list published by the principal (hall tickets read it), a BBA draft waiting.
  const detention = await service(DetentionController);
  const principal = as(principalId, ['principal']);
  const exam = c.byEmail.controller ? as(c.byEmail.controller.id, ['exam_controller']) : principal;
  const bcom = c.programs.BCM?.id;
  const bba = c.programs.BBA?.id;
  if (bcom) {
    const list = await detention.prepare(exam, { programId: bcom });
    await detention.publish(principal, list.id);
  }
  if (bba) await detention.prepare(exam, { programId: bba, term: 1 });
}
