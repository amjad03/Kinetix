import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { committees, dpdpRequests, grievanceTickets, incidents, institutionProfiles, programs, tenants, userRoles, users, auditNonConformities } from '../db/schema.js';
import { dvvQueries, iqacAqarSubmissions } from '../db/schema-accreditation.js';
import { complianceDeadlines, disclosureItems, disclosureSettings, governancePolicies, governancePolicyAcks, governancePolicyVersions, rtiRequests } from '../db/schema-governance-pass.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { CommitteeGovService } from './committee-gov.service.js';
import { GOVERNANCE_ROLES } from './governance.controller.js';
import { ruleOf } from './statutory.js';

const SECTIONS = ['about', 'approvals', 'governance', 'academics', 'fees', 'infrastructure', 'other'] as const;

/** The mandatory disclosure page the institution keeps (UGC self-disclosure, AICTE mandatory disclosure), built from its records. */
async function disclosurePage(tx: Tx, svc: CommitteeGovService, publicOnly: boolean) {
  const today = await svc.today(tx);
  const year = await svc.year(tx, today);
  const [t] = await tx.select({ name: tenants.name, slug: tenants.slug }).from(tenants);
  const [prof] = await tx.select().from(institutionProfiles);
  const [settings] = await tx.select().from(disclosureSettings);
  const items = await tx.select().from(disclosureItems).where(publicOnly ? eq(disclosureItems.public, true) : undefined).orderBy(asc(disclosureItems.section), asc(disclosureItems.sortOrder), asc(disclosureItems.label));
  const cs = await tx.select().from(committees).where(and(eq(committees.active, true), publicOnly ? eq(committees.public, true) : undefined)).orderBy(asc(committees.name));
  const members = await svc.members(tx, cs.map((c) => c.id));
  const progs = await tx.select({ name: programs.name, level: programs.level, terms: programs.termCount }).from(programs).orderBy(asc(programs.sortOrder), asc(programs.name));
  const pols = await tx
    .select({ code: governancePolicies.code, title: governancePolicies.title, category: governancePolicies.category, versionId: governancePolicyVersions.id, version: governancePolicyVersions.version, effectiveFrom: governancePolicyVersions.effectiveFrom })
    .from(governancePolicies)
    .innerJoin(governancePolicyVersions, and(eq(governancePolicyVersions.policyId, governancePolicies.id), eq(governancePolicyVersions.status, 'published')))
    .where(and(eq(governancePolicies.status, 'active'), publicOnly ? eq(governancePolicies.public, true) : undefined))
    .orderBy(asc(governancePolicies.title));
  const [g] = await tx
    .select({ received: sql<number>`count(*)::int`, resolved: sql<number>`count(*) filter (where ${grievanceTickets.resolvedAt} is not null)::int`, avgDays: sql<number | null>`round(avg(extract(epoch from ${grievanceTickets.resolvedAt} - ${grievanceTickets.createdAt}) / 86400)::numeric, 1)::float8` })
    .from(grievanceTickets)
    .where(and(gte(sql`(${grievanceTickets.createdAt} at time zone 'Asia/Kolkata')::date`, year.from), lte(sql`(${grievanceTickets.createdAt} at time zone 'Asia/Kolkata')::date`, year.to)));
  const officers = await tx.selectDistinct({ name: users.fullName, email: users.email }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(and(eq(userRoles.role, 'grievance_officer'), eq(users.status, 'active')));
  return {
    institution: { name: t?.name ?? '', slug: t?.slug ?? '', legalName: prof?.legalName ?? null, address: [prof?.addressLine, prof?.city, prof?.state, prof?.pincode].filter(Boolean).join(', '), phone: prof?.phone ?? null, email: prof?.email ?? null, website: prof?.website ?? null, established: prof?.establishedYear ?? null, affiliation: prof?.affiliationBody ? `${prof.affiliationBody}${prof.affiliationNo ? ` (${prof.affiliationNo})` : ''}` : null, aisheCode: prof?.aisheCode ?? null, naacGrade: prof?.naacGrade ?? null },
    published: settings?.published ?? false,
    publishedAt: settings?.publishedAt ?? null,
    intro: settings?.intro ?? '',
    year,
    sections: SECTIONS.map((s) => ({ section: s, items: items.filter((i) => i.section === s).map((i) => ({ id: i.id, label: i.label, value: i.value, url: i.url, public: i.public })) })).filter((s) => s.items.length),
    committees: cs.map((c) => ({
      name: c.name,
      kind: c.kind,
      basis: ruleOf(c.kind)?.basis ?? null,
      helpline: c.helpline,
      email: c.email,
      public: c.public,
      members: members
        .filter((m) => m.committeeId === c.id && m.tenureStart <= today && (!m.tenureEnd || m.tenureEnd >= today))
        .map((m) => ({ name: m.displayName, role: m.role, designation: m.designation, phone: m.contactPublic ? m.phone : '' })),
    })),
    programmes: progs,
    policies: pols,
    grievances: { received: g?.received ?? 0, resolved: g?.resolved ?? 0, averageDays: g?.avgDays ?? null, officers: officers.map((o) => ({ name: o.name, email: o.email })) },
  };
}

/**
 * The mandatory disclosure page: lines the institution types in (approvals, fees, infrastructure), and what the ERP
 * already holds (profile, programmes, public committees with their members, published public policies, grievance
 * figures). The office previews it and publishes; the public page is served at /v1/public/disclosure/:slug.
 */
@Controller('v1/governance/disclosure')
export class DisclosureController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CommitteeGovService,
    private readonly clock: Clock,
  ) {}

  /** The page as it stands, with the lines that are not public too. */
  @Get()
  @Auth('user', GOVERNANCE_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => disclosurePage(tx, this.svc, false));
  }

  @Put('settings')
  @Auth('user', GOVERNANCE_ROLES)
  settings(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ published: z.boolean(), intro: z.string().trim().max(2000).default('') }))) b: { published: boolean; intro: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [before] = await tx.select().from(disclosureSettings);
      const now = this.clock.now();
      const [row] = await tx
        .insert(disclosureSettings)
        .values({ tenantId: p.tenantId, published: b.published, publishedAt: b.published ? now : null, intro: b.intro, updatedBy: p.userId, updatedAt: now })
        .onConflictDoUpdate({ target: disclosureSettings.tenantId, set: { published: b.published, publishedAt: b.published ? (before?.published ? before.publishedAt : now) : null, intro: b.intro, updatedBy: p.userId, updatedAt: now } })
        .returning();
      await auditUser(tx, p, b.published ? 'disclosure.published' : 'disclosure.unpublished', 'disclosure', row.id, {});
      return row;
    });
  }
}

/** The published mandatory disclosure page, for anyone (no sign-in): the institution's website links here. */
@Controller('v1/public/disclosure/:slug')
export class PublicDisclosureController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly svc: CommitteeGovService,
  ) {}

  @Get()
  async page(@Param('slug') slug: string) {
    const t = await this.system.tenantBySlug(slug);
    if (!t) throw new NotFoundException('Institution not found');
    return this.db.withTenant(t.id, async (tx) => {
      const page = await disclosurePage(tx, this.svc, true);
      if (!page.published) throw new NotFoundException('This institution has not published its disclosure page');
      return page;
    });
  }

  /** The text of a published public policy. */
  @Get('policies/:versionId')
  async policy(@Param('slug') slug: string, @Param('versionId', ParseUUIDPipe) versionId: string) {
    const t = await this.system.tenantBySlug(slug);
    if (!t) throw new NotFoundException('Institution not found');
    return this.db.withTenant(t.id, async (tx) => {
      const [s] = await tx.select({ published: disclosureSettings.published }).from(disclosureSettings);
      const [r] = await tx
        .select({ code: governancePolicies.code, title: governancePolicies.title, version: governancePolicyVersions.version, body: governancePolicyVersions.body, effectiveFrom: governancePolicyVersions.effectiveFrom })
        .from(governancePolicyVersions)
        .innerJoin(governancePolicies, eq(governancePolicies.id, governancePolicyVersions.policyId))
        .where(and(eq(governancePolicyVersions.id, versionId), eq(governancePolicyVersions.status, 'published'), eq(governancePolicies.public, true)));
      if (!s?.published || !r) throw new NotFoundException('Policy not found');
      return r;
    });
  }
}

/**
 * The board and management view of governance: statutory committees, grievances, RTI, the compliance calendar,
 * policies, data-protection requests, incidents, academic audit findings and the IQAC's AQAR and DVV, in one call.
 */
@Controller('v1/governance/dashboard')
export class GovernanceDashboardController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CommitteeGovService,
  ) {}

  @Get()
  @Auth('user', [...GOVERNANCE_ROLES, 'hod'])
  dashboard(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.svc.compliance(tx);
      const today = c.today;
      const n = (v: unknown) => Number(v ?? 0);
      const [gr] = await tx
        .select({
          open: sql<number>`count(*) filter (where ${grievanceTickets.resolvedAt} is null and ${grievanceTickets.status} not in ('closed', 'withdrawn'))::int`,
          overdue: sql<number>`count(*) filter (where ${grievanceTickets.resolvedAt} is null and ${grievanceTickets.status} not in ('closed', 'withdrawn') and ${grievanceTickets.slaDueAt} < now())::int`,
          resolvedYear: sql<number>`count(*) filter (where ${grievanceTickets.resolvedAt} is not null and (${grievanceTickets.resolvedAt} at time zone 'Asia/Kolkata')::date >= ${c.year.from})::int`,
          receivedYear: sql<number>`count(*) filter (where (${grievanceTickets.createdAt} at time zone 'Asia/Kolkata')::date >= ${c.year.from})::int`,
          committee: sql<number>`count(*) filter (where ${grievanceTickets.committee} is not null and ${grievanceTickets.resolvedAt} is null)::int`,
          external: sql<number>`count(*) filter (where ${grievanceTickets.externalRef} is not null and ${grievanceTickets.resolvedAt} is null)::int`,
          avgDays: sql<number | null>`round(avg(extract(epoch from ${grievanceTickets.resolvedAt} - ${grievanceTickets.createdAt}) / 86400) filter (where (${grievanceTickets.createdAt} at time zone 'Asia/Kolkata')::date >= ${c.year.from})::numeric, 1)::float8`,
        })
        .from(grievanceTickets);
      const [rti] = await tx
        .select({
          open: sql<number>`count(*) filter (where ${rtiRequests.status} = 'received')::int`,
          dueWeek: sql<number>`count(*) filter (where ${rtiRequests.status} = 'received' and ${rtiRequests.dueOn} between ${today}::date and ${today}::date + 7)::int`,
          overdue: sql<number>`count(*) filter (where ${rtiRequests.status} = 'received' and ${rtiRequests.dueOn} < ${today}::date)::int`,
          appeals: sql<number>`count(*) filter (where ${rtiRequests.appealFiledOn} is not null and ${rtiRequests.appealOutcome} = '')::int`,
          year: sql<number>`count(*) filter (where ${rtiRequests.receivedOn} >= ${c.year.from})::int`,
        })
        .from(rtiRequests);
      const [cal] = await tx
        .select({
          overdue: sql<number>`count(*) filter (where ${complianceDeadlines.status} = 'pending' and ${complianceDeadlines.dueOn} < ${today}::date)::int`,
          dueMonth: sql<number>`count(*) filter (where ${complianceDeadlines.status} = 'pending' and ${complianceDeadlines.dueOn} between ${today}::date and ${today}::date + 30)::int`,
          doneYear: sql<number>`count(*) filter (where ${complianceDeadlines.status} = 'done' and ${complianceDeadlines.completedOn} >= ${c.year.from})::int`,
          onTime: sql<number>`count(*) filter (where ${complianceDeadlines.status} = 'done' and ${complianceDeadlines.completedOn} >= ${c.year.from} and ${complianceDeadlines.completedOn} <= ${complianceDeadlines.dueOn})::int`,
        })
        .from(complianceDeadlines);
      const next = await tx.select({ id: complianceDeadlines.id, title: complianceDeadlines.title, dueOn: complianceDeadlines.dueOn, authority: complianceDeadlines.authority }).from(complianceDeadlines).where(eq(complianceDeadlines.status, 'pending')).orderBy(asc(complianceDeadlines.dueOn)).limit(6);
      const [pol] = await tx
        .select({ published: sql<number>`count(*) filter (where exists (select 1 from governance_policy_versions v where v.policy_id = ${governancePolicies.id} and v.status = 'published'))::int`, reviewDue: sql<number>`count(*) filter (where ${governancePolicies.nextReviewOn} <= ${today}::date and ${governancePolicies.status} = 'active')::int`, inApproval: sql<number>`count(*) filter (where exists (select 1 from governance_policy_versions v where v.policy_id = ${governancePolicies.id} and v.status in ('in_review', 'approved')))::int` })
        .from(governancePolicies)
        .where(eq(governancePolicies.status, 'active'));
      const [acks] = await tx.select({ n: sql<number>`count(*)::int` }).from(governancePolicyAcks).innerJoin(governancePolicyVersions, eq(governancePolicyVersions.id, governancePolicyAcks.versionId)).where(eq(governancePolicyVersions.status, 'published'));
      const [dp] = await tx.select({ pending: sql<number>`count(*) filter (where ${dpdpRequests.status} = 'pending')::int`, overdue: sql<number>`count(*) filter (where ${dpdpRequests.status} = 'pending' and ${dpdpRequests.dueAt} < now())::int` }).from(dpdpRequests);
      const [inc] = await tx.select({ active: sql<number>`count(*) filter (where ${incidents.status} in ('open', 'investigating', 'mitigated'))::int`, severe: sql<number>`count(*) filter (where ${incidents.status} in ('open', 'investigating', 'mitigated') and ${incidents.severity} in ('sev1', 'sev2'))::int` }).from(incidents);
      const [nc] = await tx.select({ open: sql<number>`count(*) filter (where ${auditNonConformities.status} <> 'closed')::int`, overdue: sql<number>`count(*) filter (where ${auditNonConformities.status} <> 'closed' and ${auditNonConformities.dueOn} < ${today}::date)::int` }).from(auditNonConformities);
      const aqar = await tx.select({ year: iqacAqarSubmissions.year, status: iqacAqarSubmissions.status, dueOn: iqacAqarSubmissions.dueOn }).from(iqacAqarSubmissions).orderBy(sql`${iqacAqarSubmissions.year} desc`).limit(1);
      const [dvv] = await tx.select({ open: sql<number>`count(*) filter (where ${dvvQueries.status} in ('open', 'answered'))::int` }).from(dvvQueries);
      const statutory = c.committees.filter((x) => x.statutory);
      return {
        today,
        year: c.year,
        committees: {
          statutory: statutory.length,
          missing: c.missing,
          attention: statutory.filter((x) => x.status === 'attention').map((x) => ({ id: x.id, name: x.name, kind: x.kind, issues: x.issues.length, meetingsHeld: x.meetingsHeld, meetingsExpected: x.meetingsExpected, overdueActions: x.overdueActions })),
          meetingsHeld: statutory.reduce((a, x) => a + x.meetingsHeld, 0),
          meetingsExpected: statutory.reduce((a, x) => a + x.meetingsExpected, 0),
          minutesPending: c.committees.reduce((a, x) => a + x.minutesPending, 0),
          openActions: c.committees.reduce((a, x) => a + x.openActions, 0),
          overdueActions: c.committees.reduce((a, x) => a + x.overdueActions, 0),
          doneActions: c.committees.reduce((a, x) => a + x.doneActions, 0),
        },
        grievances: { open: n(gr?.open), overdue: n(gr?.overdue), receivedYear: n(gr?.receivedYear), resolvedYear: n(gr?.resolvedYear), committee: n(gr?.committee), external: n(gr?.external), averageDays: gr?.avgDays ?? null },
        rti: { open: n(rti?.open), dueWeek: n(rti?.dueWeek), overdue: n(rti?.overdue), appealsPending: n(rti?.appeals), year: n(rti?.year) },
        calendar: { overdue: n(cal?.overdue), dueMonth: n(cal?.dueMonth), doneYear: n(cal?.doneYear), onTime: n(cal?.onTime), next },
        policies: { published: n(pol?.published), reviewDue: n(pol?.reviewDue), inApproval: n(pol?.inApproval), acknowledgements: n(acks?.n) },
        dpdp: { pending: n(dp?.pending), overdue: n(dp?.overdue) },
        incidents: { active: n(inc?.active), severe: n(inc?.severe) },
        audit: { openFindings: n(nc?.open), overdueFindings: n(nc?.overdue) },
        iqac: { aqar: aqar[0] ?? null, dvvOpen: n(dvv?.open) },
      };
    });
  }
}

