import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, ne, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { auditUser } from '../common/audit.js';
import { nextNumber } from '../common/ops.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import { conferences, grantExpenses, patents, publications, researchGrants, researchProjects, researchProposals, researchScholars } from '../db/schema.js';
import { grantUtilisationCertificates, researchCalls, researchConsultancies, researchEquipment, researchEquipmentUsage, researchEthicsApprovals, researchMouActivities, researchMous, researchRecognitions, researchSeedGrants, scholarCoursework, scholarDcMeetings } from '../db/schema-research.js';
import { hasRole, RecordRegistry, type FieldOption, type KitCtx } from '../records/entity.js';
import { choices, kitEntity, parseParams, rowOf } from './kit.js';
import { moveProposal } from './proposal-flow.js';
import { normalizeDoi } from './research-rules.js';
import { FACULTY_ROLES, RESEARCH_ROLES, RESEARCH_VIEW_ROLES } from './roles.js';

/**
 * The research office's registers as record kit lists (docs/requirements/RECORD_DEPTH_KIT.md): publications, IPR,
 * proposals, projects, grants and utilisation certificates, conferences, consultancy, MoUs and their activities, seed
 * money, recognitions, ethics approvals, funding calls, central instruments and their usage, scholars, doctoral
 * committee meetings and coursework. Research staff manage every record; teachers see and keep their own.
 */
const R = RESEARCH_VIEW_ROLES;
const W = RESEARCH_ROLES;
const F = FACULTY_ROLES;
const MODULE = 'research';
const staff = (ctx: KitCtx) => hasRole(ctx.p, R);
/** A teacher sees the records that name them; research staff and heads see all. */
const mine = (cond: (me: string) => SQL) => (ctx: KitCtx) => (staff(ctx) ? undefined : cond(ctx.p.userId));
const after = (a: unknown, b: unknown) => !!a && !!b && String(a) < String(b);

const projectOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchProjects.id, code: researchProjects.code, title: researchProjects.title }).from(researchProjects).orderBy(desc(researchProjects.startsOn))).map((r) => ({ value: r.id, label: `${r.code} ${r.title}` }));
const projectLookup = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: researchProjects.id }).from(researchProjects).where(sql`lower(${researchProjects.code}) = ${text.toLowerCase()} or lower(${researchProjects.title}) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
const grantOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchGrants.id, agency: researchGrants.agency, ref: researchGrants.sanctionRef, code: researchProjects.code }).from(researchGrants).innerJoin(researchProjects, eq(researchProjects.id, researchGrants.projectId)).orderBy(desc(researchGrants.startsOn))).map((r) => ({ value: r.id, label: `${r.code} · ${r.agency}${r.ref ? ` (${r.ref})` : ''}` }));
const grantLookup = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: researchGrants.id }).from(researchGrants).where(sql`lower(coalesce(${researchGrants.sanctionRef}, '')) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
const mouOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchMous.id, partner: researchMous.partner, signedOn: researchMous.signedOn }).from(researchMous).orderBy(asc(researchMous.partner))).map((r) => ({ value: r.id, label: `${r.partner} (${r.signedOn.slice(0, 4)})` }));
const mouLookup = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: researchMous.id }).from(researchMous).where(sql`lower(${researchMous.partner}) = ${text.toLowerCase()}`).orderBy(desc(researchMous.signedOn)).limit(1))[0]?.id ?? null;
const scholarOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchScholars.id, name: researchScholars.fullName, programme: researchScholars.programme }).from(researchScholars).orderBy(asc(researchScholars.fullName))).map((r) => ({ value: r.id, label: `${r.name} (${r.programme === 'phd' ? 'Ph.D.' : 'M.Phil.'})` }));
const scholarLookup = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: researchScholars.id }).from(researchScholars).where(sql`lower(${researchScholars.fullName}) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
const equipmentOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchEquipment.id, code: researchEquipment.code, name: researchEquipment.name }).from(researchEquipment).orderBy(asc(researchEquipment.sortOrder), asc(researchEquipment.name))).map((r) => ({ value: r.id, label: `${r.code} ${r.name}` }));
const equipmentLookup = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: researchEquipment.id }).from(researchEquipment).where(sql`lower(${researchEquipment.code}) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
const callOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchCalls.id, agency: researchCalls.agency, title: researchCalls.title, deadline: researchCalls.deadline }).from(researchCalls).orderBy(desc(researchCalls.deadline))).map((r) => ({ value: r.id, label: `${r.agency}: ${r.title} (${r.deadline})` }));
const callLookup = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: researchCalls.id }).from(researchCalls).where(sql`lower(${researchCalls.title}) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
const proposalOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: researchProposals.id, title: researchProposals.title }).from(researchProposals).orderBy(desc(researchProposals.createdAt))).map((r) => ({ value: r.id, label: r.title }));

const PUB_KINDS = ['journal', 'conference', 'book', 'book_chapter'];
const INDEXES = choices(['scopus', 'wos', 'ugc_care', 'pubmed', 'other'], { scopus: 'Scopus', wos: 'Web of Science', ugc_care: 'UGC-CARE', pubmed: 'PubMed', other: 'Other' });
const LEVELS = ['institutional', 'state', 'national', 'international'];

/** Internal co-authors and inventors are credited by matching names to staff: one record, every author credited. */
async function creditPeople(ctx: KitCtx, table: typeof publications | typeof patents, column: 'authors' | 'inventors', id: string) {
  await ctx.tx.execute(sql`update ${table} t set ${sql.identifier(column)} = coalesce((
      select jsonb_agg(case when a ? 'userId' then a else coalesce(a || (select jsonb_build_object('userId', u.id) from users u where lower(u.full_name) = lower(a->>'name') and u.status = 'active' limit 1), a) end order by n)
      from jsonb_array_elements(t.${sql.identifier(column)}) with ordinality as x(a, n)), '[]'::jsonb)
    where t.id = ${id}`);
}

function publicationsEntity() {
  const authorOf = (me: string) => sql`(${publications.ownerUserId} = ${me} or ${publications.authors} @> ${JSON.stringify([{ userId: me }])}::jsonb)`;
  return kitEntity({
    key: 'research-publications',
    module: MODULE,
    table: publications,
    subjectType: 'publication',
    roles: { read: F, write: F },
    title: 'title',
    fields: {
      title: { label: 'Title', kind: 'text', column: publications.title, required: true, max: 300, example: 'Deep learning for crop yield prediction' },
      kind: { label: 'Kind', kind: 'select', column: publications.kind, required: true, options: choices(PUB_KINDS, { book_chapter: 'Book chapter' }), bulk: true, example: 'Journal' },
      authors: { label: 'Authors', kind: 'names', column: publications.authors, required: true, help: 'Names in the order of the paper, separated by semicolons; staff are credited by name', example: 'Asha Rao; K. Murthy' },
      venue: { label: 'Journal, conference or publisher', kind: 'text', column: publications.venue, required: true, max: 200, example: 'Journal of Agricultural Informatics' },
      year: { label: 'Year', kind: 'number', column: publications.year, required: true, int: true, min: 1950, max: 2100, example: '2026' },
      doi: { label: 'DOI', kind: 'text', column: publications.doi, max: 200, help: 'For example 10.1016/j.compag.2026.01.002' },
      issn: { label: 'ISSN', kind: 'text', column: publications.issn, max: 9 },
      isbn: { label: 'ISBN', kind: 'text', column: publications.isbn, max: 20, help: 'Books and chapters' },
      volume: { label: 'Volume', kind: 'text', column: publications.volume, max: 20 },
      issue: { label: 'Issue', kind: 'text', column: publications.issue, max: 20 },
      pages: { label: 'Pages', kind: 'text', column: publications.pages, max: 30 },
      indexedIn: { label: 'Indexed in', kind: 'tags', column: publications.indexedIn, options: INDEXES, help: 'scopus, wos, ugc_care, pubmed or other, separated by commas', example: 'scopus, ugc_care' },
      citations: { label: 'Citations', kind: 'number', column: publications.citations, int: true, min: 0, max: 1_000_000, help: 'Excluding self-citations (Scopus or Web of Science)' },
      impactFactor: { label: 'Impact factor', kind: 'number', column: publications.impactFactor, min: 0, max: 1000 },
      quartile: { label: 'Quartile', kind: 'select', column: publications.quartile, options: choices(['Q1', 'Q2', 'Q3', 'Q4']) },
      status: { label: 'Status', kind: 'select', column: publications.status, options: choices(['accepted', 'published', 'retracted']), bulk: true, help: 'A retracted paper stays on record and stops counting in reports' },
      retractedOn: { label: 'Retracted on', kind: 'date', column: publications.retractedOn },
      retractionNote: { label: 'Retraction note', kind: 'textarea', column: publications.retractionNote, max: 1000 },
      url: { label: 'Link', kind: 'text', column: publications.url, max: 500 },
      ownerUserId: { label: 'Recorded for', kind: 'user', column: publications.ownerUserId, help: 'The teacher this record belongs to (yourself if left empty)', filter: true },
      departmentId: { label: 'Department', kind: 'department', column: publications.departmentId, bulk: true },
      projectId: { label: 'Project', kind: 'ref', column: publications.projectId, options: projectOptions, lookup: projectLookup },
    },
    search: [publications.title, publications.venue, publications.doi, sql`${publications.authors}::text`],
    filters: {
      year: { label: 'Year', where: (v) => (/^\d{4}$/.test(v) ? eq(publications.year, Number(v)) : undefined) },
    },
    defaultSort: { id: 'year', dir: 'desc' },
    scope: mine(authorOf),
    defaults: (ctx) => ({ ownerUserId: ctx.p.userId, authors: [] }),
    importKey: ['title', 'year'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, publications, id);
      if (!staff(ctx) && r.ownerUserId !== ctx.p.userId) return 'You can record only your own publications';
      if (r.doi) {
        const doi = normalizeDoi(String(r.doi));
        if (!doi) return 'That is not a valid DOI';
        if (doi !== r.doi) await ctx.tx.update(publications).set({ doi }).where(eq(publications.id, id));
        const [dup] = await ctx.tx.select({ id: publications.id }).from(publications).where(and(sql`lower(${publications.doi}) = ${doi.toLowerCase()}`, ne(publications.id, id))).limit(1);
        if (dup) return 'A publication with that DOI is already recorded';
      } else {
        // Without a DOI a paper is one record per title and year, however many co-authors record it.
        const [dup] = await ctx.tx.select({ id: publications.id }).from(publications).where(and(sql`lower(${publications.title}) = ${String(r.title).toLowerCase()}`, eq(publications.year, Number(r.year)), ne(publications.id, id))).limit(1);
        if (dup) return 'This publication is already recorded (same title and year); add yourself as an author there';
      }
      if (r.issn && !/^\d{4}-\d{3}[\dXx]$/.test(String(r.issn))) return 'Use an ISSN like 1234-567X';
      if (r.status === 'retracted' && !r.retractedOn) return 'Give the date of the retraction';
      if (r.status !== 'retracted' && r.retractedOn) await ctx.tx.update(publications).set({ retractedOn: null }).where(eq(publications.id, id));
      if (!(r.authors as unknown[]).length) return 'Give at least one author';
      await creditPeople(ctx, publications, 'authors', id);
      return null;
    },
  });
}

function patentsEntity() {
  const inventorOf = (me: string) => sql`(${patents.ownerUserId} = ${me} or ${patents.inventors} @> ${JSON.stringify([{ userId: me }])}::jsonb)`;
  const e = kitEntity({
    key: 'research-patents',
    module: MODULE,
    table: patents,
    subjectType: 'patent',
    roles: { read: F, write: F },
    title: 'title',
    fields: {
      title: { label: 'Title', kind: 'text', column: patents.title, required: true, max: 300, example: 'Low-cost soil moisture sensor' },
      kind: { label: 'Kind', kind: 'select', column: patents.kind, required: true, options: choices(['patent', 'copyright', 'design', 'trademark']), example: 'Patent' },
      inventors: { label: 'Inventors', kind: 'names', column: patents.inventors, required: true, help: 'Names separated by semicolons; staff are credited by name', example: 'Asha Rao; K. Murthy' },
      applicationNo: { label: 'Application no.', kind: 'text', column: patents.applicationNo, max: 80 },
      filedOn: { label: 'Filed on', kind: 'date', column: patents.filedOn },
      country: { label: 'Country or office', kind: 'text', column: patents.country, max: 80, example: 'India' },
      status: { label: 'Status', kind: 'select', column: patents.status, options: choices(['draft', 'filed', 'published', 'granted', 'rejected']), edit: false, help: 'Later stages are recorded with Publish, Grant or Reject' },
      publishedOn: { label: 'Published on', kind: 'date', column: patents.publishedOn, edit: false, noImport: true },
      patentNo: { label: 'Patent no.', kind: 'text', column: patents.patentNo, max: 80, edit: false, noImport: true },
      grantedOn: { label: 'Granted on', kind: 'date', column: patents.grantedOn, edit: false, noImport: true },
      licensed: { label: 'Licensed or commercialised', kind: 'boolean', column: patents.licensed },
      licenceRevenue: { label: 'Licence revenue', kind: 'money', column: patents.licenceRevenuePaise },
      ownerUserId: { label: 'Recorded for', kind: 'user', column: patents.ownerUserId, filter: true },
      departmentId: { label: 'Department', kind: 'department', column: patents.departmentId, bulk: true },
      projectId: { label: 'Project', kind: 'ref', column: patents.projectId, options: projectOptions, lookup: projectLookup },
    },
    search: [patents.title, patents.applicationNo, patents.patentNo, sql`${patents.inventors}::text`],
    defaultSort: { id: 'filedOn', dir: 'desc' },
    scope: mine(inventorOf),
    defaults: (ctx) => ({ ownerUserId: ctx.p.userId, inventors: [], status: 'filed' }),
    importKey: ['title'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, patents, id);
      if (!staff(ctx) && r.ownerUserId !== ctx.p.userId) return 'You can record only your own patents';
      if (!['draft', 'filed', 'published', 'granted', 'rejected'].includes(String(r.status))) return 'Choose one of the listed values';
      if (r.status !== 'draft' && (!r.applicationNo || !r.filedOn)) return 'A filed application needs its number and filing date';
      if (r.licensed === false && Number(r.licenceRevenuePaise) > 0) return 'Licence revenue is for licensed patents';
      await creditPeople(ctx, patents, 'inventors', id);
      return null;
    },
    actions: {
      publish: {
        label: 'Record publication',
        roles: W,
        params: z.object({ on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
        apply: async (ctx, id, params) => {
          const { on } = parseParams(z.object({ on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Give the date of publication') }), params);
          const r = await rowOf(ctx, patents, id);
          if (r.status !== 'filed') throw new ConflictException(`A ${r.status} application cannot be published`);
          if (r.filedOn && on < String(r.filedOn)) throw new ConflictException('Publication cannot be before filing');
          await ctx.tx.update(patents).set({ status: 'published', publishedOn: on }).where(eq(patents.id, id));
          await auditUser(ctx.tx, ctx.p, 'research.patent_published', 'patent', id, { on });
        },
      },
      grant: {
        label: 'Record grant',
        roles: W,
        params: z.object({ on: z.string(), patentNo: z.string().optional() }),
        apply: async (ctx, id, params) => {
          const b = parseParams(z.object({ on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Give the grant date'), patentNo: z.string().trim().min(1, 'Give the patent number').max(80) }), params);
          const r = await rowOf(ctx, patents, id);
          if (!['filed', 'published'].includes(String(r.status))) throw new ConflictException(`A ${r.status} application cannot be granted`);
          await ctx.tx.update(patents).set({ status: 'granted', grantedOn: b.on, patentNo: b.patentNo }).where(eq(patents.id, id));
          await auditUser(ctx.tx, ctx.p, 'research.patent_granted', 'patent', id, b);
        },
      },
      reject: {
        label: 'Record rejection',
        roles: W,
        tone: 'danger',
        apply: async (ctx, id) => {
          const r = await rowOf(ctx, patents, id);
          if (!['filed', 'published'].includes(String(r.status))) throw new ConflictException(`A ${r.status} application cannot be rejected`);
          await ctx.tx.update(patents).set({ status: 'rejected' }).where(eq(patents.id, id));
          await auditUser(ctx.tx, ctx.p, 'research.patent_rejected', 'patent', id);
        },
      },
    },
  });
  return e;
}

function proposalsEntity(clock: Clock) {
  const today = (ctx: KitCtx) => tenantToday(ctx.tx, clock);
  const move = (to: string, label: string, roles: typeof W, extra: Partial<{ tone: 'danger'; params: z.ZodType }> = {}, ownerOnly = false) => ({
    label,
    roles,
    ...extra,
    apply: async (ctx: KitCtx, id: string, params: unknown) => {
      const b = to === 'rejected' ? parseParams(z.object({ note: z.string().trim().min(3, 'Give a reason for rejecting').max(1000) }), params) : to === 'approved' ? parseParams(z.object({ startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), params) : undefined;
      await moveProposal(ctx.tx, ctx.p, id, to, await today(ctx), ownerOnly ? undefined : (b ?? {}), ownerOnly);
    },
  });
  return kitEntity({
    key: 'research-proposals',
    module: MODULE,
    table: researchProposals,
    subjectType: 'proposal',
    roles: { read: F, write: F },
    title: 'title',
    fields: {
      title: { label: 'Title', kind: 'text', column: researchProposals.title, required: true, max: 200 },
      kind: { label: 'Kind', kind: 'select', column: researchProposals.kind, required: true, options: choices(['research', 'capstone', 'industry']) },
      abstract: { label: 'Abstract', kind: 'textarea', column: researchProposals.abstract, max: 5000 },
      callId: { label: 'Funding call', kind: 'ref', column: researchProposals.callId, options: callOptions, lookup: callLookup },
      sponsorOrg: { label: 'Sponsor', kind: 'text', column: researchProposals.sponsorOrg, max: 160 },
      fundingSought: { label: 'Funding sought', kind: 'money', column: researchProposals.fundingSoughtPaise },
      ethicsRequired: { label: 'Needs ethics clearance', kind: 'boolean', column: researchProposals.ethicsRequired },
      piUserId: { label: 'Principal investigator', kind: 'user', column: researchProposals.piUserId, filter: true },
      departmentId: { label: 'Department', kind: 'department', column: researchProposals.departmentId },
      status: { label: 'Status', kind: 'select', column: researchProposals.status, options: choices(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn']), create: false, edit: false },
      ethicsStatus: { label: 'Ethics', kind: 'select', column: researchProposals.ethicsStatus, options: choices(['not_required', 'pending', 'cleared', 'rejected']), create: false, edit: false },
    },
    extra: { callDeadline: sql<string | null>`(select coalesce(c.internal_deadline, c.deadline)::text from research_calls c where c.id = ${researchProposals.callId})`, reviewNote: researchProposals.reviewNote, createdAt: researchProposals.createdAt },
    sorts: { created: researchProposals.createdAt },
    search: [researchProposals.title, researchProposals.sponsorOrg],
    defaultSort: { id: 'created', dir: 'desc' },
    scope: mine((me) => eq(researchProposals.piUserId, me)),
    defaults: (ctx) => ({ piUserId: ctx.p.userId, status: 'draft' }),
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchProposals, id);
      if (r.status !== 'draft') return 'Only a draft can be edited';
      if (!staff(ctx) && r.piUserId !== ctx.p.userId) return 'You can write only your own proposals';
      await ctx.tx.update(researchProposals).set({ ethicsStatus: r.ethicsRequired ? (r.ethicsStatus === 'not_required' ? 'pending' : String(r.ethicsStatus)) : 'not_required' }).where(eq(researchProposals.id, id));
      return null;
    },
    actions: {
      submit: move('submitted', 'Submit for review', F, {}, true),
      withdraw: move('withdrawn', 'Withdraw', F, { tone: 'danger' }, true),
      review: move('under_review', 'Start review', W),
      approve: move('approved', 'Approve', W, { params: z.object({ startsOn: z.string().optional() }) }),
      reject: move('rejected', 'Reject', W, { tone: 'danger', params: z.object({ note: z.string() }) }),
    },
  });
}

function projectsEntity() {
  return kitEntity({
    key: 'research-projects',
    module: MODULE,
    table: researchProjects,
    subjectType: 'project',
    roles: { read: F, write: W },
    title: 'title',
    fields: {
      code: { label: 'Code', kind: 'text', column: researchProjects.code, create: false, edit: false, noImport: true },
      title: { label: 'Title', kind: 'text', column: researchProjects.title, required: true, max: 200, example: 'Crop yield prediction with satellite data' },
      kind: { label: 'Kind', kind: 'select', column: researchProjects.kind, required: true, options: choices(['research', 'capstone', 'industry']), bulk: true, example: 'Research' },
      piUserId: { label: 'Principal investigator', kind: 'user', column: researchProjects.piUserId, required: true, filter: true },
      departmentId: { label: 'Department', kind: 'department', column: researchProjects.departmentId, bulk: true },
      sponsorOrg: { label: 'Sponsor', kind: 'text', column: researchProjects.sponsorOrg, max: 160 },
      startsOn: { label: 'Starts on', kind: 'date', column: researchProjects.startsOn, required: true, example: '2026-07-01' },
      endsOn: { label: 'Ends on', kind: 'date', column: researchProjects.endsOn },
      status: { label: 'Status', kind: 'select', column: researchProjects.status, options: choices(['active', 'on_hold', 'completed', 'cancelled']), bulk: true },
      outcomeSummary: { label: 'Outcome', kind: 'textarea', column: researchProjects.outcomeSummary, max: 4000, help: 'Needed to complete a project' },
    },
    extra: {
      grantLakhs: sql<number>`coalesce((select sum(g.sanctioned_paise) from research_grants g where g.project_id = "research_projects"."id"), 0)::float8 / 1e7`,
      members: sql<number>`(select count(*)::int from project_members m where m.project_id = "research_projects"."id")`,
    },
    search: [researchProjects.title, researchProjects.code, researchProjects.sponsorOrg],
    defaultSort: { id: 'startsOn', dir: 'desc' },
    scope: mine((me) => sql`(${researchProjects.piUserId} = ${me} or exists (select 1 from project_members m where m.project_id = "research_projects"."id" and m.user_id = ${me}))`),
    defaults: async (ctx) => ({ code: await nextNumber(ctx.tx, ctx.p.tenantId, 'PRJ') }),
    duplicate: async (ctx) => ({ code: await nextNumber(ctx.tx, ctx.p.tenantId, 'PRJ'), status: 'active', outcome_summary: null }),
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchProjects, id);
      if (after(r.endsOn, r.startsOn)) return 'The end date is before the start date';
      if (r.status === 'completed' && !String(r.outcomeSummary ?? '').trim()) return 'Record the outcome before completing the project';
      return null;
    },
  });
}

function grantsEntity() {
  const spent = sql<number>`coalesce((select sum(e.amount_paise) from grant_expenses e where e.grant_id = "research_grants"."id"), 0)`;
  return kitEntity({
    key: 'research-grants',
    module: MODULE,
    table: researchGrants,
    subjectType: 'grant',
    roles: { read: R, write: W },
    title: 'agency',
    label: (r) => `${r.agency}${r.sanctionRef ? ` (${r.sanctionRef})` : ''}`,
    fields: {
      projectId: { label: 'Project', kind: 'ref', column: researchGrants.projectId, required: true, options: projectOptions, lookup: projectLookup, filter: true, example: 'PRJ-0001' },
      agency: { label: 'Funding agency', kind: 'text', column: researchGrants.agency, required: true, max: 160, example: 'DST-SERB' },
      scheme: { label: 'Scheme', kind: 'text', column: researchGrants.scheme, max: 160, example: 'Core Research Grant' },
      sanctionRef: { label: 'Sanction reference', kind: 'text', column: researchGrants.sanctionRef, max: 80, example: 'CRG/2026/000123' },
      sanctioned: { label: 'Amount sanctioned', kind: 'money', column: researchGrants.sanctionedPaise, required: true, min: 1, example: '2500000' },
      startsOn: { label: 'Starts on', kind: 'date', column: researchGrants.startsOn, required: true, example: '2026-07-01' },
      endsOn: { label: 'Ends on', kind: 'date', column: researchGrants.endsOn, required: true, example: '2029-06-30' },
      status: { label: 'Status', kind: 'select', column: researchGrants.status, options: choices(['active', 'closed', 'cancelled']), bulk: true },
    },
    extra: {
      projectTitle: sql<string>`(select p.code || ' ' || p.title from research_projects p where p.id = ${researchGrants.projectId})`,
      spent: sql<number>`(${spent})::float8 / 100`,
      balance: sql<number>`(${researchGrants.sanctionedPaise} - ${spent})::float8 / 100`,
      ucs: sql<number>`(select count(*)::int from grant_utilisation_certificates u where u.grant_id = "research_grants"."id")`,
    },
    sorts: { spent },
    search: [researchGrants.agency, researchGrants.scheme, researchGrants.sanctionRef],
    defaultSort: { id: 'startsOn', dir: 'desc' },
    importKey: ['sanctionRef'],
    exportExtra: [{ key: 'spent', header: 'Spent (INR)' }, { key: 'balance', header: 'Balance (INR)' }],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchGrants, id);
      if (after(r.endsOn, r.startsOn)) return 'The end date is before the start date';
      const [s] = await ctx.tx.select({ v: sql<number>`coalesce(sum(${grantExpenses.amountPaise}), 0)::bigint`.mapWith(Number) }).from(grantExpenses).where(eq(grantExpenses.grantId, id));
      if (Number(r.sanctionedPaise) < s.v) return 'The sanction cannot be less than what has already been spent';
      return null;
    },
  });
}

function ucsEntity() {
  return kitEntity({
    key: 'grant-ucs',
    module: MODULE,
    table: grantUtilisationCertificates,
    subjectType: 'grant_uc',
    roles: { read: R, write: W },
    title: 'reference',
    label: (r) => `UC ${r.periodFrom} to ${r.periodTo}`,
    fields: {
      grantId: { label: 'Grant', kind: 'ref', column: grantUtilisationCertificates.grantId, required: true, options: grantOptions, lookup: grantLookup, filter: true, help: 'In an import, the sanction reference' },
      periodFrom: { label: 'Period from', kind: 'date', column: grantUtilisationCertificates.periodFrom, required: true },
      periodTo: { label: 'Period to', kind: 'date', column: grantUtilisationCertificates.periodTo, required: true },
      utilised: { label: 'Amount utilised', kind: 'money', column: grantUtilisationCertificates.utilisedPaise, help: 'Use "Fill from expenses" to take the expenses recorded in the period' },
      status: { label: 'Status', kind: 'select', column: grantUtilisationCertificates.status, options: choices(['draft', 'submitted', 'accepted', 'returned']), bulk: true },
      submittedOn: { label: 'Submitted on', kind: 'date', column: grantUtilisationCertificates.submittedOn },
      reference: { label: 'Reference', kind: 'text', column: grantUtilisationCertificates.reference, max: 80 },
      note: { label: 'Note', kind: 'textarea', column: grantUtilisationCertificates.note, max: 2000 },
    },
    extra: { grantName: sql<string>`(select g.agency || coalesce(' (' || g.sanction_ref || ')', '') from research_grants g where g.id = ${grantUtilisationCertificates.grantId})` },
    search: [grantUtilisationCertificates.reference, grantUtilisationCertificates.note],
    defaultSort: { id: 'periodTo', dir: 'desc' },
    importKey: ['grantId', 'periodFrom'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, grantUtilisationCertificates, id);
      if (after(r.periodTo, r.periodFrom)) return 'The period ends before it starts';
      const g = await rowOf(ctx, researchGrants, String(r.grantId));
      if (String(r.periodFrom) < String(g.startsOn) || String(r.periodTo) > String(g.endsOn)) return 'The period falls outside the grant period';
      if (Number(r.utilisedPaise) > Number(g.sanctionedPaise)) return 'The amount utilised is more than the sanction';
      if (['submitted', 'accepted', 'returned'].includes(String(r.status)) && !r.submittedOn) return 'Give the date the certificate was submitted';
      return null;
    },
    actions: {
      fill: {
        label: 'Fill from expenses',
        apply: async (ctx, id) => {
          const r = await rowOf(ctx, grantUtilisationCertificates, id);
          if (r.status !== 'draft') throw new ConflictException('Only a draft certificate can be refilled');
          const [s] = await ctx.tx.select({ v: sql<number>`coalesce(sum(${grantExpenses.amountPaise}), 0)::bigint`.mapWith(Number) }).from(grantExpenses).where(and(eq(grantExpenses.grantId, String(r.grantId)), sql`${grantExpenses.spentOn} between ${r.periodFrom}::date and ${r.periodTo}::date`));
          await ctx.tx.update(grantUtilisationCertificates).set({ utilisedPaise: s.v }).where(eq(grantUtilisationCertificates.id, id));
          await auditUser(ctx.tx, ctx.p, 'research.uc_filled', 'grant_uc', id, { utilisedPaise: s.v });
          return `₹${(s.v / 100).toLocaleString('en-IN')}`;
        },
      },
    },
  });
}

function conferencesEntity() {
  return kitEntity({
    key: 'research-conferences',
    module: MODULE,
    table: conferences,
    subjectType: 'conference',
    roles: { read: F, write: F },
    title: 'name',
    fields: {
      name: { label: 'Seminar or conference', kind: 'text', column: conferences.name, required: true, max: 200, example: 'National Conference on Smart Agriculture' },
      role: { label: 'Role', kind: 'select', column: conferences.role, required: true, options: choices(['attended', 'presented', 'organised']), example: 'Presented' },
      level: { label: 'Level', kind: 'select', column: conferences.level, required: true, options: choices(['institutional', 'national', 'international']), example: 'National' },
      heldOn: { label: 'Held on', kind: 'date', column: conferences.heldOn, required: true, example: '2026-09-12' },
      location: { label: 'Place', kind: 'text', column: conferences.location, max: 120 },
      paperTitle: { label: 'Paper presented', kind: 'text', column: conferences.paperTitle, max: 300 },
      userId: { label: 'Teacher', kind: 'user', column: conferences.userId, filter: true },
    },
    search: [conferences.name, conferences.paperTitle, conferences.location],
    defaultSort: { id: 'heldOn', dir: 'desc' },
    scope: mine((me) => eq(conferences.userId, me)),
    defaults: (ctx) => ({ userId: ctx.p.userId }),
    importKey: ['name', 'heldOn'],
    duplicate: true,
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, conferences, id);
      if (!staff(ctx) && r.userId !== ctx.p.userId) return 'You can record only your own conferences';
      if (r.role === 'presented' && !r.paperTitle) return 'Give the title of the paper presented';
      return null;
    },
  });
}

function consultanciesEntity() {
  return kitEntity({
    key: 'research-consultancies',
    module: MODULE,
    table: researchConsultancies,
    subjectType: 'consultancy',
    roles: { read: R, write: W },
    title: 'title',
    fields: {
      title: { label: 'Project or programme', kind: 'text', column: researchConsultancies.title, required: true, max: 200, example: 'Water quality testing for the municipality' },
      client: { label: 'Client', kind: 'text', column: researchConsultancies.client, required: true, max: 200, example: 'Hubballi-Dharwad Municipal Corporation' },
      clientContact: { label: 'Client contact', kind: 'text', column: researchConsultancies.clientContact, max: 200 },
      kind: { label: 'Kind', kind: 'select', column: researchConsultancies.kind, required: true, options: choices(['consultancy', 'testing', 'corporate_training']), example: 'Testing' },
      leadUserId: { label: 'Lead consultant', kind: 'user', column: researchConsultancies.leadUserId, filter: true },
      departmentId: { label: 'Department', kind: 'department', column: researchConsultancies.departmentId, bulk: true },
      startsOn: { label: 'Starts on', kind: 'date', column: researchConsultancies.startsOn },
      endsOn: { label: 'Ends on', kind: 'date', column: researchConsultancies.endsOn },
      contract: { label: 'Contract value', kind: 'money', column: researchConsultancies.contractPaise, example: '150000' },
      received: { label: 'Amount received', kind: 'money', column: researchConsultancies.receivedPaise, example: '150000' },
      institutionSharePct: { label: 'Institution share (%)', kind: 'number', column: researchConsultancies.institutionSharePct, min: 0, max: 100, help: 'The rest is shared among the consultants (consultancy policy)', example: '40' },
      trainees: { label: 'Trainees', kind: 'number', column: researchConsultancies.trainees, int: true, min: 0, max: 100000, help: 'Corporate training only' },
      agreementRef: { label: 'Agreement reference', kind: 'text', column: researchConsultancies.agreementRef, max: 80 },
      status: { label: 'Status', kind: 'select', column: researchConsultancies.status, options: choices(['proposed', 'active', 'completed', 'cancelled']), bulk: true },
      note: { label: 'Note', kind: 'textarea', column: researchConsultancies.note, max: 2000 },
    },
    extra: { institutionShare: sql<number>`round(${researchConsultancies.receivedPaise} * ${researchConsultancies.institutionSharePct} / 100.0)::float8 / 100`, consultantShare: sql<number>`round(${researchConsultancies.receivedPaise} * (100 - ${researchConsultancies.institutionSharePct}) / 100.0)::float8 / 100` },
    search: [researchConsultancies.title, researchConsultancies.client, researchConsultancies.agreementRef],
    defaultSort: { id: 'startsOn', dir: 'desc' },
    defaults: (ctx) => ({ createdBy: ctx.p.userId }),
    importKey: ['title', 'client'],
    duplicate: (_ctx, _row) => ({ received_paise: 0, status: 'proposed' }),
    exportExtra: [{ key: 'institutionShare', header: 'Institution share (INR)' }, { key: 'consultantShare', header: 'Consultants\' share (INR)' }],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchConsultancies, id);
      if (after(r.endsOn, r.startsOn)) return 'The end date is before the start date';
      if (r.kind !== 'corporate_training' && r.trainees) return 'Trainees are for corporate training';
      if (r.status === 'completed' && Number(r.receivedPaise) === 0) return 'Record the amount received before completing';
      return null;
    },
  });
}

function mousEntity() {
  return kitEntity({
    key: 'research-mous',
    module: MODULE,
    table: researchMous,
    subjectType: 'mou',
    roles: { read: R, write: W },
    title: 'partner',
    fields: {
      partner: { label: 'Partner', kind: 'text', column: researchMous.partner, required: true, max: 200, example: 'Infosys Ltd' },
      partnerKind: { label: 'Partner kind', kind: 'select', column: researchMous.partnerKind, required: true, options: choices(['industry', 'academic', 'government', 'ngo', 'international'], { ngo: 'NGO' }), example: 'Industry' },
      country: { label: 'Country', kind: 'text', column: researchMous.country, max: 80, example: 'India' },
      purpose: { label: 'Purpose', kind: 'textarea', column: researchMous.purpose, max: 2000, example: 'Internships, faculty training and joint projects' },
      signedOn: { label: 'Signed on', kind: 'date', column: researchMous.signedOn, required: true, example: '2025-08-01' },
      validUntil: { label: 'Valid until', kind: 'date', column: researchMous.validUntil, example: '2028-07-31' },
      coordinatorUserId: { label: 'Coordinator', kind: 'user', column: researchMous.coordinatorUserId },
      departmentId: { label: 'Department', kind: 'department', column: researchMous.departmentId, bulk: true },
      status: { label: 'Status', kind: 'select', column: researchMous.status, options: choices(['active', 'terminated']), bulk: true },
      documentUrl: { label: 'Document link', kind: 'text', column: researchMous.documentUrl, max: 500 },
    },
    extra: { activities: sql<number>`(select count(*)::int from research_mou_activities a where a.mou_id = "research_mous"."id")`, lastActivity: sql<string | null>`(select max(a.held_on)::text from research_mou_activities a where a.mou_id = "research_mous"."id")` },
    filters: {
      validity: {
        label: 'Validity',
        options: choices(['current', 'expiring', 'expired']),
        where: (v) => (v === 'current' ? sql`${researchMous.status} = 'active' and (${researchMous.validUntil} is null or ${researchMous.validUntil} >= current_date)` : v === 'expiring' ? sql`${researchMous.status} = 'active' and ${researchMous.validUntil} between current_date and current_date + 90` : v === 'expired' ? sql`(${researchMous.validUntil} < current_date or ${researchMous.status} = 'terminated')` : undefined),
      },
    },
    search: [researchMous.partner, researchMous.purpose],
    defaultSort: { id: 'signedOn', dir: 'desc' },
    importKey: ['partner', 'signedOn'],
    duplicate: true,
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchMous, id);
      return after(r.validUntil, r.signedOn) ? 'The MoU cannot expire before it is signed' : null;
    },
  });
}

function mouActivitiesEntity() {
  return kitEntity({
    key: 'research-mou-activities',
    module: MODULE,
    table: researchMouActivities,
    subjectType: 'mou_activity',
    roles: { read: R, write: W },
    title: 'title',
    fields: {
      mouId: { label: 'MoU', kind: 'ref', column: researchMouActivities.mouId, required: true, options: mouOptions, lookup: mouLookup, filter: true, help: 'In an import, the partner\'s name', example: 'Infosys Ltd' },
      title: { label: 'Activity', kind: 'text', column: researchMouActivities.title, required: true, max: 200, example: 'Summer internship for 12 students' },
      kind: { label: 'Kind', kind: 'select', column: researchMouActivities.kind, required: true, options: choices(['faculty_exchange', 'student_exchange', 'internship', 'joint_research', 'training', 'event', 'other']), example: 'Internship' },
      heldOn: { label: 'Held on', kind: 'date', column: researchMouActivities.heldOn, required: true, example: '2026-06-15' },
      participants: { label: 'Participants', kind: 'number', column: researchMouActivities.participants, int: true, min: 0, max: 100000 },
      note: { label: 'Note', kind: 'textarea', column: researchMouActivities.note, max: 2000 },
    },
    extra: { partner: sql<string>`(select m.partner from research_mous m where m.id = ${researchMouActivities.mouId})` },
    search: [researchMouActivities.title, researchMouActivities.note],
    defaultSort: { id: 'heldOn', dir: 'desc' },
    importKey: ['mouId', 'title', 'heldOn'],
    move: { label: 'Move to MoU', options: mouOptions, column: researchMouActivities.mouId },
    duplicate: true,
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchMouActivities, id);
      const m = await rowOf(ctx, researchMous, String(r.mouId));
      if (String(r.heldOn) < String(m.signedOn)) return 'The activity is before the MoU was signed';
      if (m.validUntil && String(r.heldOn) > String(m.validUntil)) return 'The activity is after the MoU expired';
      return null;
    },
  });
}

function seedEntity() {
  return kitEntity({
    key: 'research-seed-grants',
    module: MODULE,
    table: researchSeedGrants,
    subjectType: 'seed_grant',
    roles: { read: F, write: W },
    title: 'title',
    fields: {
      title: { label: 'Project', kind: 'text', column: researchSeedGrants.title, required: true, max: 200, example: 'Pilot study on biodegradable packaging' },
      applicantUserId: { label: 'Teacher', kind: 'user', column: researchSeedGrants.applicantUserId, required: true, filter: true },
      departmentId: { label: 'Department', kind: 'department', column: researchSeedGrants.departmentId, bulk: true },
      requested: { label: 'Amount requested', kind: 'money', column: researchSeedGrants.requestedPaise, example: '100000' },
      sanctioned: { label: 'Amount sanctioned', kind: 'money', column: researchSeedGrants.sanctionedPaise },
      sanctionedOn: { label: 'Sanctioned on', kind: 'date', column: researchSeedGrants.sanctionedOn },
      durationMonths: { label: 'Duration (months)', kind: 'number', column: researchSeedGrants.durationMonths, int: true, min: 1, max: 60 },
      utilised: { label: 'Amount utilised', kind: 'money', column: researchSeedGrants.utilisedPaise },
      reportSubmittedOn: { label: 'Utilisation report on', kind: 'date', column: researchSeedGrants.reportSubmittedOn },
      outcome: { label: 'Outcome', kind: 'textarea', column: researchSeedGrants.outcome, max: 4000, help: 'Papers, patents or external proposals that came of it' },
      status: { label: 'Status', kind: 'select', column: researchSeedGrants.status, options: choices(['applied', 'sanctioned', 'completed', 'rejected']), bulk: true },
    },
    search: [researchSeedGrants.title, researchSeedGrants.outcome],
    defaultSort: { id: 'sanctionedOn', dir: 'desc' },
    scope: mine((me) => eq(researchSeedGrants.applicantUserId, me)),
    importKey: ['title'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchSeedGrants, id);
      if (['sanctioned', 'completed'].includes(String(r.status)) && (!Number(r.sanctionedPaise) || !r.sanctionedOn)) return 'Give the amount and date of the sanction';
      if (Number(r.utilisedPaise) > Number(r.sanctionedPaise) && Number(r.sanctionedPaise) > 0) return 'The amount utilised is more than the sanction';
      if (r.status === 'completed' && !r.reportSubmittedOn) return 'Record the utilisation report before completing';
      if (r.reportSubmittedOn && r.sanctionedOn && String(r.reportSubmittedOn) < String(r.sanctionedOn)) return 'The report is dated before the sanction';
      return null;
    },
  });
}

function recognitionsEntity() {
  return kitEntity({
    key: 'research-recognitions',
    module: MODULE,
    table: researchRecognitions,
    subjectType: 'recognition',
    roles: { read: F, write: F },
    title: 'title',
    fields: {
      userId: { label: 'Teacher', kind: 'user', column: researchRecognitions.userId, filter: true },
      kind: { label: 'Kind', kind: 'select', column: researchRecognitions.kind, required: true, options: choices(['award', 'fellowship', 'editorial_board', 'reviewer', 'keynote', 'membership']), example: 'Award' },
      title: { label: 'Title', kind: 'text', column: researchRecognitions.title, required: true, max: 200, example: 'Young Scientist Award' },
      body: { label: 'Awarding body or journal', kind: 'text', column: researchRecognitions.body, max: 200, example: 'Karnataka Science and Technology Academy' },
      level: { label: 'Level', kind: 'select', column: researchRecognitions.level, required: true, options: choices(LEVELS), example: 'State' },
      receivedOn: { label: 'Received on', kind: 'date', column: researchRecognitions.receivedOn, required: true, example: '2026-03-10' },
      validUntil: { label: 'Valid until', kind: 'date', column: researchRecognitions.validUntil, help: 'Fellowships and editorial roles with a term' },
      amount: { label: 'Amount', kind: 'money', column: researchRecognitions.amountPaise },
      url: { label: 'Link', kind: 'text', column: researchRecognitions.url, max: 500 },
    },
    search: [researchRecognitions.title, researchRecognitions.body],
    defaultSort: { id: 'receivedOn', dir: 'desc' },
    scope: mine((me) => eq(researchRecognitions.userId, me)),
    defaults: (ctx) => ({ userId: ctx.p.userId }),
    importKey: ['userId', 'title', 'receivedOn'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchRecognitions, id);
      if (!staff(ctx) && r.userId !== ctx.p.userId) return 'You can record only your own recognitions';
      return after(r.validUntil, r.receivedOn) ? 'The end of the term is before it began' : null;
    },
  });
}

function ethicsEntity() {
  const validity = sql<string>`case when ${researchEthicsApprovals.status} <> 'approved' then ${researchEthicsApprovals.status} when ${researchEthicsApprovals.expiresOn} < current_date then 'expired' when ${researchEthicsApprovals.expiresOn} <= current_date + 60 then 'expiring' else 'valid' end`;
  return kitEntity({
    key: 'research-ethics',
    module: MODULE,
    table: researchEthicsApprovals,
    subjectType: 'ethics_approval',
    roles: { read: F, write: W },
    title: 'title',
    fields: {
      committee: { label: 'Committee', kind: 'select', column: researchEthicsApprovals.committee, required: true, options: choices(['iec', 'iaec', 'ibsc', 'other'], { iec: 'Institutional ethics committee (IEC)', iaec: 'Animal ethics committee (IAEC)', ibsc: 'Biosafety committee (IBSC)', other: 'Other' }), example: 'IEC' },
      protocolNo: { label: 'Protocol no.', kind: 'text', column: researchEthicsApprovals.protocolNo, required: true, max: 60, example: 'IEC/2026/014' },
      title: { label: 'Study', kind: 'text', column: researchEthicsApprovals.title, required: true, max: 300, example: 'Stress and sleep among first-year students' },
      piUserId: { label: 'Principal investigator', kind: 'user', column: researchEthicsApprovals.piUserId, filter: true },
      proposalId: { label: 'Proposal', kind: 'ref', column: researchEthicsApprovals.proposalId, options: proposalOptions, noImport: true },
      projectId: { label: 'Project', kind: 'ref', column: researchEthicsApprovals.projectId, options: projectOptions, lookup: projectLookup },
      submittedOn: { label: 'Submitted on', kind: 'date', column: researchEthicsApprovals.submittedOn },
      approvedOn: { label: 'Approved on', kind: 'date', column: researchEthicsApprovals.approvedOn },
      expiresOn: { label: 'Valid until', kind: 'date', column: researchEthicsApprovals.expiresOn },
      status: { label: 'Status', kind: 'select', column: researchEthicsApprovals.status, options: choices(['pending', 'approved', 'rejected', 'withdrawn']), bulk: true },
      conditions: { label: 'Conditions', kind: 'textarea', column: researchEthicsApprovals.conditions, max: 2000 },
    },
    extra: { validity },
    filters: { validity: { label: 'Validity', options: choices(['valid', 'expiring', 'expired', 'pending']), where: (v) => (['valid', 'expiring', 'expired', 'pending'].includes(v) ? sql`${validity} = ${v}` : undefined) } },
    search: [researchEthicsApprovals.title, researchEthicsApprovals.protocolNo],
    defaultSort: { id: 'expiresOn', dir: 'asc' },
    scope: mine((me) => eq(researchEthicsApprovals.piUserId, me)),
    importKey: ['committee', 'protocolNo'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchEthicsApprovals, id);
      if (r.status === 'approved' && (!r.approvedOn || !r.expiresOn)) return 'Give the approval date and how long it is valid';
      if (after(r.expiresOn, r.approvedOn)) return 'The approval cannot expire before it was given';
      // An approval tied to a proposal clears (or refuses) the proposal's ethics step.
      if (r.proposalId && (r.status === 'approved' || r.status === 'rejected')) {
        await ctx.tx.update(researchProposals).set({ ethicsStatus: r.status === 'approved' ? 'cleared' : 'rejected', ethicsRef: String(r.protocolNo) }).where(and(eq(researchProposals.id, String(r.proposalId)), eq(researchProposals.ethicsRequired, true)));
      }
      return null;
    },
  });
}

function callsEntity() {
  const last = sql`coalesce(${researchCalls.internalDeadline}, ${researchCalls.deadline})`;
  return kitEntity({
    key: 'research-calls',
    module: MODULE,
    table: researchCalls,
    subjectType: 'research_call',
    roles: { read: F, write: W },
    title: 'title',
    fields: {
      agency: { label: 'Agency', kind: 'text', column: researchCalls.agency, required: true, max: 160, example: 'ANRF (SERB)' },
      scheme: { label: 'Scheme', kind: 'text', column: researchCalls.scheme, max: 160, example: 'Core Research Grant' },
      title: { label: 'Call', kind: 'text', column: researchCalls.title, required: true, max: 200, example: 'CRG call 2026' },
      url: { label: 'Link', kind: 'text', column: researchCalls.url, max: 500 },
      opensOn: { label: 'Opens on', kind: 'date', column: researchCalls.opensOn },
      internalDeadline: { label: 'Internal deadline', kind: 'date', column: researchCalls.internalDeadline, help: 'Proposals must be submitted for internal approval by this date' },
      deadline: { label: 'Agency deadline', kind: 'date', column: researchCalls.deadline, required: true, example: '2026-12-15' },
      maxAmount: { label: 'Maximum funding', kind: 'money', column: researchCalls.maxAmountPaise },
      status: { label: 'Status', kind: 'select', column: researchCalls.status, options: choices(['open', 'closed']), bulk: true },
      note: { label: 'Note', kind: 'textarea', column: researchCalls.note, max: 2000 },
    },
    extra: {
      proposals: sql<number>`(select count(*)::int from research_proposals p where p.call_id = "research_calls"."id")`,
      daysLeft: sql<number | null>`case when ${researchCalls.status} = 'open' then (${last} - current_date)::int end`,
    },
    filters: { due: { label: 'Due', options: choices(['next_14_days', 'next_30_days', 'past']), where: (v) => (v === 'next_14_days' ? sql`${last} between current_date and current_date + 14` : v === 'next_30_days' ? sql`${last} between current_date and current_date + 30` : v === 'past' ? sql`${last} < current_date` : undefined) } },
    search: [researchCalls.title, researchCalls.agency, researchCalls.scheme],
    defaultSort: { id: 'deadline', dir: 'asc' },
    importKey: ['title'],
    duplicate: true,
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchCalls, id);
      if (r.internalDeadline && String(r.internalDeadline) > String(r.deadline)) return 'The internal deadline must be on or before the agency deadline';
      if (after(r.deadline, r.opensOn)) return 'The deadline is before the call opens';
      return null;
    },
  });
}

function equipmentEntity() {
  const used = (col: SQL) => sql`coalesce((select ${col} from research_equipment_usage u where u.equipment_id = "research_equipment"."id" and u.status <> 'cancelled' and u.starts_at >= date_trunc('year', now())), 0)`;
  return kitEntity({
    key: 'research-equipment',
    module: MODULE,
    table: researchEquipment,
    subjectType: 'research_equipment',
    roles: { read: F, write: W },
    title: 'name',
    fields: {
      code: { label: 'Code', kind: 'text', column: researchEquipment.code, required: true, max: 40, example: 'CIF-XRD-01' },
      name: { label: 'Instrument', kind: 'text', column: researchEquipment.name, required: true, max: 200, example: 'X-ray diffractometer' },
      category: { label: 'Category', kind: 'text', column: researchEquipment.category, max: 80, bulk: true, example: 'Materials characterisation' },
      location: { label: 'Location', kind: 'text', column: researchEquipment.location, max: 120, bulk: true, example: 'Central Instrumentation Facility, room 12' },
      departmentId: { label: 'Department', kind: 'department', column: researchEquipment.departmentId, bulk: true },
      custodianUserId: { label: 'Custodian', kind: 'user', column: researchEquipment.custodianUserId },
      makeModel: { label: 'Make and model', kind: 'text', column: researchEquipment.makeModel, max: 160 },
      purchasedOn: { label: 'Purchased on', kind: 'date', column: researchEquipment.purchasedOn },
      cost: { label: 'Cost', kind: 'money', column: researchEquipment.costPaise },
      internalRate: { label: 'Rate per hour, internal users', kind: 'money', column: researchEquipment.internalRatePaise, example: '500' },
      externalRate: { label: 'Rate per hour, external users', kind: 'money', column: researchEquipment.externalRatePaise, example: '2500' },
      status: { label: 'Status', kind: 'select', column: researchEquipment.status, options: choices(['working', 'under_repair', 'retired']), bulk: true },
    },
    extra: {
      hoursThisYear: sql<number>`(${used(sql`sum(extract(epoch from u.ends_at - u.starts_at) / 3600)`)})::float8`,
      revenueThisYear: sql<number>`(${used(sql`sum(u.amount_paise)`)})::float8 / 100`,
    },
    search: [researchEquipment.name, researchEquipment.code, researchEquipment.category],
    defaultSort: { id: 'name', dir: 'asc' },
    order: { column: researchEquipment.sortOrder },
    importKey: ['code'],
    duplicate: async (ctx, row) => ({ code: await copyCode(ctx, String(row.code)) }),
    exportExtra: [{ key: 'hoursThisYear', header: 'Hours used this year' }, { key: 'revenueThisYear', header: 'Billed this year (INR)' }],
  });
}

async function copyCode(ctx: KitCtx, code: string): Promise<string> {
  for (let n = 1; n < 200; n++) {
    const c = `${code}-${n + 1}`;
    if (!(await ctx.tx.select({ id: researchEquipment.id }).from(researchEquipment).where(sql`lower(${researchEquipment.code}) = ${c.toLowerCase()}`).limit(1))[0]) return c;
  }
  return `${code}-${Date.now()}`;
}

function usageEntity() {
  return kitEntity({
    key: 'research-equipment-usage',
    module: MODULE,
    table: researchEquipmentUsage,
    subjectType: 'equipment_usage',
    roles: { read: F, write: F },
    title: 'purpose',
    label: (r) => `${r.equipmentName ?? ''} ${r.startsAt ?? ''}`.trim(),
    fields: {
      equipmentId: { label: 'Instrument', kind: 'ref', column: researchEquipmentUsage.equipmentId, required: true, options: equipmentOptions, lookup: equipmentLookup, filter: true, help: 'In an import, the instrument code', example: 'CIF-XRD-01' },
      userKind: { label: 'User', kind: 'select', column: researchEquipmentUsage.userKind, required: true, options: choices(['internal', 'external']), example: 'External' },
      userId: { label: 'Internal user', kind: 'user', column: researchEquipmentUsage.userId },
      externalName: { label: 'External user', kind: 'text', column: researchEquipmentUsage.externalName, max: 160, example: 'Dr. R. Kulkarni' },
      externalOrg: { label: 'Organisation', kind: 'text', column: researchEquipmentUsage.externalOrg, max: 200, example: 'KLE Technological University' },
      purpose: { label: 'Purpose', kind: 'text', column: researchEquipmentUsage.purpose, max: 300, example: 'Phase analysis of 10 samples' },
      startsAt: { label: 'From', kind: 'datetime', column: researchEquipmentUsage.startsAt, required: true, example: '2026-10-20 10:00' },
      endsAt: { label: 'To', kind: 'datetime', column: researchEquipmentUsage.endsAt, required: true, example: '2026-10-20 13:00' },
      status: { label: 'Status', kind: 'select', column: researchEquipmentUsage.status, options: choices(['booked', 'completed', 'billed', 'cancelled']), bulk: true },
      invoiceRef: { label: 'Invoice', kind: 'text', column: researchEquipmentUsage.invoiceRef, max: 80 },
    },
    extra: {
      equipmentName: sql<string>`(select e.code || ' ' || e.name from research_equipment e where e.id = ${researchEquipmentUsage.equipmentId})`,
      hours: sql<number>`round((extract(epoch from ${researchEquipmentUsage.endsAt} - ${researchEquipmentUsage.startsAt}) / 3600)::numeric, 2)::float8`,
      rate: sql<number>`${researchEquipmentUsage.ratePaise}::float8 / 100`,
      amount: sql<number>`${researchEquipmentUsage.amountPaise}::float8 / 100`,
    },
    sorts: { amount: researchEquipmentUsage.amountPaise },
    search: [researchEquipmentUsage.purpose, researchEquipmentUsage.externalName, researchEquipmentUsage.externalOrg, researchEquipmentUsage.invoiceRef],
    defaultSort: { id: 'startsAt', dir: 'desc' },
    scope: mine((me) => sql`(${researchEquipmentUsage.userId} = ${me} or ${researchEquipmentUsage.createdBy} = ${me})`),
    defaults: (ctx) => ({ createdBy: ctx.p.userId }),
    importKey: ['equipmentId', 'startsAt'],
    exportExtra: [{ key: 'hours', header: 'Hours' }, { key: 'rate', header: 'Rate per hour (INR)' }, { key: 'amount', header: 'Amount (INR)' }],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, researchEquipmentUsage, id);
      const e = await rowOf(ctx, researchEquipment, String(r.equipmentId));
      const from = new Date(String(r.startsAt));
      const to = new Date(String(r.endsAt));
      if (to <= from) return 'The booking ends before it starts';
      if (r.userKind === 'internal' && !r.userId) return 'Choose the internal user';
      if (r.userKind === 'external' && !r.externalName) return 'Give the external user\'s name';
      if (r.status === 'billed' && !r.invoiceRef) return 'Give the invoice number of the bill';
      if (r.status === 'booked' && e.status !== 'working') return 'This instrument is not available for booking';
      if (r.status !== 'cancelled') {
        const [clash] = await ctx.tx
          .select({ id: researchEquipmentUsage.id })
          .from(researchEquipmentUsage)
          .where(and(eq(researchEquipmentUsage.equipmentId, String(r.equipmentId)), ne(researchEquipmentUsage.id, id), ne(researchEquipmentUsage.status, 'cancelled'), sql`${researchEquipmentUsage.startsAt} < ${to.toISOString()}::timestamptz and ${researchEquipmentUsage.endsAt} > ${from.toISOString()}::timestamptz`))
          .limit(1);
        if (clash) return 'The instrument is already booked for part of this time';
      }
      // The charge: hours at the internal or external rate, kept once the use is billed.
      if (r.status !== 'billed') {
        const rate = Number(r.userKind === 'external' ? e.externalRatePaise : e.internalRatePaise);
        const hours = (to.getTime() - from.getTime()) / 3_600_000;
        await ctx.tx.update(researchEquipmentUsage).set({ ratePaise: rate, amountPaise: Math.round(rate * hours) }).where(eq(researchEquipmentUsage.id, id));
      }
      return null;
    },
  });
}

function scholarsEntity() {
  return kitEntity({
    key: 'research-scholars',
    module: MODULE,
    table: researchScholars,
    subjectType: 'scholar',
    roles: { read: F, write: W },
    title: 'fullName',
    fields: {
      fullName: { label: 'Scholar', kind: 'text', column: researchScholars.fullName, required: true, max: 120, example: 'Meera Patil' },
      programme: { label: 'Programme', kind: 'select', column: researchScholars.programme, required: true, options: choices(['phd', 'mphil'], { phd: 'Ph.D.', mphil: 'M.Phil.' }), example: 'Ph.D.' },
      supervisorUserId: { label: 'Supervisor', kind: 'user', column: researchScholars.supervisorUserId, required: true, filter: true },
      projectId: { label: 'Project', kind: 'ref', column: researchScholars.projectId, options: projectOptions, lookup: projectLookup },
      enrolledOn: { label: 'Registered on', kind: 'date', column: researchScholars.enrolledOn, required: true, example: '2025-08-01' },
      thesisTitle: { label: 'Thesis title', kind: 'text', column: researchScholars.thesisTitle, max: 300 },
      status: { label: 'Status', kind: 'select', column: researchScholars.status, options: choices(['enrolled', 'thesis_submitted', 'awarded', 'withdrawn']), create: false, edit: false },
    },
    extra: {
      dcMeetings: sql<number>`(select count(*)::int from scholar_dc_meetings d where d.scholar_id = "research_scholars"."id")`,
      nextDcDue: sql<string | null>`(select d.next_due_on::text from scholar_dc_meetings d where d.scholar_id = "research_scholars"."id" order by d.held_on desc limit 1)`,
      courseworkDone: sql<string>`(select count(*) filter (where c.status in ('passed', 'exempted'))::text || ' / ' || count(*)::text from scholar_coursework c where c.scholar_id = "research_scholars"."id")`,
    },
    filters: { dcDue: { label: 'Doctoral committee', options: choices(['overdue', 'never_met']), where: (v) => (v === 'overdue' ? sql`(select d.next_due_on from scholar_dc_meetings d where d.scholar_id = "research_scholars"."id" order by d.held_on desc limit 1) < current_date` : v === 'never_met' ? sql`not exists (select 1 from scholar_dc_meetings d where d.scholar_id = "research_scholars"."id")` : undefined) } },
    search: [researchScholars.fullName, researchScholars.thesisTitle],
    defaultSort: { id: 'fullName', dir: 'asc' },
    scope: mine((me) => eq(researchScholars.supervisorUserId, me)),
    importKey: ['fullName'],
  });
}

function dcEntity() {
  return kitEntity({
    key: 'scholar-dc-meetings',
    module: MODULE,
    table: scholarDcMeetings,
    subjectType: 'dc_meeting',
    roles: { read: F, write: F },
    title: 'heldOn',
    label: (r) => `${r.scholarName ?? ''} ${r.heldOn ?? ''}`.trim(),
    fields: {
      scholarId: { label: 'Scholar', kind: 'ref', column: scholarDcMeetings.scholarId, required: true, options: scholarOptions, lookup: scholarLookup, filter: true, help: 'In an import, the scholar\'s name', example: 'Meera Patil' },
      heldOn: { label: 'Held on', kind: 'date', column: scholarDcMeetings.heldOn, required: true, example: '2026-09-20' },
      members: { label: 'Members present', kind: 'text', column: scholarDcMeetings.members, max: 500 },
      progress: { label: 'Progress', kind: 'select', column: scholarDcMeetings.progress, required: true, options: choices(['satisfactory', 'needs_improvement', 'unsatisfactory']), example: 'Satisfactory' },
      recommendations: { label: 'Recommendations', kind: 'textarea', column: scholarDcMeetings.recommendations, max: 4000 },
      nextDueOn: { label: 'Next meeting due', kind: 'date', column: scholarDcMeetings.nextDueOn, help: 'Usually six months later' },
    },
    extra: { scholarName: sql<string>`(select s.full_name from research_scholars s where s.id = ${scholarDcMeetings.scholarId})` },
    search: [scholarDcMeetings.members, scholarDcMeetings.recommendations],
    defaultSort: { id: 'heldOn', dir: 'desc' },
    scope: mine((me) => sql`exists (select 1 from research_scholars s where s.id = ${scholarDcMeetings.scholarId} and s.supervisor_user_id = ${me})`),
    importKey: ['scholarId', 'heldOn'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, scholarDcMeetings, id);
      const s = await rowOf(ctx, researchScholars, String(r.scholarId));
      if (!staff(ctx) && s.supervisorUserId !== ctx.p.userId) return 'Only the supervisor or the research office records these meetings';
      if (String(r.heldOn) < String(s.enrolledOn)) return 'The meeting is before the scholar registered';
      if (r.nextDueOn && String(r.nextDueOn) <= String(r.heldOn)) return 'The next meeting must be after this one';
      return null;
    },
  });
}

function courseworkEntity() {
  return kitEntity({
    key: 'scholar-coursework',
    module: MODULE,
    table: scholarCoursework,
    subjectType: 'coursework',
    roles: { read: F, write: W },
    title: 'course',
    fields: {
      scholarId: { label: 'Scholar', kind: 'ref', column: scholarCoursework.scholarId, required: true, options: scholarOptions, lookup: scholarLookup, filter: true, example: 'Meera Patil' },
      course: { label: 'Course', kind: 'text', column: scholarCoursework.course, required: true, max: 160, example: 'Research and publication ethics' },
      credits: { label: 'Credits', kind: 'number', column: scholarCoursework.credits, min: 0, max: 30, example: '2' },
      grade: { label: 'Grade', kind: 'text', column: scholarCoursework.grade, max: 10 },
      status: { label: 'Status', kind: 'select', column: scholarCoursework.status, options: choices(['enrolled', 'passed', 'failed', 'exempted']), bulk: true },
      completedOn: { label: 'Completed on', kind: 'date', column: scholarCoursework.completedOn },
    },
    extra: { scholarName: sql<string>`(select s.full_name from research_scholars s where s.id = ${scholarCoursework.scholarId})` },
    search: [scholarCoursework.course],
    defaultSort: { id: 'course', dir: 'asc' },
    scope: mine((me) => sql`exists (select 1 from research_scholars s where s.id = ${scholarCoursework.scholarId} and s.supervisor_user_id = ${me})`),
    importKey: ['scholarId', 'course'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, scholarCoursework, id);
      if (r.status === 'passed' && (!r.completedOn || !r.grade)) return 'Give the grade and the date of completion';
      return null;
    },
  });
}

@Injectable()
export class ResearchRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    for (const e of [publicationsEntity(), patentsEntity(), proposalsEntity(this.clock), projectsEntity(), grantsEntity(), ucsEntity(), conferencesEntity(), consultanciesEntity(), mousEntity(), mouActivitiesEntity(), seedEntity(), recognitionsEntity(), ethicsEntity(), callsEntity(), equipmentEntity(), usageEntity(), scholarsEntity(), dcEntity(), courseworkEntity()]) this.registry.register(e);
  }
}

export const RESEARCH_ENTITIES = ['research-publications', 'research-patents', 'research-proposals', 'research-projects', 'research-grants', 'grant-ucs', 'research-conferences', 'research-consultancies', 'research-mous', 'research-mou-activities', 'research-seed-grants', 'research-recognitions', 'research-ethics', 'research-calls', 'research-equipment', 'research-equipment-usage', 'research-scholars', 'scholar-dc-meetings', 'scholar-coursework'] as const;
