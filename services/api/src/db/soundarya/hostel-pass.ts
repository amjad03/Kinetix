/**
 * Hostel pass: the two hostels (boys and girls) over the blocks the campus stage made, room types with amenities,
 * a block-scoped warden for the girls' hostel, staff and the night duty roster, applications scored by distance,
 * merit and category, room change and vacate requests, caution deposits and a vacate settlement, the gate log with
 * QR scans and late entries, sick bay visits (one emergency), discipline, room assets, the anti-ragging committee,
 * squad and undertakings, the mess committee's inspections, a diet system plan with the month's spending and bills,
 * mess leave, and hostel and mess fee invoices (some overdue, for the defaulters report).
 */
import type { Ctx } from './ctx.js';
import { DOMAIN } from './data.js';
import { addDays, at, J, rupees } from './kit.js';

type Res = { allotmentId: string; studentId: string; bedId: string; roomId: string; blockId: string; gender: string; sectionId: string; userId: string | null; name: string; rollNo: string; term: number };

export async function hostelPass(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const T = c.tenantId;
  const warden = c.byEmail.warden.id;
  const canteen = c.byEmail.canteen.id;
  const month = c.today.slice(0, 7);
  const lastMonth = addDays(`${month}-01`, -1).slice(0, 7);
  const year = c.today.slice(5, 7) >= '06' ? Number(c.today.slice(0, 4)) : Number(c.today.slice(0, 4)) - 1;
  const yearLabel = `${year}-${String((year + 1) % 100).padStart(2, '0')}`;

  // ---- hostels, blocks, room types --------------------------------------------------------------------------------
  const [boysH, girlsH] = await k.ins<{ id: string }>('hostels', [
    { name: 'Vidyaranya Boys’ Hostel', code: 'VBH', gender: 'boys', address: 'Soundarya Nagar, behind the main block', wardenUserId: warden, phone: '+91 80 2839 4411', sortOrder: 1 },
    { name: 'Sharada Girls’ Hostel', code: 'SGH', gender: 'girls', address: 'Soundarya Nagar, opposite the library', phone: '+91 80 2839 4412', sortOrder: 2 },
  ]);
  const blocks = await k.q<{ id: string; gender: string; name: string }>('select id, gender, name from hostel_blocks where tenant_id = $1 order by name', [T]);
  for (const b of blocks) await k.q('update hostel_blocks set hostel_id = $2 where id = $1', [b.id, b.gender === 'girls' ? girlsH.id : boysH.id]);
  // A second boys' block for first years: four four-sharing rooms, still filling.
  const [tunga] = await k.ins<{ id: string }>('hostel_blocks', [{ name: 'Tunga Block (Boys, first year)', gender: 'boys', hostelId: boysH.id, allowedTerms: '{1,2}' }]);
  const types = await k.ins<{ id: string; name: string }>('hostel_room_types', [
    { name: 'Three-sharing', bedsPerRoom: 3, feePaise: rupees(6500), description: 'Common bathroom on each floor', amenities: '{Wi-Fi,Study table,Wardrobe,Ceiling fan}', sortOrder: 1 },
    { name: 'Three-sharing with attached bath', bedsPerRoom: 3, attachedBath: true, feePaise: rupees(8000), description: 'Attached bathroom with a geyser', amenities: '{Wi-Fi,Study table,Wardrobe,Geyser,Attached bathroom}', sortOrder: 2 },
    { name: 'Four-sharing (first year)', bedsPerRoom: 4, feePaise: rupees(5500), description: 'Bunk beds, common bathroom', amenities: '{Wi-Fi,Study table,Locker}', sortOrder: 3 },
  ]);
  await k.q('update hostel_rooms set room_type_id = $2 where tenant_id = $1 and monthly_fee_paise = $3', [T, types[0].id, rupees(6500)]);
  await k.q('update hostel_rooms set room_type_id = $2 where tenant_id = $1 and monthly_fee_paise = $3', [T, types[1].id, rupees(8000)]);
  await k.q("update hostel_rooms set amenities = '{Balcony}' where tenant_id = $1 and floor = 2", [T]);
  const tRooms = await k.ins<{ id: string }>('hostel_rooms', [1, 2, 3, 4].map((n) => ({ blockId: tunga.id, number: `T-${100 + n}`, floor: 1, monthlyFeePaise: rupees(5500), roomTypeId: types[2].id })));
  await k.ins('hostel_beds', tRooms.flatMap((rm) => ['A', 'B', 'C', 'D'].map((label) => ({ roomId: rm.id, label }))), { returning: false });
  // One room is closed for repainting.
  await k.q("update hostel_rooms set status = 'maintenance' where id = $1", [tRooms[3].id]);

  // ---- the demo student and their mother: a resident of the boys' hostel ------------------------------------------
  const vignesh = c.students.find((s) => s.rollNo === '25BCA001');
  const already = vignesh && (await k.q('select 1 from hostel_allotments where tenant_id = $1 and student_id = $2 and vacated_on is null', [T, vignesh.id])).length;
  if (vignesh && !already) {
    const [bed] = await k.q<{ id: string }>(`select b.id from hostel_beds b join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id
      where k.tenant_id = $1 and k.gender = 'boys' and k.id <> $2 and not exists (select 1 from hostel_allotments a where a.bed_id = b.id and a.vacated_on is null) order by r.number, b.label limit 1`, [T, tunga.id]);
    if (bed) {
      await k.ins('hostel_allotments', { studentId: vignesh.id, bedId: bed.id, startsOn: '2026-08-01', createdBy: warden }, { returning: false });
      const [plan] = await k.q<{ id: string }>('select id from mess_plans where tenant_id = $1 order by monthly_fee_paise desc limit 1', [T]);
      await k.ins('mess_subscriptions', { studentId: vignesh.id, planId: plan.id, startsOn: '2026-08-01' }, { returning: false });
    }
  }

  const residents = await k.q<Res>(
    `select a.id as allotment_id, a.student_id, a.bed_id, b.room_id, r.block_id, k.gender, s.section_id, s.user_id, s.full_name as name, s.roll_no, coalesce(sec.term, 1) as term
     from hostel_allotments a join hostel_beds b on b.id = a.bed_id join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id
     join students s on s.id = a.student_id left join sections sec on sec.id = s.section_id
     where a.tenant_id = $1 and a.vacated_on is null order by k.name, r.number, b.label`,
    [T],
  );
  const girls = residents.filter((x) => x.gender === 'girls');
  const boys = residents.filter((x) => x.gender !== 'girls');
  const sharada = blocks.find((b) => b.gender === 'girls')!;

  // ---- staff: the chief warden, a girls' hostel warden limited to Sharada Block, resident tutors, the duty roster --
  const [gw] = await k.ins<{ id: string }>('users', [{ fullName: 'Lakshmi Devaraj', email: `warden.girls@${DOMAIN}`, phone: '+919845012377', passwordHash: c.hash, status: 'active' }]);
  await k.ins('user_roles', [{ userId: gw.id, role: 'hostel_warden', campusId: c.campusId }], { returning: false });
  const tutors = c.teachers.slice(10, 12);
  await k.ins('hostel_staff', [
    // The chief warden's assignment names no block: both hostels in full.
    { hostelId: boysH.id, userId: warden, role: 'warden', fromOn: '2026-06-01', phone: '+919845012300' },
    { hostelId: girlsH.id, userId: warden, role: 'warden', fromOn: '2026-06-01', phone: '+919845012300' },
    { hostelId: girlsH.id, userId: gw.id, role: 'warden', fromOn: '2026-07-15', phone: '+919845012377', blockIds: `{${sharada.id}}` },
    ...tutors.map((t, i) => ({ hostelId: i ? girlsH.id : boysH.id, userId: t.id, role: 'resident_tutor', fromOn: '2026-08-01', untilOn: '2027-05-31', phone: `+9198450124${10 + i}` })),
  ], { returning: false });
  const duties: Record<string, unknown>[] = [];
  for (let d = -6; d <= 7; d++) {
    const day = addDays(c.today, d);
    duties.push({ hostelId: boysH.id, userId: d % 2 ? warden : tutors[0].id, dutyOn: day, shift: 'night', status: d < 0 ? (d === -3 ? 'missed' : 'done') : 'scheduled' });
    duties.push({ hostelId: girlsH.id, userId: d % 2 ? gw.id : tutors[1].id, dutyOn: day, shift: 'night', status: d < 0 ? 'done' : 'scheduled' });
  }
  await k.ins('hostel_duties', duties, { returning: false });

  // ---- applications for next intake: scored by distance, merit, year and category ---------------------------------
  const resIds = new Set(residents.map((x) => x.studentId));
  const applicants = c.students.filter((s) => !resIds.has(s.id) && s.term <= 2).slice(0, 14);
  const cats = ['general', 'obc', 'general', 'sc', 'general', 'ews', 'general', 'st', 'pwd', 'general', 'obc', 'general', 'sports', 'general'];
  const points: Record<string, number> = { sc: 20, st: 20, obc: 10, ews: 10, pwd: 25 };
  await k.ins('hostel_applications', applicants.map((s, i) => {
    const distance = [212, 38, 96, 340, 54, 410, 18, 260, 120, 75, 180, 22, 305, 140][i];
    const merit = [82.5, 91, 68.4, 74.2, 88.8, 59.5, 95.1, 71, 66.6, 79.3, 84, 90.2, 62.7, 77.7][i];
    const priority = Math.round((Math.min(distance, 1000) / 10 + merit + Math.max(s.term, 1) * 10 + (points[cats[i]] ?? 0)) * 100) / 100;
    const status = i < 9 ? 'applied' : i < 12 ? 'waitlisted' : 'rejected';
    return { number: `HA-${yearLabel.slice(0, 4)}-${String(i + 1).padStart(4, '0')}`, studentId: s.id, hostelId: s.female ? girlsH.id : boysH.id, roomTypeId: s.term <= 1 && !s.female ? types[2].id : types[0].id, gender: s.female ? 'female' : 'male', distanceKm: distance, meritScore: merit, category: cats[i], needs: i === 8 ? 'Ground-floor room (uses crutches)' : '', status, priority, decisionNote: status === 'rejected' ? 'Home is within 25 km; day scholar' : '', decidedBy: status === 'rejected' ? warden : null, decidedAt: status === 'rejected' ? at(addDays(c.today, -4)) : null, createdBy: s.userId ?? warden };
  }), { returning: false });

  // ---- requests, bed holds ----------------------------------------------------------------------------------------
  const freeBed = async (blockId: string) => (await k.q<{ id: string }>('select b.id from hostel_beds b join hostel_rooms r on r.id = b.room_id where r.block_id = $1 and r.status = $2 and not exists (select 1 from hostel_allotments a where a.bed_id = b.id and a.vacated_on is null) order by r.number desc, b.label limit 1', [blockId, 'available']))[0]?.id ?? null;
  await k.ins('hostel_requests', [
    { studentId: boys[3].studentId, kind: 'change', roomTypeId: types[1].id, bedId: await freeBed(boys[3].blockId), reason: 'Would like a room with an attached bathroom; parents agreed to the higher fee', effectiveOn: addDays(c.today, 5), createdBy: boys[3].userId ?? warden },
    { studentId: girls[2].studentId, kind: 'vacate', reason: 'Moving in with my aunt in Rajajinagar from next month', effectiveOn: addDays(c.today, 20), createdBy: girls[2].userId ?? warden },
    { studentId: boys[6].studentId, kind: 'change', reason: 'Roommate keeps late hours before exams', effectiveOn: addDays(c.today, -10), status: 'approved', decidedBy: warden, decidedAt: at(addDays(c.today, -11)), decisionNote: 'Moved within the floor' },
  ], { returning: false });
  const internBed = boys[9];
  await k.ins('hostel_bed_holds', [
    { bedId: internBed.bedId, studentId: internBed.studentId, reason: 'internship', fromOn: addDays(c.today, -12), untilOn: addDays(c.today, 48), note: 'Internship at Infosys, Mysuru campus' },
    { bedId: (await freeBed(tunga.id))!, reason: 'reservation', fromOn: c.today, untilOn: addDays(c.today, 14), note: 'Held for a lateral-entry admission' },
  ], { returning: false });

  // ---- caution deposits, a vacate and its settlement on the fee account -------------------------------------------
  await k.ins('hostel_deposits', residents.map((x, i) => ({ studentId: x.studentId, allotmentId: x.allotmentId, amountPaise: rupees(5000), collectedOn: '2026-08-01', mode: ['upi', 'cash', 'bank_transfer'][i % 3], receiptNo: `HD/2026/${String(i + 1).padStart(4, '0')}`, createdBy: warden })), { returning: false });
  // A student who left mid-month: unused fee and the deposit back, less a broken chair and the unpaid mess bill.
  const leaver = girls[girls.length - 1];
  const vacatedOn = addDays(c.today, -9);
  const dim = new Date(Date.UTC(Number(vacatedOn.slice(0, 4)), Number(vacatedOn.slice(5, 7)), 0)).getUTCDate();
  const used = Number(vacatedOn.slice(8, 10));
  const fee = rupees(6500);
  const prorata = Math.floor((fee * (dim - used)) / dim);
  const damages = rupees(1200);
  const dues = rupees(1850);
  const net = prorata + rupees(5000) - damages - dues;
  await k.q("update hostel_allotments set vacated_on = $2, vacate_reason = 'Family moved to Bengaluru; day scholar now' where id = $1", [leaver.allotmentId, vacatedOn]);
  await k.q("update hostel_deposits set status = 'refunded', damages_paise = $2, refunded_paise = $3, refunded_on = $4, note = 'Broken study chair' where allotment_id = $1", [leaver.allotmentId, damages, rupees(5000) - damages, vacatedOn]);
  const [credit] = await k.ins<{ id: string }>('student_credits', [{ studentId: leaver.studentId, amountPaise: net, kind: 'adjustment', note: `Hostel vacate settlement ${vacatedOn}`, createdBy: warden }]);
  await k.ins('hostel_settlements', [{ allotmentId: leaver.allotmentId, studentId: leaver.studentId, vacatedOn, monthlyFeePaise: fee, daysUsed: used, daysInMonth: dim, prorataRefundPaise: prorata, depositPaise: rupees(5000), damagesPaise: damages, duesPaise: dues, netRefundPaise: net, status: 'pending', ledgerPostedAt: at(addDays(vacatedOn, 1)), ledgerRef: `credit:${credit.id}`, createdBy: warden }], { returning: false });
  const stay = residents.filter((x) => x.allotmentId !== leaver.allotmentId);

  // ---- gate passes awaiting the family and the warden, the QR gate log, late entries -----------------------------
  await k.q("update module_settings set settings = jsonb_set(settings, '{rules}', (settings->'rules') || $2::jsonb) where tenant_id = $1 and module = 'hostel'", [T, JSON.stringify({ outpassNeedsParentApproval: true, lateEntryAlertParents: true, lateEntryEscalateAfter: 3, allotCategoryPoints: 'sc:20, st:20, obc:10, ews:10, pwd:25', allotNeedsUndertaking: false, cautionDepositPaise: rupees(5000) })]);
  const vRes = stay.find((x) => x.rollNo === '25BCA001');
  const passRows = [
    ...(vRes ? [{ studentId: vRes.studentId, reason: 'Cousin’s wedding in Shivamogga', destination: 'Shivamogga', expectedBackAt: at(addDays(c.today, 3), '19:00'), status: 'parent_pending', parentStatus: 'pending' }] : []),
    { studentId: stay[14].studentId, reason: 'Weekend at home', destination: 'Hassan', expectedBackAt: at(addDays(c.today, 2), '18:00'), status: 'requested', parentStatus: 'approved', parentDecidedAt: at(addDays(c.today, -1), '20:10') },
    { studentId: stay[15].studentId, reason: 'Dental appointment', destination: 'Rajajinagar', expectedBackAt: at(addDays(c.today, 1), '17:00'), status: 'requested', parentStatus: 'approved', parentDecidedAt: at(c.today, '08:30') },
  ];
  await k.ins('hostel_gate_passes', passRows.map((p) => ({ ...p, issuedBy: warden })), { returning: false });
  // Tokens for the residents' gate QRs.
  for (const x of stay) await k.q('update hostel_allotments set gate_token = $2 where id = $1', [x.allotmentId, `seed${x.allotmentId.replace(/-/g, '').slice(0, 20)}`]);
  // Seven days of moves: local outings in the evening, a few late returns, and three residents out right now.
  const logs: Record<string, unknown>[] = [];
  const late: { studentId: string; at: Date; minutes: number; reason: string }[] = [];
  for (let d = 7; d >= 1; d--) {
    const day = addDays(c.today, -d);
    for (const [i, x] of stay.entries()) {
      if ((i + d) % 4 !== 0) continue;
      const outAt = at(day, `${17 + (i % 2)}:${String((i * 7) % 60).padStart(2, '0')}`);
      const lateMin = i % 7 === 3 ? 15 + ((i * 11 + d) % 50) : 0;
      const inAt = lateMin ? new Date(at(day, '20:30').getTime() + lateMin * 60_000) : at(day, `${19 + (i % 2)}:${String((i * 5) % 50).padStart(2, '0')}`);
      logs.push({ studentId: x.studentId, direction: 'out', at: outAt, method: i % 9 === 0 ? 'manual' : 'qr', gate: 'Main gate', note: i % 9 === 0 ? 'Phone battery flat' : '', recordedBy: warden, createdAt: outAt });
      logs.push({ studentId: x.studentId, direction: 'in', at: inAt, method: 'qr', gate: 'Main gate', minutesLate: lateMin, recordedBy: warden, createdAt: inAt });
      if (lateMin) late.push({ studentId: x.studentId, at: inAt, minutes: lateMin, reason: ['Bus was late from Majestic', 'Stayed back at the library', 'Traffic at Yeshwanthpur'][i % 3] });
    }
  }
  for (const x of stay.slice(20, 23)) logs.push({ studentId: x.studentId, direction: 'out', at: at(addDays(c.today, -1), '16:45'), method: 'qr', gate: 'Main gate', recordedBy: warden, createdAt: at(addDays(c.today, -1), '16:45') });
  // The repeat late-comer (escalated on the third).
  const repeat = stay[4];
  for (const n of [6, 4, 2]) {
    const inAt = at(addDays(c.today, -n), '21:25');
    late.push({ studentId: repeat.studentId, at: inAt, minutes: 55, reason: 'Was at a friend’s place' });
    logs.push({ studentId: repeat.studentId, direction: 'out', at: at(addDays(c.today, -n), '18:00'), method: 'qr', gate: 'Main gate', recordedBy: warden, createdAt: at(addDays(c.today, -n), '18:00') });
    logs.push({ studentId: repeat.studentId, direction: 'in', at: inAt, method: 'qr', gate: 'Main gate', minutesLate: 55, recordedBy: warden, createdAt: inAt });
  }
  const lateRows = await k.ins<{ id: string; studentId: string; enteredAt: Date }>('hostel_late_entries', late.map((l, i) => ({ studentId: l.studentId, enteredAt: l.at, minutesLate: l.minutes, reason: l.reason, escalated: l.studentId === repeat.studentId && i === late.length - 1, recordedBy: warden })));
  for (const lg of logs) {
    if (!lg.minutesLate) continue;
    const m = lateRows.find((l) => l.studentId === lg.studentId && new Date(l.enteredAt).getTime() === (lg.at as Date).getTime());
    if (m) lg.lateEntryId = m.id;
  }
  await k.ins('hostel_gate_logs', logs, { returning: false });

  // ---- sick bay (one emergency taken to hospital), discipline -----------------------------------------------------
  await k.ins('hostel_sickbay', [
    { studentId: stay[2].studentId, admittedAt: at(addDays(c.today, -5), '07:40'), dischargedAt: at(addDays(c.today, -4), '10:00'), symptoms: 'Fever 101°F and body ache', treatment: 'Paracetamol, rest, fluids', parentAlerted: true, severity: 'routine', recordedBy: warden },
    { studentId: stay[11].studentId, admittedAt: at(addDays(c.today, -2), '23:15'), dischargedAt: at(addDays(c.today, -1), '14:30'), symptoms: 'Severe abdominal pain and vomiting', treatment: 'First aid; ambulance called', referredTo: 'Sapthagiri Hospital, Chikkasandra', escort: 'Ramesh Poojary (warden)', hospitalAt: at(addDays(c.today, -2), '23:50'), outcome: 'Acute gastritis; treated and discharged the next afternoon', parentAlerted: true, severity: 'emergency', recordedBy: warden },
    { studentId: girls[5].studentId, admittedAt: at(c.today, '08:10'), symptoms: 'Migraine', treatment: 'Rest in a dark room', parentAlerted: true, severity: 'urgent', recordedBy: gw.id },
  ], { returning: false });
  await k.ins('hostel_incidents', [
    { studentId: repeat.studentId, occurredOn: addDays(c.today, -2), kind: 'late_entry', description: 'Third late entry in a week', actionTaken: 'Warned; parents called', finePaise: rupees(200), status: 'open', recordedBy: warden },
    { studentId: stay[7].studentId, occurredOn: addDays(c.today, -15), kind: 'misconduct', description: 'Loud music in the room after 11 pm', actionTaken: 'Speaker confiscated for a week', status: 'closed', recordedBy: warden },
  ], { returning: false });

  // ---- room assets, one damage charged to the room through the fees -----------------------------------------------
  const roomIds = [...new Set(stay.map((x) => x.roomId))];
  const assetRows = roomIds.slice(0, 12).flatMap((roomId, i) => [
    { roomId, name: 'Cot with mattress', quantity: 3, condition: 'good', checkedOn: '2026-08-01' },
    { roomId, name: 'Study table and chair', quantity: 3, condition: i === 3 ? 'damaged' : 'good', checkedOn: i === 3 ? addDays(c.today, -6) : '2026-08-01', note: i === 3 ? 'One chair leg broken' : '' },
    { roomId, name: 'Ceiling fan', quantity: 1, condition: i === 5 ? 'repair' : 'good', checkedOn: '2026-08-01' },
  ]);
  await k.ins('hostel_room_assets', assetRows, { returning: false });

  // ---- anti-ragging committee and squad, the mess committee, undertakings -----------------------------------------
  const [arc] = await k.q<{ id: string }>("select id from committees where tenant_id = $1 and name = 'Anti-Ragging Committee'", [T]);
  const newComms = await k.ins<{ id: string; name: string }>('committees', [
    { name: 'Anti-Ragging Squad', statutory: true, description: 'Surprise checks of the hostels at night, as the UGC regulations ask' },
    { name: 'Hostel Mess Committee', statutory: false, description: 'Students and staff who check the food and the kitchen' },
  ]);
  const hc = [
    ...(arc ? [{ committeeId: arc.id, purpose: 'anti_ragging', constitutedOn: '2026-07-20', validUntil: '2027-07-19', helpline: '+91 80 2839 4400' }] : []),
    { committeeId: newComms[0].id, purpose: 'anti_ragging_squad', constitutedOn: '2026-07-20', validUntil: '2027-07-19', helpline: '+91 98450 12300' },
    { committeeId: newComms[1].id, hostelId: null, purpose: 'mess', constitutedOn: '2026-08-10', validUntil: '2027-05-31', helpline: '' },
  ];
  await k.ins('hostel_committees', hc, { returning: false });
  const studentMembers = stay.filter((x) => x.userId).slice(0, 3);
  await k.ins('committee_members', [
    { committeeId: newComms[0].id, userId: warden, role: 'chair', tenureStart: '2026-07-20', tenureEnd: '2027-07-19' },
    { committeeId: newComms[0].id, userId: tutors[0].id, role: 'member', tenureStart: '2026-07-20', tenureEnd: '2027-07-19' },
    { committeeId: newComms[0].id, userId: gw.id, role: 'member', tenureStart: '2026-07-20', tenureEnd: '2027-07-19' },
    { committeeId: newComms[1].id, userId: warden, role: 'chair', tenureStart: '2026-08-10', tenureEnd: '2027-05-31' },
    { committeeId: newComms[1].id, userId: canteen, role: 'secretary', tenureStart: '2026-08-10', tenureEnd: '2027-05-31' },
    ...studentMembers.map((x) => ({ committeeId: newComms[1].id, userId: x.userId!, role: 'member', tenureStart: '2026-08-10', tenureEnd: '2027-05-31' })),
  ], { returning: false });
  await k.ins('committee_meetings', [
    { committeeId: newComms[0].id, title: 'Squad: first-year orientation week checks', meetingOn: '2026-08-12', agenda: 'Night rounds in all blocks during orientation week.', minutes: 'Rounds done on five nights. No incident found.', status: 'held', createdBy: warden },
    { committeeId: newComms[1].id, title: 'Mess committee: monthly review', meetingOn: addDays(c.today, -12), agenda: 'Menu, quality complaints, the diet rate.', minutes: 'Add a fruit on Sundays. Rice quality to be checked with the supplier.', status: 'held', createdBy: warden },
  ], { returning: false });
  await k.ins('antiragging_undertakings', stay.map((x, i) => ({ studentId: x.studentId, yearLabel, studentRef: i % 9 === 4 ? '' : `ARU${yearLabel.slice(2, 4)}${String(400000 + i * 37)}`, parentRef: i % 9 === 4 ? '' : `ARP${yearLabel.slice(2, 4)}${String(500000 + i * 41)}`, submittedOn: i % 9 === 4 ? null : '2026-08-02', status: i % 9 === 4 ? 'pending' : i % 5 === 0 ? 'received' : 'verified', verifiedBy: i % 9 === 4 || i % 5 === 0 ? null : warden, verifiedAt: i % 9 === 4 || i % 5 === 0 ? null : at('2026-08-05') })), { returning: false });

  // ---- mess: the committee's inspections, a diet system plan and its month, leave, bills ----------------------------
  const inspectors = [warden, canteen, ...studentMembers.map((x) => x.userId!)];
  await k.ins('mess_inspections', Array.from({ length: 8 }, (_, i) => {
    const q = [4, 3, 5, 2, 4, 4, 3, 5][i];
    return { hostelId: i % 2 ? girlsH.id : boysH.id, inspectedOn: addDays(c.today, -(i * 3 + 1)), meal: ['lunch', 'dinner', 'breakfast', 'lunch', 'dinner', 'snacks', 'lunch', 'breakfast'][i], quality: q, quantity: [4, 4, 5, 3, 4, 3, 4, 5][i], hygiene: [5, 3, 4, 2, 4, 4, 3, 5][i], remarks: ['Good sambar, rice slightly overcooked', 'Chapatis cold by 8.30', 'Fresh and hot', 'Dal watery; a fly near the serving counter', 'Fine', 'Bonda oily', 'Curd sour', 'Very good pongal'][i], status: q <= 2 || i === 1 ? (i === 3 ? 'closed' : 'open') : 'closed', actionTaken: i === 3 ? 'Serving counter given a mesh cover; cook spoken to' : q <= 2 || i === 1 ? '' : 'Shared with the cook', inspectorUserId: inspectors[i % inspectors.length] };
  }), { returning: false });
  const [dietPlan] = await k.ins<{ id: string }>('mess_plans', [{ name: 'Diet system (pay for what you eat)', monthlyFeePaise: rupees(600), meals: J(['breakfast', 'lunch', 'dinner']), billing: 'diet', rebateMinDays: 1, active: true }]);
  const dieters = boys.filter((x) => x.allotmentId !== leaver.allotmentId).slice(-8);
  await k.q('update mess_subscriptions set ended_on = $3 where tenant_id = $1 and student_id = any($2::uuid[]) and ended_on is null', [T, dieters.map((x) => x.studentId), `${lastMonth}-01`]);
  await k.ins('mess_subscriptions', dieters.map((x) => ({ studentId: x.studentId, planId: dietPlan.id, startsOn: `${lastMonth}-02` })), { returning: false });
  await k.ins('mess_leaves', [
    { studentId: stay[1].studentId, fromOn: addDays(c.today, -20), toOn: addDays(c.today, -14), reason: 'Home for Deepavali', status: 'approved', decidedBy: warden, decidedAt: at(addDays(c.today, -22)) },
    { studentId: dieters[0].studentId, fromOn: `${lastMonth}-10`, toOn: `${lastMonth}-13`, reason: 'College tour to Mysuru', status: 'approved', decidedBy: warden, decidedAt: at(`${lastMonth}-08`) },
    { studentId: stay[8].studentId, fromOn: addDays(c.today, 4), toOn: addDays(c.today, 8), reason: 'Sister’s wedding', status: 'pending' },
  ], { returning: false });
  // The diet system members' kitchen: last month's spending, shared by the diets they ate (as the bill run does).
  await k.ins('mess_expenses', [
    { month: lastMonth, head: 'provisions', amountPaise: rupees(14650), spentOn: `${lastMonth}-03`, note: 'Rice, dal, oil: Sri Lakshmi Traders', createdBy: canteen },
    { month: lastMonth, head: 'vegetables', amountPaise: rupees(6240), spentOn: `${lastMonth}-15`, note: 'KR Market, fortnightly', createdBy: canteen },
    { month: lastMonth, head: 'milk', amountPaise: rupees(4810), spentOn: `${lastMonth}-28`, note: 'Nandini milk, monthly bill', createdBy: canteen },
    { month: lastMonth, head: 'fuel', amountPaise: rupees(2400), spentOn: `${lastMonth}-20`, note: 'Commercial LPG cylinder', createdBy: canteen },
    { month, head: 'provisions', amountPaise: rupees(7300), spentOn: `${month}-01`, note: 'Rice and dal for the first fortnight', createdBy: canteen },
  ], { returning: false });
  const [{ spent }] = await k.q<{ spent: string }>('select sum(amount_paise)::bigint as spent from mess_expenses where tenant_id = $1 and month = $2', [T, lastMonth]);
  const lmDays = new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).getUTCDate();
  // On the plan from the 2nd; the first member was away on the college tour for four days (10th to 13th).
  const dietDays = dieters.map((_, i) => lmDays - 1 - (i === 0 ? 4 : 0));
  const diets = dietDays.map((d) => d * 3);
  const dietRate = Math.round(Number(spent) / diets.reduce((a, b) => a + b, 0));
  await k.ins('mess_bills', dieters.map((x, i) => {
    const gross = diets[i] * dietRate + rupees(600);
    return { studentId: x.studentId, planId: dietPlan.id, month: lastMonth, days: lmDays - 1, leaveDays: i === 0 ? 4 : 0, rebateDays: 0, grossPaise: gross, rebatePaise: 0, netPaise: gross, diets: diets[i], dietRatePaise: dietRate, establishmentPaise: rupees(600), status: 'charged', chargedTitle: `Mess bill ${lastMonth}` };
  }), { returning: false });

  // ---- hostel and mess fees on the student ledger (some overdue: the defaulters report) ----------------------------
  const acc = c.byEmail.accounts?.id ?? warden;
  const invoices: Record<string, unknown>[] = [];
  const paid: { i: number; amount: number }[] = [];
  const hostelBatch = crypto.randomUUID();
  const messBatch = crypto.randomUUID();
  const dietBatch = crypto.randomUUID();
  for (const [i, x] of stay.entries()) {
    const roomFee = x.blockId === tunga.id ? rupees(5500) : (await k.q<{ f: string }>('select monthly_fee_paise as f from hostel_rooms where id = $1', [x.roomId]))[0].f;
    invoices.push({ studentId: x.studentId, sectionId: x.sectionId, batchId: hostelBatch, title: 'Hostel fee: Semester (Aug to Dec)', amountPaise: Number(roomFee) * 5, dueOn: '2026-08-10', status: 'due', createdBy: acc });
    paid.push({ i: invoices.length - 1, amount: i % 7 === 3 ? 0 : i % 11 === 5 ? Math.round(Number(roomFee) * 2.5) : Number(roomFee) * 5 });
    if (!dieters.some((d) => d.studentId === x.studentId)) {
      invoices.push({ studentId: x.studentId, sectionId: x.sectionId, batchId: messBatch, title: `Mess fee ${lastMonth}`, amountPaise: rupees(4200), dueOn: `${lastMonth}-10`, status: 'due', createdBy: acc });
      paid.push({ i: invoices.length - 1, amount: i % 6 === 1 ? 0 : rupees(4200) });
    }
  }
  for (const [i, x] of dieters.entries()) {
    const net = diets[i] * dietRate + rupees(600);
    invoices.push({ studentId: x.studentId, sectionId: x.sectionId, batchId: dietBatch, title: `Mess bill ${lastMonth}`, amountPaise: net, dueOn: addDays(c.today, -2), status: 'due', createdBy: acc });
    paid.push({ i: invoices.length - 1, amount: i % 3 ? net : 0 });
  }
  const inv = await k.ins<{ id: string; studentId: string; amountPaise: string }>('fee_invoices', invoices);
  const payRows: Record<string, unknown>[] = [];
  for (const p of paid) {
    if (!p.amount) continue;
    const row = inv[p.i];
    payRows.push({ invoiceId: row.id, studentId: row.studentId, amountPaise: p.amount, method: r.pick(['upi', 'upi', 'cash', 'bank_transfer']), status: 'paid', reference: `HST-${row.id.slice(0, 8)}`, recordedBy: acc, paidAt: at('2026-08-08', '11:00') });
  }
  await k.ins('fee_payments', payRows, { returning: false });
  for (const p of paid) if (p.amount) await k.q('update fee_invoices set paid_paise = $2, status = $3 where id = $1', [inv[p.i].id, p.amount, p.amount >= Number(inv[p.i].amountPaise) ? 'paid' : 'due']);
}
