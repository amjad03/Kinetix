import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, Paise } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { students, welfareRequests } from '../db/schema.js';
import { checkVersion, found, hasRole } from '../placements/placements.access.js';
import { WELFARE_ROLES } from './welfare.access.js';
import { WelfareService } from './welfare.service.js';
import { approvedAmountOk, canMoveWelfare } from './welfare-rules.js';

const RequestBody = z.object({ studentId: z.uuid().optional(), kind: z.enum(['scholarship', 'fee_waiver', 'medical_aid', 'hardship', 'other']), title: z.string().trim().min(3).max(160), details: z.string().trim().max(3000).default(''), amountRequestedPaise: Paise.default(0) });
const DecisionBody = z.object({ decision: z.enum(['approved', 'rejected']), amountApprovedPaise: Paise.optional(), note: z.string().trim().min(3).max(1000), expectedVersion: z.number().int().optional() });

/** Scholarships, fee waivers and welfare aid requested by students or parents, decided by the welfare team. */
@Controller('v1/welfare')
export class WelfareRequestsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: WelfareService,
  ) {}

  @Post('requests')
  @Auth('user', ['student', 'guardian'])
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RequestBody)) b: z.infer<typeof RequestBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const studentId = await this.svc.actingStudent(tx, p, b.studentId);
      const { studentId: _s, ...rest } = b;
      const [row] = await tx.insert(welfareRequests).values({ tenantId: p.tenantId, studentId, requestedBy: p.userId, ...rest }).returning();
      await auditUser(tx, p, 'welfare.requested', 'welfare', row.id, { kind: b.kind, studentId });
      await this.svc.notify(tx, await this.svc.usersWithRole(tx, WELFARE_ROLES), 'welfare', 'New welfare request', b.title, `welfare:new:${row.id}`, { requestId: row.id });
      return row;
    });
  }

  /** The team sees every request; students and parents see their own family's. */
  @Get('requests')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('kind') kind?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const team = hasRole(p, WELFARE_ROLES);
      const kids = team ? [] : await this.svc.familyStudents(tx, p);
      if (!team && kids.length === 0) return [];
      const rows = await tx
        .select({ r: welfareRequests, fullName: students.fullName, rollNo: students.rollNo })
        .from(welfareRequests)
        .innerJoin(students, eq(students.id, welfareRequests.studentId))
        .where(and(team ? undefined : inArray(welfareRequests.studentId, kids), status ? eq(welfareRequests.status, status) : undefined, kind ? eq(welfareRequests.kind, kind) : undefined))
        .orderBy(desc(welfareRequests.createdAt));
      return rows.map((r) => ({ ...r.r, fullName: r.fullName, rollNo: r.rollNo }));
    });
  }

  private move(p: UserPrincipal, id: string, to: string, patch: (cur: typeof welfareRequests.$inferSelect, tx: Tx) => Partial<typeof welfareRequests.$inferInsert> | Promise<Partial<typeof welfareRequests.$inferInsert>>, expectedVersion?: number, requesterOnly = false) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(welfareRequests).where(eq(welfareRequests.id, id)).for('update'))[0], 'Request');
      if (requesterOnly ? cur.requestedBy !== p.userId : !hasRole(p, WELFARE_ROLES)) throw new ForbiddenException('Not allowed');
      checkVersion(cur.version, expectedVersion);
      if (!canMoveWelfare(cur.status, to)) throw new ConflictException(`A ${cur.status} request cannot become ${to}`);
      const [row] = await tx.update(welfareRequests).set({ ...(await patch(cur, tx)), status: to, version: cur.version + 1 }).where(eq(welfareRequests.id, id)).returning();
      await auditUser(tx, p, `welfare.${to}`, 'welfare', id, { from: cur.status });
      if (!requesterOnly) await this.svc.notify(tx, await this.svc.family(tx, cur.studentId), 'welfare', 'Update on your welfare request', `${cur.title}: ${to.replace('_', ' ')}`, `welfare:${id}:${to}`, { requestId: id });
      return row;
    });
  }

  @Post('requests/:id/review')
  @Auth('user', WELFARE_ROLES)
  @HttpCode(200)
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.move(p, id, 'under_review', () => ({}));
  }

  @Post('requests/:id/decision')
  @Auth('user', WELFARE_ROLES)
  @HttpCode(200)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecisionBody)) b: z.infer<typeof DecisionBody>) {
    return this.move(
      p,
      id,
      b.decision,
      (cur) => {
        const amount = b.decision === 'approved' ? (b.amountApprovedPaise ?? cur.amountRequestedPaise) : null;
        if (amount !== null && !approvedAmountOk(cur.amountRequestedPaise, amount)) throw new ConflictException('The approved amount exceeds the amount requested');
        return { amountApprovedPaise: amount, decisionNote: b.note, decidedBy: p.userId, decidedAt: this.svc.now() };
      },
      b.expectedVersion,
    );
  }

  @Post('requests/:id/disburse')
  @Auth('user', WELFARE_ROLES)
  @HttpCode(200)
  disburse(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ disbursedOn: Day.optional() }))) b: { disbursedOn?: string }) {
    return this.move(p, id, 'disbursed', async (_cur, tx) => ({ disbursedOn: b.disbursedOn ?? (await this.svc.today(tx)) }));
  }

  @Post('requests/:id/withdraw')
  @Auth('user', ['student', 'guardian'])
  @HttpCode(200)
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.move(p, id, 'withdrawn', () => ({}), undefined, true);
  }
}
