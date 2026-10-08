import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day, orConflict, Paise } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessments, feeInvoices, marks, scholarshipApplications, scholarshipSchemes, students } from '../db/schema.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { discountFor } from './gl.js';

type Scheme = typeof scholarshipSchemes.$inferSelect;
const SchemeBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    kind: z.enum(['percent', 'fixed']),
    value: z.number().int().min(1).max(100_000_000_00),
    minPercentage: z.number().min(0).max(100).nullable().default(null),
    maxIncomePaise: Paise.nullable().default(null),
    validUntil: Day.nullable().default(null),
    active: z.boolean().default(true),
  })
  .refine((b) => b.kind !== 'percent' || b.value <= 100, { message: 'A percentage scheme cannot exceed 100' });
const ApplyBody = z.object({ schemeId: z.uuid(), studentId: z.uuid(), incomePaise: Paise.optional(), note: z.string().trim().max(500).default('') });
const DecideBody = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() });

/**
 * Scholarships and concessions: the accounts office defines schemes with eligibility rules; a student
 * or guardian applies; approval takes the discount off the student's open fees on the spot.
 */
@Controller('v1/finance')
export class ScholarshipsController {
  constructor(private readonly db: DbService) {}

  @Post('scholarship-schemes')
  @Auth('user', FEE_ROLES)
  createScheme(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SchemeBody)) b: z.infer<typeof SchemeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(scholarshipSchemes).values({ tenantId: p.tenantId, ...b }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'scholarship.scheme_created', subjectType: 'scholarship_scheme', subjectId: row.id });
      return row;
    });
  }

  @Patch('scholarship-schemes/:id')
  @Auth('user', FEE_ROLES)
  setActive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ active: z.boolean() }))) b: { active: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(scholarshipSchemes).set({ active: b.active }).where(eq(scholarshipSchemes.id, id)).returning();
      if (!row) throw new NotFoundException('Scheme not found');
      return row;
    });
  }

  /** Schemes: the accounts office sees all; students and families see those open for applications. */
  @Get('scholarship-schemes')
  @Auth('user')
  schemes(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const office = p.roles.some((r) => FEE_ROLES.includes(r));
      const rows = await tx.select().from(scholarshipSchemes).orderBy(asc(scholarshipSchemes.name));
      const today = new Date().toISOString().slice(0, 10);
      return rows.filter((s) => office || (s.active && (!s.validUntil || s.validUntil >= today)));
    });
  }

  @Post('scholarships/apply')
  @Auth('user', ['student', 'guardian'])
  apply(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ApplyBody)) b: z.infer<typeof ApplyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, []);
      const [scheme] = await tx.select().from(scholarshipSchemes).where(eq(scholarshipSchemes.id, b.schemeId));
      if (!scheme || !scheme.active || (scheme.validUntil && scheme.validUntil < new Date().toISOString().slice(0, 10))) throw new NotFoundException('This scholarship is not open');
      const why = await this.ineligible(tx, scheme, b.studentId, b.incomePaise);
      if (why) throw new BadRequestException(why);
      const row = await orConflict('There is already an open application for this scholarship', async () => {
        const [r] = await tx.insert(scholarshipApplications).values({ tenantId: p.tenantId, schemeId: b.schemeId, studentId: b.studentId, incomePaise: b.incomePaise ?? null, note: b.note, requestedBy: p.userId }).returning();
        return r;
      });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'scholarship.applied', subjectType: 'scholarship_application', subjectId: row.id });
      return row;
    });
  }

  /** The family's own applications (`studentId`), or for the accounts office all, filtered by `status`. */
  @Get('scholarships')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Query('studentId') studentId?: string, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const office = p.roles.some((r) => FEE_ROLES.includes(r));
      let ids: string[] | undefined;
      if (studentId) {
        await assertCanSeeStudent(tx, p, z.uuid().parse(studentId), FEE_ROLES);
        ids = [studentId];
      } else if (!office) throw new ForbiddenException('Choose a student');
      const rows = await tx
        .select({ a: scholarshipApplications, scheme: scholarshipSchemes.name, fullName: students.fullName, rollNo: students.rollNo })
        .from(scholarshipApplications)
        .innerJoin(scholarshipSchemes, eq(scholarshipSchemes.id, scholarshipApplications.schemeId))
        .innerJoin(students, eq(students.id, scholarshipApplications.studentId))
        .where(and(ids ? inArray(scholarshipApplications.studentId, ids) : undefined, status ? eq(scholarshipApplications.status, status as 'pending') : undefined))
        .orderBy(desc(scholarshipApplications.createdAt))
        .limit(200);
      return rows.map((x) => ({ ...x.a, scheme: x.scheme, fullName: x.fullName, rollNo: x.rollNo }));
    });
  }

  /** Approving re-checks eligibility, then reduces the student's open fees (oldest first) and records exactly what was taken off. */
  @Post('scholarships/:id/decide')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [app] = await tx.select().from(scholarshipApplications).where(eq(scholarshipApplications.id, id)).for('update');
      if (!app) throw new NotFoundException('Application not found');
      if (app.status !== 'pending') throw new ConflictException(`This application is already ${app.status}`);
      let awarded = 0;
      const adjustments: { invoiceId: string; paise: number }[] = [];
      if (b.approve) {
        const [scheme] = await tx.select().from(scholarshipSchemes).where(eq(scholarshipSchemes.id, app.schemeId));
        const why = await this.ineligible(tx, scheme, app.studentId, app.incomePaise ?? undefined);
        if (why) throw new BadRequestException(why);
        const open = await tx.select().from(feeInvoices).where(and(eq(feeInvoices.studentId, app.studentId), eq(feeInvoices.status, 'due'))).orderBy(asc(feeInvoices.dueOn)).for('update');
        let fixedLeft = scheme.kind === 'fixed' ? scheme.value : 0;
        for (const inv of open) {
          const paise = discountFor(scheme.kind, scheme.value, inv.amountPaise - inv.paidPaise, fixedLeft);
          if (paise <= 0) continue;
          fixedLeft -= scheme.kind === 'fixed' ? paise : 0;
          const settled = inv.amountPaise - paise <= inv.paidPaise;
          await tx.update(feeInvoices).set({ amountPaise: sql`${feeInvoices.amountPaise} - ${paise}`, ...(settled ? { status: 'paid' as const } : {}), updatedAt: new Date() }).where(eq(feeInvoices.id, inv.id));
          adjustments.push({ invoiceId: inv.id, paise });
          awarded += paise;
        }
      }
      const [row] = await tx
        .update(scholarshipApplications)
        .set({ status: b.approve ? 'approved' : 'rejected', decidedBy: p.userId, decisionNote: b.note ?? null, decidedAt: new Date(), awardedPaise: awarded, adjustments })
        .where(eq(scholarshipApplications.id, id))
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `scholarship.${row.status}`, subjectType: 'scholarship_application', subjectId: id, data: { awardedPaise: awarded, adjustments } });
      return row;
    });
  }

  @Post('scholarships/:id/cancel')
  @HttpCode(200)
  @Auth('user', ['student', 'guardian'])
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [cur] = await tx.select().from(scholarshipApplications).where(eq(scholarshipApplications.id, id));
      if (!cur) throw new NotFoundException('Application not found');
      await assertCanSeeStudent(tx, p, cur.studentId, []);
      const [row] = await tx.update(scholarshipApplications).set({ status: 'cancelled' }).where(and(eq(scholarshipApplications.id, id), eq(scholarshipApplications.status, 'pending'))).returning();
      if (!row) throw new ConflictException(`This application is already ${cur.status}`);
      return row;
    });
  }

  /** Why the student does not qualify, or null. Marks are the student's average over published assessments. */
  private async ineligible(tx: Tx, s: Scheme, studentId: string, incomePaise?: number): Promise<string | null> {
    if (s.maxIncomePaise !== null) {
      if (incomePaise === undefined) return 'This scholarship needs the family income';
      if (incomePaise > s.maxIncomePaise) return 'The family income is above the limit for this scholarship';
    }
    if (s.minPercentage !== null) {
      const rows = await tx.select({ got: sql<number>`coalesce(${marks.moderatedMarks}, ${marks.marks})`, max: assessments.maxMarks }).from(marks).innerJoin(assessments, eq(assessments.id, marks.assessmentId)).where(and(eq(marks.studentId, studentId), eq(marks.absent, false), isNotNull(assessments.publishedAt)));
      const max = rows.reduce((t, r) => t + (r.got === null ? 0 : r.max), 0);
      const got = rows.reduce((t, r) => t + (r.got ?? 0), 0);
      if (max === 0 || (got / max) * 100 < s.minPercentage) return `This scholarship needs at least ${s.minPercentage}% in published marks`;
    }
    return null;
  }
}
