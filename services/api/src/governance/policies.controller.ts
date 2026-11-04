import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import { Day, orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { roleName, userRoles, users } from '../db/schema.js';
import { governancePolicies, governancePolicyAcks, governancePolicyVersions } from '../db/schema-governance-pass.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { found, hasRole } from '../placements/placements.access.js';
import { GOVERNANCE_ROLES } from './governance.controller.js';
import { govTexts } from './governance-texts.js';
import { addMonths } from './statutory.js';

export const POLICY_CATEGORIES = ['academic', 'examination', 'admission', 'hr', 'finance', 'it', 'data_protection', 'anti_ragging', 'posh', 'grievance', 'code_of_conduct', 'research', 'environment', 'safety', 'other'] as const;
const ROLES = roleName.enumValues as unknown as [RoleName, ...RoleName[]];
const Code = z.string().trim().regex(/^[A-Z0-9][A-Z0-9_/.-]{1,30}$/, 'Use capitals, digits, dots, dashes or slashes, for example POL/HR/01');
const PolicyBody = z.object({
  code: Code,
  title: z.string().trim().min(3).max(200),
  category: z.enum(POLICY_CATEGORIES),
  ownerUserId: z.uuid().optional(),
  reviewMonths: z.number().int().min(1).max(120).default(24),
  public: z.boolean().default(false),
  audience: z.array(z.enum(ROLES)).max(30).default([]),
  body: z.string().trim().min(20, 'Write the policy text').max(100_000),
  changeNote: z.string().trim().max(1000).default('First version'),
});
const PolicyEdit = PolicyBody.pick({ title: true, category: true, reviewMonths: true, public: true, audience: true }).extend({ ownerUserId: z.uuid().nullable(), status: z.enum(['active', 'retired']) }).partial();
const VersionBody = z.object({ body: z.string().trim().min(20).max(100_000), changeNote: z.string().trim().min(3).max(1000) });
const VersionEdit = z.object({ body: z.string().trim().min(20).max(100_000), changeNote: z.string().trim().max(1000), effectiveFrom: Day.nullable() }).partial();

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Policies and document control: each policy is kept as versions (draft, review, approval by someone other than the
 * author, publication), the published text is fingerprinted, the roles it applies to acknowledge it, and the review
 * date follows from the publication. Superseded versions stay readable, with who acknowledged them.
 */
@Controller('v1/governance/policies')
export class PoliciesController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every policy with its published version, an open draft, acknowledgement and the review date. */
  @Get()
  @Auth('user', GOVERNANCE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('category') category?: string, @Query('q') q?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock);
      const rows = await tx
        .select({ p: governancePolicies, owner: users.fullName })
        .from(governancePolicies)
        .leftJoin(users, eq(users.id, governancePolicies.ownerUserId))
        .where(and(category ? eq(governancePolicies.category, category) : undefined, q ? sql`(${governancePolicies.title} ilike ${`%${q}%`} or ${governancePolicies.code} ilike ${`%${q}%`})` : undefined))
        .orderBy(asc(governancePolicies.code))
        .limit(500);
      const ids = rows.map((r) => r.p.id);
      const versions = ids.length ? await tx.select({ id: governancePolicyVersions.id, policyId: governancePolicyVersions.policyId, version: governancePolicyVersions.version, status: governancePolicyVersions.status, publishedAt: governancePolicyVersions.publishedAt }).from(governancePolicyVersions).where(inArray(governancePolicyVersions.policyId, ids)) : [];
      const published = versions.filter((v) => v.status === 'published');
      const ackCounts = published.length ? await tx.select({ versionId: governancePolicyAcks.versionId, n: sql<number>`count(*)::int` }).from(governancePolicyAcks).where(inArray(governancePolicyAcks.versionId, published.map((v) => v.id))).groupBy(governancePolicyAcks.versionId) : [];
      const cache = new Map<string, number>();
      const sizes = new Map<string, number>();
      for (const r of rows) sizes.set(r.p.id, await this.audienceSize(tx, r.p.audience, cache));
      return rows.map(({ p: pol, owner }) => {
        const pub = published.find((v) => v.policyId === pol.id);
        const open = versions.filter((v) => v.policyId === pol.id && ['draft', 'in_review', 'approved'].includes(v.status)).sort((a, b) => b.version - a.version)[0];
        const audience = sizes.get(pol.id) ?? 0;
        const acked = pub ? (ackCounts.find((a) => a.versionId === pub.id)?.n ?? 0) : 0;
        return { ...pol, ownerName: owner, published: pub ? { id: pub.id, version: pub.version, publishedAt: pub.publishedAt } : null, openVersion: open ? { id: open.id, version: open.version, status: open.status } : null, audienceSize: audience, acknowledged: acked, ackPct: pub && audience ? Math.round((acked * 100) / audience) : null, reviewDue: !!pol.nextReviewOn && pol.nextReviewOn <= today && pol.status === 'active' };
      });
    });
  }

  @Post()
  @Auth('user', GOVERNANCE_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PolicyBody)) b: z.infer<typeof PolicyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { body, changeNote, ...rest } = b;
      const [pol] = await orConflict('A policy with this code already exists', () => tx.insert(governancePolicies).values({ tenantId: p.tenantId, ...rest, ownerUserId: rest.ownerUserId ?? p.userId, createdBy: p.userId }).returning());
      const [v] = await tx.insert(governancePolicyVersions).values({ tenantId: p.tenantId, policyId: pol.id, version: 1, body, changeNote, authoredBy: p.userId }).returning();
      await auditUser(tx, p, 'policy.created', 'policy', pol.id, { code: pol.code, versionId: v.id });
      return { ...pol, versions: [v] };
    });
  }

  @Put(':id')
  @Auth('user', GOVERNANCE_ROLES)
  edit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PolicyEdit)) b: z.infer<typeof PolicyEdit>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: governancePolicies.id }).from(governancePolicies).where(eq(governancePolicies.id, id)))[0], 'Policy');
      const [row] = await tx.update(governancePolicies).set(b).where(eq(governancePolicies.id, id)).returning();
      await auditUser(tx, p, 'policy.updated', 'policy', id, { changes: Object.keys(b) });
      return row;
    });
  }

  /** The policy with every version (newest first) and the acknowledgement of the published one. */
  @Get(':id')
  @Auth('user', GOVERNANCE_ROLES)
  detail(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const pol = found((await tx.select().from(governancePolicies).where(eq(governancePolicies.id, id)))[0], 'Policy');
      const vs = await tx.select().from(governancePolicyVersions).where(eq(governancePolicyVersions.policyId, id)).orderBy(desc(governancePolicyVersions.version));
      const people = [...new Set(vs.flatMap((v) => [v.authoredBy, v.approvedBy]).concat(pol.ownerUserId).filter((x): x is string => !!x))];
      const names = people.length ? await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, people)) : [];
      const nm = new Map(names.map((n) => [n.id, n.name]));
      const acks = vs.length ? await tx.select({ versionId: governancePolicyAcks.versionId, n: sql<number>`count(*)::int` }).from(governancePolicyAcks).where(inArray(governancePolicyAcks.versionId, vs.map((v) => v.id))).groupBy(governancePolicyAcks.versionId) : [];
      const audience = await this.audienceSize(tx, pol.audience);
      return {
        ...pol,
        ownerName: pol.ownerUserId ? nm.get(pol.ownerUserId) ?? null : null,
        audienceSize: audience,
        versions: vs.map((v) => ({ ...v, authorName: v.authoredBy ? nm.get(v.authoredBy) ?? null : null, approverName: v.approvedBy ? nm.get(v.approvedBy) ?? null : null, acknowledged: acks.find((a) => a.versionId === v.id)?.n ?? 0, intact: !v.contentHash || v.contentHash === sha(v.body) })),
      };
    });
  }

  /** Starts the next version from the text given; one open version at a time. */
  @Post(':id/versions')
  @Auth('user', GOVERNANCE_ROLES)
  newVersion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VersionBody)) b: z.infer<typeof VersionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const pol = found((await tx.select().from(governancePolicies).where(eq(governancePolicies.id, id)).for('update'))[0], 'Policy');
      if (pol.status === 'retired') throw new ConflictException('This policy is retired');
      const vs = await tx.select({ version: governancePolicyVersions.version, status: governancePolicyVersions.status }).from(governancePolicyVersions).where(eq(governancePolicyVersions.policyId, id));
      if (vs.some((v) => ['draft', 'in_review', 'approved'].includes(v.status))) throw new ConflictException('Finish or discard the open version first');
      const [v] = await tx.insert(governancePolicyVersions).values({ tenantId: p.tenantId, policyId: id, version: Math.max(0, ...vs.map((x) => x.version)) + 1, body: b.body, changeNote: b.changeNote, authoredBy: p.userId }).returning();
      await auditUser(tx, p, 'policy.version_started', 'policy', id, { versionId: v.id, version: v.version });
      return v;
    });
  }

  @Put('versions/:vid')
  @Auth('user', GOVERNANCE_ROLES)
  editVersion(@CurrentPrincipal() p: UserPrincipal, @Param('vid', ParseUUIDPipe) vid: string, @Body(new ZodBody(VersionEdit)) b: z.infer<typeof VersionEdit>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.version(tx, vid);
      if (v.status !== 'draft') throw new ConflictException('Only a draft can be edited');
      const [row] = await tx.update(governancePolicyVersions).set(b).where(eq(governancePolicyVersions.id, vid)).returning();
      await auditUser(tx, p, 'policy.version_edited', 'policy', v.policyId, { versionId: vid, changes: Object.keys(b) });
      return row;
    });
  }

  /** draft to in_review, or in_review back to draft. */
  @Post('versions/:vid/move')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  move(@CurrentPrincipal() p: UserPrincipal, @Param('vid', ParseUUIDPipe) vid: string, @Body(new ZodBody(z.object({ to: z.enum(['draft', 'in_review']) }))) b: { to: 'draft' | 'in_review' }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.version(tx, vid);
      const ok = (v.status === 'draft' && b.to === 'in_review') || ((v.status === 'in_review' || v.status === 'approved') && b.to === 'draft');
      if (!ok) throw new ConflictException(`A ${v.status} version cannot go to ${b.to}`);
      const [row] = await tx.update(governancePolicyVersions).set({ status: b.to, ...(b.to === 'draft' ? { approvedBy: null, approvedAt: null, contentHash: null } : {}) }).where(eq(governancePolicyVersions.id, vid)).returning();
      await auditUser(tx, p, b.to === 'in_review' ? 'policy.sent_for_review' : 'policy.returned', 'policy', v.policyId, { versionId: vid });
      return row;
    });
  }

  /** A second person approves; the text is fingerprinted so what is published is what was approved. */
  @Post('versions/:vid/approve')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('vid', ParseUUIDPipe) vid: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.version(tx, vid);
      if (v.status !== 'in_review') throw new ConflictException('Send the version for review first');
      if (v.authoredBy === p.userId) throw new ForbiddenException({ message: 'The author cannot approve their own version', code: 'FOUR_EYES' });
      const [row] = await tx.update(governancePolicyVersions).set({ status: 'approved', approvedBy: p.userId, approvedAt: this.clock.now(), contentHash: sha(v.body) }).where(eq(governancePolicyVersions.id, vid)).returning();
      await auditUser(tx, p, 'policy.approved', 'policy', v.policyId, { versionId: vid, version: v.version });
      return row;
    });
  }

  /** Publishes the approved version: the one before is superseded, the review date is set, the audience is told. */
  @Post('versions/:vid/publish')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('vid', ParseUUIDPipe) vid: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.version(tx, vid);
      if (v.status !== 'approved') throw new ConflictException('Only an approved version can be published');
      if (v.contentHash !== sha(v.body)) throw new ConflictException('The text changed after approval');
      const pol = found((await tx.select().from(governancePolicies).where(eq(governancePolicies.id, v.policyId)).for('update'))[0], 'Policy');
      const today = await tenantToday(tx, this.clock);
      await tx.update(governancePolicyVersions).set({ status: 'superseded' }).where(and(eq(governancePolicyVersions.policyId, v.policyId), eq(governancePolicyVersions.status, 'published')));
      const [row] = await tx.update(governancePolicyVersions).set({ status: 'published', publishedAt: this.clock.now(), effectiveFrom: v.effectiveFrom ?? today }).where(eq(governancePolicyVersions.id, vid)).returning();
      await tx.update(governancePolicies).set({ nextReviewOn: addMonths(v.effectiveFrom ?? today, pol.reviewMonths) }).where(eq(governancePolicies.id, pol.id));
      const to = await this.audienceUsers(tx, pol.audience);
      await this.notifications.notifyUsers(tx, to, { kind: 'announcement', text: govTexts.policyToAcknowledge({ title: pol.title, version: v.version }), data: { policyId: pol.id, versionId: vid }, dedupeKey: `policy:${vid}` });
      await auditUser(tx, p, 'policy.published', 'policy', pol.id, { versionId: vid, version: v.version, audience: to.length });
      return { ...row, told: to.length };
    });
  }

  /** Who has and has not acknowledged a version (pages of 200), with totals. */
  @Get('versions/:vid/acks')
  @Auth('user', GOVERNANCE_ROLES)
  acks(@CurrentPrincipal() p: UserPrincipal, @Param('vid', ParseUUIDPipe) vid: string, @Query('state') state?: string, @Query('page') page?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.version(tx, vid);
      const [pol] = await tx.select().from(governancePolicies).where(eq(governancePolicies.id, v.policyId));
      const pg = Math.max(1, Number(page) || 1);
      const audience = this.audienceQuery(tx, pol.audience);
      const done = await tx.select({ n: sql<number>`count(*)::int` }).from(governancePolicyAcks).where(eq(governancePolicyAcks.versionId, vid));
      const total = await this.audienceSize(tx, pol.audience);
      const base = tx
        .select({ userId: users.id, name: users.fullName, acknowledgedAt: governancePolicyAcks.acknowledgedAt })
        .from(users)
        .leftJoin(governancePolicyAcks, and(eq(governancePolicyAcks.userId, users.id), eq(governancePolicyAcks.versionId, vid)))
        .where(and(inArray(users.id, audience), eq(users.status, 'active'), state === 'pending' ? sql`${governancePolicyAcks.id} is null` : state === 'done' ? sql`${governancePolicyAcks.id} is not null` : undefined))
        .orderBy(asc(users.fullName))
        .limit(200)
        .offset((pg - 1) * 200);
      return { version: v.version, status: v.status, audience: total, acknowledged: done[0].n, pending: Math.max(0, total - done[0].n), page: pg, rows: await base };
    });
  }

  /** Reminds everyone in the audience who has not acknowledged the published version. */
  @Post('versions/:vid/remind')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  remind(@CurrentPrincipal() p: UserPrincipal, @Param('vid', ParseUUIDPipe) vid: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.version(tx, vid);
      if (v.status !== 'published') throw new ConflictException('Only a published version is acknowledged');
      const [pol] = await tx.select().from(governancePolicies).where(eq(governancePolicies.id, v.policyId));
      const done = tx.select({ id: governancePolicyAcks.userId }).from(governancePolicyAcks).where(eq(governancePolicyAcks.versionId, vid));
      const pending = (await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, this.audienceQuery(tx, pol.audience)), eq(users.status, 'active'), notInArray(users.id, done)))).map((r) => r.id);
      const today = await tenantToday(tx, this.clock);
      await this.notifications.notifyUsers(tx, pending, { kind: 'announcement', text: govTexts.policyReminder({ title: pol.title, version: v.version }), data: { policyId: pol.id, versionId: vid }, dedupeKey: `policy-remind:${vid}:${today}` });
      await auditUser(tx, p, 'policy.reminded', 'policy', pol.id, { versionId: vid, reminded: pending.length });
      return { reminded: pending.length };
    });
  }

  /** The policies that apply to the signed-in person (by role), whether each is acknowledged, and the public ones. */
  @Get('me/list')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ p: governancePolicies, v: governancePolicyVersions, ackAt: governancePolicyAcks.acknowledgedAt })
        .from(governancePolicyVersions)
        .innerJoin(governancePolicies, eq(governancePolicies.id, governancePolicyVersions.policyId))
        .leftJoin(governancePolicyAcks, and(eq(governancePolicyAcks.versionId, governancePolicyVersions.id), eq(governancePolicyAcks.userId, p.userId)))
        .where(and(eq(governancePolicyVersions.status, 'published'), eq(governancePolicies.status, 'active'), sql`(${governancePolicies.audience} && array[${sql.join(p.roles.map((r) => sql`${r}`), sql`, `)}]::text[] or ${governancePolicies.public})`))
        .orderBy(asc(governancePolicies.title));
      return rows.map((r) => {
        const mustAck = r.p.audience.some((a) => p.roles.includes(a as RoleName));
        return { policyId: r.p.id, versionId: r.v.id, code: r.p.code, title: r.p.title, category: r.p.category, version: r.v.version, effectiveFrom: r.v.effectiveFrom, publishedAt: r.v.publishedAt, mustAcknowledge: mustAck, acknowledgedAt: r.ackAt ?? null, pending: mustAck && !r.ackAt };
      });
    });
  }

  /** The text of a published (or superseded) version, for the people it applies to, or anyone if it is public. */
  @Get('versions/:vid/text')
  @Auth('user')
  text(@CurrentPrincipal() p: UserPrincipal, @Param('vid', ParseUUIDPipe) vid: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { v, pol } = await this.readable(tx, p, vid);
      const [ack] = await tx.select({ at: governancePolicyAcks.acknowledgedAt }).from(governancePolicyAcks).where(and(eq(governancePolicyAcks.versionId, vid), eq(governancePolicyAcks.userId, p.userId)));
      return { policyId: pol.id, code: pol.code, title: pol.title, category: pol.category, version: v.version, status: v.status, body: v.body, changeNote: v.changeNote, effectiveFrom: v.effectiveFrom, publishedAt: v.publishedAt, fingerprint: v.contentHash, acknowledgedAt: ack?.at ?? null, mustAcknowledge: v.status === 'published' && pol.audience.some((a) => p.roles.includes(a as RoleName)) };
    });
  }

  /** The signed-in person acknowledges the published version (once; again is a no-op). */
  @Post('versions/:vid/acknowledge')
  @HttpCode(200)
  @Auth('user')
  acknowledge(@CurrentPrincipal() p: UserPrincipal, @Param('vid', ParseUUIDPipe) vid: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { v, pol } = await this.readable(tx, p, vid);
      if (v.status !== 'published') throw new ConflictException('A newer version replaced this one; acknowledge that instead');
      if (!pol.audience.some((a) => p.roles.includes(a as RoleName))) throw new BadRequestException('This policy does not ask you to acknowledge it');
      const at = this.clock.now();
      const [row] = await tx.insert(governancePolicyAcks).values({ tenantId: p.tenantId, versionId: vid, userId: p.userId, acknowledgedAt: at }).onConflictDoNothing().returning();
      if (row) await auditUser(tx, p, 'policy.acknowledged', 'policy', pol.id, { versionId: vid, version: v.version });
      const [ack] = await tx.select({ at: governancePolicyAcks.acknowledgedAt }).from(governancePolicyAcks).where(and(eq(governancePolicyAcks.versionId, vid), eq(governancePolicyAcks.userId, p.userId)));
      return { acknowledgedAt: ack.at, already: !row };
    });
  }

  // ---- helpers --------------------------------------------------------------------------------------------------

  private async version(tx: Tx, vid: string) {
    return found((await tx.select().from(governancePolicyVersions).where(eq(governancePolicyVersions.id, vid)).for('update'))[0], 'Policy version');
  }

  private async readable(tx: Tx, p: UserPrincipal, vid: string) {
    const [v] = await tx.select().from(governancePolicyVersions).where(eq(governancePolicyVersions.id, vid));
    if (!v) throw new NotFoundException('Policy not found');
    const [pol] = await tx.select().from(governancePolicies).where(eq(governancePolicies.id, v.policyId));
    const office = hasRole(p, GOVERNANCE_ROLES);
    const applies = pol.public || pol.audience.some((a) => p.roles.includes(a as RoleName));
    if (!office && (!applies || !['published', 'superseded'].includes(v.status))) throw new NotFoundException('Policy not found');
    return { v, pol };
  }

  /** User ids holding any of the roles (a subquery inside `tx`). */
  private audienceQuery(tx: Tx, roles: string[]) {
    return tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, (roles.length ? roles : ['tenant_admin']) as RoleName[]));
  }

  private async audienceUsers(tx: Tx, roles: string[]): Promise<string[]> {
    if (!roles.length) return [];
    return (await tx.selectDistinct({ id: users.id }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(and(inArray(userRoles.role, roles as RoleName[]), eq(users.status, 'active')))).map((r) => r.id);
  }

  /** Active people holding any of the roles, counted once each; cached per audience within one request. */
  private async audienceSize(tx: Tx, roles: string[], cache = new Map<string, number>()): Promise<number> {
    if (!roles.length) return 0;
    const key = [...roles].sort().join(',');
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const [r] = await tx.select({ n: sql<number>`count(distinct ${users.id})::int` }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(and(inArray(userRoles.role, roles as RoleName[]), eq(users.status, 'active')));
    cache.set(key, r.n);
    return r.n;
  }
}
