import { Body, Controller, ForbiddenException, Get, NotFoundException, Post, Query, ParseUUIDPipe } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { consents, guardians, students, tenants, users } from '../db/schema.js';

/** Version of the privacy notice the apps show (docs/product/privacy-notice.md). Bump when it changes. */
export const NOTICE_VERSION = '2026-10';

export const PURPOSES = ['data_processing', 'ai_features', 'class_recordings', 'photos'] as const;
export type Purpose = (typeof PURPOSES)[number];

const ConsentBody = z.object({ studentId: z.uuid(), purpose: z.enum(PURPOSES), granted: z.boolean() });

/** The latest decision per purpose for a student (no row = not asked yet). */
export async function latestConsents(tx: Tx, studentId: string) {
  const rows = await tx
    .selectDistinctOn([consents.purpose], { purpose: consents.purpose, granted: consents.granted, at: consents.createdAt, noticeVersion: consents.noticeVersion, givenBy: users.fullName })
    .from(consents)
    .innerJoin(users, eq(users.id, consents.givenBy))
    .where(eq(consents.studentId, studentId))
    .orderBy(consents.purpose, desc(consents.createdAt));
  return Object.fromEntries(PURPOSES.map((p) => [p, rows.find((r) => r.purpose === p) ?? null])) as Record<Purpose, (typeof rows)[number] | null>;
}

/** Whether the student's family (or the adult student) has withdrawn consent for [purpose]. */
export async function consentWithdrawn(tx: Tx, studentId: string, purpose: Purpose): Promise<boolean> {
  const [row] = await tx
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.studentId, studentId), eq(consents.purpose, purpose)))
    .orderBy(desc(consents.createdAt))
    .limit(1);
  return row?.granted === false;
}

/**
 * Consent under the DPDP Act. For a school the guardian decides for the child; in a college the
 * student decides for themselves. Every decision is kept (append-only) with the notice version.
 */
@Controller('v1/consents')
export class ConsentController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user', ['guardian', 'student'])
  get(@CurrentPrincipal() p: UserPrincipal, @Query('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const canDecide = await this.decider(tx, p, studentId);
      return { studentId, noticeVersion: NOTICE_VERSION, canDecide, purposes: await latestConsents(tx, studentId) };
    });
  }

  @Post()
  @Auth('user', ['guardian', 'student'])
  record(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ConsentBody)) b: z.infer<typeof ConsentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!(await this.decider(tx, p, b.studentId))) throw new ForbiddenException("In a school, the student's parent or guardian decides");
      await tx.insert(consents).values({ tenantId: p.tenantId, studentId: b.studentId, purpose: b.purpose, granted: b.granted, noticeVersion: NOTICE_VERSION, givenBy: p.userId });
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: 'user',
        actorId: p.userId,
        action: b.granted ? 'consent.granted' : 'consent.withdrawn',
        subjectType: 'student',
        subjectId: b.studentId,
        data: { purpose: b.purpose, noticeVersion: NOTICE_VERSION },
      });
      return { studentId: b.studentId, noticeVersion: NOTICE_VERSION, canDecide: true, purposes: await latestConsents(tx, b.studentId) };
    });
  }

  /** Whether [p] decides for this student: a guardian in a school, the student in a college. Others get 404. */
  private async decider(tx: Tx, p: UserPrincipal, studentId: string): Promise<boolean> {
    const [s] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, studentId), eq(guardians.userId, p.userId)));
    const self = s.userId === p.userId;
    if (!self && !g) throw new NotFoundException('Student not found');
    const [t] = await tx.select({ kind: tenants.kind }).from(tenants);
    return t?.kind === 'school' ? !!g : self || (!!g && s.userId === null);
  }
}

/** For the principal: how many students' families have answered, per purpose. */
@Controller('v1/admin/consents')
export class ConsentAdminController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user', STAFF_ADMIN_ROLES)
  summary(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { rows } = await tx.execute<{ purpose: Purpose; granted: number; withdrawn: number }>(sql`
        select purpose, count(*) filter (where granted)::int as granted, count(*) filter (where not granted)::int as withdrawn
        from (select distinct on (c.student_id, c.purpose) c.purpose, c.granted
              from consents c join students s on s.id = c.student_id and s.status = 'active'
              order by c.student_id, c.purpose, c.created_at desc) latest
        group by purpose`);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(eq(students.status, 'active'));
      return {
        noticeVersion: NOTICE_VERSION,
        students: n,
        purposes: PURPOSES.map((purpose) => {
          const r = rows.find((x) => x.purpose === purpose);
          return { purpose, granted: r?.granted ?? 0, withdrawn: r?.withdrawn ?? 0, notAsked: n - (r?.granted ?? 0) - (r?.withdrawn ?? 0) };
        }),
      };
    });
  }
}
