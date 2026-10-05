import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { familyPrograms } from '../calendar/calendar.controller.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicTerms, academicYears, programs } from '../db/schema.js';
import { assertTermFits } from './terms.js';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const TermBody = z
  .object({
    /** Omit for the academic year the term starts in. */
    academicYearId: z.uuid().optional(),
    name: z.string().trim().min(1).max(120),
    startsOn: DATE,
    endsOn: DATE,
    /** Omit or null for every program. */
    programIds: z.array(z.uuid()).min(1).max(100).nullable().optional(),
  })
  .refine((b) => b.startsOn <= b.endsOn, { message: 'The last day must be on or after the first day', path: ['endsOn'] });

/**
 * Academic terms (semesters). Everyone signed in reads them; families and students see the
 * terms of their classes. Lesson recordings are kept until their term ends (plus a grace period).
 */
@Controller('v1/terms')
export class TermsController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await listTerms(tx);
      const mine = await familyPrograms(tx, p);
      return mine === null ? rows : rows.filter((t) => t.programIds === null || t.programIds.some((id) => mine.includes(id)));
    });
  }
}

async function listTerms(tx: Tx) {
  const rows = await tx
    .select({
      id: academicTerms.id,
      academicYearId: academicTerms.academicYearId,
      academicYear: academicYears.label,
      name: academicTerms.name,
      startsOn: academicTerms.startsOn,
      endsOn: academicTerms.endsOn,
      programIds: academicTerms.programIds,
    })
    .from(academicTerms)
    .innerJoin(academicYears, eq(academicYears.id, academicTerms.academicYearId))
    .orderBy(asc(academicTerms.startsOn), asc(academicTerms.name));
  const ids = [...new Set(rows.flatMap((r) => r.programIds ?? []))];
  const names = ids.length ? new Map((await tx.select({ id: programs.id, name: programs.name }).from(programs).where(inArray(programs.id, ids))).map((r) => [r.id, r.name])) : new Map<string, string>();
  return rows.map((r) => ({ ...r, programs: r.programIds?.map((id) => names.get(id) ?? '') ?? null }));
}

/** The principal and the administrator keep the terms. */
@Controller('v1/admin/terms')
export class TermsAdminController {
  constructor(private readonly db: DbService) {}

  @Post()
  @Auth('user', STAFF_ADMIN_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TermBody)) b: z.infer<typeof TermBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const programIds = await checkedPrograms(tx, b.programIds);
      const academicYearId = await yearOf(tx, b);
      await assertTermFits(tx, { ...b, academicYearId, programIds });
      const [t] = await tx.insert(academicTerms).values({ tenantId: p.tenantId, academicYearId, name: b.name, startsOn: b.startsOn, endsOn: b.endsOn, programIds }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'term.created', subjectType: 'academic_term', subjectId: t.id, data: { name: t.name, startsOn: t.startsOn, endsOn: t.endsOn, programIds } });
      return t;
    });
  }

  @Put(':id')
  @Auth('user', STAFF_ADMIN_ROLES)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TermBody)) b: z.infer<typeof TermBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [before] = await tx.select().from(academicTerms).where(eq(academicTerms.id, id));
      if (!before) throw new NotFoundException('Term not found');
      const programIds = await checkedPrograms(tx, b.programIds);
      const academicYearId = await yearOf(tx, b);
      await assertTermFits(tx, { ...b, id, academicYearId, programIds });
      const [t] = await tx.update(academicTerms).set({ academicYearId, name: b.name, startsOn: b.startsOn, endsOn: b.endsOn, programIds }).where(eq(academicTerms.id, id)).returning();
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: 'user',
        actorId: p.userId,
        action: 'term.updated',
        subjectType: 'academic_term',
        subjectId: id,
        data: { name: t.name, startsOn: t.startsOn, endsOn: t.endsOn, programIds, before: { name: before.name, startsOn: before.startsOn, endsOn: before.endsOn, programIds: before.programIds } },
      });
      return t;
    });
  }

  /** Recordings of a deleted term have no term any more, so they are kept. */
  @Delete(':id')
  @HttpCode(204)
  @Auth('user', STAFF_ADMIN_ROLES)
  async remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      const [t] = await tx.delete(academicTerms).where(eq(academicTerms.id, id)).returning();
      if (!t) throw new NotFoundException('Term not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'term.deleted', subjectType: 'academic_term', subjectId: id, data: { name: t.name, startsOn: t.startsOn, endsOn: t.endsOn } });
    });
  }
}

/** The given academic year, or the one the term starts in. */
async function yearOf(tx: Tx, b: { academicYearId?: string; startsOn: string }): Promise<string> {
  if (b.academicYearId) return b.academicYearId;
  const [y] = await tx.select({ id: academicYears.id }).from(academicYears).where(and(lte(academicYears.startsOn, b.startsOn), gte(academicYears.endsOn, b.startsOn)));
  if (!y) throw new BadRequestException('The term must be within an academic year');
  return y.id;
}

async function checkedPrograms(tx: Tx, ids: string[] | null | undefined): Promise<string[] | null> {
  if (!ids?.length) return null;
  const unique = [...new Set(ids)];
  const found = await tx.select({ id: programs.id }).from(programs).where(inArray(programs.id, unique));
  if (found.length !== unique.length) throw new BadRequestException('Some programs were not found');
  return unique;
}
