import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { and, asc, desc, eq, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, designations, exitClearances, separations, staffProfiles, tenants, users } from '../db/schema.js';
import { addDays } from './dates.js';
import { hasAnyRole, HR_ROLES, isHr, STAFF_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { relievingLetterPdf } from './letters-pdf.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const ResignBody = z.object({ userId: z.uuid().optional(), reason: z.string().trim().min(3).max(1000), resignedOn: Day.optional(), noticeDays: z.number().int().min(0).max(180).default(30), lastWorkingDay: Day.optional() });
const AcceptBody = z.object({ lastWorkingDay: Day.optional() });
const ClearBody = z.object({ status: z.enum(['pending', 'cleared']).default('cleared'), duesPaise: z.number().int().min(0).max(1_000_000_000).default(0), remarks: z.string().trim().max(500).nullable().optional() });
const SettleBody = z.object({ settlementPaise: z.number().int().min(-1_000_000_000).max(1_000_000_000), note: z.string().trim().min(5).max(3000) });

/** The departments that must sign off, and which roles besides HR may do it. */
const CLEARANCE: Record<string, RoleName[]> = {
  Department: ['hod'],
  Library: ['librarian'],
  Accounts: ['accountant'],
  IT: [],
  Hostel: [],
  HR: [],
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);
const OPEN = ['submitted', 'accepted', 'clearance'];

/** Staff exit: resignation and notice, clearance across departments, full-and-final note and the relieving letter. */
@Controller('v1/hr')
export class ExitController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
  ) {}

  private act = (p: UserPrincipal) => ({ tenantId: p.tenantId, actorType: 'user' as const, actorId: p.userId });

  private async load(tx: Tx, id: string, lock = false) {
    const q = tx.select().from(separations).where(eq(separations.id, id));
    const [s] = await (lock ? q.for('update') : q);
    if (!s) throw new NotFoundException('Exit record not found');
    return s;
  }

  private async detail(tx: Tx, id: string) {
    const s = await this.load(tx, id);
    const [u] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, s.userId));
    const clearances = await tx.select().from(exitClearances).where(eq(exitClearances.separationId, id)).orderBy(asc(exitClearances.department));
    const dues = clearances.reduce((n, c) => n + c.duesPaise, 0);
    const served = daysBetween(s.resignedOn, s.lastWorkingDay);
    return {
      ...s,
      fullName: u?.fullName ?? null,
      clearances,
      duesPaise: dues,
      noticeServedDays: Math.max(0, served),
      // What HR needs when drafting the full-and-final note.
      suggestion: { noticeShortfallDays: s.noticeShortfallDays, outstandingDuesPaise: dues, allCleared: clearances.length > 0 && clearances.every((c) => c.status === 'cleared') },
    };
  }

  private canSee(p: UserPrincipal, s: { userId: string }) {
    if (s.userId !== p.userId && !hasAnyRole(p, [...HR_ROLES, 'hod', 'librarian', 'accountant'])) throw new ForbiddenException('Not your exit record');
  }

  @Post('separations')
  @Auth('user', STAFF_ROLES)
  resign(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ResignBody)) b: z.infer<typeof ResignBody>) {
    if (b.userId && b.userId !== p.userId && !isHr(p)) throw new ForbiddenException('Only HR can record a resignation for someone else');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const userId = b.userId ?? p.userId;
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
      if (!u) throw new NotFoundException('Staff member not found');
      const [open] = await tx.select({ id: separations.id }).from(separations).where(eq(separations.userId, userId)).orderBy(desc(separations.createdAt)).limit(1);
      if (open) {
        const s = await this.load(tx, open.id);
        if (!['withdrawn'].includes(s.status)) throw new ConflictException(s.status === 'relieved' ? 'This person has already left' : 'A resignation is already in progress');
      }
      const resignedOn = b.resignedOn ?? (await this.hr.today(tx));
      const lastWorkingDay = b.lastWorkingDay ?? addDays(resignedOn, b.noticeDays);
      if (lastWorkingDay < resignedOn) throw new BadRequestException('The last working day cannot be before the resignation date');
      const shortfall = Math.max(0, b.noticeDays - daysBetween(resignedOn, lastWorkingDay));
      const [row] = await tx.insert(separations).values({ tenantId: p.tenantId, userId, resignedOn, noticeDays: b.noticeDays, lastWorkingDay, reason: b.reason, noticeShortfallDays: shortfall }).returning();
      await audit(tx, { ...this.act(p), action: 'hr.resignation_submitted.v1', subjectType: 'separation', subjectId: row.id, data: { userId, lastWorkingDay, shortfall } });
      return this.detail(tx, row.id);
    });
  }

  @Get('separations')
  @Auth('user', [...HR_ROLES, 'hod', 'librarian', 'accountant'])
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ s: separations, name: users.fullName }).from(separations).innerJoin(users, eq(users.id, separations.userId)).where(isHr(p) ? undefined : notInArray(separations.status, ['submitted', 'withdrawn', 'relieved'])).orderBy(desc(separations.createdAt));
      return rows.map((r) => ({ ...r.s, fullName: r.name }));
    });
  }

  @Get('separations/mine')
  @Auth('user', STAFF_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: separations.id }).from(separations).where(eq(separations.userId, p.userId)).orderBy(desc(separations.createdAt)).limit(1);
      return s ? this.detail(tx, s.id) : null;
    });
  }

  @Get('separations/:id')
  @Auth('user', STAFF_ROLES)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.detail(tx, id);
      this.canSee(p, d);
      return d;
    });
  }

  /** HR accepts the resignation (optionally agreeing a different last day) and opens clearance in every department. */
  @Post('separations/:id/accept')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  accept(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AcceptBody)) b: z.infer<typeof AcceptBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, id, true);
      if (s.status !== 'submitted') throw new ConflictException(`This resignation is already ${s.status}`);
      const lwd = b.lastWorkingDay ?? s.lastWorkingDay;
      if (lwd < s.resignedOn) throw new BadRequestException('The last working day cannot be before the resignation date');
      const shortfall = Math.max(0, s.noticeDays - daysBetween(s.resignedOn, lwd));
      await tx.update(separations).set({ status: 'clearance', lastWorkingDay: lwd, noticeShortfallDays: shortfall, updatedAt: new Date() }).where(eq(separations.id, id));
      await tx.insert(exitClearances).values(Object.keys(CLEARANCE).map((department) => ({ tenantId: p.tenantId, separationId: id, department })));
      await audit(tx, { ...this.act(p), action: 'hr.resignation_accepted.v1', subjectType: 'separation', subjectId: id, data: { lastWorkingDay: lwd, shortfall } });
      return this.detail(tx, id);
    });
  }

  /** A department signs off (or reopens) its clearance and records any dues. HR can act for any department. */
  @Put('separations/:id/clearances/:department')
  @Auth('user', [...HR_ROLES, 'hod', 'librarian', 'accountant'])
  clear(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('department') department: string, @Body(new ZodBody(ClearBody)) b: z.infer<typeof ClearBody>) {
    const allowed = CLEARANCE[department];
    if (!allowed) throw new BadRequestException(`Unknown department. Use one of ${Object.keys(CLEARANCE).join(', ')}`);
    if (!isHr(p) && !hasAnyRole(p, allowed)) throw new ForbiddenException(`Only ${department} or HR can clear this`);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, id, true);
      if (s.userId === p.userId) throw new ForbiddenException('You cannot clear your own exit');
      if (s.status !== 'clearance') throw new ConflictException(s.status === 'submitted' ? 'HR has not accepted the resignation yet' : `Clearance is closed: the exit is ${s.status}`);
      const cleared = b.status === 'cleared';
      const [row] = await tx
        .update(exitClearances)
        .set({ status: b.status, duesPaise: b.duesPaise, remarks: b.remarks ?? null, clearedBy: cleared ? p.userId : null, clearedAt: cleared ? new Date() : null })
        .where(and(eq(exitClearances.separationId, id), eq(exitClearances.department, department)))
        .returning();
      if (!row) throw new NotFoundException('Clearance not found');
      await audit(tx, { ...this.act(p), action: 'hr.exit_clearance.v1', subjectType: 'separation', subjectId: id, data: { department, status: b.status, duesPaise: b.duesPaise } });
      return this.detail(tx, id);
    });
  }

  /** The full-and-final settlement note and net amount (negative means the employee owes the institution). Needs every clearance. */
  @Put('separations/:id/settlement')
  @Auth('user', HR_ROLES)
  settle(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SettleBody)) b: z.infer<typeof SettleBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, id, true);
      if (s.status !== 'clearance' && s.status !== 'settled') throw new ConflictException(s.status === 'relieved' ? 'Already relieved' : 'Clearance has not started');
      const cl = await tx.select().from(exitClearances).where(eq(exitClearances.separationId, id));
      const pending = cl.filter((c) => c.status !== 'cleared').map((c) => c.department);
      if (pending.length) throw new ConflictException(`Clearance pending from: ${pending.join(', ')}`);
      await tx.update(separations).set({ status: 'settled', settlementPaise: b.settlementPaise, settlementNote: b.note, updatedAt: new Date() }).where(eq(separations.id, id));
      await audit(tx, { ...this.act(p), action: 'hr.exit_settlement.v1', subjectType: 'separation', subjectId: id, data: { settlementPaise: b.settlementPaise } });
      return this.detail(tx, id);
    });
  }

  /** Relieves the employee on or after their last working day: the staff record is closed and their login disabled. */
  @Post('separations/:id/relieve')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  relieve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, id, true);
      if (s.status !== 'settled') throw new ConflictException(s.status === 'relieved' ? 'Already relieved' : 'Settle the full and final account first');
      const today = await this.hr.today(tx);
      if (today < s.lastWorkingDay) throw new ConflictException(`The last working day is ${s.lastWorkingDay}; relieve on or after it`);
      await tx.update(separations).set({ status: 'relieved', relievedOn: today, updatedAt: new Date() }).where(eq(separations.id, id));
      await tx.update(staffProfiles).set({ status: 'exited', dateOfLeaving: s.lastWorkingDay }).where(eq(staffProfiles.userId, s.userId));
      await tx.update(users).set({ status: 'disabled' }).where(eq(users.id, s.userId));
      await audit(tx, { ...this.act(p), action: 'hr.staff_relieved.v1', subjectType: 'separation', subjectId: id, data: { userId: s.userId, lastWorkingDay: s.lastWorkingDay } });
      return this.detail(tx, id);
    });
  }

  @Post('separations/:id/withdraw')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, id, true);
      if (s.userId !== p.userId && !isHr(p)) throw new ForbiddenException('Not your resignation');
      if (!OPEN.includes(s.status)) throw new ConflictException(`This exit is already ${s.status}`);
      await tx.update(separations).set({ status: 'withdrawn', updatedAt: new Date() }).where(eq(separations.id, id));
      await audit(tx, { ...this.act(p), action: 'hr.resignation_withdrawn.v1', subjectType: 'separation', subjectId: id, data: {} });
      return this.detail(tx, id);
    });
  }

  @Get('separations/:id/relieving-letter')
  @Auth('user', STAFF_ROLES)
  async letter(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const d = await this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.load(tx, id);
      if (s.userId !== p.userId && !isHr(p)) throw new ForbiddenException('Not your letter');
      if (s.status !== 'relieved') throw new ConflictException('The relieving letter is issued once the employee is relieved');
      const [u] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, s.userId));
      const [sp] = await tx
        .select({ code: staffProfiles.employeeCode, doj: staffProfiles.dateOfJoining, designation: designations.name, department: departments.name })
        .from(staffProfiles)
        .leftJoin(designations, eq(designations.id, staffProfiles.designationId))
        .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
        .where(eq(staffProfiles.userId, s.userId));
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      return { s, name: u?.name ?? '', sp, institution: t?.name ?? '' };
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="relieving-letter.pdf"');
    return new StreamableFile(
      relievingLetterPdf({ institution: d.institution, employeeName: d.name, employeeCode: d.sp?.code ?? null, designation: d.sp?.designation ?? null, department: d.sp?.department ?? null, joinedOn: d.sp?.doj ?? null, lastWorkingDay: d.s.lastWorkingDay, relievedOn: d.s.relievedOn!, referenceNo: `REL/${d.s.relievedOn!.slice(0, 4)}/${d.s.id.slice(0, 6).toUpperCase()}` }),
    );
  }
}
