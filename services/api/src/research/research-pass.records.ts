import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { auditUser } from '../common/audit.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import { grantExpenses, researchGrants, researchProjects, researchScholars, students } from '../db/schema.js';
import { researchCentres, researchGrantHeads, researchGrantReleases, researchIncentiveClaims, researchIncentiveSchemes, researchProfiles, scholarProgressReports } from '../db/schema-research.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { hasRole, RecordRegistry, type FieldOption, type KitCtx } from '../records/entity.js';
import { choices, kitEntity, parseParams, rowOf } from './kit.js';
import { normalizeOrcid, validOrcid } from './orcid.js';
import { BUDGET_HEADS, scholarIdOf, validScopusId, validWosId, vidwanIdOf } from './research-pass.rules.js';
import { FACULTY_ROLES, RESEARCH_ROLES, RESEARCH_VIEW_ROLES } from './roles.js';
import { TODAY } from './research.records.js';

/**
 * The research pass's registers as record kit lists: faculty research profiles, research centres, grant budget heads
 * and fund releases, incentive schemes and claims, and scholars' six-monthly progress reports.
 */
const R = RESEARCH_VIEW_ROLES;
const W = RESEARCH_ROLES;
const F = FACULTY_ROLES;
const MODULE = 'research';
const staff = (ctx: KitCtx) => hasRole(ctx.p, R);
const office = (ctx: KitCtx) => hasRole(ctx.p, W);
const after = (a: unknown, b: unknown) => !!a && !!b && String(a) < String(b);
const DayParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');

const grantOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchGrants.id, agency: researchGrants.agency, ref: researchGrants.sanctionRef, code: researchProjects.code }).from(researchGrants).innerJoin(researchProjects, eq(researchProjects.id, researchGrants.projectId)).orderBy(desc(researchGrants.startsOn))).map((r) => ({ value: r.id, label: `${r.code} · ${r.agency}${r.ref ? ` (${r.ref})` : ''}` }));
const grantLookup = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: researchGrants.id }).from(researchGrants).where(sql`lower(coalesce(${researchGrants.sanctionRef}, '')) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
const scholarOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchScholars.id, name: researchScholars.fullName }).from(researchScholars).orderBy(asc(researchScholars.fullName))).map((r) => ({ value: r.id, label: r.name }));
const scholarLookup = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: researchScholars.id }).from(researchScholars).where(sql`lower(${researchScholars.fullName}) = ${text.toLowerCase()} or lower(coalesce(${researchScholars.registrationNo}, '')) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
const schemeOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchIncentiveSchemes.id, name: researchIncentiveSchemes.name }).from(researchIncentiveSchemes).orderBy(asc(researchIncentiveSchemes.name))).map((r) => ({ value: r.id, label: r.name }));

/** The grant's project PI (or a member) is the one who may see a grant's budget lines besides the office. */
const grantScope = (me: string) => sql`exists (select 1 from research_grants g join research_projects p on p.id = g.project_id where g.id = "grant_id" and (p.pi_user_id = ${me} or exists (select 1 from project_members m where m.project_id = p.id and m.user_id = ${me})))`;

function profilesEntity() {
  return kitEntity({
    key: 'research-profiles',
    module: MODULE,
    table: researchProfiles,
    subjectType: 'research_profile',
    roles: { read: F, write: F },
    title: 'userId',
    label: (r) => String(r.userIdName ?? 'Research profile'),
    fields: {
      userId: { label: 'Teacher', kind: 'user', column: researchProfiles.userId, required: true, filter: true, help: 'Yourself if left empty', example: 'asha.rao@college.edu' },
      orcid: { label: 'ORCID iD', kind: 'text', column: researchProfiles.orcid, max: 60, example: '0000-0002-1825-0097' },
      scopusAuthorId: { label: 'Scopus Author ID', kind: 'text', column: researchProfiles.scopusAuthorId, max: 20, example: '57201234567' },
      wosResearcherId: { label: 'Web of Science ResearcherID', kind: 'text', column: researchProfiles.wosResearcherId, max: 20, example: 'AAB-1234-2019' },
      googleScholarId: { label: 'Google Scholar', kind: 'text', column: researchProfiles.googleScholarId, max: 200, help: 'The profile link or its 12-character id', example: 'qc6CJjYAAAAJ' },
      vidwanId: { label: 'Vidwan ID', kind: 'text', column: researchProfiles.vidwanId, max: 200, help: 'The Vidwan (INFLIBNET) profile link or number', example: '123456' },
      irinsUrl: { label: 'IRINS profile', kind: 'text', column: researchProfiles.irinsUrl, max: 300 },
      areas: { label: 'Research areas', kind: 'textarea', column: researchProfiles.areas, max: 500, example: 'Rural finance; digital payments' },
      scopusHIndex: { label: 'h-index (Scopus)', kind: 'number', column: researchProfiles.scopusHIndex, int: true, min: 0, max: 500 },
      wosHIndex: { label: 'h-index (Web of Science)', kind: 'number', column: researchProfiles.wosHIndex, int: true, min: 0, max: 500 },
      scholarHIndex: { label: 'h-index (Google Scholar)', kind: 'number', column: researchProfiles.scholarHIndex, int: true, min: 0, max: 500 },
      scholarCitations: { label: 'Citations (Google Scholar)', kind: 'number', column: researchProfiles.scholarCitations, int: true, min: 0, max: 10_000_000 },
      metricsOn: { label: 'Metrics as on', kind: 'date', column: researchProfiles.metricsOn },
    },
    extra: {
      verifiedAt: researchProfiles.verifiedAt,
      publications: sql<number>`(select count(*)::int from publications x where (x.owner_user_id = "research_profiles"."user_id" or x.authors @> jsonb_build_array(jsonb_build_object('userId', "research_profiles"."user_id"::text))) and x.status <> 'retracted')`,
    },
    search: [researchProfiles.orcid, researchProfiles.scopusAuthorId, researchProfiles.areas, sql`(select u.full_name from users u where u.id = "research_profiles"."user_id")`],
    filters: { verified: { label: 'Verified', options: choices(['yes', 'no']), where: (v) => (v === 'yes' ? sql`${researchProfiles.verifiedAt} is not null` : v === 'no' ? sql`${researchProfiles.verifiedAt} is null` : undefined) } },
    defaultSort: { id: 'userId', dir: 'asc' },
    scope: (ctx) => (staff(ctx) ? undefined : eq(researchProfiles.userId, ctx.p.userId)),
    defaults: (ctx) => ({ userId: ctx.p.userId }),
    importKey: ['userId'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchProfiles, id);
      if (!office(ctx) && r.userId !== ctx.p.userId) return 'You can keep only your own research profile';
      const [d] = await ctx.tx.select({ id: researchProfiles.id }).from(researchProfiles).where(and(eq(researchProfiles.userId, String(r.userId)), ne(researchProfiles.id, id))).limit(1);
      if (d) return 'This teacher already has a research profile';
      const set: Record<string, unknown> = {};
      if (r.orcid) {
        const o = normalizeOrcid(String(r.orcid));
        if (!validOrcid(o)) return 'That is not a valid ORCID iD (like 0000-0002-1825-0097)';
        const [taken] = await ctx.tx.select({ id: researchProfiles.id }).from(researchProfiles).where(and(eq(researchProfiles.orcid, o), ne(researchProfiles.id, id))).limit(1);
        if (taken) return 'Another teacher has that ORCID iD';
        set.orcid = o;
      }
      if (r.scopusAuthorId && !validScopusId(String(r.scopusAuthorId))) return 'A Scopus Author ID is 10 or 11 digits';
      if (r.wosResearcherId) {
        if (!validWosId(String(r.wosResearcherId))) return 'Use a ResearcherID like AAB-1234-2019';
        set.wosResearcherId = String(r.wosResearcherId).trim().toUpperCase();
      }
      if (r.googleScholarId) {
        const g = scholarIdOf(String(r.googleScholarId));
        if (!g) return 'Give the Google Scholar profile link or its 12-character id';
        set.googleScholarId = g;
      }
      if (r.vidwanId) {
        const v = vidwanIdOf(String(r.vidwanId));
        if (!v) return 'Give the Vidwan profile link or number';
        set.vidwanId = v;
      }
      // A teacher's own change to an identifier needs the office to verify it again.
      if (!office(ctx)) set.verifiedAt = null;
      await ctx.tx.update(researchProfiles).set(set).where(eq(researchProfiles.id, id));
      return null;
    },
    actions: {
      verify: {
        label: 'Mark verified',
        roles: W,
        apply: async (ctx, id) => {
          await ctx.tx.update(researchProfiles).set({ verifiedAt: sql`now()`, verifiedBy: ctx.p.userId }).where(eq(researchProfiles.id, id));
          await auditUser(ctx.tx, ctx.p, 'research.profile_verified', 'research_profile', id);
        },
      },
    },
  });
}

function centresEntity() {
  return kitEntity({
    key: 'research-centres',
    module: MODULE,
    table: researchCentres,
    subjectType: 'research_centre',
    roles: { read: F, write: W },
    title: 'name',
    fields: {
      code: { label: 'Code', kind: 'text', column: researchCentres.code, required: true, max: 20, example: 'RC-COM' },
      name: { label: 'Centre', kind: 'text', column: researchCentres.name, required: true, max: 200, example: 'Research Centre in Commerce' },
      departmentId: { label: 'Department', kind: 'department', column: researchCentres.departmentId, bulk: true },
      headUserId: { label: 'Head', kind: 'user', column: researchCentres.headUserId },
      recognisedBy: { label: 'Recognised by', kind: 'text', column: researchCentres.recognisedBy, max: 160, example: 'Bengaluru City University' },
      recognitionRef: { label: 'Recognition order', kind: 'text', column: researchCentres.recognitionRef, max: 80 },
      recognisedOn: { label: 'Recognised on', kind: 'date', column: researchCentres.recognisedOn },
      validUntil: { label: 'Valid until', kind: 'date', column: researchCentres.validUntil },
      areas: { label: 'Research areas', kind: 'textarea', column: researchCentres.areas, max: 500 },
      facilities: { label: 'Facilities', kind: 'textarea', column: researchCentres.facilities, max: 2000 },
      status: { label: 'Status', kind: 'select', column: researchCentres.status, options: choices(['active', 'lapsed', 'closed']), bulk: true },
    },
    extra: {
      scholars: sql<number>`(select count(*)::int from research_scholars s where s.centre_id = "research_centres"."id" and s.status in ('enrolled', 'thesis_submitted'))`,
      guides: sql<number>`(select count(distinct s.supervisor_user_id)::int from research_scholars s where s.centre_id = "research_centres"."id")`,
      projects: sql<number>`(select count(*)::int from research_projects p where p.centre_id = "research_centres"."id")`,
      validity: sql<string>`case when ${researchCentres.status} <> 'active' then ${researchCentres.status} when ${researchCentres.validUntil} < ${TODAY} then 'expired' when ${researchCentres.validUntil} <= ${TODAY} + 90 then 'expiring' else 'valid' end`,
    },
    search: [researchCentres.name, researchCentres.code, researchCentres.areas],
    defaultSort: { id: 'name', dir: 'asc' },
    order: { column: researchCentres.sortOrder },
    importKey: ['code'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchCentres, id);
      const [d] = await ctx.tx.select({ id: researchCentres.id }).from(researchCentres).where(and(sql`lower(${researchCentres.code}) = ${String(r.code).toLowerCase()}`, ne(researchCentres.id, id))).limit(1);
      if (d) return 'Another centre has that code';
      if (after(r.validUntil, r.recognisedOn)) return 'The recognition ends before it was given';
      return null;
    },
  });
}

function headsEntity() {
  return kitEntity({
    key: 'grant-heads',
    module: MODULE,
    table: researchGrantHeads,
    subjectType: 'grant_head',
    roles: { read: F, write: W },
    title: 'head',
    label: (r) => `${r.grantName ?? ''}: ${r.head}`,
    fields: {
      grantId: { label: 'Grant', kind: 'ref', column: researchGrantHeads.grantId, required: true, options: grantOptions, lookup: grantLookup, filter: true, help: 'In an import, the sanction reference', example: 'CRG/2026/000123' },
      head: { label: 'Budget head', kind: 'select', column: researchGrantHeads.head, required: true, options: choices([...BUDGET_HEADS]), example: 'Equipment' },
      sanctioned: { label: 'Sanctioned', kind: 'money', column: researchGrantHeads.sanctionedPaise, required: true, example: '500000' },
      note: { label: 'Note', kind: 'textarea', column: researchGrantHeads.note, max: 500 },
    },
    extra: {
      grantName: sql<string>`(select g.agency || coalesce(' (' || g.sanction_ref || ')', '') from research_grants g where g.id = ${researchGrantHeads.grantId})`,
      spent: sql<number>`coalesce((select sum(e.amount_paise) from grant_expenses e where e.grant_id = ${researchGrantHeads.grantId} and e.budget_head = ${researchGrantHeads.head}), 0)::float8 / 100`,
      left: sql<number>`(${researchGrantHeads.sanctionedPaise} - coalesce((select sum(e.amount_paise) from grant_expenses e where e.grant_id = ${researchGrantHeads.grantId} and e.budget_head = ${researchGrantHeads.head}), 0))::float8 / 100`,
    },
    search: [researchGrantHeads.head, researchGrantHeads.note],
    defaultSort: { id: 'head', dir: 'asc' },
    scope: (ctx) => (staff(ctx) ? undefined : grantScope(ctx.p.userId)),
    importKey: ['grantId', 'head'],
    exportExtra: [{ key: 'spent', header: 'Spent (INR)' }, { key: 'left', header: 'Left (INR)' }],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchGrantHeads, id);
      const g = await rowOf(ctx, researchGrants, String(r.grantId));
      const [d] = await ctx.tx.select({ id: researchGrantHeads.id }).from(researchGrantHeads).where(and(eq(researchGrantHeads.grantId, String(r.grantId)), eq(researchGrantHeads.head, String(r.head)), ne(researchGrantHeads.id, id))).limit(1);
      if (d) return 'This grant already has that budget head';
      const [t] = await ctx.tx.select({ v: sql<number>`coalesce(sum(${researchGrantHeads.sanctionedPaise}), 0)::bigint`.mapWith(Number) }).from(researchGrantHeads).where(eq(researchGrantHeads.grantId, String(r.grantId)));
      if (t.v > Number(g.sanctionedPaise)) return `The budget heads add up to more than the sanction (₹${(Number(g.sanctionedPaise) / 100).toLocaleString('en-IN')})`;
      const [s] = await ctx.tx.select({ v: sql<number>`coalesce(sum(${grantExpenses.amountPaise}), 0)::bigint`.mapWith(Number) }).from(grantExpenses).where(and(eq(grantExpenses.grantId, String(r.grantId)), eq(grantExpenses.budgetHead, String(r.head))));
      if (s.v > Number(r.sanctionedPaise)) return 'The head cannot be less than what has been spent under it';
      return null;
    },
  });
}

function releasesEntity() {
  return kitEntity({
    key: 'grant-releases',
    module: MODULE,
    table: researchGrantReleases,
    subjectType: 'grant_release',
    roles: { read: F, write: W },
    title: 'instalment',
    label: (r) => `${r.grantName ?? ''}: instalment ${r.instalment}`,
    fields: {
      grantId: { label: 'Grant', kind: 'ref', column: researchGrantReleases.grantId, required: true, options: grantOptions, lookup: grantLookup, filter: true, help: 'In an import, the sanction reference', example: 'CRG/2026/000123' },
      instalment: { label: 'Instalment', kind: 'number', column: researchGrantReleases.instalment, required: true, int: true, min: 1, max: 20, example: '1' },
      releasedOn: { label: 'Released on', kind: 'date', column: researchGrantReleases.releasedOn, required: true, example: '2026-09-15' },
      amount: { label: 'Amount', kind: 'money', column: researchGrantReleases.amountPaise, required: true, min: 1, example: '1250000' },
      reference: { label: 'Sanction or transfer reference', kind: 'text', column: researchGrantReleases.reference, max: 80 },
      receivedOn: { label: 'Received in the account on', kind: 'date', column: researchGrantReleases.receivedOn },
      note: { label: 'Note', kind: 'textarea', column: researchGrantReleases.note, max: 500 },
    },
    extra: { grantName: sql<string>`(select g.agency || coalesce(' (' || g.sanction_ref || ')', '') from research_grants g where g.id = ${researchGrantReleases.grantId})` },
    search: [researchGrantReleases.reference, researchGrantReleases.note],
    defaultSort: { id: 'releasedOn', dir: 'desc' },
    scope: (ctx) => (staff(ctx) ? undefined : grantScope(ctx.p.userId)),
    defaults: (ctx) => ({ createdBy: ctx.p.userId }),
    importKey: ['grantId', 'instalment'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchGrantReleases, id);
      const g = await rowOf(ctx, researchGrants, String(r.grantId));
      if (g.status === 'cancelled') return 'This grant was cancelled';
      const [d] = await ctx.tx.select({ id: researchGrantReleases.id }).from(researchGrantReleases).where(and(eq(researchGrantReleases.grantId, String(r.grantId)), eq(researchGrantReleases.instalment, Number(r.instalment)), ne(researchGrantReleases.id, id))).limit(1);
      if (d) return 'That instalment is already recorded';
      const [t] = await ctx.tx.select({ v: sql<number>`coalesce(sum(${researchGrantReleases.amountPaise}), 0)::bigint`.mapWith(Number) }).from(researchGrantReleases).where(eq(researchGrantReleases.grantId, String(r.grantId)));
      if (t.v > Number(g.sanctionedPaise)) return 'The releases add up to more than the sanction';
      if (after(r.receivedOn, r.releasedOn)) return 'The money cannot arrive before it was released';
      return null;
    },
  });
}

function schemesEntity() {
  const RATES = z.partialRecord(z.enum(['scopus_q1', 'scopus_q2', 'scopus_q3', 'scopus_q4', 'wos', 'scopus', 'ugc_care', 'book', 'book_chapter', 'conference', 'published', 'granted']), z.number().int().min(0).max(100_000_000));
  return kitEntity({
    key: 'research-incentive-schemes',
    module: MODULE,
    table: researchIncentiveSchemes,
    subjectType: 'incentive_scheme',
    roles: { read: F, write: W },
    title: 'name',
    fields: {
      name: { label: 'Scheme', kind: 'text', column: researchIncentiveSchemes.name, required: true, max: 160, example: 'Publication incentive 2026-27' },
      kind: { label: 'For', kind: 'select', column: researchIncentiveSchemes.kind, required: true, options: choices(['publication', 'patent']), example: 'Publication' },
      capPerYear: { label: 'Most per teacher a year', kind: 'money', column: researchIncentiveSchemes.capPerYearPaise, help: '0 for no limit; a financial year (April to March)' },
      validFrom: { label: 'From', kind: 'date', column: researchIncentiveSchemes.validFrom },
      validUntil: { label: 'Until', kind: 'date', column: researchIncentiveSchemes.validUntil },
      active: { label: 'Open for claims', kind: 'boolean', column: researchIncentiveSchemes.active, bulk: true },
      note: { label: 'Rules', kind: 'textarea', column: researchIncentiveSchemes.note, max: 2000 },
    },
    extra: {
      rates: researchIncentiveSchemes.rates,
      claims: sql<number>`(select count(*)::int from research_incentive_claims c where c.scheme_id = "research_incentive_schemes"."id")`,
      paid: sql<number>`coalesce((select sum(c.amount_paise) from research_incentive_claims c where c.scheme_id = "research_incentive_schemes"."id" and c.status = 'paid'), 0)::float8 / 100`,
    },
    search: [researchIncentiveSchemes.name, researchIncentiveSchemes.note],
    defaultSort: { id: 'name', dir: 'asc' },
    importKey: ['name'],
    duplicate: true,
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchIncentiveSchemes, id);
      if (after(r.validUntil, r.validFrom)) return 'The scheme ends before it starts';
      if (!RATES.safeParse(r.rates).success) return 'The rates are not valid';
      return null;
    },
    actions: {
      setRates: {
        label: 'Set rates',
        inputs: [{ key: 'rates', label: 'Rates in rupees, like scopus_q1=25000, ugc_care=5000, granted=50000', type: 'textarea', required: true }],
        params: z.object({ rates: z.string() }),
        apply: async (ctx, id, params) => {
          const { rates } = parseParams(z.object({ rates: z.string().trim().min(3).max(1000) }), params);
          const parsed: Record<string, number> = {};
          for (const part of rates.split(/[;\n]|,(?=\s*[a-z])/i).map((x) => x.trim()).filter(Boolean)) {
            const m = /^([a-z0-9_]+)\s*[=:]\s*([\d,]+(\.\d{1,2})?)$/i.exec(part);
            if (!m) throw new ConflictException(`Write each rate as name=amount (${part})`);
            parsed[m[1].toLowerCase()] = Math.round(Number(m[2].replace(/,/g, '')) * 100);
          }
          const ok = RATES.safeParse(parsed);
          if (!ok.success) throw new ConflictException('Use these names: scopus_q1 to scopus_q4, wos, scopus, ugc_care, book, book_chapter, conference, published, granted');
          await ctx.tx.update(researchIncentiveSchemes).set({ rates: ok.data }).where(eq(researchIncentiveSchemes.id, id));
          await auditUser(ctx.tx, ctx.p, 'research.incentive_rates_set', 'incentive_scheme', id, { rates: ok.data });
        },
      },
    },
  });
}

function claimsEntity(clock: Clock, notifications: NotificationsService) {
  const decide = (to: 'approved' | 'rejected' | 'paid') => async (ctx: KitCtx, id: string, params: unknown) => {
    const c = await rowOf(ctx, researchIncentiveClaims, id);
    const from = String(c.status);
    if (to === 'paid' ? from !== 'approved' : from !== 'claimed') throw new ConflictException(`A ${from} claim cannot be ${to}`);
    if (c.userId === ctx.p.userId) throw new ConflictException('You cannot decide your own claim');
    const today = await tenantToday(ctx.tx, clock);
    if (to === 'rejected') {
      const b = parseParams(z.object({ note: z.string().trim().min(3, 'Give a reason').max(500) }), params);
      await ctx.tx.update(researchIncentiveClaims).set({ status: to, decidedBy: ctx.p.userId, decidedAt: sql`now()`, decisionNote: b.note }).where(eq(researchIncentiveClaims.id, id));
    } else if (to === 'approved') {
      await ctx.tx.update(researchIncentiveClaims).set({ status: to, decidedBy: ctx.p.userId, decidedAt: sql`now()` }).where(eq(researchIncentiveClaims.id, id));
    } else {
      const b = parseParams(z.object({ paymentRef: z.string().trim().min(2, 'Give the payment reference').max(80), paidOn: DayParam.optional() }), params);
      await ctx.tx.update(researchIncentiveClaims).set({ status: to, paidOn: b.paidOn ?? today, paymentRef: b.paymentRef }).where(eq(researchIncentiveClaims.id, id));
    }
    await auditUser(ctx.tx, ctx.p, `research.incentive_${to}`, 'incentive_claim', id);
    const amount = `₹${(Number(c.amountPaise) / 100).toLocaleString('en-IN')}`;
    await notifications.notifyUsers(ctx.tx, [String(c.userId)], { kind: 'task', text: { title: 'Research incentive', body: to === 'rejected' ? 'Your incentive claim was not approved' : to === 'approved' ? `Your incentive claim of ${amount} was approved` : `Your incentive of ${amount} was paid` }, data: { claimId: id }, dedupeKey: `incentive:${id}:${to}` });
  };
  return kitEntity({
    key: 'research-incentive-claims',
    module: MODULE,
    table: researchIncentiveClaims,
    subjectType: 'incentive_claim',
    roles: { read: F, write: W },
    title: 'basis',
    noImport: true,
    label: (r) => `${r.userIdName ?? ''}: ${r.subject ?? ''}`,
    fields: {
      schemeId: { label: 'Scheme', kind: 'ref', column: researchIncentiveClaims.schemeId, options: schemeOptions, filter: true, create: false, edit: false },
      userId: { label: 'Teacher', kind: 'user', column: researchIncentiveClaims.userId, filter: true, create: false, edit: false },
      basis: { label: 'Basis', kind: 'text', column: researchIncentiveClaims.basis, create: false, edit: false },
      amount: { label: 'Amount', kind: 'money', column: researchIncentiveClaims.amountPaise, create: false, edit: false },
      status: { label: 'Status', kind: 'select', column: researchIncentiveClaims.status, options: choices(['claimed', 'approved', 'paid', 'rejected']), create: false, edit: false },
      paidOn: { label: 'Paid on', kind: 'date', column: researchIncentiveClaims.paidOn, create: false, edit: false },
      paymentRef: { label: 'Payment reference', kind: 'text', column: researchIncentiveClaims.paymentRef, create: false, edit: false },
      decisionNote: { label: 'Note', kind: 'textarea', column: researchIncentiveClaims.decisionNote, create: false, edit: false },
    },
    extra: {
      schemeName: sql<string>`(select s.name from research_incentive_schemes s where s.id = ${researchIncentiveClaims.schemeId})`,
      subject: sql<string>`coalesce((select p.title from publications p where p.id = ${researchIncentiveClaims.publicationId}), (select t.title from patents t where t.id = ${researchIncentiveClaims.patentId}), '')`,
      createdAt: researchIncentiveClaims.createdAt,
    },
    sorts: { created: researchIncentiveClaims.createdAt },
    search: [researchIncentiveClaims.basis, sql`coalesce((select p.title from publications p where p.id = ${researchIncentiveClaims.publicationId}), (select t.title from patents t where t.id = ${researchIncentiveClaims.patentId}), '')`],
    defaultSort: { id: 'created', dir: 'desc' },
    scope: (ctx) => (staff(ctx) ? undefined : eq(researchIncentiveClaims.userId, ctx.p.userId)),
    actions: {
      approve: { label: 'Approve', apply: decide('approved') },
      reject: { label: 'Reject', tone: 'danger', inputs: [{ key: 'note', label: 'Why', type: 'textarea', required: true }], params: z.object({ note: z.string() }), apply: decide('rejected') },
      pay: { label: 'Mark paid', inputs: [{ key: 'paymentRef', label: 'Payment reference', type: 'text', required: true }], params: z.object({ paymentRef: z.string(), paidOn: z.string().optional() }), apply: decide('paid') },
    },
  });
}

function progressEntity(notifications: NotificationsService) {
  const review = (to: 'accepted' | 'returned') => async (ctx: KitCtx, id: string, params: unknown) => {
    const r = await rowOf(ctx, scholarProgressReports, id);
    const s = await rowOf(ctx, researchScholars, String(r.scholarId));
    if (!office(ctx) && s.supervisorUserId !== ctx.p.userId) throw new ConflictException('Only the supervisor or the research office reviews progress reports');
    if (r.status !== 'submitted') throw new ConflictException(`A report already ${r.status} cannot be reviewed again`);
    const b = parseParams(z.object({ rating: z.enum(['satisfactory', 'needs_improvement', 'unsatisfactory']).optional(), remarks: z.string().trim().max(2000).optional() }), params);
    if (to === 'accepted' && !b.rating) throw new ConflictException('Give a rating to accept the report');
    if (to === 'returned' && !b.remarks) throw new ConflictException('Say what to correct');
    await ctx.tx.update(scholarProgressReports).set({ status: to, rating: b.rating ?? (r.rating as string | null) ?? null, supervisorRemarks: b.remarks ?? (r.supervisorRemarks as string | null) ?? null, reviewedBy: ctx.p.userId, reviewedAt: sql`now()` }).where(eq(scholarProgressReports.id, id));
    await auditUser(ctx.tx, ctx.p, `research.progress_${to}`, 'progress_report', id, { rating: b.rating });
    if (s.studentId) {
      const [st] = await ctx.tx.select({ userId: students.userId }).from(students).where(eq(students.id, String(s.studentId)));
      if (st?.userId) await notifications.notifyUsers(ctx.tx, [st.userId], { kind: 'task', text: { title: 'Progress report', body: to === 'accepted' ? 'Your progress report was accepted' : 'Your progress report was returned for corrections' }, data: { reportId: id }, dedupeKey: `progress:${id}:${to}` });
    }
  };
  return kitEntity({
    key: 'scholar-progress-reports',
    module: MODULE,
    table: scholarProgressReports,
    subjectType: 'progress_report',
    roles: { read: F, write: F },
    title: 'periodTo',
    label: (r) => `${r.scholarName ?? ''} ${r.periodFrom ?? ''} to ${r.periodTo ?? ''}`.trim(),
    fields: {
      scholarId: { label: 'Scholar', kind: 'ref', column: scholarProgressReports.scholarId, required: true, options: scholarOptions, lookup: scholarLookup, filter: true, help: 'In an import, the scholar\'s name or registration number', example: 'Ananth Prabhu' },
      periodFrom: { label: 'Period from', kind: 'date', column: scholarProgressReports.periodFrom, required: true, example: '2026-01-10' },
      periodTo: { label: 'Period to', kind: 'date', column: scholarProgressReports.periodTo, required: true, example: '2026-07-09' },
      submittedOn: { label: 'Submitted on', kind: 'date', column: scholarProgressReports.submittedOn, required: true, example: '2026-07-15' },
      summary: { label: 'Work done', kind: 'textarea', column: scholarProgressReports.summary, required: true, max: 5000 },
      outputs: { label: 'Papers, presentations and data', kind: 'textarea', column: scholarProgressReports.outputs, max: 2000 },
      rating: { label: 'Rating', kind: 'select', column: scholarProgressReports.rating, options: choices(['satisfactory', 'needs_improvement', 'unsatisfactory']), create: false, edit: false },
      supervisorRemarks: { label: 'Supervisor\'s remarks', kind: 'textarea', column: scholarProgressReports.supervisorRemarks, create: false, edit: false },
      status: { label: 'Status', kind: 'select', column: scholarProgressReports.status, options: choices(['submitted', 'accepted', 'returned']), create: false, edit: false },
    },
    extra: { scholarName: sql<string>`(select s.full_name from research_scholars s where s.id = ${scholarProgressReports.scholarId})` },
    search: [scholarProgressReports.summary, scholarProgressReports.outputs],
    defaultSort: { id: 'periodTo', dir: 'desc' },
    scope: (ctx) => (staff(ctx) ? undefined : sql`exists (select 1 from research_scholars s where s.id = ${scholarProgressReports.scholarId} and s.supervisor_user_id = ${ctx.p.userId})`),
    importKey: ['scholarId', 'periodFrom'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, scholarProgressReports, id);
      const s = await rowOf(ctx, researchScholars, String(r.scholarId));
      if (!staff(ctx) && s.supervisorUserId !== ctx.p.userId) return 'Only the supervisor or the research office records these reports';
      if (String(r.periodTo) <= String(r.periodFrom)) return 'The period ends before it starts';
      if (String(r.periodFrom) < String(s.enrolledOn)) return 'The period starts before the scholar registered';
      if (String(r.submittedOn) < String(r.periodFrom)) return 'A report cannot be submitted before its period starts';
      if (!['enrolled', 'thesis_submitted'].includes(String(s.status))) return 'Progress reports are for scholars still working on the thesis';
      const [overlap] = await ctx.tx.select({ id: scholarProgressReports.id }).from(scholarProgressReports).where(and(eq(scholarProgressReports.scholarId, String(r.scholarId)), ne(scholarProgressReports.id, id), sql`daterange(${scholarProgressReports.periodFrom}, ${scholarProgressReports.periodTo}, '[]') && daterange(${r.periodFrom}::date, ${r.periodTo}::date, '[]')`)).limit(1);
      if (overlap) return 'This period overlaps another report of the scholar';
      if (r.status === 'returned') await ctx.tx.update(scholarProgressReports).set({ status: 'submitted' }).where(eq(scholarProgressReports.id, id));
      return null;
    },
    actions: {
      accept: { label: 'Accept', inputs: [{ key: 'rating', label: 'Rating: satisfactory, needs_improvement or unsatisfactory', type: 'text', required: true }, { key: 'remarks', label: 'Remarks', type: 'textarea' }], params: z.object({ rating: z.string(), remarks: z.string().optional() }), apply: review('accepted') },
      return: { label: 'Return for corrections', tone: 'danger', inputs: [{ key: 'remarks', label: 'What to correct', type: 'textarea', required: true }], params: z.object({ remarks: z.string() }), apply: review('returned') },
    },
  });
}

@Injectable()
export class ResearchPassRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    for (const e of [profilesEntity(), centresEntity(), headsEntity(), releasesEntity(), schemesEntity(), claimsEntity(this.clock, this.notifications), progressEntity(this.notifications)]) this.registry.register(e);
  }
}

export const RESEARCH_PASS_ENTITIES = ['research-profiles', 'research-centres', 'grant-heads', 'grant-releases', 'research-incentive-schemes', 'research-incentive-claims', 'scholar-progress-reports'] as const;
