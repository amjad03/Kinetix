import { randomBytes } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { readSettings } from '../campus-ops/settings.js';
import { auditUser } from '../common/audit.js';
import { familyUserIds } from '../common/lht-kit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { canteenStockLog } from '../db/schema-depth.js';
import { hostelCommittees, hostelGateLogs, messExpenses, messInspections } from '../db/schema-hostel-pass.js';
import { hostelLateEntries } from '../db/schema-lht.js';
import { hostelAllotments, hostelBeds, hostelBlocks, hostelGatePasses, hostelRooms, students, tenants } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { gateMove, residentOf } from './allotment.js';
import { HOSTEL_ROLES } from './hostel.controller.js';
import { HostelRecords } from './hostel.records.js';
import { minutesLate } from './hostel-rules.js';
import { assertStudentInScope, blockScope, LOCAL_TODAY, studentScope } from './hostel-scope.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
const Direction = z.enum(['out', 'in']);
const ScanBody = z.object({ code: z.string().trim().regex(/^HG1:[A-Za-z0-9_-]{16,64}$/, 'This is not a hostel gate QR'), direction: Direction.optional(), gate: z.string().trim().max(60).default('') });
const ManualBody = z.object({ studentId: z.uuid(), direction: Direction, note: z.string().trim().min(3, 'Say why the QR was not used').max(300), gate: z.string().trim().max(60).default('') });
const InspectionBody = z.object({ hostelId: z.uuid().optional(), inspectedOn: Day, meal: z.enum(['breakfast', 'lunch', 'snacks', 'dinner']), quality: z.number().int().min(1).max(5), quantity: z.number().int().min(1).max(5), hygiene: z.number().int().min(1).max(5), remarks: z.string().trim().max(1000).default('') });
const REPORT_ROLES: RoleName[] = [...HOSTEL_ROLES, 'accountant', 'quality_officer'];
const MESS_ROLES: RoleName[] = [...HOSTEL_ROLES, 'canteen_manager'];

/** Deps a gate event needs beyond the transaction. */
export interface GateDeps {
  notifications: NotificationsService;
  records: HostelRecords;
}

/**
 * A resident goes out of or comes in through the gate (by their QR or by hand). Going out uses an approved out-pass
 * when there is one (the family is told); without one a local outing is allowed until curfew. Coming in closes the
 * pass; after curfew, or after the pass ran out, it is a late entry: the family is told (when the hostel says so) and
 * repeated late entries are escalated.
 */
export async function gateEvent(tx: Tx, p: UserPrincipal, now: Date, deps: GateDeps, o: { studentId: string; direction?: 'out' | 'in'; method: 'qr' | 'manual'; gate: string; note: string }) {
  if (!(await residentOf(tx, o.studentId))) throw new BadRequestException('This student has no hostel bed');
  await assertStudentInScope(tx, p, o.studentId);
  const [st] = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(eq(students.id, o.studentId));
  const [last] = await tx.select({ direction: hostelGateLogs.direction }).from(hostelGateLogs).where(eq(hostelGateLogs.studentId, o.studentId)).orderBy(desc(hostelGateLogs.createdAt), desc(hostelGateLogs.at)).limit(1);
  const lastDir = last?.direction ?? 'in';
  const direction = o.direction ?? (lastDir === 'out' ? 'in' : 'out');
  if (direction === lastDir) throw new ConflictException(direction === 'out' ? `${st.fullName} is already out` : `${st.fullName} is already in`);
  const rules = (await readSettings(tx, p.tenantId, 'hostel')).rules;
  const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
  const local = localParts(now, t?.tz ?? 'Asia/Kolkata');
  const curfew = String(rules.curfew ?? '21:00');
  let passId: string | null = null;
  let late = 0;
  let lateEntryId: string | null = null;
  if (direction === 'out') {
    const [pass] = await tx.select().from(hostelGatePasses).where(and(eq(hostelGatePasses.studentId, o.studentId), inArray(hostelGatePasses.status, ['issued', 'approved']))).orderBy(desc(hostelGatePasses.createdAt)).limit(1);
    if (pass) {
      await gateMove(tx, p, now, deps.notifications, pass.id, 'out');
      passId = pass.id;
    } else if (minutesLate(local, curfew) > 0) throw new ConflictException('After curfew a resident needs an approved out-pass to go out');
  } else {
    const [pass] = await tx.select().from(hostelGatePasses).where(and(eq(hostelGatePasses.studentId, o.studentId), eq(hostelGatePasses.status, 'out'))).orderBy(desc(hostelGatePasses.createdAt)).limit(1);
    if (pass) {
      await gateMove(tx, p, now, deps.notifications, pass.id, 'in');
      passId = pass.id;
    }
    late = minutesLate(local, curfew, pass?.expectedBackAt ?? null, now);
    if (late > 0) {
      const [e] = await tx.insert(hostelLateEntries).values({ tenantId: p.tenantId, studentId: o.studentId, enteredAt: now, minutesLate: late, reason: o.note, gatePassId: passId, recordedBy: p.userId }).returning({ id: hostelLateEntries.id });
      lateEntryId = e.id;
      if (rules.lateEntryAlertParents !== false) {
        const hm = local.time.slice(0, 5);
        await deps.notifications.notifyUsers(tx, await familyUserIds(tx, o.studentId), {
          kind: 'hostel',
          text: {
            en: { title: `${st.fullName} came back late`, body: `${st.fullName} came in to the hostel at ${hm}, ${late} minutes late.` },
            hi: { title: `${st.fullName} देर से लौटे`, body: `${st.fullName} ${hm} बजे छात्रावास में आए, ${late} मिनट देर से।` },
            kn: { title: `${st.fullName} ತಡವಾಗಿ ಬಂದಿದ್ದಾರೆ`, body: `${st.fullName} ${hm} ಕ್ಕೆ ವಸತಿ ನಿಲಯಕ್ಕೆ ಬಂದಿದ್ದಾರೆ, ${late} ನಿಮಿಷ ತಡವಾಗಿ.` },
          },
          data: { studentId: o.studentId, lateEntryId: e.id },
          dedupeKey: `hostel-late-in:${e.id}`,
        });
      }
      await deps.records.escalate({ tx, p }, o.studentId, st.fullName, e.id, now);
    }
  }
  const [log] = await tx.insert(hostelGateLogs).values({ tenantId: p.tenantId, studentId: o.studentId, direction, at: now, method: o.method, gatePassId: passId, lateEntryId, minutesLate: late, gate: o.gate, note: o.note, recordedBy: p.userId }).returning();
  await auditUser(tx, p, `hostel.gate_${o.method}_${direction}`, 'hostel_gate_log', log.id, { studentId: o.studentId, passId, minutesLate: late });
  return { ...log, studentName: st.fullName, rollNo: st.rollNo, withPass: !!passId };
}

/**
 * The hostel gate (QR scans and hand entries, who is out now), the anti-ragging and mess committee compliance view,
 * mess committee inspections, bringing kitchen purchases into the mess spending, and the hostel's reports: fee
 * defaulters and the AISHE and NAAC figures.
 */
@Controller('v1/hostel')
export class HostelPassController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly records: HostelRecords,
  ) {}

  private get deps(): GateDeps {
    return { notifications: this.notifications, records: this.records };
  }

  // ---- the gate --------------------------------------------------------------------------------------------------

  /**
   * The resident's gate QR (shown in the student app). A random code for this stay, made on first use; it stops
   * working when the bed is vacated.
   */
  @Get('students/:id/gate-qr')
  @Auth('user', ['student', ...HOSTEL_ROLES])
  gateQr(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, HOSTEL_ROLES);
      await assertStudentInScope(tx, p, studentId);
      const a = await residentOf(tx, studentId);
      if (!a) throw new NotFoundException('This student has no hostel bed');
      let token = a.gateToken;
      if (!token) {
        token = randomBytes(18).toString('base64url');
        await tx.update(hostelAllotments).set({ gateToken: token }).where(eq(hostelAllotments.id, a.id));
        await auditUser(tx, p, 'hostel.gate_qr_made', 'hostel_allotment', a.id);
      }
      return { code: `HG1:${token}`, studentId };
    });
  }

  /** The gate scans a resident's QR: out or in (the other way from their last move unless the guard picks one). */
  @Post('gate/scan')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  scan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ScanBody)) b: z.infer<typeof ScanBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select({ studentId: hostelAllotments.studentId }).from(hostelAllotments).where(and(eq(hostelAllotments.gateToken, b.code.slice(4)), isNull(hostelAllotments.vacatedOn)));
      if (!a) throw new NotFoundException('This QR is not a current resident’s');
      return gateEvent(tx, p, this.clock.now(), this.deps, { studentId: a.studentId, direction: b.direction, method: 'qr', gate: b.gate, note: '' });
    });
  }

  /** A move entered by hand (no phone, a dead battery): the reason is kept. */
  @Post('gate/manual')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  manual(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ManualBody)) b: z.infer<typeof ManualBody>) {
    return this.db.withTenant(p.tenantId, (tx) => gateEvent(tx, p, this.clock.now(), this.deps, { studentId: b.studentId, direction: b.direction, method: 'manual', gate: b.gate, note: b.note }));
  }

  /** Residents outside now (their last move was out), with the pass they went on and when it said they would be back. */
  @Get('gate/out-now')
  @Auth('user', HOSTEL_ROLES)
  outNow(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.execute<{ student_id: string; direction: string; full_name: string; roll_no: string; place: string; out_at: string; pass_reason: string | null; expected_back_at: string | null }>(sql`
        select distinct on (l.student_id) l.student_id, l.direction, s.full_name, s.roll_no, k.name || ' · ' || r.number as place, l.at as out_at, g.reason as pass_reason, g.expected_back_at
        from hostel_gate_logs l join students s on s.id = l.student_id
        join hostel_allotments a on a.student_id = l.student_id and a.vacated_on is null
        join hostel_beds b on b.id = a.bed_id join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id
        left join hostel_gate_passes g on g.id = l.gate_pass_id
        where ${blockScope(p, sql.raw('k.id')) ?? sql`true`}
        order by l.student_id, l.created_at desc, l.at desc`);
      const now = this.clock.now();
      return rows.rows
        .filter((r) => r.direction === 'out')
        .map((r) => ({ studentId: r.student_id, studentName: r.full_name, rollNo: r.roll_no, place: r.place, outAt: r.out_at, passReason: r.pass_reason, expectedBackAt: r.expected_back_at, overdue: !!r.expected_back_at && new Date(r.expected_back_at) < now }));
    });
  }

  // ---- committees and compliance ---------------------------------------------------------------------------------

  /**
   * UGC anti-ragging compliance and the mess committee: whether the committee and the squad are constituted and in
   * date, members and meetings in the last year, residents' undertakings, and mess inspections in the last 30 days.
   */
  @Get('compliance')
  @Auth('user', REPORT_ROLES)
  compliance(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const committees = await tx.execute<{ purpose: string; name: string; valid: boolean; members: number; meetings: number; last_meeting: string | null; helpline: string }>(sql`
        select hc.purpose, c.name, (hc.valid_until is null or hc.valid_until >= ${LOCAL_TODAY}) as valid, hc.helpline,
          (select count(*)::int from committee_members m where m.committee_id = c.id and (m.tenure_end is null or m.tenure_end >= ${LOCAL_TODAY})) as members,
          (select count(*)::int from committee_meetings mt where mt.committee_id = c.id and mt.status = 'held' and mt.meeting_on >= ${LOCAL_TODAY} - 365) as meetings,
          (select max(mt.meeting_on)::text from committee_meetings mt where mt.committee_id = c.id and mt.status = 'held') as last_meeting
        from hostel_committees hc join committees c on c.id = hc.committee_id where c.active order by hc.purpose, c.name`);
      const has = (purpose: string) => committees.rows.some((c) => c.purpose === purpose && c.valid && c.members > 0);
      const [u] = (
        await tx.execute<{ residents: number; received: number; verified: number }>(sql`
        select count(*)::int as residents,
          count(*) filter (where x.status = 'received')::int as received, count(*) filter (where x.status = 'verified')::int as verified
        from hostel_allotments a left join lateral (select status from antiragging_undertakings u where u.student_id = a.student_id order by u.year_label desc limit 1) x on true
        where a.vacated_on is null and ${studentScope(p, sql.raw('a.student_id')) ?? sql`true`}`)
      ).rows;
      const [m] = (
        await tx.execute<{ n: number; quality: number | null; quantity: number | null; hygiene: number | null; open: number }>(sql`
        select count(*)::int as n, round(avg(quality), 2)::float as quality, round(avg(quantity), 2)::float as quantity, round(avg(hygiene), 2)::float as hygiene,
          count(*) filter (where status = 'open')::int as open
        from mess_inspections where inspected_on >= ${LOCAL_TODAY} - 30`)
      ).rows;
      const missing = u.residents - u.received - u.verified;
      return {
        antiRagging: { committee: has('anti_ragging'), squad: has('anti_ragging_squad'), residents: u.residents, received: u.received, verified: u.verified, missing, percent: u.residents ? Math.round(((u.received + u.verified) * 1000) / u.residents) / 10 : 100 },
        messCommittee: { constituted: has('mess'), inspections30d: m.n, openInspections: m.open, average: { quality: m.quality, quantity: m.quantity, hygiene: m.hygiene } },
        committees: committees.rows.map((c) => ({ purpose: c.purpose, name: c.name, valid: c.valid, members: c.members, meetingsLastYear: c.meetings, lastMeeting: c.last_meeting, helpline: c.helpline })),
      };
    });
  }

  /** The hostel's helplines and committees a resident should know (the student app's safety card). */
  @Get('safety')
  @Auth('user')
  safety(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ purpose: hostelCommittees.purpose, helpline: hostelCommittees.helpline, name: sql<string>`(select c.name from committees c where c.id = ${hostelCommittees.committeeId})` }).from(hostelCommittees).where(sql`${hostelCommittees.validUntil} is null or ${hostelCommittees.validUntil} >= ${LOCAL_TODAY}`).orderBy(asc(hostelCommittees.purpose));
      // The UGC's national anti-ragging helpline, always shown.
      return { nationalHelpline: '1800-180-5522', nationalEmail: 'helpline@antiragging.in', committees: rows };
    });
  }

  /**
   * A mess committee member's inspection of a meal (students on the committee included): quality, quantity and
   * hygiene out of 5. The warden and the canteen manager see the inspections and close them with what was done.
   */
  @Post('mess/inspections')
  @Auth('user')
  inspect(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(InspectionBody)) b: z.infer<typeof InspectionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!p.roles.some((r) => MESS_ROLES.includes(r))) {
        const member = await tx.execute<{ ok: boolean }>(sql`select exists (select 1 from committee_members m join hostel_committees hc on hc.committee_id = m.committee_id where hc.purpose = 'mess' and m.user_id = ${p.userId}::uuid and m.tenure_start <= ${LOCAL_TODAY} and (m.tenure_end is null or m.tenure_end >= ${LOCAL_TODAY})) as ok`);
        if (!member.rows[0]?.ok) throw new ForbiddenException('Only the mess committee can record an inspection');
      }
      const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
      if (b.inspectedOn > localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date) throw new BadRequestException('That meal has not been served yet');
      const [row] = await tx.insert(messInspections).values({ tenantId: p.tenantId, hostelId: b.hostelId ?? null, inspectedOn: b.inspectedOn, meal: b.meal, quality: b.quality, quantity: b.quantity, hygiene: b.hygiene, remarks: b.remarks, inspectorUserId: p.userId }).returning();
      await auditUser(tx, p, 'mess_inspection.created', 'mess_inspection', row.id, { meal: b.meal });
      return row;
    });
  }

  /** Brings the month's kitchen purchases (the canteen stock log) into the mess spending, each purchase once. */
  @Post('mess/expenses/import-stock')
  @HttpCode(200)
  @Auth('user', MESS_ROLES)
  importStock(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ month: Month }))) b: { month: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [y, mo] = b.month.split('-').map(Number);
      const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
      const rows = await tx
        .select({ id: canteenStockLog.id, cost: canteenStockLog.costPaise, on: canteenStockLog.loggedOn, item: canteenStockLog.itemName, qty: canteenStockLog.quantity, unit: canteenStockLog.unit })
        .from(canteenStockLog)
        .where(and(eq(canteenStockLog.kind, 'purchase'), sql`${canteenStockLog.loggedOn} between ${`${b.month}-01`}::date and ${last}::date`, sql`${canteenStockLog.costPaise} > 0`, sql`not exists (select 1 from mess_expenses e where e.stock_log_id = ${canteenStockLog.id})`));
      if (rows.length) await tx.insert(messExpenses).values(rows.map((r) => ({ tenantId: p.tenantId, month: b.month, head: 'provisions', amountPaise: r.cost, spentOn: r.on, note: `${r.item} ${r.qty} ${r.unit}`.slice(0, 200), stockLogId: r.id, createdBy: p.userId })));
      const amount = rows.reduce((t, r) => t + r.cost, 0);
      await auditUser(tx, p, 'mess_expense.imported', 'mess_expense', undefined, { month: b.month, added: rows.length, amountPaise: amount });
      return { month: b.month, added: rows.length, amountPaise: amount };
    });
  }

  // ---- reports ---------------------------------------------------------------------------------------------------

  /**
   * Hostel and mess fee defaulters as of a date (today by default): each student's unpaid hostel and mess bills past
   * their due date, the balance and how it ages (0-30, 31-60, 61-90, over 90 days). Paged on the server.
   */
  @Get('reports/defaulters')
  @Auth('user', REPORT_ROLES)
  defaulters(@CurrentPrincipal() p: UserPrincipal, @Query('asOf') asOf?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    if (asOf !== undefined && !Day.safeParse(asOf).success) throw new BadRequestException('Use a date like 2026-10-15');
    const size = Math.min(Math.max(Number(pageSize) || 50, 1), 500);
    const pg = Math.max(Number(page) || 1, 1);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
      const day = asOf ?? localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
      const scope = studentScope(p, sql.raw('s.id')) ?? sql`true`;
      const base = sql`from fee_invoices i join students s on s.id = i.student_id
        where (i.title ilike 'hostel%' or i.title ilike 'mess%') and i.amount_paise > i.paid_paise and i.due_on < ${day}::date and ${scope}`;
      const rows = await tx.execute<{ student_id: string; full_name: string; roll_no: string; place: string | null; invoices: number; oldest: string; balance: string; b30: string; b60: string; b90: string; b90p: string }>(sql`
        select s.id as student_id, s.full_name, s.roll_no,
          (select k.name || ' · ' || r.number from hostel_allotments a join hostel_beds b on b.id = a.bed_id join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id where a.student_id = s.id and a.vacated_on is null limit 1) as place,
          count(*)::int as invoices, min(i.due_on)::text as oldest, sum(i.amount_paise - i.paid_paise)::bigint as balance,
          coalesce(sum(i.amount_paise - i.paid_paise) filter (where ${day}::date - i.due_on <= 30), 0)::bigint as b30,
          coalesce(sum(i.amount_paise - i.paid_paise) filter (where ${day}::date - i.due_on between 31 and 60), 0)::bigint as b60,
          coalesce(sum(i.amount_paise - i.paid_paise) filter (where ${day}::date - i.due_on between 61 and 90), 0)::bigint as b90,
          coalesce(sum(i.amount_paise - i.paid_paise) filter (where ${day}::date - i.due_on > 90), 0)::bigint as b90p
        ${base} group by s.id, s.full_name, s.roll_no order by sum(i.amount_paise - i.paid_paise) desc, s.full_name
        limit ${size} offset ${(pg - 1) * size}`);
      const [tot] = (await tx.execute<{ students: number; balance: string }>(sql`select count(distinct s.id)::int as students, coalesce(sum(i.amount_paise - i.paid_paise), 0)::bigint as balance ${base}`)).rows;
      return {
        asOf: day,
        page: pg,
        pageSize: size,
        total: tot.students,
        balancePaise: Number(tot.balance),
        rows: rows.rows.map((r) => ({ studentId: r.student_id, studentName: r.full_name, rollNo: r.roll_no, place: r.place, resident: !!r.place, invoices: r.invoices, oldestDue: r.oldest, daysOverdue: Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${r.oldest}T00:00:00Z`)) / 86_400_000), balancePaise: Number(r.balance), ageing: { d30: Number(r.b30), d60: Number(r.b60), d90: Number(r.b90), over90: Number(r.b90p) } })),
      };
    });
  }

  /**
   * The hostel figures AISHE and NAAC ask for, for an academic year (June to May, "2026-27"; the current one by
   * default): hostels by type with intake capacity and students residing (AISHE DCF-II), and for NAAC the capacity
   * and occupancy, residents by gender and category, staff, mess, anti-ragging compliance, health and grievances.
   */
  @Get('reports/aishe')
  @Auth('user', REPORT_ROLES)
  aishe(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string) {
    if (year !== undefined && !/^\d{4}-\d{2}$/.test(year)) throw new BadRequestException('Use a year like 2026-27');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
      const today = localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
      const startYear = year ? Number(year.slice(0, 4)) : Number(today.slice(5, 7)) >= 6 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
      const from = `${startYear}-06-01`;
      const to = `${startYear + 1}-05-31`;
      const label = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
      // The gender a resident is counted under: their hostel application, else their admission application, else the
      // block's (a boys' block houses men, a girls' block women; a mixed block leaves it unknown).
      const gender = sql.raw(`coalesce((select nullif(ha.gender, '') from hostel_applications ha where ha.student_id = a.student_id order by ha.created_at desc limit 1), (select nullif(ap.gender, '') from students s2 join applications ap on ap.id = s2.application_id where s2.id = a.student_id), case k.gender when 'boys' then 'male' when 'girls' then 'female' end, '')`);
      const byType = await tx.execute<{ type: string; hostels: number; capacity: number; residing: number; male: number; female: number; other: number }>(sql`
        with h as (select h.id, case h.gender when 'boys' then 'Boys' when 'girls' then 'Girls' else 'Co-ed' end as type from hostels h),
        cap as (select k.hostel_id, count(b.id)::int as beds from hostel_blocks k join hostel_rooms r on r.block_id = k.id join hostel_beds b on b.room_id = r.id where r.status <> 'closed' group by k.hostel_id),
        res as (select k.hostel_id, lower(${gender}) as g from hostel_allotments a join hostel_beds b on b.id = a.bed_id join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id
                where a.starts_on <= least(${to}::date, ${today}::date) and (a.vacated_on is null or a.vacated_on > least(${to}::date, ${today}::date)))
        select h.type, count(distinct h.id)::int as hostels, coalesce(sum(distinct_cap.beds), 0)::int as capacity,
          (select count(*)::int from res where res.hostel_id in (select id from h h2 where h2.type = h.type)) as residing,
          (select count(*)::int from res where res.hostel_id in (select id from h h2 where h2.type = h.type) and res.g in ('male', 'm', 'boy')) as male,
          (select count(*)::int from res where res.hostel_id in (select id from h h2 where h2.type = h.type) and res.g in ('female', 'f', 'girl')) as female,
          (select count(*)::int from res where res.hostel_id in (select id from h h2 where h2.type = h.type) and res.g not in ('male', 'm', 'boy', 'female', 'f', 'girl')) as other
        from h left join cap distinct_cap on distinct_cap.hostel_id = h.id group by h.type order by h.type`);
      const [beds] = (
        await tx.execute<{ hostels: number; blocks: number; rooms: number; beds: number; residents: number }>(sql`
        select (select count(*)::int from hostels) as hostels, (select count(*)::int from hostel_blocks) as blocks,
          (select count(*)::int from hostel_rooms where status <> 'closed') as rooms,
          (select count(*)::int from hostel_beds b join hostel_rooms r on r.id = b.room_id where r.status <> 'closed') as beds,
          (select count(*)::int from hostel_allotments where vacated_on is null) as residents`)
      ).rows;
      const byCategory = await tx.execute<{ category: string; residents: number }>(sql`
        select coalesce((select ha.category from hostel_applications ha where ha.student_id = a.student_id order by ha.created_at desc limit 1), 'general') as category, count(*)::int as residents
        from hostel_allotments a where a.vacated_on is null group by 1 order by 2 desc`);
      const [staff] = (
        await tx.execute<{ wardens: number; tutors: number; security: number; others: number }>(sql`
        select count(*) filter (where role = 'warden')::int as wardens, count(*) filter (where role = 'resident_tutor')::int as tutors,
          count(*) filter (where role = 'security')::int as security, count(*) filter (where role not in ('warden', 'resident_tutor', 'security'))::int as others
        from hostel_staff where from_on <= ${to}::date and (until_on is null or until_on >= ${from}::date)`)
      ).rows;
      const [year1] = (
        await tx.execute<{ sickbay: number; emergencies: number; complaints: number; resolved: number; days: number | null; passes: number; late: number; incidents: number; ragging: number; plans: number; diners: number }>(sql`
        select (select count(*)::int from hostel_sickbay where admitted_at::date between ${from}::date and ${to}::date) as sickbay,
          (select count(*)::int from hostel_sickbay where severity = 'emergency' and admitted_at::date between ${from}::date and ${to}::date) as emergencies,
          (select count(*)::int from hostel_complaints where created_at::date between ${from}::date and ${to}::date) as complaints,
          (select count(*)::int from hostel_complaints where status = 'resolved' and created_at::date between ${from}::date and ${to}::date) as resolved,
          (select round(avg(extract(epoch from resolved_at - created_at) / 86400)::numeric, 1)::float from hostel_complaints where resolved_at is not null and created_at::date between ${from}::date and ${to}::date) as days,
          (select count(*)::int from hostel_gate_passes where created_at::date between ${from}::date and ${to}::date) as passes,
          (select count(*)::int from hostel_late_entries where entered_at::date between ${from}::date and ${to}::date) as late,
          (select count(*)::int from hostel_incidents where occurred_on between ${from}::date and ${to}::date) as incidents,
          (select count(*)::int from hostel_incidents where kind = 'ragging' and occurred_on between ${from}::date and ${to}::date) as ragging,
          (select count(*)::int from mess_plans where active) as plans,
          (select count(*)::int from mess_subscriptions where ended_on is null) as diners`)
      ).rows;
      const [ug] = (
        await tx.execute<{ residents: number; done: number }>(sql`
        select count(*)::int as residents, count(*) filter (where exists (select 1 from antiragging_undertakings u where u.student_id = a.student_id and u.year_label = ${label} and u.status in ('received', 'verified')))::int as done
        from hostel_allotments a where a.vacated_on is null`)
      ).rows;
      const committees = await tx.execute<{ purpose: string }>(sql`select distinct purpose from hostel_committees where valid_until is null or valid_until >= ${from}::date`);
      const pct = (a: number, b: number) => (b ? Math.round((a * 1000) / b) / 10 : 0);
      return {
        year: label,
        from,
        to,
        aishe: { rows: byType.rows, total: byType.rows.reduce((s, r) => ({ hostels: s.hostels + r.hostels, capacity: s.capacity + r.capacity, residing: s.residing + r.residing }), { hostels: 0, capacity: 0, residing: 0 }) },
        naac: {
          ...beds,
          occupancyPercent: pct(beds.residents, beds.beds),
          byCategory: byCategory.rows,
          staff,
          mess: { plans: year1.plans, diners: year1.diners },
          antiRagging: { committee: committees.rows.some((c) => c.purpose === 'anti_ragging'), squad: committees.rows.some((c) => c.purpose === 'anti_ragging_squad'), undertakingsPercent: pct(ug.done, ug.residents), raggingIncidents: year1.ragging },
          health: { sickbayVisits: year1.sickbay, emergencies: year1.emergencies },
          grievances: { complaints: year1.complaints, resolved: year1.resolved, resolvedPercent: pct(year1.resolved, year1.complaints), meanDaysToResolve: year1.days },
          discipline: { outPasses: year1.passes, lateEntries: year1.late, incidents: year1.incidents },
        },
      };
    });
  }
}
