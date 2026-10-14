import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { userMfa, userSessions } from '../db/schema-foundation.js';
import { roleAccessRules } from '../db/schema-governance.js';
import { auditLog, departments, departmentStaff, roleName, userRoles, users } from '../db/schema.js';
import { ACCESS_LEVELS, ACCESS_MODULES, RULE_ROLES, type AccessLevel } from './access-catalog.js';
import { invalidateRoleAccess } from './role-access.interceptor.js';
import { ASSIGNABLE_ROLES, assertMayManage, revokeAll, roleLabel, rolesOf, setRoles } from './users.records.js';

const RulesBody = z.object({
  role: z.enum(RULE_ROLES),
  changes: z.array(z.object({ module: z.string().max(40), access: z.enum(ACCESS_LEVELS) })).min(1).max(ACCESS_MODULES.length),
});
const ResetBody = z.object({ role: z.enum(RULE_ROLES).optional() });
const CopyBody = z.object({ from: z.enum(RULE_ROLES), to: z.enum(RULE_ROLES) });
const RolesBody = z.object({ roles: z.array(z.enum(roleName.enumValues)).max(roleName.enumValues.length) });
const Range = z.object({ from: Day.optional(), to: Day.optional(), q: z.string().trim().max(100).optional(), result: z.enum(['ok', 'failed']).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });

const SIGN_IN_ACTIONS = ['auth.sign_in', 'auth.sign_in_failed', 'auth.sign_in_blocked', 'auth.mfa_failed'];
const DAY_MS = 86_400_000;

/** The date range of a report: the last 30 days by default, at most a year. */
function range(q: z.infer<typeof Range>, now = new Date()): { from: Date; to: Date; fromDay: string; toDay: string } {
  const toDay = q.to ?? now.toISOString().slice(0, 10);
  const fromDay = q.from ?? new Date(Date.parse(`${toDay}T00:00:00Z`) - 29 * DAY_MS).toISOString().slice(0, 10);
  if (fromDay > toDay) throw new BadRequestException('"From" must not be after "to"');
  const from = new Date(`${fromDay}T00:00:00Z`);
  const to = new Date(Date.parse(`${toDay}T00:00:00Z`) + DAY_MS);
  if (to.getTime() - from.getTime() > 367 * DAY_MS) throw new BadRequestException('Choose at most a year');
  return { from, to, fromDay, toDay };
}

const parse = <T extends z.ZodType>(schema: T, q: unknown): z.infer<T> => {
  const r = schema.safeParse(q);
  if (!r.success) throw new BadRequestException(z.flattenError(r.error));
  return r.data;
};

/** Age buckets of a pending item, in days. */
const BUCKETS = [
  { key: 'd0_2', max: 2 },
  { key: 'd3_7', max: 7 },
  { key: 'd8_30', max: 30 },
  { key: 'd31', max: Infinity },
] as const;

/**
 * Users and access: the role access matrix (what each staff role may do in each module), a person's roles, sessions
 * and sign-ins, and the governance reports (sign-ins, module usage, pending approvals by age). Principal and
 * administrator only; every change is audited.
 */
@Controller('v1/admin/access')
export class AccessController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  // ---- roles and permissions ---------------------------------------------------------------------------------------

  /** The modules, the roles a rule may narrow, and the institution's rules (`role:module` → read | none). */
  @Get('matrix')
  @Auth('user', STAFF_ADMIN_ROLES)
  matrix(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rules = await tx
        .select({ role: roleAccessRules.role, module: roleAccessRules.module, access: roleAccessRules.access, updatedAt: roleAccessRules.updatedAt, updatedBy: users.fullName })
        .from(roleAccessRules)
        .leftJoin(users, eq(users.id, roleAccessRules.updatedBy))
        .orderBy(asc(roleAccessRules.role), asc(roleAccessRules.module));
      const holders = await tx.select({ role: userRoles.role, n: sql<number>`count(distinct ${userRoles.userId})::int` }).from(userRoles).groupBy(userRoles.role);
      return {
        modules: ACCESS_MODULES.map(({ key, label, group, usedBy }) => ({ key, label, group, usedBy })),
        roles: RULE_ROLES.map((r) => ({ key: r, label: roleLabel(r), people: holders.find((h) => h.role === r)?.n ?? 0 })),
        levels: ACCESS_LEVELS,
        rules,
      };
    });
  }

  /** Changes one role's access to some modules: `full` removes the rule, `read` and `none` set it. */
  @Put('matrix')
  @Auth('user', STAFF_ADMIN_ROLES)
  async saveRules(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RulesBody)) b: z.infer<typeof RulesBody>) {
    const unknown = b.changes.find((c) => !ACCESS_MODULES.some((m) => m.key === c.module));
    if (unknown) throw new BadRequestException(`Unknown module ${unknown.module}`);
    if (b.role === 'principal' && !p.roles.includes('tenant_admin')) throw new BadRequestException("Only the institution's administrator can narrow the principal's access");
    const out = await this.db.withTenant(p.tenantId, (tx) => this.apply(tx, p, b.role, b.changes));
    invalidateRoleAccess(p.tenantId);
    return out;
  }

  /** Copies one role's rules to another (replacing the other's). */
  @Post('matrix/copy')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  async copy(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CopyBody)) b: z.infer<typeof CopyBody>) {
    if (b.from === b.to) throw new BadRequestException('Choose two different roles');
    if (b.to === 'principal' && !p.roles.includes('tenant_admin')) throw new BadRequestException("Only the institution's administrator can narrow the principal's access");
    const out = await this.db.withTenant(p.tenantId, async (tx) => {
      const src = await tx.select({ module: roleAccessRules.module, access: roleAccessRules.access }).from(roleAccessRules).where(eq(roleAccessRules.role, b.from));
      const changes = ACCESS_MODULES.map((m) => ({ module: m.key, access: (src.find((s) => s.module === m.key)?.access ?? 'full') as AccessLevel }));
      return this.apply(tx, p, b.to, changes, b.from);
    });
    invalidateRoleAccess(p.tenantId);
    return out;
  }

  /** Back to the defaults: one role, or every role. */
  @Post('matrix/reset')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  async reset(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ResetBody)) b: z.infer<typeof ResetBody>) {
    const admin = p.roles.includes('tenant_admin');
    if (b.role === 'principal' && !admin) throw new BadRequestException("Only the institution's administrator can change the principal's access");
    // A principal resetting every role leaves the principal's own rules to the administrator.
    const roles = b.role ? [b.role] : RULE_ROLES.filter((r) => admin || r !== 'principal');
    const out = await this.db.withTenant(p.tenantId, async (tx) => {
      let changed = 0;
      for (const role of roles) changed += (await this.apply(tx, p, role, ACCESS_MODULES.map((m) => ({ module: m.key, access: 'full' as const })))).changed;
      return { roles: roles.length, changed };
    });
    invalidateRoleAccess(p.tenantId);
    return out;
  }

  /** Who changed the rules, when, and what. */
  @Get('matrix/history')
  @Auth('user', STAFF_ADMIN_ROLES)
  history(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: auditLog.id, at: auditLog.at, actor: users.fullName, data: auditLog.data })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(eq(auditLog.action, 'access.rules_changed'))
        .orderBy(desc(auditLog.at))
        .limit(100),
    );
  }

  private async apply(tx: Tx, p: UserPrincipal, role: string, changes: { module: string; access: AccessLevel }[], copiedFrom?: string) {
    const before = new Map((await tx.select({ module: roleAccessRules.module, access: roleAccessRules.access }).from(roleAccessRules).where(eq(roleAccessRules.role, role))).map((r) => [r.module, r.access as AccessLevel]));
    const diff: Record<string, { before: AccessLevel; after: AccessLevel }> = {};
    for (const c of changes) {
      const was = before.get(c.module) ?? 'full';
      if (was === c.access) continue;
      diff[c.module] = { before: was, after: c.access };
      if (c.access === 'full') await tx.delete(roleAccessRules).where(and(eq(roleAccessRules.role, role), eq(roleAccessRules.module, c.module)));
      else
        await tx
          .insert(roleAccessRules)
          .values({ tenantId: p.tenantId, role, module: c.module, access: c.access, updatedBy: p.userId })
          .onConflictDoUpdate({ target: [roleAccessRules.tenantId, roleAccessRules.role, roleAccessRules.module], set: { access: c.access, updatedBy: p.userId, updatedAt: new Date() } });
    }
    if (Object.keys(diff).length) await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'access.rules_changed', subjectType: 'tenant', subjectId: p.tenantId, changes: diff, data: { role, ...(copiedFrom && { copiedFrom }) } });
    return { role, changed: Object.keys(diff).length };
  }

  // ---- one person ----------------------------------------------------------------------------------------------------

  /** A person's account: roles, departments, two-step sign-in, open sessions and recent sign-ins. */
  @Get('users/:id')
  @Auth('user', STAFF_ADMIN_ROLES)
  user(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx
        .select({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, status: users.status, preferredLanguage: users.preferredLanguage, mustChangePassword: users.passwordMustChange, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, id));
      if (!u) throw new NotFoundException('User not found');
      const [mfa] = await tx.select({ confirmedAt: userMfa.confirmedAt }).from(userMfa).where(eq(userMfa.userId, id));
      const sessions = await tx
        .select({ id: userSessions.id, label: userSessions.label, ip: userSessions.ip, userAgent: userSessions.userAgent, mfaVerified: userSessions.mfaVerified, createdAt: userSessions.createdAt, lastSeenAt: userSessions.lastSeenAt })
        .from(userSessions)
        .where(and(eq(userSessions.userId, id), isNull(userSessions.revokedAt)))
        .orderBy(desc(userSessions.lastSeenAt))
        .limit(50);
      const depts = await tx.select({ id: departments.id, name: departments.name }).from(departmentStaff).innerJoin(departments, eq(departments.id, departmentStaff.departmentId)).where(eq(departmentStaff.userId, id)).orderBy(asc(departments.name));
      const headOf = await tx.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.headUserId, id));
      const signIns = await tx
        .select({ at: auditLog.at, action: auditLog.action, data: auditLog.data })
        .from(auditLog)
        .where(and(eq(auditLog.subjectType, 'user'), eq(auditLog.subjectId, id), inArray(auditLog.action, SIGN_IN_ACTIONS)))
        .orderBy(desc(auditLog.at))
        .limit(20);
      return { ...u, roles: await rolesOf(tx, id), assignable: ASSIGNABLE_ROLES, mfaOn: !!mfa?.confirmedAt, sessions, departments: depts, headOf, signIns };
    });
  }

  /** Sets a person's roles; they are signed out so the change applies at once. */
  @Put('users/:id/roles')
  @Auth('user', STAFF_ADMIN_ROLES)
  roles(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RolesBody)) b: z.infer<typeof RolesBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!u) throw new NotFoundException('User not found');
      return setRoles({ tx, p }, id, b.roles as RoleName[]);
    });
  }

  /** Signs a person out of every device. */
  @Post('users/:id/sign-out')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  signOut(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!u) throw new NotFoundException('User not found');
      await assertMayManage({ tx, p }, id);
      const signedOut = await revokeAll(tx, id);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'user.signed_out', subjectType: 'user', subjectId: id, data: { sessions: signedOut } });
      return { signedOut };
    });
  }

  /** Signs one of a person's devices out. */
  @Delete('users/:id/sessions/:sid')
  @HttpCode(204)
  @Auth('user', STAFF_ADMIN_ROLES)
  async revokeSession(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('sid', ParseUUIDPipe) sid: string) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      await assertMayManage({ tx, p }, id);
      const [s] = await tx.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.id, sid), eq(userSessions.userId, id), isNull(userSessions.revokedAt))).returning({ id: userSessions.id });
      if (!s) throw new NotFoundException('Session not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'auth.session_revoked', subjectType: 'user', subjectId: id, data: { sessionId: sid } });
    });
  }

  // ---- reports -------------------------------------------------------------------------------------------------------

  /** Sign-ins and failed attempts in a date range: totals by day and result, and the latest entries. */
  @Get('reports/sign-ins')
  @Auth('user', STAFF_ADMIN_ROLES)
  signIns(@CurrentPrincipal() p: UserPrincipal, @Query() query: Record<string, string>) {
    const q = parse(Range, query);
    const r = range(q, this.clock.now());
    return this.db.withTenant(p.tenantId, async (tx) => {
      const when = and(inArray(auditLog.action, SIGN_IN_ACTIONS), gte(auditLog.at, r.from), lt(auditLog.at, r.to));
      const failed = sql`${auditLog.action} <> 'auth.sign_in'`;
      const byDay = await tx
        .select({ day: sql<string>`to_char(${auditLog.at} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`, ok: sql<number>`count(*) filter (where ${auditLog.action} = 'auth.sign_in')::int`, failed: sql<number>`count(*) filter (where ${failed})::int`, people: sql<number>`count(distinct ${auditLog.subjectId}) filter (where ${auditLog.action} = 'auth.sign_in')::int` })
        .from(auditLog)
        .where(when)
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      const filter: SQL | undefined = and(
        when,
        q.result === 'ok' ? eq(auditLog.action, 'auth.sign_in') : q.result === 'failed' ? failed : undefined,
        q.q ? sql`(${users.fullName} ilike ${`%${q.q}%`} or ${users.email} ilike ${`%${q.q}%`} or ${users.phone} ilike ${`%${q.q}%`})` : undefined,
      );
      const items = await tx
        .select({
          id: auditLog.id,
          at: auditLog.at,
          action: auditLog.action,
          userId: auditLog.subjectId,
          name: users.fullName,
          email: users.email,
          data: auditLog.data,
          // A successful sign-in names its session: the browser or app and the address it came from.
          ip: sql<string | null>`(select s.ip from user_sessions s where s.id::text = ${auditLog.data} ->> 'sessionId')`,
          device: sql<string | null>`(select nullif(s.label, '') from user_sessions s where s.id::text = ${auditLog.data} ->> 'sessionId')`,
          userAgent: sql<string | null>`(select s.user_agent from user_sessions s where s.id::text = ${auditLog.data} ->> 'sessionId')`,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.subjectId))
        .where(filter)
        .orderBy(desc(auditLog.at))
        .limit(q.limit);
      const repeatFailures = await tx
        .select({ userId: auditLog.subjectId, name: users.fullName, n: sql<number>`count(*)::int`, last: sql<string>`max(${auditLog.at})` })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.subjectId))
        .where(and(when, failed))
        .groupBy(auditLog.subjectId, users.fullName)
        .having(sql`count(*) >= 3`)
        .orderBy(desc(sql`count(*)`))
        .limit(20);
      const [never] = await tx.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.status, 'active'), sql`not exists (select 1 from user_sessions s where s.user_id = ${users.id})`));
      const totals = byDay.reduce((a, d) => ({ ok: a.ok + d.ok, failed: a.failed + d.failed }), { ok: 0, failed: 0 });
      const [people] = await tx.select({ n: sql<number>`count(distinct ${auditLog.subjectId})::int` }).from(auditLog).where(and(when, eq(auditLog.action, 'auth.sign_in')));
      return { from: r.fromDay, to: r.toDay, totals: { ...totals, people: people?.n ?? 0, neverSignedIn: never?.n ?? 0 }, byDay, items, repeatFailures };
    });
  }

  /** What people did in a date range: changes per module (the audit action's first word), per role, and the busiest people. */
  @Get('reports/usage')
  @Auth('user', STAFF_ADMIN_ROLES)
  usage(@CurrentPrincipal() p: UserPrincipal, @Query() query: Record<string, string>) {
    const q = parse(Range, query);
    const r = range(q, this.clock.now());
    return this.db.withTenant(p.tenantId, async (tx) => {
      const when = and(eq(auditLog.actorType, 'user'), gte(auditLog.at, r.from), lt(auditLog.at, r.to), sql`${auditLog.action} not like 'auth.%'`, sql`${auditLog.action} not in ('audit.viewed', 'audit.exported')`);
      const area = sql<string>`split_part(${auditLog.action}, '.', 1)`;
      const byArea = await tx
        .select({ area, actions: sql<number>`count(*)::int`, people: sql<number>`count(distinct ${auditLog.actorId})::int`, last: sql<string>`max(${auditLog.at})` })
        .from(auditLog)
        .where(when)
        .groupBy(area)
        .orderBy(desc(sql`count(*)`))
        .limit(60);
      const byRole = await tx
        .select({ role: sql<string>`ur.role::text`, actions: sql<number>`count(*)::int`, people: sql<number>`count(distinct ${auditLog.actorId})::int` })
        .from(auditLog)
        .innerJoin(sql`user_roles ur`, sql`ur.user_id = ${auditLog.actorId}`)
        .where(when)
        .groupBy(sql`ur.role`)
        .orderBy(desc(sql`count(*)`));
      const people = await tx
        .select({ userId: auditLog.actorId, name: users.fullName, actions: sql<number>`count(*)::int`, areas: sql<number>`count(distinct split_part(${auditLog.action}, '.', 1))::int`, last: sql<string>`max(${auditLog.at})` })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(when)
        .groupBy(auditLog.actorId, users.fullName)
        .orderBy(desc(sql`count(*)`))
        .limit(25);
      const byDay = await tx
        .select({ day: sql<string>`to_char(${auditLog.at} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`, actions: sql<number>`count(*)::int`, people: sql<number>`count(distinct ${auditLog.actorId})::int` })
        .from(auditLog)
        .where(when)
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      const [active] = await tx.select({ n: sql<number>`count(distinct ${userSessions.userId})::int` }).from(userSessions).where(and(gte(userSessions.lastSeenAt, r.from), lt(userSessions.lastSeenAt, r.to)));
      return { from: r.fromDay, to: r.toDay, totals: { actions: byArea.reduce((a, x) => a + x.actions, 0), activePeople: active?.n ?? 0 }, byArea, byRole, people, byDay };
    });
  }

  /** What is waiting for a decision, by how long it has waited: approval requests, staff and student leave, and tasks. */
  @Get('reports/approvals')
  @Auth('user', STAFF_ADMIN_ROLES)
  approvals(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = (
        await tx.execute<{ source: string; id: string; title: string; waiting_on: string | null; since: string; days: number }>(sql`
          select 'workflow' as source, r.id::text, r.title, coalesce(u.full_name, replace(r.approver_role, '_', ' ')) as waiting_on, coalesce(r.step_entered_at, r.created_at) as since,
                 floor(extract(epoch from now() - coalesce(r.step_entered_at, r.created_at)) / 86400)::int as days
            from workflow_requests r left join users u on u.id = r.approver_user_id where r.status = 'pending'
          union all
          select 'staff_leave', l.id::text, u.full_name || ' (' || l.from_date || ' to ' || l.to_date || ')', null, l.created_at, floor(extract(epoch from now() - l.created_at) / 86400)::int
            from leave_requests l join users u on u.id = l.user_id where l.status = 'pending'
          union all
          select 'student_leave', l.id::text, s.full_name || ' (' || l.from_date || ' to ' || l.to_date || ')', null, l.created_at, floor(extract(epoch from now() - l.created_at) / 86400)::int
            from student_leave_requests l join students s on s.id = l.student_id where l.status = 'pending'
          union all
          select 'task', t.id::text, t.title, u.full_name, t.created_at, floor(extract(epoch from now() - t.created_at) / 86400)::int
            from tasks t join users u on u.id = t.assignee_id where t.status in ('open', 'in_progress')
          order by days desc
        `)
      ).rows;
      const sources = ['workflow', 'staff_leave', 'student_leave', 'task'];
      const summary = sources.map((source) => {
        const of = rows.filter((r) => r.source === source);
        const buckets = Object.fromEntries(BUCKETS.map((b, i) => [b.key, of.filter((r) => r.days <= b.max && (i === 0 || r.days > BUCKETS[i - 1].max)).length]));
        return { source, total: of.length, oldestDays: of[0]?.days ?? null, ...buckets };
      });
      const byPerson = new Map<string, { waitingOn: string; total: number; overWeek: number }>();
      for (const r of rows) {
        if (!r.waiting_on) continue;
        const e = byPerson.get(r.waiting_on) ?? { waitingOn: r.waiting_on, total: 0, overWeek: 0 };
        e.total++;
        if (r.days > 7) e.overWeek++;
        byPerson.set(r.waiting_on, e);
      }
      return {
        summary,
        oldest: rows.slice(0, 50).map((r) => ({ source: r.source, id: r.id, title: r.title, waitingOn: r.waiting_on, since: r.since, days: r.days })),
        byPerson: [...byPerson.values()].sort((a, b) => b.total - a.total).slice(0, 20),
      };
    });
  }
}
