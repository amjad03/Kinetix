import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, ServiceUnavailableException } from '@nestjs/common';
import type { BankDetailsView, Designation, Holiday, StaffAttendanceSummary } from '@kinetix/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, designations, staffProfiles } from '../db/schema.js';
import { requireDay, requireMonth } from './dates.js';
import { HR_ROLES, PAYROLL_ROLES, STAFF_ROLES, requireVersion } from './hr.access.js';
import { bankAad, HrService, NO_SECRETS_KEY } from './hr.service.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Paise = z.number().int().min(0).max(100_000_000_00);
const Pan = z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN looks like ABCDE1234F');
const Uan = z.string().trim().regex(/^\d{12}$/, 'UAN has 12 digits');

const DesignationBody = z.object({ name: z.string().trim().min(1).max(80), grade: z.string().trim().max(20).nullable().optional() });
const ProfileBody = z.object({
  employeeCode: z.string().trim().min(1).max(30),
  departmentId: z.uuid().nullable().optional(),
  designationId: z.uuid().nullable().optional(),
  employmentType: z.enum(['permanent', 'contract', 'probation', 'visiting']).default('permanent'),
  dateOfJoining: Day.nullable().optional(),
  dateOfLeaving: Day.nullable().optional(),
  status: z.enum(['active', 'on_notice', 'exited']).default('active'),
  gender: z.enum(['female', 'male', 'other']).nullable().optional(),
  dateOfBirth: Day.nullable().optional(),
  pan: Pan.nullable().optional(),
  uan: Uan.nullable().optional(),
  esiNumber: z.string().trim().max(20).nullable().optional(),
  taxRegime: z.enum(['new', 'old']).default('new'),
  tax80cPaise: Paise.default(0),
  taxOtherDeductionsPaise: Paise.default(0),
  pfEnabled: z.boolean().default(true),
  esiEnabled: z.boolean().default(false),
  ptEnabled: z.boolean().default(true),
  /** 0 (or omitted) when creating the record. */
  expectedVersion: z.number().int().min(0).default(0),
});
const BankBody = z.object({
  accountHolder: z.string().trim().min(1).max(100),
  bankName: z.string().trim().min(1).max(100),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC looks like HDFC0001234'),
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'Account number has 9 to 18 digits'),
});
const MarkBody = z.object({
  date: Day,
  entries: z.array(z.object({ userId: z.uuid(), status: z.enum(['present', 'absent', 'half_day', 'on_leave']), note: z.string().trim().max(200).optional() })).min(1).max(500),
});
const ImportBody = z.object({ csv: z.string().min(1).max(2_000_000) });

/** Staff records, designations, staff attendance and holidays (docs/architecture/hr-payroll.md). */
@Controller('v1/hr')
export class HrController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
  ) {}

  // ----- designations ----------------------------------------------------------------------------

  @Get('designations')
  @Auth('user', PAYROLL_ROLES)
  designations(@CurrentPrincipal() p: UserPrincipal): Promise<Designation[]> {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: designations.id, name: designations.name, grade: designations.grade }).from(designations).orderBy(asc(designations.name)));
  }

  @Post('designations')
  @Auth('user', HR_ROLES)
  createDesignation(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DesignationBody)) body: z.infer<typeof DesignationBody>): Promise<Designation> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: designations.id }).from(designations).where(eq(designations.name, body.name));
      if (dup) throw new ConflictException('That designation already exists');
      const [row] = await tx.insert(designations).values({ tenantId: p.tenantId, name: body.name, grade: body.grade ?? null }).returning({ id: designations.id, name: designations.name, grade: designations.grade });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.designation_created', subjectType: 'designation', subjectId: row.id, data: body });
      return row;
    });
  }

  // ----- staff records ---------------------------------------------------------------------------

  @Get('staff')
  @Auth('user', PAYROLL_ROLES)
  staff(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.hr.listStaff(tx));
  }

  @Get('me')
  @Auth('user', STAFF_ROLES)
  me(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.hr.profile(tx, p.userId));
  }

  @Get('staff/:userId')
  @Auth('user', PAYROLL_ROLES)
  profile(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.hr.profile(tx, userId));
  }

  @Put('staff/:userId')
  @Auth('user', HR_ROLES)
  saveProfile(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(ProfileBody)) b: z.infer<typeof ProfileBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.hr.profile(tx, userId); // 404 unless they are staff
      requireVersion(before.version, b.expectedVersion);
      if (b.dateOfJoining && b.dateOfLeaving && b.dateOfLeaving < b.dateOfJoining) throw new BadRequestException('The leaving date is before the joining date');
      await this.assertRefs(tx, b);
      const { expectedVersion: _v, ...fields } = b;
      const values = {
        ...fields,
        departmentId: b.departmentId ?? null,
        designationId: b.designationId ?? null,
        dateOfJoining: b.dateOfJoining ?? null,
        dateOfLeaving: b.dateOfLeaving ?? null,
        gender: b.gender ?? null,
        dateOfBirth: b.dateOfBirth ?? null,
        pan: b.pan ?? null,
        uan: b.uan ?? null,
        esiNumber: b.esiNumber ?? null,
      };
      try {
        if (before.version === 0) await tx.insert(staffProfiles).values({ tenantId: p.tenantId, userId, ...values });
        else await tx.update(staffProfiles).set({ ...values, version: before.version + 1, updatedAt: new Date() }).where(eq(staffProfiles.userId, userId));
      } catch (e) {
        if ((e as { code?: string; cause?: { code?: string } }).cause?.code === '23505' || (e as { code?: string }).code === '23505') throw new ConflictException('That employee code is already in use');
        throw e;
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: before.version === 0 ? 'hr.staff_created' : 'hr.staff_updated', subjectType: 'user', subjectId: userId, data: { employeeCode: b.employeeCode, status: b.status, taxRegime: b.taxRegime } });
      return this.hr.profile(tx, userId);
    });
  }

  private async assertRefs(tx: Tx, b: { departmentId?: string | null; designationId?: string | null }) {
    if (b.departmentId && !(await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, b.departmentId))).length) throw new BadRequestException('Department not found');
    if (b.designationId && !(await tx.select({ id: designations.id }).from(designations).where(eq(designations.id, b.designationId))).length) throw new BadRequestException('Designation not found');
  }

  /** The account number is encrypted at rest; only the last four digits come back. */
  @Put('staff/:userId/bank')
  @Auth('user', HR_ROLES)
  saveBank(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(BankBody)) b: z.infer<typeof BankBody>): Promise<BankDetailsView> {
    if (!this.hr.box) throw new ServiceUnavailableException(NO_SECRETS_KEY);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select({ userId: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
      if (!row) throw new ConflictException('Create the staff record before adding bank details');
      await tx
        .update(staffProfiles)
        .set({ bankAccountHolder: b.accountHolder, bankName: b.bankName, bankIfsc: b.ifsc, bankAccountEnc: this.hr.box!.encrypt(b.accountNumber, bankAad(p.tenantId, userId)), bankAccountLast4: b.accountNumber.slice(-4), version: sql`${staffProfiles.version} + 1`, updatedAt: new Date() })
        .where(eq(staffProfiles.userId, userId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.bank_updated', subjectType: 'user', subjectId: userId, data: { ifsc: b.ifsc, last4: b.accountNumber.slice(-4) } });
      return { accountHolder: b.accountHolder, bankName: b.bankName, ifsc: b.ifsc, accountLast4: b.accountNumber.slice(-4) };
    });
  }

  // ----- attendance ------------------------------------------------------------------------------

  @Post('attendance/check-in')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  checkIn(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.hr.checkIn(tx, p.tenantId, p.userId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.check_in', subjectType: 'user', subjectId: p.userId });
      return r;
    });
  }

  @Post('attendance/check-out')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  checkOut(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.hr.checkOut(tx, p.userId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.check_out', subjectType: 'user', subjectId: p.userId });
      return r;
    });
  }

  /** The caller's month (default: this month) and today's mark. */
  @Get('attendance/me')
  @Auth('user', STAFF_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('month') month?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.hr.today(tx);
      const ym = month ? requireMonth(month) : today.slice(0, 7);
      return { today: await this.hr.day(tx, p.userId, today), month: ym, days: await this.hr.month(tx, p.userId, ym) };
    });
  }

  @Get('attendance/summary')
  @Auth('user', PAYROLL_ROLES)
  summary(@CurrentPrincipal() p: UserPrincipal, @Query('month') month?: string): Promise<StaffAttendanceSummary[]> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ym = requireMonth(month ?? (await this.hr.today(tx)).slice(0, 7));
      const settings = await this.hr.settings(tx, p.tenantId);
      const lop = await this.hr.lopByUser(tx, ym, settings);
      const staff = await this.hr.listStaff(tx);
      const out: StaffAttendanceSummary[] = [];
      for (const s of staff) {
        const days = await this.hr.month(tx, s.userId, ym);
        const n = (st: string) => days.filter((d) => d.status === st).length;
        out.push({ userId: s.userId, fullName: s.fullName, employeeCode: s.employeeCode, present: n('present'), absent: n('absent'), halfDay: n('half_day'), onLeave: n('on_leave'), lopDays: lop.get(s.userId) ?? 0 });
      }
      return out;
    });
  }

  /** Every staff member for a day, marked or not. */
  @Get('attendance')
  @Auth('user', HR_ROLES)
  day(@CurrentPrincipal() p: UserPrincipal, @Query('date') date?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.hr.dayRows(tx, date ? requireDay(date) : await this.hr.today(tx)));
  }

  @Put('attendance')
  @Auth('user', HR_ROLES)
  mark(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MarkBody)) b: z.infer<typeof MarkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.date > (await this.hr.today(tx))) throw new BadRequestException('Attendance cannot be marked for a future date');
      await this.hr.markManual(tx, p.tenantId, p.userId, b.date, b.entries);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.attendance_marked', subjectType: 'staff_attendance', data: { date: b.date, count: b.entries.length } });
      return this.hr.dayRows(tx, b.date);
    });
  }

  @Post('attendance/import')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  import(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ImportBody)) b: z.infer<typeof ImportBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.hr.importBiometric(tx, p.tenantId, p.userId, b.csv);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.attendance_imported', subjectType: 'staff_attendance', data: { imported: r.imported, errors: r.errors.length } });
      return r;
    });
  }

  // ----- holidays --------------------------------------------------------------------------------

  /** Institution-wide holidays from the academic calendar, one entry per day. */
  @Get('holidays')
  @Auth('user', STAFF_ROLES)
  holidays(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string): Promise<Holiday[]> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.hr.today(tx);
      const f = from ? requireDay(from, 'from') : `${today.slice(0, 4)}-01-01`;
      const t = to ? requireDay(to, 'to') : `${today.slice(0, 4)}-12-31`;
      if (t < f || (new Date(t).getTime() - new Date(f).getTime()) / 86400_000 > 400) throw new BadRequestException('Choose a range of at most 400 days');
      return this.hr.holidayDates(tx, f, t);
    });
  }
}
