import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AttendanceImportResult, BankDetailsView, PayrollSettings, StaffAttendanceRow, StaffProfile, StaffSummary } from '@kinetix/shared';
import { and, asc, eq, inArray, lte, gte, sql } from 'drizzle-orm';
import { SecretBox } from '../common/secret-box.js';
import { Clock, localParts, zonedToInstant } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import type { Tx } from '../db/db.service.js';
import { departments, designations, leaveRequests, leaveTypes, payrollRuns, payrollSettings, staffAttendance, staffProfiles, tenants, userRoles, users } from '../db/schema.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { STAFF_ROLES } from './hr.access.js';
import { parseBiometricCsv } from './biometric-csv.js';
import { eachDay, monthEnd, monthStart } from './dates.js';
import { lopDays } from './lop.js';
import { KARNATAKA_PT } from './payroll-math.js';

export const DEFAULT_LEDGERS = {
  salaryExpense: 'Salaries & Wages',
  employerPfExpense: 'Employer PF Contribution',
  employerEsiExpense: 'Employer ESI Contribution',
  pfPayable: 'PF Payable',
  esiPayable: 'ESI Payable',
  ptPayable: 'Professional Tax Payable',
  tdsPayable: 'TDS on Salary Payable',
  salaryPayable: 'Salary Payable',
  otherDeductions: 'Staff Recoveries',
};

export const bankAad = (tenantId: string, userId: string) => `${tenantId}:staff.${userId}.bank_account`;
export const LOCKED_MONTH = 'Payroll for that month is locked';
export const NO_SECRETS_KEY = 'Bank details cannot be stored on this server yet (SECRETS_ENCRYPTION_KEY is not set)';

@Injectable()
export class HrService {
  readonly box: SecretBox | undefined;

  constructor(
    @Inject(ENV) env: Env,
    private readonly clock: Clock,
    private readonly calendar: CalendarService,
  ) {
    this.box = SecretBox.fromEnv(env);
  }

  async timezone(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return t?.tz ?? 'Asia/Kolkata';
  }

  async today(tx: Tx): Promise<string> {
    return localParts(this.clock.now(), await this.timezone(tx)).date;
  }

  async settings(tx: Tx, tenantId: string): Promise<PayrollSettings> {
    await tx.insert(payrollSettings).values({ tenantId, ptSlabs: KARNATAKA_PT, ledgers: DEFAULT_LEDGERS }).onConflictDoNothing();
    const [r] = await tx.select().from(payrollSettings);
    return {
      pfCapAtCeiling: r.pfCapAtCeiling,
      pfWageCeilingPaise: r.pfWageCeilingPaise,
      esiGrossLimitPaise: r.esiGrossLimitPaise,
      ptState: r.ptState,
      ptSlabs: r.ptSlabs as PayrollSettings['ptSlabs'],
      weeklyOffs: r.weeklyOffs,
      ledgers: { ...DEFAULT_LEDGERS, ...(r.ledgers as object) } as PayrollSettings['ledgers'],
    };
  }

  /** Institution-wide holidays in a range (calendar events of kind holiday with no program filter). */
  async holidayDates(tx: Tx, from: string, to: string): Promise<{ date: string; title: string }[]> {
    const hol = await this.calendar.holidays(tx, from, to);
    const out: { date: string; title: string }[] = [];
    for (const h of hol.list) {
      if (h.programIds !== null) continue;
      for (const d of eachDay(h.startsOn < from ? from : h.startsOn, h.endsOn > to ? to : h.endsOn)) out.push({ date: d, title: h.title });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  async assertMonthOpen(tx: Tx, date: string): Promise<void> {
    const [run] = await tx.select({ id: payrollRuns.id }).from(payrollRuns).where(and(eq(payrollRuns.month, date.slice(0, 7)), eq(payrollRuns.status, 'locked')));
    if (run) throw new ConflictException(LOCKED_MONTH);
  }

  // ----- staff records ---------------------------------------------------------------------------

  private staffRows(tx: Tx, where?: ReturnType<typeof eq>) {
    return tx
      .select({
        u: { id: users.id, fullName: users.fullName, email: users.email, phone: users.phone },
        roles: sql<string[]>`array_agg(distinct ${userRoles.role}::text)`,
        p: staffProfiles,
        dept: { id: departments.id, name: departments.name },
        des: { id: designations.id, name: designations.name },
      })
      .from(users)
      .innerJoin(userRoles, and(eq(userRoles.userId, users.id), inArray(userRoles.role, STAFF_ROLES)))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
      .leftJoin(designations, eq(designations.id, staffProfiles.designationId))
      .where(and(eq(users.status, 'active'), where))
      .groupBy(users.id, staffProfiles.userId, departments.id, designations.id)
      .orderBy(asc(users.fullName));
  }

  private summaryOf(r: Awaited<ReturnType<HrService['staffRows']>>[number]): StaffSummary {
    return {
      userId: r.u.id,
      fullName: r.u.fullName,
      email: r.u.email,
      phone: r.u.phone,
      roles: r.roles,
      employeeCode: r.p?.employeeCode ?? null,
      department: r.dept?.id ? { id: r.dept.id, name: r.dept.name } : null,
      designation: r.des?.id ? { id: r.des.id, name: r.des.name } : null,
      employmentType: (r.p?.employmentType as StaffSummary['employmentType']) ?? null,
      status: (r.p?.status as StaffSummary['status']) ?? null,
      dateOfJoining: r.p?.dateOfJoining ?? null,
    };
  }

  async listStaff(tx: Tx): Promise<StaffSummary[]> {
    return (await this.staffRows(tx)).map((r) => this.summaryOf(r));
  }

  async isStaff(tx: Tx, userId: string): Promise<boolean> {
    return (await this.staffRows(tx, eq(users.id, userId))).length > 0;
  }

  /** The record as the API shows it: no full bank number, ever. */
  async profile(tx: Tx, userId: string): Promise<StaffProfile> {
    const [r] = await this.staffRows(tx, eq(users.id, userId));
    if (!r) throw new NotFoundException('Staff member not found');
    const p = r.p;
    const bank: BankDetailsView | null = p?.bankAccountEnc ? { accountHolder: p.bankAccountHolder!, bankName: p.bankName!, ifsc: p.bankIfsc!, accountLast4: p.bankAccountLast4! } : null;
    return {
      ...this.summaryOf(r),
      dateOfLeaving: p?.dateOfLeaving ?? null,
      gender: (p?.gender as StaffProfile['gender']) ?? null,
      dateOfBirth: p?.dateOfBirth ?? null,
      pan: p?.pan ?? null,
      uan: p?.uan ?? null,
      esiNumber: p?.esiNumber ?? null,
      taxRegime: (p?.taxRegime as StaffProfile['taxRegime']) ?? 'new',
      tax80cPaise: p?.tax80cPaise ?? 0,
      taxOtherDeductionsPaise: p?.taxOtherDeductionsPaise ?? 0,
      pfEnabled: p?.pfEnabled ?? true,
      esiEnabled: p?.esiEnabled ?? false,
      ptEnabled: p?.ptEnabled ?? true,
      bank,
      version: p?.version ?? 0,
    };
  }

  /** Decrypts a staff member's account number (bank-transfer export only). */
  accountNumber(tenantId: string, userId: string, enc: string): string {
    if (!this.box) throw new ForbiddenException(NO_SECRETS_KEY);
    return this.box.decrypt(enc, bankAad(tenantId, userId));
  }

  // ----- attendance ------------------------------------------------------------------------------

  async checkIn(tx: Tx, tenantId: string, userId: string) {
    const today = await this.today(tx);
    const now = this.clock.now();
    const [existing] = await tx.select().from(staffAttendance).where(and(eq(staffAttendance.userId, userId), eq(staffAttendance.date, today)));
    if (existing?.status === 'on_leave') throw new ConflictException('You are marked on leave today');
    if (!existing) await tx.insert(staffAttendance).values({ tenantId, userId, date: today, status: 'present', checkInAt: now, source: 'app', markedBy: userId });
    else if (!existing.checkInAt) await tx.update(staffAttendance).set({ checkInAt: now, status: existing.status === 'absent' ? 'present' : existing.status, updatedAt: now }).where(and(eq(staffAttendance.userId, userId), eq(staffAttendance.date, today)));
    return this.day(tx, userId, today);
  }

  async checkOut(tx: Tx, userId: string) {
    const today = await this.today(tx);
    const [existing] = await tx.select().from(staffAttendance).where(and(eq(staffAttendance.userId, userId), eq(staffAttendance.date, today)));
    if (!existing?.checkInAt) throw new ConflictException('Check in first');
    await tx.update(staffAttendance).set({ checkOutAt: this.clock.now(), updatedAt: this.clock.now() }).where(and(eq(staffAttendance.userId, userId), eq(staffAttendance.date, today)));
    return this.day(tx, userId, today);
  }

  async day(tx: Tx, userId: string, date: string) {
    const [r] = await tx.select().from(staffAttendance).where(and(eq(staffAttendance.userId, userId), eq(staffAttendance.date, date)));
    return r ? { date, status: r.status, checkInAt: r.checkInAt?.toISOString() ?? null, checkOutAt: r.checkOutAt?.toISOString() ?? null, source: r.source, note: r.note } : null;
  }

  async month(tx: Tx, userId: string, ym: string) {
    const rows = await tx.select().from(staffAttendance).where(and(eq(staffAttendance.userId, userId), gte(staffAttendance.date, monthStart(ym)), lte(staffAttendance.date, monthEnd(ym)))).orderBy(asc(staffAttendance.date));
    return rows.map((r) => ({ date: r.date, status: r.status, checkInAt: r.checkInAt?.toISOString() ?? null, checkOutAt: r.checkOutAt?.toISOString() ?? null, source: r.source, note: r.note }));
  }

  async dayRows(tx: Tx, date: string): Promise<StaffAttendanceRow[]> {
    const staff = await this.staffRows(tx);
    const marks = await tx.select().from(staffAttendance).where(eq(staffAttendance.date, date));
    const leaves = await tx.select({ userId: leaveRequests.userId }).from(leaveRequests).where(and(eq(leaveRequests.status, 'approved'), lte(leaveRequests.fromDate, date), gte(leaveRequests.toDate, date)));
    const onLeave = new Set(leaves.map((l) => l.userId));
    const byUser = new Map(marks.map((m) => [m.userId, m]));
    return staff.map((s) => {
      const m = byUser.get(s.u.id);
      return {
        userId: s.u.id,
        fullName: s.u.fullName,
        employeeCode: s.p?.employeeCode ?? null,
        status: (m?.status as StaffAttendanceRow['status']) ?? null,
        checkInAt: m?.checkInAt?.toISOString() ?? null,
        checkOutAt: m?.checkOutAt?.toISOString() ?? null,
        source: (m?.source as StaffAttendanceRow['source']) ?? null,
        onLeave: onLeave.has(s.u.id),
      };
    });
  }

  /** Manual marks overwrite whatever the app or device recorded. */
  async markManual(tx: Tx, tenantId: string, by: string, date: string, entries: { userId: string; status: 'present' | 'absent' | 'half_day' | 'on_leave'; note?: string }[]) {
    await this.assertMonthOpen(tx, date);
    const staff = new Set((await this.staffRows(tx, inArray(users.id, entries.map((e) => e.userId)))).map((r) => r.u.id));
    const unknown = entries.find((e) => !staff.has(e.userId));
    if (unknown) throw new NotFoundException('Staff member not found');
    const now = this.clock.now();
    for (const e of entries) {
      await tx
        .insert(staffAttendance)
        .values({ tenantId, userId: e.userId, date, status: e.status, source: 'manual', note: e.note ?? null, markedBy: by })
        .onConflictDoUpdate({ target: [staffAttendance.userId, staffAttendance.date], set: { status: e.status, source: 'manual', note: e.note ?? null, markedBy: by, updatedAt: now } });
    }
  }

  async importBiometric(tx: Tx, tenantId: string, by: string, csv: string): Promise<AttendanceImportResult> {
    const parsed = parseBiometricCsv(csv);
    const errors = [...parsed.errors];
    const codes = [...new Set(parsed.days.map((d) => d.employeeCode))];
    const people = codes.length ? await tx.select({ userId: staffProfiles.userId, code: staffProfiles.employeeCode }).from(staffProfiles).where(inArray(staffProfiles.employeeCode, codes)) : [];
    const byCode = new Map(people.map((p) => [p.code, p.userId]));
    const tz = await this.timezone(tx);
    const locked = new Set((await tx.select({ month: payrollRuns.month }).from(payrollRuns).where(eq(payrollRuns.status, 'locked'))).map((r) => r.month));
    let imported = 0;
    for (const d of parsed.days) {
      const userId = byCode.get(d.employeeCode);
      if (!userId) errors.push({ line: d.line, error: `Unknown employee code ${d.employeeCode}` });
      else if (locked.has(d.date.slice(0, 7))) errors.push({ line: d.line, error: LOCKED_MONTH });
      else {
        const at = (t: string) => zonedToInstant(d.date, t, tz);
        const values = { tenantId, userId, date: d.date, status: 'present', checkInAt: at(d.inTime), checkOutAt: d.outTime ? at(d.outTime) : null, source: 'biometric', markedBy: by };
        // Never overwrite what a person marked by hand.
        const done = await tx
          .insert(staffAttendance)
          .values(values)
          .onConflictDoUpdate({ target: [staffAttendance.userId, staffAttendance.date], set: { status: 'present', checkInAt: values.checkInAt, checkOutAt: values.checkOutAt, source: 'biometric', updatedAt: this.clock.now() }, setWhere: sql`${staffAttendance.source} <> 'manual'` })
          .returning({ userId: staffAttendance.userId });
        if (done.length) imported++;
        else errors.push({ line: d.line, error: 'Already marked by hand; left as it is' });
      }
    }
    return { imported, errors: errors.sort((a, b) => a.line - b.line) };
  }

  /** Loss-of-pay days per staff member for a month, as payroll will count them. */
  async lopByUser(tx: Tx, ym: string, settings: PayrollSettings): Promise<Map<string, number>> {
    const from = monthStart(ym);
    const to = monthEnd(ym);
    const holidays = new Set((await this.holidayDates(tx, from, to)).map((h) => h.date));
    const marks = await tx.select().from(staffAttendance).where(and(gte(staffAttendance.date, from), lte(staffAttendance.date, to)));
    const leaves = await tx
      .select({ userId: leaveRequests.userId, from: leaveRequests.fromDate, to: leaveRequests.toDate, halfDay: leaveRequests.halfDay, paid: leaveTypes.paid })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(and(eq(leaveRequests.status, 'approved'), lte(leaveRequests.fromDate, to), gte(leaveRequests.toDate, from)));
    const profiles = await tx.select({ userId: staffProfiles.userId, joined: staffProfiles.dateOfJoining, left: staffProfiles.dateOfLeaving }).from(staffProfiles);
    const out = new Map<string, number>();
    for (const p of profiles) {
      out.set(
        p.userId,
        lopDays({
          month: ym,
          weeklyOffs: settings.weeklyOffs,
          holidays,
          attendance: new Map(marks.filter((m) => m.userId === p.userId).map((m) => [m.date, m.status as 'present'])),
          leaves: leaves.filter((l) => l.userId === p.userId),
          dateOfJoining: p.joined,
          dateOfLeaving: p.left,
        }),
      );
    }
    return out;
  }
}
