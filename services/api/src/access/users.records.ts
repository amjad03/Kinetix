import { BadRequestException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import { normalizePhone } from '../auth/phone.js';
import type { RoleName } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { userMfa, userSessions } from '../db/schema-foundation.js';
import { roleName, userRoles, users } from '../db/schema.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { Text } from '../records/helpers.js';
import { eachRow } from '../records/import.js';

/** Roles this page hands out. Students, guardians and alumni get their accounts from their own records. */
export const ASSIGNABLE_ROLES = roleName.enumValues.filter((r) => !['student', 'guardian', 'alumni'].includes(r)) as RoleName[];
const FAMILY_ROLES = ['student', 'guardian'];

export const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const ROLE_OPTIONS: FieldOption[] = ASSIGNABLE_ROLES.map((r) => ({ value: r, label: roleLabel(r) }));
const ALL_ROLE_OPTIONS: FieldOption[] = roleName.enumValues.map((r) => ({ value: r, label: roleLabel(r) }));
const STATUS: FieldOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'disabled', label: 'Disabled' },
];
const KINDS: FieldOption[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'student', label: 'Students' },
  { value: 'guardian', label: 'Parents and guardians' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'external', label: 'External reviewers' },
  { value: 'all', label: 'Everyone' },
];
const LANGUAGES: FieldOption[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'kn', label: 'ಕನ್ನಡ' },
];

const Email = z
  .union([z.email().max(200), z.literal('')])
  .nullable()
  .transform((v) => (v ? v.toLowerCase() : null));
const Phone = z
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
const RoleParam = z.object({ role: z.enum(ASSIGNABLE_ROLES as [RoleName, ...RoleName[]]) });

/** Qualified, so a subquery over another table never reads its own "id". */
const USER_ID = sql.raw('"users"."id"');
const roleList = sql<string[]>`coalesce((select array_agg(distinct ur.role::text order by ur.role::text) from user_roles ur where ur.user_id = ${USER_ID}), '{}')`;
const lastActive = sql<string | null>`(select max(s.last_seen_at) from user_sessions s where s.user_id = ${USER_ID})`;
const openSessions = sql<number>`(select count(*)::int from user_sessions s where s.user_id = ${USER_ID} and s.revoked_at is null)`;
const mfaOn = sql<boolean>`exists (select 1 from user_mfa m where m.user_id = ${USER_ID} and m.confirmed_at is not null)`;
const hasRole = (roles: string[]) => sql`exists (select 1 from user_roles ur where ur.user_id = ${USER_ID} and ur.role::text in (${sql.join(roles.map((r) => sql`${r}`), sql`, `)}))`;
const STAFFISH = ASSIGNABLE_ROLES.filter((r) => !['external_examiner', 'accreditation_reviewer'].includes(r));
const kind = sql<string>`case when ${hasRole(STAFFISH)} then 'staff' when ${hasRole(['student'])} then 'student' when ${hasRole(['guardian'])} then 'guardian' when ${hasRole(['alumni'])} then 'alumni' when ${hasRole(['external_examiner', 'accreditation_reviewer'])} then 'external' else 'none' end`;

/** The person's roles. */
export async function rolesOf(tx: Tx, userId: string): Promise<RoleName[]> {
  const rows = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return [...new Set(rows.map((r) => r.role as RoleName))].sort();
}

/** Other active administrators besides this person. */
async function otherAdmins(tx: Tx, userId: string): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(distinct ${userRoles.userId})::int` })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.role, 'tenant_admin'), ne(userRoles.userId, userId), eq(users.status, 'active')));
  return r?.n ?? 0;
}

/** Only an administrator may change an administrator's account. */
export async function assertMayManage(ctx: KitCtx, userId: string): Promise<RoleName[]> {
  const roles = await rolesOf(ctx.tx, userId);
  if (roles.includes('tenant_admin') && !ctx.p.roles.includes('tenant_admin')) throw new ForbiddenException("Only the institution's administrator can change an administrator's account");
  return roles;
}

/** Signs a person out everywhere. Returns how many sessions were open. */
export async function revokeAll(tx: Tx, userId: string): Promise<number> {
  const rows = await tx.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt))).returning({ id: userSessions.id });
  return rows.length;
}

/**
 * Sets a person's roles to exactly `next` (families' own roles are kept), with the rules that protect the institution:
 * nobody changes their own roles, only an administrator gives or takes the administrator role, and the last active
 * administrator keeps it. The person is signed out so the change applies at once. Audited as `user.roles_changed`.
 */
export async function setRoles(ctx: KitCtx, userId: string, next: RoleName[]): Promise<{ before: RoleName[]; after: RoleName[]; signedOut: number }> {
  if (userId === ctx.p.userId) throw new ForbiddenException('You cannot change your own roles. Ask another administrator.');
  const before = await assertMayManage(ctx, userId);
  const want = [...new Set([...next.filter((r) => ASSIGNABLE_ROLES.includes(r)), ...before.filter((r) => !ASSIGNABLE_ROLES.includes(r))])].sort() as RoleName[];
  const adding = want.filter((r) => !before.includes(r));
  const removing = before.filter((r) => !want.includes(r));
  if (!adding.length && !removing.length) return { before, after: before, signedOut: 0 };
  if ((adding.includes('tenant_admin') || removing.includes('tenant_admin')) && !ctx.p.roles.includes('tenant_admin')) throw new ForbiddenException("Only the institution's administrator can give or take the administrator role");
  if (removing.includes('tenant_admin') && (await otherAdmins(ctx.tx, userId)) === 0) throw new BadRequestException('The institution needs at least one active administrator');
  if (!want.length) throw new BadRequestException('Give at least one role, or disable the account instead');
  if (removing.length) await ctx.tx.delete(userRoles).where(and(eq(userRoles.userId, userId), sql`${userRoles.role}::text in (${sql.join(removing.map((r) => sql`${r}`), sql`, `)})`));
  for (const role of adding) await ctx.tx.insert(userRoles).values({ tenantId: ctx.p.tenantId, userId, role, campusId: null }).onConflictDoNothing();
  const signedOut = await revokeAll(ctx.tx, userId);
  await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'user.roles_changed', subjectType: 'user', subjectId: userId, changes: { roles: { before: before.join(', '), after: want.join(', ') } }, data: { added: adding, removed: removing, signedOut } });
  return { before, after: want, signedOut };
}

/** Disables or re-enables an account. Disabling signs the person out everywhere. */
async function setStatus(ctx: KitCtx, userId: string, status: 'active' | 'invited' | 'disabled'): Promise<void> {
  const roles = await assertMayManage(ctx, userId);
  if (status === 'disabled') {
    if (userId === ctx.p.userId) throw new ForbiddenException('You cannot disable your own account');
    if (roles.includes('tenant_admin') && (await otherAdmins(ctx.tx, userId)) === 0) throw new BadRequestException('The institution needs at least one active administrator');
  }
  await ctx.tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
  if (status === 'disabled') await revokeAll(ctx.tx, userId);
}

/**
 * Users and access as a record kit entity: every account of the institution with its roles, status, two-step sign-in
 * and last activity. Add an account with a role, edit contact details, disable (which signs the person out), bulk
 * actions for roles and sessions, import, export and history. Only the principal and the administrator.
 */
export function usersEntity(): RecordEntity {
  return {
    key: 'users',
    module: 'access',
    table: users,
    subjectType: 'user',
    roles: { read: STAFF_ADMIN_ROLES, write: STAFF_ADMIN_ROLES },
    label: (r) => String(r.fullName),
    list: {
      select: {
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        preferredLanguage: users.preferredLanguage,
        status: users.status,
        mustChangePassword: users.passwordMustChange,
        roles: roleList,
        kind,
        lastActiveAt: lastActive,
        openSessions,
        mfaOn,
        createdAt: users.createdAt,
      },
      search: [users.fullName, users.email, users.phone],
      filters: {
        role: { label: 'Role', options: ALL_ROLE_OPTIONS, where: (v) => ((roleName.enumValues as string[]).includes(v) ? hasRole([v]) : undefined) },
        status: { label: 'Status', options: STATUS, where: (v) => (STATUS.some((o) => o.value === v) ? eq(users.status, v as 'active') : undefined) },
        kind: { label: 'Kind', options: KINDS, where: (v) => (v !== 'all' && KINDS.some((o) => o.value === v) ? sql`${kind} = ${v}` : undefined) },
        mfa: {
          label: 'Two-step sign-in',
          options: [
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ],
          where: (v) => (v === 'on' ? mfaOn : v === 'off' ? sql`not ${mfaOn}` : undefined),
        },
        activity: {
          label: 'Activity',
          options: [
            { value: 'week', label: 'Active in the last 7 days' },
            { value: 'idle', label: 'Not active for 30 days' },
            { value: 'never', label: 'Never signed in' },
          ],
          where: (v) =>
            v === 'week' ? sql`${lastActive} >= now() - interval '7 days'` : v === 'idle' ? sql`${lastActive} < now() - interval '30 days'` : v === 'never' ? sql`${lastActive} is null` : undefined,
        },
      },
      sorts: { name: users.fullName, status: users.status, lastActive, created: users.createdAt, email: users.email },
      defaultSort: { id: 'name', dir: 'asc' },
    },
    fields: {
      fullName: { label: 'Full name', type: 'text', schema: Text(120), column: users.fullName, required: true },
      email: { label: 'Email', type: 'email', schema: Email, column: users.email, help: 'Signs in with this and a password' },
      phone: { label: 'Mobile number', type: 'phone', schema: Phone, column: users.phone, help: 'Signs in with a code sent to this number' },
      role: { label: 'Role', type: 'select', schema: z.enum(ASSIGNABLE_ROLES as [RoleName, ...RoleName[]]), options: ROLE_OPTIONS, required: true, edit: false, apply: async () => undefined },
      preferredLanguage: { label: 'Language', type: 'select', schema: z.enum(['en', 'hi', 'kn']), column: users.preferredLanguage, options: LANGUAGES, bulk: true },
      status: {
        label: 'Status',
        type: 'select',
        schema: z.enum(['active', 'invited', 'disabled']),
        options: STATUS,
        create: false,
        bulk: true,
        help: 'A disabled account is signed out everywhere and cannot sign in',
        apply: (ctx, id, v) => setStatus(ctx, id, v as 'active' | 'invited' | 'disabled'),
      },
    },
    create: async (ctx, v) => {
      if (!v.email && !v.phone) throw new BadRequestException('Give an email or a mobile number');
      const role = v.role as RoleName;
      if (role === 'tenant_admin' && !ctx.p.roles.includes('tenant_admin')) throw new ForbiddenException("Only the institution's administrator can give or take the administrator role");
      const [u] = await ctx.tx
        .insert(users)
        .values({ tenantId: ctx.p.tenantId, fullName: String(v.fullName), email: (v.email as string | null) ?? null, phone: (v.phone as string | null) ?? null, preferredLanguage: (v.preferredLanguage as 'en' | 'hi' | 'kn' | undefined) ?? 'en' })
        .returning({ id: users.id });
      await ctx.tx.insert(userRoles).values({ tenantId: ctx.p.tenantId, userId: u.id, role, campusId: null });
      return u.id;
    },
    remove: {
      guard: async (ctx, id) => {
        if (id === ctx.p.userId) return 'You cannot delete your own account';
        const roles = await rolesOf(ctx.tx, id);
        if (roles.includes('tenant_admin') && !ctx.p.roles.includes('tenant_admin')) return "Only the institution's administrator can change an administrator's account";
        if (roles.includes('tenant_admin') && (await otherAdmins(ctx.tx, id)) === 0) return 'The institution needs at least one active administrator';
        if (roles.some((r) => FAMILY_ROLES.includes(r))) return "Remove a student's or parent's account from their student record";
        return null;
      },
    },
    actions: {
      signOut: {
        label: 'Sign out everywhere',
        apply: async (ctx, id) => {
          await assertMayManage(ctx, id);
          const n = await revokeAll(ctx.tx, id);
          await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'user.signed_out', subjectType: 'user', subjectId: id, data: { sessions: n } });
          return `${n} signed out`;
        },
      },
      resetMfa: {
        label: 'Reset two-step sign-in',
        tone: 'danger',
        apply: async (ctx, id) => {
          await assertMayManage(ctx, id);
          const removed = await ctx.tx.delete(userMfa).where(eq(userMfa.userId, id)).returning({ id: userMfa.userId });
          if (!removed.length) return 'Two-step sign-in was not on';
          await revokeAll(ctx.tx, id);
          await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'mfa.reset', subjectType: 'user', subjectId: id });
          return 'Reset';
        },
      },
      addRole: {
        label: 'Give a role',
        params: RoleParam,
        apply: async (ctx, id, params) => {
          const { role } = params as z.infer<typeof RoleParam>;
          const before = await rolesOf(ctx.tx, id);
          if (before.includes(role)) return 'Already has it';
          await setRoles(ctx, id, [...before, role]);
          return roleLabel(role);
        },
      },
      removeRole: {
        label: 'Take a role away',
        params: RoleParam,
        apply: async (ctx, id, params) => {
          const { role } = params as z.infer<typeof RoleParam>;
          const before = await rolesOf(ctx.tx, id);
          if (!before.includes(role)) return 'Did not have it';
          await setRoles(ctx, id, before.filter((r) => r !== role));
          return roleLabel(role);
        },
      },
    },
    columns: [
      { key: 'fullName', header: 'Name' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' },
      { key: 'roles', header: 'Roles', value: (r) => (r.roles as string[]).join('; ') },
      { key: 'status', header: 'Status' },
      { key: 'mfaOn', header: 'Two-step sign-in', value: (r) => (r.mfaOn ? 'On' : 'Off') },
      { key: 'lastActiveAt', header: 'Last active', value: (r) => (r.lastActiveAt ? new Date(String(r.lastActiveAt)).toISOString() : '') },
      { key: 'openSessions', header: 'Signed-in devices' },
      { key: 'createdAt', header: 'Created', value: (r) => new Date(String(r.createdAt)).toISOString().slice(0, 10) },
    ],
    import: {
      columns: [
        { key: 'full_name', header: 'Full name', required: true, example: 'Priya Nair' },
        { key: 'email', header: 'Email', help: 'Email or mobile is required; rows are matched on email, then mobile', example: 'priya.nair@example.in' },
        { key: 'phone', header: 'Mobile', help: 'e.g. 98450 12345', example: '+919845000101' },
        { key: 'roles', header: 'Roles', required: true, help: 'One or more roles separated by ; (they are added to the roles a person already has)', example: 'teacher', options: ASSIGNABLE_ROLES },
        { key: 'language', header: 'Language', help: 'en, hi or kn (default en)', options: ['en', 'hi', 'kn'], example: 'en' },
      ],
      key: ['email', 'phone'],
      exists: async (ctx, r) => !!(await findByContact(ctx.tx, r.get('email'), r.get('phone'))),
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const name = required(r, 'full_name');
          const email = r.get('email') ? lc(r.get('email')) : null;
          if (email && !z.email().safeParse(email).success) fail('Enter a valid email address', email);
          const phone = r.get('phone') ? normalizePhone(r.get('phone')) : null;
          if (phone && !/^\+\d{8,15}$/.test(phone)) fail('Enter a valid mobile number', r.get('phone'));
          if (!email && !phone) fail('Give an email or a mobile number');
          const roles = required(r, 'roles')
            .split(/[;,]/)
            .map((x) => lc(x).replace(/\s+/g, '_'))
            .filter(Boolean);
          for (const role of roles) if (!(ASSIGNABLE_ROLES as string[]).includes(role)) fail('Choose one of the listed values', role);
          if (roles.includes('tenant_admin') && !ctx.p.roles.includes('tenant_admin')) fail("Only the institution's administrator can give or take the administrator role");
          const lang = (lc(r.get('language')) || 'en') as 'en' | 'hi' | 'kn';
          if (!['en', 'hi', 'kn'].includes(lang)) fail('Choose one of the listed values', lang);
          const found = await findByContact(tx, email ?? '', phone ?? '');
          let id = found?.id;
          let changed = false;
          if (!id) {
            const [u] = await tx.insert(users).values({ tenantId: ctx.p.tenantId, fullName: name, email, phone, preferredLanguage: lang }).returning({ id: users.id });
            id = u.id;
          } else if (found!.fullName !== name || (email && found!.email !== email) || (phone && found!.phone !== phone)) {
            await tx.update(users).set({ fullName: name, ...(email && { email }), ...(phone && { phone }), updatedAt: new Date() }).where(eq(users.id, id));
            changed = true;
          }
          const had = await rolesOf(tx, id);
          for (const role of roles) if (!had.includes(role as RoleName)) {
            await tx.insert(userRoles).values({ tenantId: ctx.p.tenantId, userId: id, role: role as RoleName, campusId: null }).onConflictDoNothing();
            changed = true;
          }
          return outcome(!found, changed, [name, roles.map(roleLabel).join(', ')]);
        }),
    },
  };
}

async function findByContact(tx: Tx, email: string, phone: string) {
  const e = email ? lc(email) : '';
  const p = phone ? normalizePhone(phone) : '';
  if (!e && !p) return undefined;
  const [hit] = await tx
    .select({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone })
    .from(users)
    .where(or(e ? eq(users.email, e) : undefined, p ? eq(users.phone, p) : undefined))
    .limit(1);
  return hit;
}

@Injectable()
export class UserRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(usersEntity());
  }
}
