import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { regulations } from '../db/schema-curriculum.js';
import { curriculumFrameworks } from '../db/schema-g1.js';

const EDIT: RoleName[] = ['tenant_admin', 'principal', 'hod', 'university_admin'];
const VIEW: RoleName[] = [...EDIT, 'quality_officer', 'exam_controller', 'accreditation_reviewer'];
const FrameworkBody = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(160),
  kind: z.enum(['national', 'state', 'university', 'institution']).default('national'),
  authority: z.string().trim().max(160).default(''),
  description: z.string().trim().max(1000).default(''),
});

/** Curriculum frameworks (NEP 2020, CBCS, NCF...) that regulations follow. */
@Controller('v1/curriculum/frameworks')
export class FrameworksController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user', VIEW)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ f: curriculumFrameworks, regulations: sql<number>`(select count(*)::int from regulations r where r.framework_id = curriculum_frameworks.id)` })
        .from(curriculumFrameworks)
        .orderBy(asc(curriculumFrameworks.name));
      return rows.map((r) => ({ ...r.f, regulations: r.regulations }));
    });
  }

  @Post()
  @Auth('user', EDIT)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FrameworkBody)) b: z.infer<typeof FrameworkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: curriculumFrameworks.id }).from(curriculumFrameworks).where(eq(curriculumFrameworks.code, b.code));
      if (dup) throw new ConflictException('A framework with that code already exists');
      const [row] = await tx.insert(curriculumFrameworks).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'curriculum.framework.created', 'curriculum_framework', row.id, { code: b.code });
      return row;
    });
  }

  @Put(':id')
  @Auth('user', EDIT)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FrameworkBody.partial())) b: Partial<z.infer<typeof FrameworkBody>>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(curriculumFrameworks).set(b).where(eq(curriculumFrameworks.id, id)).returning();
      if (!row) throw new NotFoundException('Framework not found');
      await auditUser(tx, p, 'curriculum.framework.updated', 'curriculum_framework', id, { changed: Object.keys(b) });
      return row;
    });
  }

  /** Says which framework a regulation follows (or clears it). */
  @Put('regulations/:regulationId')
  @Auth('user', EDIT)
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('regulationId', ParseUUIDPipe) regulationId: string, @Body(new ZodBody(z.object({ frameworkId: z.uuid().nullable() }))) b: { frameworkId: string | null }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.frameworkId) {
        const [f] = await tx.select({ id: curriculumFrameworks.id }).from(curriculumFrameworks).where(eq(curriculumFrameworks.id, b.frameworkId));
        if (!f) throw new NotFoundException('Framework not found');
      }
      const [row] = await tx.update(regulations).set({ frameworkId: b.frameworkId }).where(eq(regulations.id, regulationId)).returning({ id: regulations.id });
      if (!row) throw new NotFoundException('Regulation not found');
      await auditUser(tx, p, 'curriculum.regulation.framework', 'regulation', regulationId, { frameworkId: b.frameworkId });
      return { regulationId, frameworkId: b.frameworkId };
    });
  }
}
