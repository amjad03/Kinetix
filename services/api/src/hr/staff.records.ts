import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { departmentOptions } from '../admin/structure.records.js';
import { normalizePhone } from '../auth/phone.js';
import type { RoleName } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { departmentStaff, departments, designations, roleName, staffProfiles, userRoles, users } from '../db/schema.js';
import { ImportService } from '../import/import.service.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { OptionalRef, Text, uuidEq } from '../records/helpers.js';
import { formatSeries, takeNumbers } from './hr-settings.js';
import { HR_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { staffPayActions } from './payroll.records.js';
import { PayrollService } from './payroll.service.js';
import { choiceFilter, labelOf, opts } from './kit-shared.js';
import { CADRES, STAFF_CATEGORIES } from './staff-depth.records.js';

const GENDERS = opts([['female', 'Female'], ['male', 'Male'], ['other', 'Other']]);
export const SOCIAL = opts([['general', 'General'], ['ews', 'EWS'], ['obc', 'OBC'], ['sc', 'SC'], ['st', 'ST']]);
export const PHD = opts([['none', 'No Ph.D.'], ['pursuing', 'Pursuing'], ['submitted', 'Thesis submitted'], ['awarded', 'Awarded']]);
export const NET_SET = opts([['none', 'None'], ['net', 'NET'], ['net_jrf', 'NET with JRF'], ['set', 'SET'], ['slet', 'SLET']]);
const POSTS = opts([['sanctioned', 'Sanctioned post'], ['self_financing', 'Self-financing'], ['guest', 'Guest faculty']]);

/** Roles that make someone staff (not a student, parent, alumnus or outside reviewer). */
export const STAFF_KIT_ROLES = roleName.enumValues.filter((r) => !['student', 'guardian', 'alumni', 'external_examiner', 'accreditation_reviewer'].includes(r)) as RoleName[];

const ROLE_LABELS: FieldOption[] = STAFF_KIT_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }));
const LANGUAGES: FieldOption[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'kn', label: 'ಕನ್ನಡ' },
];
const ACCOUNT: FieldOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
];
const EMPLOYMENT: FieldOption[] = [
  { value: 'active', label: 'Working' },
  { value: 'on_notice', label: 'On notice' },
  { value: 'exited', label: 'Left' },
];

const Email = z
  .union([z.email().max(200), z.literal('')])
  .nullable()
  .transform((v) => (v ? v.toLowerCase() : null));
const PhoneField = z
  .union([z.string().trim().max(20), z.literal('')])
  .nullable()
  .transform((v, c) => {
    if (!v) return null;
    const p = normalizePhone(v);
    if (!/^\+\d{8,15}$/.test(p)) {
      c.addIssue({ code: 'custom', message: 'Enter a valid mobile number' });
      return z.NEVER;
    }
    return p;
  });

async function designationOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: designations.id, name: designations.name }).from(designations).orderBy(asc(designations.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

const isStaff = sql`exists (select 1 from user_roles ur where ur.user_id = ${users.id} and ur.role::text in (${sql.join(
  STAFF_KIT_ROLES.map((r) => sql`${r}`),
  sql`, `,
)}))`;
const rolesText = sql<string>`(select string_agg(distinct ur.role::text, ', ') from user_roles ur where ur.user_id = ${users.id})`;

/**
 * Staff as a record kit entity: people with a staff role. Department and designation live on the HR record
 * (staff_profiles), which is created with the next employee number when first needed; moving someone to a
 * department also makes them a member of it.
 */
@Injectable()
export class StaffRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly imports: ImportService,
    private readonly hr: HrService,
    private readonly payroll: PayrollService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.entity());
  }

  /** The person's HR record, created with the next employee number if they have none. */
  private async ensureProfile(tx: Tx, tenantId: string, userId: string): Promise<void> {
    const [has] = await tx.select({ userId: staffProfiles.userId }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
    if (has) return;
    const { series, first } = await takeNumbers(tx, tenantId, 'employeeSeries', 1);
    await tx.insert(staffProfiles).values({ tenantId, userId, employeeCode: formatSeries(series, new Date(), first) });
  }

  private async setDepartment(ctx: KitCtx, userId: string, departmentId: string | null) {
    if (departmentId === null) {
      await ctx.tx.update(staffProfiles).set({ departmentId: null, updatedAt: new Date() }).where(eq(staffProfiles.userId, userId));
      return;
    }
    await this.ensureProfile(ctx.tx, ctx.p.tenantId, userId);
    const [before] = await ctx.tx.select({ departmentId: staffProfiles.departmentId }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
    await ctx.tx.update(staffProfiles).set({ departmentId, updatedAt: new Date() }).where(eq(staffProfiles.userId, userId));
    // Membership follows the move: out of the old home department, into the new one.
    if (before?.departmentId && before.departmentId !== departmentId) await ctx.tx.delete(departmentStaff).where(and(eq(departmentStaff.userId, userId), eq(departmentStaff.departmentId, before.departmentId)));
    await ctx.tx.insert(departmentStaff).values({ tenantId: ctx.p.tenantId, departmentId, userId }).onConflictDoNothing();
  }

  entity(): RecordEntity {
    return {
      key: 'staff',
      module: 'hr',
      table: users,
      subjectType: 'user',
      roles: { read: [...HR_ROLES, 'accountant'], write: HR_ROLES },
      label: (r) => String(r.fullName),
      list: {
        select: {
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
          preferredLanguage: users.preferredLanguage,
          accountStatus: users.status,
          roles: rolesText,
          employeeCode: staffProfiles.employeeCode,
          departmentId: staffProfiles.departmentId,
          departmentName: departments.name,
          designationId: staffProfiles.designationId,
          designationName: designations.name,
          employmentType: staffProfiles.employmentType,
          staffStatus: staffProfiles.status,
          dateOfJoining: staffProfiles.dateOfJoining,
          staffCategory: staffProfiles.staffCategory,
          cadre: staffProfiles.cadre,
          gender: staffProfiles.gender,
          socialCategory: staffProfiles.socialCategory,
          phdStatus: staffProfiles.phdStatus,
          netSet: staffProfiles.netSet,
          postType: staffProfiles.postType,
        },
        joins: (q) => q.leftJoin(staffProfiles, eq(staffProfiles.userId, users.id)).leftJoin(departments, eq(departments.id, staffProfiles.departmentId)).leftJoin(designations, eq(designations.id, staffProfiles.designationId)),
        search: [users.fullName, users.email, users.phone, staffProfiles.employeeCode],
        scope: () => isStaff,
        filters: {
          department: { label: 'Department', options: async (ctx) => [{ value: 'none', label: 'No department' }, ...(await departmentOptions(ctx))], where: (v) => (v === 'none' ? sql`${staffProfiles.departmentId} is null` : uuidEq(staffProfiles.departmentId, v)) },
          designation: { label: 'Designation', options: designationOptions, where: (v) => uuidEq(staffProfiles.designationId, v) },
          role: { label: 'Role', options: ROLE_LABELS, where: (v) => ((STAFF_KIT_ROLES as string[]).includes(v) ? sql`exists (select 1 from user_roles ur where ur.user_id = ${users.id} and ur.role::text = ${v})` : undefined) },
          account: { label: 'Account', options: ACCOUNT, where: (v) => (v === 'active' || v === 'disabled' ? eq(users.status, v) : undefined) },
          employment: { label: 'Employment', options: EMPLOYMENT, where: (v) => (EMPLOYMENT.some((o) => o.value === v) ? eq(staffProfiles.status, v) : undefined) },
          category: choiceFilter('Category', STAFF_CATEGORIES, staffProfiles.staffCategory),
          cadre: choiceFilter('Cadre', CADRES, staffProfiles.cadre),
          gender: choiceFilter('Gender', GENDERS, staffProfiles.gender),
          social: choiceFilter('Social category', SOCIAL, staffProfiles.socialCategory),
          phd: choiceFilter('Ph.D.', PHD, staffProfiles.phdStatus),
          netSet: choiceFilter('NET / SET', NET_SET, staffProfiles.netSet),
          post: choiceFilter('Post', POSTS, staffProfiles.postType),
        },
        sorts: { name: users.fullName, code: staffProfiles.employeeCode, department: departments.name, designation: designations.name, joined: staffProfiles.dateOfJoining, account: users.status },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        fullName: { label: 'Full name', type: 'text', schema: Text(120), column: users.fullName, required: true },
        email: { label: 'Email', type: 'email', schema: Email, column: users.email },
        phone: { label: 'Mobile number', type: 'phone', schema: PhoneField, column: users.phone, help: 'Staff can sign in with a code sent to it' },
        role: {
          label: 'Role',
          type: 'select',
          schema: z.enum(STAFF_KIT_ROLES as [RoleName, ...RoleName[]]),
          options: ROLE_LABELS,
          required: true,
          edit: false,
          apply: async (ctx, id, value) => void (await ctx.tx.insert(userRoles).values({ tenantId: ctx.p.tenantId, userId: id, role: value as RoleName, campusId: null }).onConflictDoNothing()),
        },
        preferredLanguage: { label: 'Language', type: 'select', schema: z.enum(['en', 'hi', 'kn']), column: users.preferredLanguage, options: LANGUAGES, bulk: true },
        accountStatus: { label: 'Account', type: 'select', schema: z.enum(['active', 'disabled']), column: users.status, options: ACCOUNT, create: false, bulk: true },
        departmentId: { label: 'Department', type: 'select', schema: OptionalRef, options: departmentOptions, bulk: true, apply: (ctx, id, v) => this.setDepartment(ctx, id, v as string | null) },
        designationId: {
          label: 'Designation',
          type: 'select',
          schema: OptionalRef,
          options: designationOptions,
          bulk: true,
          apply: async (ctx, id, v) => {
            if (v !== null) await this.ensureProfile(ctx.tx, ctx.p.tenantId, id);
            await ctx.tx
              .update(staffProfiles)
              .set({ designationId: v as string | null, updatedAt: new Date() })
              .where(eq(staffProfiles.userId, id));
          },
        },
      },
      create: async (ctx, v) => {
        if (!v.email && !v.phone) throw new BadRequestException('Give an email or a phone number');
        const [u] = await ctx.tx
          .insert(users)
          .values({ tenantId: ctx.p.tenantId, fullName: String(v.fullName), email: (v.email as string | null) ?? null, phone: (v.phone as string | null) ?? null, preferredLanguage: (v.preferredLanguage as 'en' | 'hi' | 'kn' | undefined) ?? 'en' })
          .returning({ id: users.id });
        await ctx.tx.insert(userRoles).values({ tenantId: ctx.p.tenantId, userId: u.id, role: v.role as RoleName, campusId: null });
        if (v.departmentId) await this.setDepartment(ctx, u.id, String(v.departmentId));
        if (v.designationId) {
          await this.ensureProfile(ctx.tx, ctx.p.tenantId, u.id);
          await ctx.tx.update(staffProfiles).set({ designationId: String(v.designationId) }).where(eq(staffProfiles.userId, u.id));
        }
        return u.id;
      },
      move: { label: 'Move to department', options: departmentOptions, apply: (ctx, id, to) => this.setDepartment(ctx, id, to) },
      actions: staffPayActions(this.hr, this.payroll),
      remove: {
        guard: async (ctx, id) => (id === ctx.p.userId ? 'You cannot delete your own account' : null),
      },
      columns: [
        { key: 'fullName', header: 'Name' },
        { key: 'employeeCode', header: 'Employee code' },
        { key: 'email', header: 'Email' },
        { key: 'phone', header: 'Phone' },
        { key: 'roles', header: 'Roles' },
        { key: 'departmentName', header: 'Department' },
        { key: 'designationName', header: 'Designation' },
        { key: 'staffStatus', header: 'Employment', value: (r) => EMPLOYMENT.find((o) => o.value === r.staffStatus)?.label ?? '' },
        { key: 'accountStatus', header: 'Account' },
        { key: 'dateOfJoining', header: 'Joined on' },
        { key: 'staffCategory', header: 'Category', value: (r) => labelOf(STAFF_CATEGORIES, r.staffCategory) },
        { key: 'cadre', header: 'Cadre', value: (r) => labelOf(CADRES, r.cadre) },
        { key: 'gender', header: 'Gender', value: (r) => labelOf(GENDERS, r.gender) },
        { key: 'socialCategory', header: 'Social category', value: (r) => labelOf(SOCIAL, r.socialCategory) },
        { key: 'phdStatus', header: 'Ph.D.', value: (r) => labelOf(PHD, r.phdStatus) },
        { key: 'netSet', header: 'NET / SET', value: (r) => labelOf(NET_SET, r.netSet) },
      ],
      import: {
        columns: [
          { key: 'full_name', header: 'Full name', required: true, help: 'In any script', example: 'Priya Nair' },
          { key: 'email', header: 'Email', help: 'Email or phone is required; rows are matched on email, then phone', example: 'priya.nair@example.in' },
          { key: 'phone', header: 'Phone', help: 'Mobile number, e.g. 98450 12345', example: '+919845000101' },
          { key: 'roles', header: 'Roles', required: true, help: 'teacher, hod, principal, tenant_admin, accountant, librarian, admissions_officer, hr_manager; several separated by ;', example: 'teacher', options: ['teacher', 'hod', 'principal', 'tenant_admin', 'accountant', 'librarian', 'admissions_officer', 'hr_manager'] },
          { key: 'preferred_language', header: 'Language', help: 'en, hi or kn (default en)', options: ['en', 'hi', 'kn'], example: 'en' },
          { key: 'departments', header: 'Departments', help: 'Department names separated by ; (created if missing)', options: async (ctx) => (await departmentOptions(ctx)).map((o) => o.label) },
        ],
        key: ['email', 'phone'],
        exists: async (ctx, r) => {
          const email = r.get('email').toLowerCase();
          const phone = r.get('phone') ? normalizePhone(r.get('phone')) : '';
          if (!email && !phone) return false;
          const [hit] = await ctx.tx
            .select({ id: users.id })
            .from(users)
            .where(or(email ? eq(users.email, email) : undefined, phone ? eq(users.phone, phone) : undefined))
            .limit(1);
          return !!hit;
        },
        run: (ctx, rows) => this.imports.applyRows(ctx.tx, ctx.p, 'staff', rows),
      },
    };
  }
}

