import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { affiliatedInstitutions } from '../db/schema-curriculum.js';
import { faculties } from '../db/schema-g1.js';
import { departments, institutionProfiles, users } from '../db/schema.js';
import { GOVERNANCE_RULES, type GovernanceModel } from '../institution/presets.js';

const EDIT: RoleName[] = ['tenant_admin', 'principal', 'university_admin'];
const VIEW: RoleName[] = [...EDIT, 'exam_controller', 'hod'];
const FacultyBody = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(160),
  kind: z.enum(['faculty', 'school']).default('faculty'),
  institutionId: z.uuid().nullable().optional(),
  deanUserId: z.uuid().nullable().optional(),
});
const AssignBody = z.object({ facultyId: z.uuid().nullable() });

/** The university hierarchy: institutions, the faculties or schools in them, and the departments in each. */
@Controller('v1/university')
export class FacultiesController {
  constructor(private readonly db: DbService) {}

  /** The behaviour the institution's governance model sets (who sets the syllabus, runs exams, awards degrees). */
  @Get('governance')
  @Auth('user', VIEW)
  governance(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [prof] = await tx.select({ g: institutionProfiles.governanceModel }).from(institutionProfiles);
      const model = (prof?.g ?? null) as GovernanceModel | null;
      return { model, rules: model ? GOVERNANCE_RULES[model] : null, all: GOVERNANCE_RULES };
    });
  }

  @Get('hierarchy')
  @Auth('user', VIEW)
  hierarchy(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const insts = await tx.select({ id: affiliatedInstitutions.id, code: affiliatedInstitutions.code, name: affiliatedInstitutions.name, model: affiliatedInstitutions.model }).from(affiliatedInstitutions).orderBy(asc(affiliatedInstitutions.name));
      const facs = await tx
        .select({ id: faculties.id, code: faculties.code, name: faculties.name, kind: faculties.kind, institutionId: faculties.institutionId, dean: users.fullName })
        .from(faculties)
        .leftJoin(users, eq(users.id, faculties.deanUserId))
        .orderBy(asc(faculties.name));
      const deps = await tx
        .select({ id: departments.id, name: departments.name, facultyId: departments.facultyId })
        .from(departments)
        .orderBy(asc(departments.name));
      const node = (f: (typeof facs)[number]) => ({ ...f, departments: deps.filter((d) => d.facultyId === f.id).map((d) => ({ id: d.id, name: d.name })) });
      return {
        institutions: insts.map((i) => ({ ...i, faculties: facs.filter((f) => f.institutionId === i.id).map(node) })),
        central: facs.filter((f) => !f.institutionId).map(node),
        unassignedDepartments: deps.filter((d) => !d.facultyId).map((d) => ({ id: d.id, name: d.name })),
      };
    });
  }

  @Post('faculties')
  @Auth('user', EDIT)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FacultyBody)) b: z.infer<typeof FacultyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: faculties.id }).from(faculties).where(eq(faculties.code, b.code));
      if (dup) throw new ConflictException('A faculty with that code already exists');
      const [row] = await tx.insert(faculties).values({ tenantId: p.tenantId, ...b, institutionId: b.institutionId ?? null, deanUserId: b.deanUserId ?? null }).returning();
      await auditUser(tx, p, 'university.faculty.created', 'faculty', row.id, { code: b.code });
      return row;
    });
  }

  @Put('faculties/:id')
  @Auth('user', EDIT)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FacultyBody.partial())) b: Partial<z.infer<typeof FacultyBody>>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(faculties).set(b).where(eq(faculties.id, id)).returning();
      if (!row) throw new NotFoundException('Faculty not found');
      await auditUser(tx, p, 'university.faculty.updated', 'faculty', id, { changed: Object.keys(b) });
      return row;
    });
  }

  @Put('departments/:id/faculty')
  @Auth('user', EDIT)
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AssignBody)) b: z.infer<typeof AssignBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.facultyId) {
        const [f] = await tx.select({ id: faculties.id }).from(faculties).where(eq(faculties.id, b.facultyId));
        if (!f) throw new NotFoundException('Faculty not found');
      }
      const [row] = await tx.update(departments).set({ facultyId: b.facultyId }).where(eq(departments.id, id)).returning({ id: departments.id });
      if (!row) throw new NotFoundException('Department not found');
      await auditUser(tx, p, 'university.department.assigned', 'department', id, { facultyId: b.facultyId });
      return { id, facultyId: b.facultyId };
    });
  }
}
