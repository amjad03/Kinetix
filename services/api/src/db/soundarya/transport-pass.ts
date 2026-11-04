/**
 * Transport pass: fare slabs by distance with each stop's distance (and its fee from the slab), the conductor and the
 * woman attendant on routes 1 and 2 (route 3 still without one, for the safety gaps), drivers' verification records,
 * GPS trackers, the safety checklist per vehicle (one clean, one without CCTV, one overdue), the trip sheet (vehicle
 * and odometer) on the week's trips, boarding and alighting by RFID, the pass QR and the conductor (with a few
 * children who did not board), a bus under way this morning running late, a resolved SOS, the month's and last
 * month's transport fees (some unpaid, for the defaulters and route-wise collection), and a cancelled seat credited.
 */
import type { Ctx } from './ctx.js';
import { addDays, at, J, rupees } from './kit.js';

const SLABS: [number, number, number][] = [
  [0, 5, 1500],
  [5, 10, 1900],
  [10, 15, 2300],
  [15, 30, 2700],
];
const feeFor = (km: number) => rupees(SLABS.find(([a, b]) => (km > a || (km === 0 && a === 0)) && km <= b)?.[2] ?? 2700);
const ALL = ['speedGovernor', 'gpsWorking', 'cctvWorking', 'firstAidBox', 'fireExtinguisher', 'emergencyExit', 'windowGrills', 'doorLocks', 'yellowPaint', 'schoolBusSign', 'schoolNamePhone', 'seatBelts', 'panicButton'];

export async function transportPass(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const T = c.tenantId;
  const mgr = c.byEmail.transport.id;
  const acc = c.byEmail.accounts?.id ?? mgr;
  const month = c.today.slice(0, 7);
  const lastMonth = addDays(`${month}-01`, -1).slice(0, 7);

  // ---- fares by distance ------------------------------------------------------------------------------------------
  await k.ins('transport_fare_slabs', SLABS.map(([fromKm, toKm, fee]) => ({ fromKm, toKm, monthlyFeePaise: rupees(fee), note: toKm <= 5 ? 'Nearby stops' : '' })), { returning: false });
  const stops = await k.q<{ id: string; routeId: string; seq: number; name: string }>('select id, route_id, seq, name from transport_stops where tenant_id = $1 order by route_id, sort_order, seq', [T]);
  const routes = await k.q<{ id: string; name: string; vehicleId: string; driverId: string }>('select id, name, vehicle_id, driver_id from transport_routes where tenant_id = $1 order by name', [T]);
  for (const s of stops) {
    const ri = routes.findIndex((x) => x.id === s.routeId);
    // The campus is the last stop (0 km); the first stop is the farthest.
    const km = s.name.includes('Campus') ? null : Math.round((5 - s.seq) * (3.4 + ri * 0.9) * 10) / 10;
    await k.q('update transport_stops set distance_km = $2, fee_paise = $3, drop_time = $4 where id = $1', [s.id, km, km == null ? null : feeFor(km), `${16 + Math.floor((20 + s.seq * 6) / 60)}:${String((20 + s.seq * 6) % 60).padStart(2, '0')}`]);
  }

  // ---- crew and verification --------------------------------------------------------------------------------------
  const drivers = await k.q<{ id: string; fullName: string; role: string }>('select id, full_name, role from transport_drivers where tenant_id = $1 order by created_at', [T]);
  const byName = (n: string) => drivers.find((d) => d.fullName === n)?.id;
  await k.q("update transport_drivers set gender = 'female' where tenant_id = $1 and role = 'attendant'", [T]);
  const [lakshmi, ravi] = await k.ins<{ id: string }>('transport_drivers', [
    { fullName: 'Lakshmamma', phone: '+919000022005', role: 'attendant', gender: 'female', dateOfBirth: '1984-03-12', policeVerifiedOn: addDays(c.today, -140), policeVerificationRef: 'BLR/PV/2026/2291', medicalValidUntil: addDays(c.today, 240), trainedOn: addDays(c.today, -60), active: true },
    { fullName: 'Ravi Kumar', phone: '+919000022006', role: 'conductor', gender: 'male', dateOfBirth: '1990-07-01', policeVerifiedOn: addDays(c.today, -200), policeVerificationRef: 'BLR/PV/2026/1874', medicalValidUntil: addDays(c.today, 150), active: true },
  ]);
  const verify = [
    ['Manjunath Urs', 'male', '1979-02-14', 'HMV, transport badge', addDays(c.today, -14 * 365), addDays(c.today, -90), 'BLR/PV/2026/0912', addDays(c.today, 210), addDays(c.today, -45)],
    ['Thimmappa Nayak', 'male', '1983-11-30', 'HMV, transport badge', addDays(c.today, -9 * 365), addDays(c.today, -300), 'BLR/PV/2025/4410', addDays(c.today, 18), addDays(c.today, -200)],
    // Route 3's driver: four years with a heavy licence and no police verification yet (shows as gaps).
    ['Narayanaswamy', 'male', '1992-05-09', 'HMV', addDays(c.today, -4 * 365), null, '', addDays(c.today, -20), null],
  ] as const;
  for (const [name, gender, dob, cls, since, police, ref, medical, trained] of verify)
    await k.q('update transport_drivers set gender = $3, date_of_birth = $4, licence_class = $5, licence_issued_on = $6, police_verified_on = $7, police_verification_ref = $8, medical_valid_until = $9, trained_on = $10 where tenant_id = $1 and full_name = $2', [T, name, gender, dob, cls, since, police, ref, medical, trained]);
  const pushpa = byName('Pushpa');
  if (routes[0]) await k.q('update transport_routes set attendant_id = $2, conductor_id = $3 where id = $1', [routes[0].id, pushpa ?? null, ravi.id]);
  if (routes[1]) await k.q('update transport_routes set attendant_id = $2 where id = $1', [routes[1].id, lakshmi.id]);
  if (routes[3]) await k.q('update transport_routes set attendant_id = $2 where id = $1', [routes[3].id, pushpa ?? null]);

  // ---- vehicles: trackers, papers, safety checks --------------------------------------------------------------------
  const vehicles = await k.q<{ id: string; regNo: string }>('select id, reg_no from transport_vehicles where tenant_id = $1 order by reg_no', [T]);
  const byReg = (reg: string) => vehicles.find((v) => v.regNo === reg)?.id;
  await k.q("update transport_vehicles set gps_device = 'TRK-' || right(replace(reg_no, '-', ''), 4), permit_expires_on = $2, road_tax_expires_on = $3 where tenant_id = $1 and status = 'active'", [T, addDays(c.today, 320), addDays(c.today, 150)]);
  const items = (missing: string[]) => J(Object.fromEntries(ALL.map((x) => [x, !missing.includes(x)])));
  const checks: Record<string, unknown>[] = [];
  const v1 = byReg('KA-01-AB-4412');
  const v2 = byReg('KA-01-AC-7781');
  const v3 = byReg('KA-51-AD-1290');
  if (v1) checks.push({ vehicleId: v1, checkedOn: addDays(c.today, -100), items: items(['panicButton']), passed: false, nextDueOn: addDays(c.today, -10), note: 'Panic button to be fitted', checkedBy: mgr }, { vehicleId: v1, checkedOn: addDays(c.today, -12), items: items([]), passed: true, nextDueOn: addDays(c.today, 78), note: 'Panic button fitted; all items present', checkedBy: mgr });
  if (v2) checks.push({ vehicleId: v2, checkedOn: addDays(c.today, -20), items: items(['cctvWorking']), passed: false, nextDueOn: addDays(c.today, 70), note: 'Rear CCTV camera not recording; sent to the vendor', checkedBy: mgr });
  if (v3) checks.push({ vehicleId: v3, checkedOn: addDays(c.today, -110), items: items([]), passed: true, nextDueOn: addDays(c.today, -20), note: 'Quarterly check', checkedBy: mgr });
  await k.ins('transport_safety_checks', checks, { returning: false });

  // ---- trip sheets and the boarding log on the week's trips ---------------------------------------------------------
  const riders = await k.q<{ id: string; studentId: string; routeId: string; stopId: string }>('select id, student_id, route_id, stop_id from transport_assignments where tenant_id = $1 and ended_on is null and student_id is not null', [T]);
  const trips = await k.q<{ id: string; routeId: string; direction: string; startedAt: Date; endedAt: Date }>("select id, route_id, direction, started_at, ended_at from transport_trips where tenant_id = $1 and status = 'ended' order by started_at", [T]);
  const odo: Record<string, number> = {};
  const marks: Record<string, unknown>[] = [];
  for (const t of trips) {
    const route = routes.find((x) => x.id === t.routeId)!;
    const v = route.vehicleId;
    odo[v] ??= 41_200 + Object.keys(odo).length * 5_200;
    const km = 26 + r.int(0, 9);
    await k.q('update transport_trips set vehicle_id = $2, start_odometer_km = $3, end_odometer_km = $4 where id = $1', [t.id, v, odo[v], odo[v] + km]);
    odo[v] += km + r.int(2, 6);
    const day = new Date(t.startedAt.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    for (const [i, s] of riders.filter((x) => x.routeId === t.routeId).entries()) {
      // About one child in twelve did not ride that run.
      if (r.int(0, 11) === 0) continue;
      const on = new Date(t.startedAt.getTime() + (8 + i * 2) * 60_000);
      const off = new Date(t.endedAt.getTime() - (i % 5) * 60_000);
      const method = i % 4 === 0 ? 'manual' : i % 4 === 1 ? 'qr' : 'rfid';
      marks.push({ studentId: s.studentId, routeId: t.routeId, tripId: t.id, stopId: t.direction === 'pickup' ? s.stopId : null, kind: 'board', method, boardedAt: on, onDate: day, recordedBy: method === 'rfid' ? null : mgr });
      marks.push({ studentId: s.studentId, routeId: t.routeId, tripId: t.id, stopId: t.direction === 'drop' ? s.stopId : null, kind: 'alight', method, boardedAt: off, onDate: day, recordedBy: method === 'rfid' ? null : mgr });
    }
  }
  for (let i = 0; i < marks.length; i += 500) await k.ins('transport_boardings', marks.slice(i, i + 500), { returning: false });

  // ---- this morning: route 1 is under way and running late ----------------------------------------------------------
  const r1 = routes[0];
  if (r1) {
    const r1Stops = stops.filter((s) => s.routeId === r1.id);
    const live = await k.one<{ id: string }>('transport_trips', { routeId: r1.id, driverUserId: c.byEmail.driver1.id, direction: 'pickup', status: 'running', startedAt: at(c.today, '07:05'), lastStopSeq: 2, lastLat: '13.061000', lastLng: '77.520000', lastSpeedKmh: '24', lastPingAt: at(c.today, '07:41'), pings: 72, vehicleId: r1.vehicleId, startOdometerKm: (odo[r1.vehicleId] ?? 41_200) + 3 });
    await k.ins('transport_trip_events', [
      { tripId: live.id, kind: 'started', at: at(c.today, '07:05') },
      { tripId: live.id, kind: 'stop_reached', stopId: r1Stops[0]?.id, at: at(c.today, '07:22') },
      { tripId: live.id, kind: 'delayed', stopId: r1Stops[1]?.id, at: at(c.today, '07:24'), detail: '14 min' },
      { tripId: live.id, kind: 'stop_reached', stopId: r1Stops[1]?.id, at: at(c.today, '07:39') },
    ], { returning: false });
    const onR1 = riders.filter((s) => s.routeId === r1.id && r1Stops.slice(0, 2).some((x) => x.id === s.stopId));
    await k.ins('transport_boardings', onR1.slice(0, Math.max(0, onR1.length - 1)).map((s, i) => ({ studentId: s.studentId, routeId: r1.id, tripId: live.id, stopId: s.stopId, kind: 'board', method: i % 2 ? 'rfid' : 'qr', boardedAt: at(c.today, i < onR1.length / 2 ? '07:22' : '07:39'), onDate: c.today, recordedBy: i % 2 ? null : mgr })), { returning: false });
    const missed = onR1.at(-1);
    if (missed) await k.ins('transport_trip_events', { tripId: live.id, kind: 'not_boarded', stopId: missed.stopId, at: at(c.today, '07:39'), detail: (await k.q<{ fullName: string }>('select full_name from students where id = $1', [missed.studentId]))[0]?.fullName ?? '' }, { returning: false });
  }

  // ---- GPS alerts, the maintenance schedule, duty with a spare, temporary changes, families' requests, hand-overs ----
  const recent = trips.slice(-8);
  if (recent.length >= 3) {
    const ev = (t: (typeof trips)[number], kind: string, mins: number, speed: number | null, detail: string, ack: boolean) => ({ tripId: t.id, kind, at: new Date(t.startedAt.getTime() + mins * 60_000), lat: '13.052100', lng: '77.531800', speedKmh: speed == null ? null : String(speed), detail, acknowledgedBy: ack ? mgr : null, acknowledgedAt: ack ? new Date(t.startedAt.getTime() + (mins + 4) * 60_000) : null });
    await k.ins('transport_trip_events', [ev(recent[0], 'overspeed', 18, 58, '58 km/h (limit 50)', true), ev(recent[1], 'deviation', 31, null, '740 m off the route', true), ev(recent[2], 'overspeed', 22, 63, '63 km/h (limit 50)', false)], { returning: false });
  }
  const maint = vehicles.flatMap((v, i) => [
    { vehicleId: v.id, kind: 'service', dueOn: addDays(c.today, i === 1 ? -4 : 20 + i * 15), dueKm: 45_000 + i * 5_000, vendor: 'Sri Chamundi Motors, Peenya', note: 'Engine oil, filters and brake check', status: 'scheduled' },
    { vehicleId: v.id, kind: i % 2 ? 'tyres' : 'battery', dueOn: addDays(c.today, -35 - i * 5), doneOn: addDays(c.today, -33 - i * 5), odometerKm: 40_100 + i * 5_000, costPaise: rupees(i % 2 ? 24_800 : 7_600), vendor: i % 2 ? 'MRF Tyre Point, Yeshwanthpur' : 'Amaron Battery Care', status: 'done' },
  ]);
  await k.ins('transport_maintenance', maint, { returning: false });
  const [spare] = await k.ins<{ id: string }>('transport_drivers', { fullName: 'Somashekar', phone: '+919000022007', role: 'driver', gender: 'male', licenceClass: 'HMV, transport badge', licenseNo: 'KA0220150077110', licenseExpiresOn: addDays(c.today, 900), licenceIssuedOn: addDays(c.today, -11 * 365), policeVerifiedOn: addDays(c.today, -60), policeVerificationRef: 'BLR/PV/2026/2410', medicalValidUntil: addDays(c.today, 300), isSpare: true, active: true });
  const duty = routes.filter((x) => x.driverId).map((x, i) => ({ driverId: x.driverId, dutyOn: c.today, routeId: x.id, status: i === 2 ? 'leave' : 'present', substituteDriverId: i === 2 ? spare.id : null, note: i === 2 ? 'Family function; Somashekar covers' : '' }));
  // Two routes share a driver: one duty row a day per driver.
  const seen = new Set<string>();
  await k.ins('transport_driver_duty', duty.filter((d) => !seen.has(d.driverId) && seen.add(d.driverId)), { returning: false });
  if (routes[2]) await k.ins('transport_route_overrides', [
    { routeId: routes[2].id, fromOn: c.today, untilOn: c.today, kind: 'driver', substituteDriverId: spare.id, reason: 'Regular driver on leave', createdBy: mgr, notifiedAt: at(c.today, '06:15') },
    { routeId: routes[0].id, fromOn: addDays(c.today, 9), untilOn: addDays(c.today, 11), kind: 'timing', shiftMinutes: -30, reason: 'Semester-end examinations start at 9:00', createdBy: mgr },
  ], { returning: false });
  const moveTo = stops.filter((s) => s.routeId === routes[1]?.id);
  const asking = riders.filter((s) => s.routeId === routes[0]?.id).slice(0, 2);
  if (moveTo.length > 1 && asking.length === 2) {
    await k.ins('transport_change_requests', [
      { studentId: asking[0].studentId, fromRouteId: routes[0].id, fromStopId: asking[0].stopId, toRouteId: routes[1].id, toStopId: moveTo[1].id, effectiveOn: addDays(c.today, 5), reason: 'We are moving to Rajajinagar from next week', requestedBy: c.byEmail.transport.id, status: 'pending' },
      { studentId: asking[1].studentId, fromRouteId: routes[0].id, fromStopId: asking[1].stopId, toRouteId: routes[0].id, toStopId: stops.find((s) => s.routeId === routes[0].id && s.seq === 2)?.id ?? asking[1].stopId, effectiveOn: addDays(c.today, -10), reason: 'Closer to the new tuition centre', requestedBy: c.byEmail.transport.id, status: 'rejected', decisionNote: 'That stop is full on the morning run', decidedBy: mgr, decidedAt: at(addDays(c.today, -11), '12:00') },
    ], { returning: false });
  }
  const persons = await k.ins<{ id: string; studentId: string }>('transport_pickup_persons', riders.slice(0, 6).map((s, i) => ({ studentId: s.studentId, name: ['Ramesh (father)', 'Savitha (mother)', 'Krishnappa (grandfather)', 'Geetha (aunt)', 'Mohan (uncle)', 'Vani (mother)'][i], relation: ['father', 'mother', 'grandfather', 'aunt', 'uncle', 'mother'][i], phone: `+9198450${String(31100 + i)}`, idProof: i % 2 ? 'Aadhaar ending 4417' : 'Driving licence KA01' })));
  const drop = trips.filter((t) => t.direction === 'drop').at(-1);
  if (drop) await k.ins('transport_handovers', persons.slice(0, 4).map((p, i) => ({ studentId: p.studentId, tripId: drop.id, personId: i % 2 ? p.id : null, method: i % 2 ? 'photo' : 'otp', status: i === 3 ? 'refused' : 'done', attempts: i === 3 ? 5 : i === 0 ? 1 : 0, note: i === 3 ? 'Too many wrong codes; child brought back to campus and parent called' : '', handedAt: i === 3 ? null : new Date(drop.startedAt.getTime() + (20 + i * 6) * 60_000), recordedBy: mgr })), { returning: false });

  // ---- a resolved SOS last week -------------------------------------------------------------------------------------
  const sosTrip = trips.find((t) => t.routeId === routes[1]?.id);
  if (sosTrip) {
    await k.ins('transport_incidents', { vehicleId: routes[1].vehicleId, tripId: sosTrip.id, kind: 'sos', severity: 'high', description: 'SOS from the bus: a student fainted near Rajajinagar Entrance (at 13.00410, 77.55320)', occurredAt: new Date(sosTrip.startedAt.getTime() + 25 * 60_000), status: 'resolved', resolution: 'Attendant gave first aid; parent met the bus at the next stop; student fine.', reportedBy: c.byEmail.driver2.id, resolvedAt: new Date(sosTrip.startedAt.getTime() + 70 * 60_000) }, { returning: false });
    await k.ins('transport_trip_events', { tripId: sosTrip.id, kind: 'sos', at: new Date(sosTrip.startedAt.getTime() + 25 * 60_000), lat: '13.004100', lng: '77.553200', detail: 'Student fainted' }, { returning: false });
  }

  // ---- transport fees: last month and this month, on the ledger, some unpaid -----------------------------------------
  const seats = await k.q<{ id: string; studentId: string; sectionId: string; fee: string; startsOn: string }>(
    `select a.id, a.student_id, s.section_id, coalesce(a.fee_paise, st.fee_paise, r.monthly_fee_paise)::text as fee, a.starts_on::text as starts_on
     from transport_assignments a join students s on s.id = a.student_id join transport_stops st on st.id = a.stop_id join transport_routes r on r.id = a.route_id
     where a.tenant_id = $1 and a.ended_on is null order by s.full_name`,
    [T],
  );
  const invoices: Record<string, unknown>[] = [];
  for (const m of [lastMonth, month]) {
    const batchId = (await k.q<{ id: string }>('select gen_random_uuid() as id'))[0].id;
    for (const s of seats) invoices.push({ studentId: s.studentId, sectionId: s.sectionId, batchId, title: `Transport fee ${m}`, amountPaise: Number(s.fee), dueOn: `${m}-10`, status: 'due', createdBy: acc });
  }
  const inv = await k.ins<{ id: string; studentId: string; amountPaise: string; title: string }>('fee_invoices', invoices);
  const pays: Record<string, unknown>[] = [];
  for (const [i, row] of inv.entries()) {
    const last = row.title.endsWith(lastMonth);
    // Last month: all but about one in six paid; this month: about half so far.
    const paid = last ? i % 6 !== 0 : i % 2 === 0;
    if (!paid) continue;
    pays.push({ invoiceId: row.id, studentId: row.studentId, amountPaise: Number(row.amountPaise), method: r.pick(['upi', 'upi', 'cash', 'bank_transfer']), status: 'paid', reference: `BUS-${row.id.slice(0, 8)}`, recordedBy: acc, paidAt: at(last ? `${lastMonth}-08` : addDays(c.today, -2), '11:00') });
  }
  await k.ins('fee_payments', pays, { returning: false });
  for (const p of pays) await k.q("update fee_invoices set paid_paise = amount_paise, status = 'paid' where id = $1", [p.invoiceId]);

  // ---- a seat cancelled mid-month: the days given up come off this month's unpaid fee --------------------------------
  const unpaid = inv.find((x, i) => x.title.endsWith(month) && i % 2 === 1);
  const seat = unpaid && seats.find((s) => s.studentId === unpaid.studentId);
  if (unpaid && seat) {
    const dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const endsOn = addDays(c.today, 1);
    const kept = Math.round((Number(seat.fee) * (Number(endsOn.slice(8, 10)) - 1)) / dim);
    const credit = endsOn.slice(0, 7) === month ? Number(seat.fee) - kept : 0;
    await k.q('update transport_assignments set ended_on = $2 where id = $1', [seat.id, endsOn]);
    if (credit > 0) {
      await k.q('update fee_invoices set amount_paise = amount_paise - $2 where id = $1', [unpaid.id, credit]);
      await k.ins('transport_fee_adjustments', { assignmentId: seat.id, studentId: seat.studentId, kind: 'cancel_credit', month, amountPaise: -credit, appliedPaise: credit, refundDuePaise: 0, invoiceId: unpaid.id, note: 'Family moving to Mysuru', createdBy: mgr }, { returning: false });
    }
  }
}
