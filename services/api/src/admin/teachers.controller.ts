import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import argon2 from 'argon2';
import { and, asc, eq, inArray, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import { temporaryPassword } from '../auth/password-policy.js';
import { normalizePhone } from '../auth/phone.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, departmentStaff, userRoles, users } from '../db/schema.js';

const ADMINS: RoleName[] = [...STAFF_ADMIN_ROLES, 'tenant_admin'];
const TEACHER_ROLES = ['teacher', 'hod'] as const;
const Email = z.email().max(200).transform((e) => e.toLowerCase());
const Phone = z
  .string()
  .trim()
  .max(20)
  .transform((p) => normalizePhone(p))
  .refine((p) => /^\+\d{8,15}$/.test(p), 'Enter a valid mobile number');
const CreateBody = z
  .object({
    fullName: z.string().trim().min(1).max(200),
    email: Email.optional(),
    phone: Phone.optional(),
    roles: z.array(z.enum(TEACHER_ROLES)).min(1).max(2).default(['teacher']),
    departmentIds: z.array(z.uuid()).max(10).default([]),
    teachingSubjects: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    preferredLanguage: z.enum(['en', 'hi', 'kn']).default('en'),
  })
  .refine((b) => b.email || b.phone, 'Give an email or a mobile number');
const PatchBody = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    email: Email.nullable().optional(),
    phone: Phone.nullable().optional(),
    active: z.boolean().optional(),
    roles: z.array(z.enum(TEACHER_ROLES)).min(1).max(2).optional(),
    departmentIds: z.array(z.uuid()).max(10).optional(),
    teachingSubjects: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change');

/**
 * Teacher accounts for the college (both editions; the board edition has no HR module): the
 * principal or administrator adds a teacher with a temporary password (asked to change it at
 * first sign-in), edits them, sets their departments and teacher/HoD roles, and deactivates them.
 * Bulk loads still go through Import (staff CSV).
 */
@Controller('v1/admin/teachers')
export class TeachersAdminController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user', ADMINS)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .selectDistinct({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, status: users.status, teachingSubjects: users.teachingSubjects })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(inArray(userRoles.role, [...TEACHER_ROLES]))
        .orderBy(asc(users.fullName));
      return Promise.all(rows.map(async (u) => ({ ...u, ...(await this.extras(tx, u.id)) })));
    });
  }

  @Post()
  @Auth('user', ADMINS)
  async create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateBody)) b: z.infer<typeof CreateBody>) {
    const password = temporaryPassword();
    const passwordHash = await argon2.hash(password);
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertFree(tx, b.email ?? null, b.phone ?? null, null);
      await this.assertDepartments(tx, b.departmentIds);
      const [u] = await tx
        .insert(users)
        .values({ tenantId: p.tenantId, fullName: b.fullName, email: b.email ?? null, phone: b.phone ?? null, passwordHash, passwordMustChange: true, preferredLanguage: b.preferredLanguage, teachingSubjects: b.teachingSubjects })
        .returning({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, status: users.status });
      await tx.insert(userRoles).values([...new Set(b.roles)].map((role) => ({ tenantId: p.tenantId, userId: u.id, role, campusId: null })));
      if (b.departmentIds.length) await tx.insert(departmentStaff).values([...new Set(b.departmentIds)].map((departmentId) => ({ tenantId: p.tenantId, departmentId, userId: u.id })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'teacher.created', subjectType: 'user', subjectId: u.id, data: { roles: b.roles, departmentIds: b.departmentIds } });
      return { ...u, ...(await this.extras(tx, u.id)), temporaryPassword: password, mustChangePassword: true };
    });
  }

  @Patch(':id')
  @Auth('user', ADMINS)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PatchBody)) b: z.infer<typeof PatchBody>) {
    if (id === p.userId && b.active === false) throw new BadRequestException('You cannot deactivate yourself');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [teacher] = await tx.select({ id: userRoles.userId }).from(userRoles).where(and(eq(userRoles.userId, id), inArray(userRoles.role, [...TEACHER_ROLES]))).limit(1);
      if (!teacher) throw new NotFoundException('Teacher not found');
      await this.assertFree(tx, b.email ?? null, b.phone ?? null, id);
      const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (b.fullName !== undefined) set.fullName = b.fullName;
      if (b.email !== undefined) set.email = b.email;
      if (b.phone !== undefined) set.phone = b.phone;
      if (b.teachingSubjects !== undefined) set.teachingSubjects = b.teachingSubjects;
      if (b.active !== undefined) set.status = b.active ? 'active' : 'disabled';
      await tx.update(users).set(set).where(eq(users.id, id));
      if (b.roles) {
        await tx.delete(userRoles).where(and(eq(userRoles.userId, id), inArray(userRoles.role, [...TEACHER_ROLES])));
        await tx.insert(userRoles).values([...new Set(b.roles)].map((role) => ({ tenantId: p.tenantId, userId: id, role, campusId: null })));
      }
      if (b.departmentIds) {
        await this.assertDepartments(tx, b.departmentIds);
        await tx.delete(departmentStaff).where(eq(departmentStaff.userId, id));
        if (b.departmentIds.length) await tx.insert(departmentStaff).values([...new Set(b.departmentIds)].map((departmentId) => ({ tenantId: p.tenantId, departmentId, userId: id })));
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'teacher.updated', subjectType: 'user', subjectId: id, data: { ...b } });
      const [u] = await tx.select({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, status: users.status, teachingSubjects: users.teachingSubjects }).from(users).where(eq(users.id, id));
      return { ...u, ...(await this.extras(tx, id)) };
    });
  }

  private async extras(tx: Tx, userId: string) {
    const roles = (await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role);
    const deps = await tx.select({ id: departments.id, name: departments.name }).from(departmentStaff).innerJoin(departments, eq(departments.id, departmentStaff.departmentId)).where(eq(departmentStaff.userId, userId));
    return { roles: [...new Set(roles)], departments: deps };
  }

  private async assertFree(tx: Tx, email: string | null, phone: string | null, self: string | null) {
    const clash = [email ? eq(users.email, email) : undefined, phone ? eq(users.phone, phone) : undefined].filter((c) => c !== undefined);
    if (!clash.length) return;
    const [taken] = await tx.select({ id: users.id }).from(users).where(and(or(...clash), self ? ne(users.id, self) : undefined)).limit(1);
    if (taken) throw new ConflictException('This email or phone number already belongs to someone else');
  }

  private async assertDepartments(tx: Tx, ids: string[]) {
    if (!ids.length) return;
    const found = await tx.select({ id: departments.id }).from(departments).where(inArray(departments.id, ids));
    if (found.length !== new Set(ids).size) throw new BadRequestException('Some departments were not found');
  }
}
