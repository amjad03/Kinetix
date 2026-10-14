import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, Global, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeHoldOverrides } from '../db/schema-fee-depth.js';
import { sections, students, users } from '../db/schema.js';
import { rupees } from '../documents/doc-data.js';
import { settingsOf } from '../fee-accounts/fee-accounts.service.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { DuesService, type DuesPurpose } from './dues.service.js';
import { FeeDepthModule } from './fee-depth.module.js';

export const HOLD_PURPOSES = ['hallTicket', 'results', 'tc'] as const satisfies readonly DuesPurpose[];
const WHAT: Record<DuesPurpose, string> = { hallTicket: 'The hall ticket', results: 'The result', tc: 'The transfer certificate' };
/** Who may let a held document through. */
const OVERRIDERS: RoleName[] = ['principal'];

export interface FeeHold {
  purpose: DuesPurpose;
  /** Dues hold it back (the setting is on and enough is overdue). */
  held: boolean;
  /** Held, but the principal has let it through. */
  overridden: boolean;
  /** The institution holds this document for dues at all (fee settings; off by default). */
  enabled: boolean;
  /** For the student, family or office: why it is held and what to do. */
  message: string | null;
}

/**
 * Fee holds: with the institution's dues block on (fee settings, off by default), overdue fees hold back a student's
 * hall ticket, the result shown to the student and family, and the transfer certificate. The principal can let one
 * through for a student (kept and audited). Exam, results and certificate offices call {@link FeeHoldsService.assertClear}.
 */
@Injectable()
export class FeeHoldsService {
  constructor(private readonly dues: DuesService) {}

  /** Every purpose's hold for a student, with the dues behind it. */
  async status(tx: Tx, tenantId: string, studentId: string) {
    const b = await this.dues.blocks(tx, tenantId, studentId);
    const on = (await settingsOf(tx, tenantId)).duesBlock;
    const overrides = await tx.select().from(feeHoldOverrides).where(and(eq(feeHoldOverrides.studentId, studentId), isNull(feeHoldOverrides.revokedAt))).orderBy(desc(feeHoldOverrides.createdAt));
    const holds: FeeHold[] = HOLD_PURPOSES.map((purpose) => {
      const overridden = b[purpose] && overrides.some((o) => o.purpose === purpose);
      const held = b[purpose];
      return { purpose, held, overridden, enabled: !!on[purpose], message: held && !overridden ? `${WHAT[purpose]} is held for unpaid fees: ${rupees(b.overduePaise)} is overdue. Pay the dues at the fee counter, or ask the principal to allow it.` : null };
    });
    return { duePaise: b.duePaise, overduePaise: b.overduePaise, holds, overrides };
  }

  /** Whether the institution holds this document for dues at all (off by default). */
  async enabled(tx: Tx, tenantId: string, purpose: DuesPurpose): Promise<boolean> {
    return !!(await settingsOf(tx, tenantId)).duesBlock[purpose];
  }

  /** The hold on one purpose. */
  async check(tx: Tx, tenantId: string, studentId: string, purpose: DuesPurpose): Promise<FeeHold> {
    if (!(await this.enabled(tx, tenantId, purpose))) return { purpose, held: false, overridden: false, enabled: false, message: null };
    return (await this.status(tx, tenantId, studentId)).holds.find((h) => h.purpose === purpose)!;
  }

  /** Throws 403 with the reason when dues hold this back and the principal has not let it through. */
  async assertClear(tx: Tx, tenantId: string, studentId: string, purpose: DuesPurpose): Promise<void> {
    const h = await this.check(tx, tenantId, studentId, purpose);
    if (h.held && !h.overridden) throw new ForbiddenException(h.message);
  }
}

const OverrideBody = z.object({ purpose: z.enum(HOLD_PURPOSES), reason: z.string().trim().min(3).max(500) });
const RevokeBody = z.object({ reason: z.string().trim().min(3).max(500) });

/** A student's fee holds, and the principal's overrides. */
@Controller('v1/fee-holds')
export class FeeHoldsController {
  constructor(
    private readonly db: DbService,
    private readonly holds: FeeHoldsService,
  ) {}

  /**
   * The principal's overrides across students, newest first: the ones in force, or (`?all=1`) withdrawn ones too,
   * with the student, the class and who granted or withdrew each.
   */
  @Get()
  @Auth('user', [...FEE_ROLES, 'exam_controller', 'hod'])
  list(@CurrentPrincipal() p: UserPrincipal, @Query('all') all?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: feeHoldOverrides.id,
          studentId: feeHoldOverrides.studentId,
          studentName: students.fullName,
          rollNo: students.rollNo,
          section: sections.displayName,
          purpose: feeHoldOverrides.purpose,
          reason: feeHoldOverrides.reason,
          grantedBy: feeHoldOverrides.grantedBy,
          revokedBy: feeHoldOverrides.revokedBy,
          revokedAt: feeHoldOverrides.revokedAt,
          createdAt: feeHoldOverrides.createdAt,
        })
        .from(feeHoldOverrides)
        .innerJoin(students, eq(students.id, feeHoldOverrides.studentId))
        .leftJoin(sections, eq(sections.id, students.sectionId))
        .where(all === '1' || all === 'true' ? undefined : isNull(feeHoldOverrides.revokedAt))
        .orderBy(desc(feeHoldOverrides.createdAt))
        .limit(500);
      const ids = [...new Set(rows.flatMap((r) => [r.grantedBy, r.revokedBy].filter((x): x is string => !!x)))];
      const names = new Map(ids.length ? (await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.name]) : []);
      return rows.map((r) => ({ ...r, grantedBy: r.grantedBy ? (names.get(r.grantedBy) ?? null) : null, revokedBy: r.revokedBy ? (names.get(r.revokedBy) ?? null) : null }));
    });
  }

  @Get(':studentId')
  @Auth('user', [...FEE_ROLES, 'exam_controller', 'hod'])
  get(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [st] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
      if (!st) throw new NotFoundException('Student not found');
      const s = await this.holds.status(tx, p.tenantId, studentId);
      const ids = [...new Set(s.overrides.flatMap((o) => (o.grantedBy ? [o.grantedBy] : [])))];
      const names = new Map(ids.length ? (await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.name]) : []);
      return { ...s, overrides: s.overrides.map((o) => ({ id: o.id, purpose: o.purpose, reason: o.reason, grantedBy: o.grantedBy ? (names.get(o.grantedBy) ?? null) : null, createdAt: o.createdAt })) };
    });
  }

  /** The principal lets a held hall ticket, result or TC through for this student. */
  @Post(':studentId/overrides')
  @Auth('user', OVERRIDERS)
  override(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(OverrideBody)) b: z.infer<typeof OverrideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [st] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
      if (!st) throw new NotFoundException('Student not found');
      const [open] = await tx.select({ id: feeHoldOverrides.id }).from(feeHoldOverrides).where(and(eq(feeHoldOverrides.studentId, studentId), eq(feeHoldOverrides.purpose, b.purpose), isNull(feeHoldOverrides.revokedAt)));
      if (open) throw new ConflictException('This is already allowed for the student');
      const [row] = await tx.insert(feeHoldOverrides).values({ tenantId: p.tenantId, studentId, purpose: b.purpose, reason: b.reason, grantedBy: p.userId }).returning();
      await auditUser(tx, p, 'fee_hold.overridden', 'student', studentId, { purpose: b.purpose, reason: b.reason, overrideId: row.id });
      return row;
    });
  }

  /** Withdraws an override; the hold applies again. */
  @Delete('overrides/:id')
  @HttpCode(200)
  @Auth('user', OVERRIDERS)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RevokeBody)) b: z.infer<typeof RevokeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(feeHoldOverrides).set({ revokedAt: new Date(), revokedBy: p.userId }).where(and(eq(feeHoldOverrides.id, id), isNull(feeHoldOverrides.revokedAt))).returning();
      if (!row) throw new NotFoundException('Override not found');
      await auditUser(tx, p, 'fee_hold.override_revoked', 'student', row.studentId, { purpose: row.purpose, reason: b.reason, overrideId: id });
      return row;
    });
  }
}

/** Global, so the exam, results and certificate offices can check holds without importing the fees desk. */
@Global()
@Module({
  imports: [FeeDepthModule],
  providers: [FeeHoldsService],
  controllers: [FeeHoldsController],
  exports: [FeeHoldsService],
})
export class FeeHoldsModule {}
