import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { windowOf, yearOf } from '../accreditation/sources.js';
import { xlsx, type Sheet } from '../accreditation/xlsx.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { grantExpenses, patents, publications, researchGrants, researchProjects, users } from '../db/schema.js';
import { researchGrantHeads, researchGrantReleases, researchIncentiveClaims, researchIncentiveSchemes, researchProfiles } from '../db/schema-research.js';
import { hasRole } from '../placements/placements.access.js';
import { qualitySettings } from '../quality-hub/settings.catalogue.js';
import { DoiLookup } from './doi-lookup.js';
import { normalizeOrcid, validOrcid } from './orcid.js';
import { duplicateOf } from './publication-dupes.js';
import { financialYear, incentiveAmount, nirfRatios, overheadPaise, paperBasis, scholarIdOf, ucFigures, validScopusId, validWosId, vidwanIdOf } from './research-pass.rules.js';
import { normalizeDoi } from './research-rules.js';
import { FACULTY_ROLES, RESEARCH_ROLES, RESEARCH_VIEW_ROLES } from './roles.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const Opt = (n: number) => z.string().trim().max(n).optional().nullable();
const ProfileBody = z.object({
  orcid: Opt(60),
  scopusAuthorId: Opt(20),
  wosResearcherId: Opt(20),
  googleScholarId: Opt(200),
  vidwanId: Opt(200),
  irinsUrl: Opt(300),
  areas: z.string().trim().max(500).optional(),
  scopusHIndex: z.number().int().min(0).max(500).optional().nullable(),
  wosHIndex: z.number().int().min(0).max(500).optional().nullable(),
  scholarHIndex: z.number().int().min(0).max(500).optional().nullable(),
  scholarCitations: z.number().int().min(0).max(10_000_000).optional().nullable(),
});
const DupBody = z.object({ title: z.string().trim().min(3).max(300), year: z.number().int().min(1950).max(2100), doi: z.string().trim().max(200).optional() });
const ClaimBody = z.object({ schemeId: z.uuid(), publicationId: z.uuid().optional(), patentId: z.uuid().optional() }).refine((b) => !!b.publicationId !== !!b.patentId, { message: 'Claim for one publication or one patent' });
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const empty = (v: string | null | undefined) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null);

/**
 * The research pass: a teacher's own researcher identifiers, DOI look-up with an offline fallback and duplicate
 * check, pending DOI records filled in once the registry is back, a grant's statement (heads, releases, overhead and
 * the GFR 12-A utilisation figures), incentive claims, and the NIRF RP ratios, NBA criterion 5 research figures and
 * AISHE Ph.D. tables.
 */
@Controller('v1/research')
export class ResearchPassController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly doi: DoiLookup,
  ) {}

  // ---- my research profile ----------------------------------------------------------------------

  @Get('profiles/me')
  @Auth('user', FACULTY_ROLES)
  myProfile(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(researchProfiles).where(eq(researchProfiles.userId, p.userId)))[0] ?? { userId: p.userId, id: null });
  }

  /** A teacher keeps their own identifiers; each is checked and normalised, and a change needs the office to verify it again. */
  @Put('profiles/me')
  @Auth('user', FACULTY_ROLES)
  saveProfile(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ProfileBody)) b: z.infer<typeof ProfileBody>) {
    const v: Record<string, unknown> = { ...b };
    const orcid = empty(b.orcid);
    if (orcid !== undefined) {
      if (orcid && !validOrcid(normalizeOrcid(orcid))) throw new BadRequestException({ message: 'That is not a valid ORCID iD (like 0000-0002-1825-0097)', code: 'INVALID_ORCID' });
      v.orcid = orcid ? normalizeOrcid(orcid) : null;
    }
    const scopus = empty(b.scopusAuthorId);
    if (scopus && !validScopusId(scopus)) throw new BadRequestException({ message: 'A Scopus Author ID is 10 or 11 digits', code: 'INVALID_SCOPUS_ID' });
    if (scopus !== undefined) v.scopusAuthorId = scopus;
    const wos = empty(b.wosResearcherId);
    if (wos && !validWosId(wos)) throw new BadRequestException({ message: 'Use a ResearcherID like AAB-1234-2019', code: 'INVALID_WOS_ID' });
    if (wos !== undefined) v.wosResearcherId = wos ? wos.toUpperCase() : null;
    const gs = empty(b.googleScholarId);
    if (gs !== undefined) {
      if (gs && !scholarIdOf(gs)) throw new BadRequestException({ message: 'Give the Google Scholar profile link or its 12-character id', code: 'INVALID_SCHOLAR_ID' });
      v.googleScholarId = gs ? scholarIdOf(gs) : null;
    }
    const vid = empty(b.vidwanId);
    if (vid !== undefined) {
      if (vid && !vidwanIdOf(vid)) throw new BadRequestException({ message: 'Give the Vidwan profile link or number', code: 'INVALID_VIDWAN_ID' });
      v.vidwanId = vid ? vidwanIdOf(vid) : null;
    }
    if (b.irinsUrl !== undefined) v.irinsUrl = empty(b.irinsUrl);
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (v.orcid) {
        const [taken] = await tx.select({ userId: researchProfiles.userId }).from(researchProfiles).where(eq(researchProfiles.orcid, String(v.orcid)));
        if (taken && taken.userId !== p.userId) throw new ConflictException({ message: 'Another teacher has that ORCID iD', code: 'ORCID_TAKEN' });
      }
      const [before] = await tx.select().from(researchProfiles).where(eq(researchProfiles.userId, p.userId));
      const ids = ['orcid', 'scopusAuthorId', 'wosResearcherId', 'googleScholarId', 'vidwanId'] as const;
      const idsChanged = !before || ids.some((k) => v[k] !== undefined && v[k] !== before[k]);
      const set = { ...v, ...(idsChanged ? { verifiedAt: null, verifiedBy: null } : {}), metricsOn: ['scopusHIndex', 'wosHIndex', 'scholarHIndex', 'scholarCitations'].some((k) => v[k] !== undefined) ? await tenantToday(tx, this.clock) : before?.metricsOn ?? null };
      const [row] = before
        ? await tx.update(researchProfiles).set(set).where(eq(researchProfiles.id, before.id)).returning()
        : await tx.insert(researchProfiles).values({ tenantId: p.tenantId, userId: p.userId, ...set }).returning();
      await auditUser(tx, p, before ? 'research_profile.updated' : 'research_profile.created', 'research_profile', row.id, { before: before ?? undefined, after: row });
      return row;
    });
  }

  // ---- DOI look-up, duplicates and pending records ----------------------------------------------

  /** What the registry (or the cached copy) says about a DOI, and whether the paper is already on record. */
  @Get('publications/doi-lookup')
  @Auth('user', FACULTY_ROLES)
  async doiLookup(@CurrentPrincipal() p: UserPrincipal, @Query('doi') raw?: string) {
    const doi = normalizeDoi(raw ?? '');
    if (!doi) throw new BadRequestException({ message: 'That is not a valid DOI', code: 'INVALID_DOI' });
    const { source, record } = await this.doi.lookup(p.tenantId, doi);
    const duplicate = await this.db.withTenant(p.tenantId, (tx) => duplicateOf(tx, { doi, title: record?.title ?? '', year: record?.year ?? 0 }));
    return { doi, source, record, duplicate };
  }

  @Post('publications/check-duplicate')
  @HttpCode(200)
  @Auth('user', FACULTY_ROLES)
  checkDuplicate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DupBody)) b: z.infer<typeof DupBody>) {
    const doi = b.doi ? normalizeDoi(b.doi) : null;
    if (b.doi && !doi) throw new BadRequestException({ message: 'That is not a valid DOI', code: 'INVALID_DOI' });
    return this.db.withTenant(p.tenantId, async (tx) => ({ duplicate: await duplicateOf(tx, { doi, title: b.title, year: b.year }) }));
  }

  /** Fills in records kept while the registry was unreachable (the caller's own; the office's: everyone's), up to 50 at a time. */
  @Post('publications/refresh-pending')
  @HttpCode(200)
  @Auth('user', FACULTY_ROLES)
  async refreshPending(@CurrentPrincipal() p: UserPrincipal) {
    const pending = await this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: publications.id, doi: publications.doi })
        .from(publications)
        .where(and(eq(publications.metadataSource, 'pending'), hasRole(p, RESEARCH_ROLES) ? undefined : eq(publications.ownerUserId, p.userId)))
        .orderBy(asc(publications.createdAt))
        .limit(50),
    );
    let updated = 0;
    let offline = 0;
    for (const row of pending) {
      if (!row.doi) continue;
      const { source, record } = await this.doi.lookup(p.tenantId, row.doi);
      if (!record) {
        if (source === 'offline') offline++;
        continue;
      }
      await this.db.withTenant(p.tenantId, async (tx) => {
        await tx.update(publications).set({ title: record.title, venue: record.venue, year: record.year, kind: record.kind, issn: record.issn, ...(record.authors.length ? { authors: record.authors } : {}), metadataSource: 'crossref' }).where(eq(publications.id, row.id));
        await auditUser(tx, p, 'research.publication_completed', 'publication', row.id, { doi: row.doi });
      });
      updated++;
    }
    return { checked: pending.length, updated, stillPending: pending.length - updated, registryOffline: offline > 0 };
  }

  // ---- funded projects: the grant statement ------------------------------------------------------

  private async statement(tx: Tx, p: UserPrincipal, id: string, fromQ?: string, toQ?: string) {
    const [g] = await tx.select({ g: researchGrants, code: researchProjects.code, title: researchProjects.title, pi: researchProjects.piUserId, piName: users.fullName }).from(researchGrants).innerJoin(researchProjects, eq(researchProjects.id, researchGrants.projectId)).innerJoin(users, eq(users.id, researchProjects.piUserId)).where(eq(researchGrants.id, id));
    if (!g) throw new NotFoundException('Grant not found');
    if (!hasRole(p, RESEARCH_VIEW_ROLES) && g.pi !== p.userId) {
      const [m] = (await tx.execute(sql`select 1 from project_members where project_id = ${g.g.projectId} and user_id = ${p.userId} limit 1`)).rows;
      if (!m) throw new NotFoundException('Grant not found');
    }
    const from = fromQ && Day.safeParse(fromQ).success ? fromQ : g.g.startsOn;
    const to = toQ && Day.safeParse(toQ).success ? toQ : (await tenantToday(tx, this.clock)) < g.g.endsOn ? await tenantToday(tx, this.clock) : g.g.endsOn;
    if (to < from) throw new BadRequestException('The period ends before it starts');
    const heads = await tx.select().from(researchGrantHeads).where(eq(researchGrantHeads.grantId, id)).orderBy(asc(researchGrantHeads.head));
    const releases = await tx.select().from(researchGrantReleases).where(eq(researchGrantReleases.grantId, id)).orderBy(asc(researchGrantReleases.instalment));
    const expenses = await tx.select({ head: grantExpenses.head, budgetHead: grantExpenses.budgetHead, amountPaise: grantExpenses.amountPaise, spentOn: grantExpenses.spentOn }).from(grantExpenses).where(eq(grantExpenses.grantId, id));
    const uc = ucFigures(releases.map((r) => ({ on: r.receivedOn ?? r.releasedOn, amountPaise: r.amountPaise })), expenses.map((e) => ({ on: e.spentOn, amountPaise: e.amountPaise })), from, to);
    const releasedPaise = releases.reduce((s, r) => s + r.amountPaise, 0);
    const spentPaise = expenses.reduce((s, e) => s + e.amountPaise, 0);
    const byHead = heads.map((h) => {
      const all = expenses.filter((e) => e.budgetHead === h.head);
      const inPeriod = all.filter((e) => e.spentOn >= from && e.spentOn <= to).reduce((s, e) => s + e.amountPaise, 0);
      const spent = all.reduce((s, e) => s + e.amountPaise, 0);
      return { head: h.head, sanctionedPaise: h.sanctionedPaise, spentPaise: spent, spentInPeriodPaise: inPeriod, balancePaise: h.sanctionedPaise - spent };
    });
    const unheaded = expenses.filter((e) => !e.budgetHead || !heads.some((h) => h.head === e.budgetHead)).reduce((s, e) => s + e.amountPaise, 0);
    return {
      grant: { id, agency: g.g.agency, agencyKind: g.g.agencyKind, scheme: g.g.scheme, sanctionRef: g.g.sanctionRef, project: `${g.code} ${g.title}`, pi: g.piName, startsOn: g.g.startsOn, endsOn: g.g.endsOn, status: g.g.status },
      period: { from, to },
      sanctionedPaise: g.g.sanctionedPaise,
      releasedPaise,
      pendingReleasePaise: g.g.sanctionedPaise - releasedPaise,
      spentPaise,
      unspentPaise: releasedPaise - spentPaise,
      overheadPct: g.g.overheadPct,
      overheadPaise: overheadPaise(releasedPaise, g.g.overheadPct),
      heads: byHead,
      unheadedSpentPaise: unheaded,
      releases: releases.map((r) => ({ instalment: r.instalment, releasedOn: r.releasedOn, receivedOn: r.receivedOn, amountPaise: r.amountPaise, reference: r.reference })),
      uc,
    };
  }

  @Get('grants/:id/statement')
  @Auth('user', FACULTY_ROLES)
  grantStatement(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.statement(tx, p, id, from, to));
  }

  /** The statement as a workbook: the GFR 12-A utilisation figures, heads and releases. */
  @Get('grants/:id/statement.xlsx')
  @Auth('user', FACULTY_ROLES)
  async grantStatementXlsx(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response, @Param('id', ParseUUIDPipe) id: string, @Query('from') from?: string, @Query('to') to?: string) {
    const d = await this.db.withTenant(p.tenantId, (tx) => this.statement(tx, p, id, from, to));
    const r = (n: number) => n / 100;
    const sheets: Sheet[] = [
      { name: 'Utilisation certificate', rows: [['Utilisation certificate (GFR 2017, form 12-A)'], [`${d.grant.agency} ${d.grant.scheme} · ${d.grant.sanctionRef ?? ''}`], [d.grant.project], [`Principal investigator: ${d.grant.pi}`], [`Period ${d.period.from} to ${d.period.to}`], [], ['Item', 'Amount (INR)'], ['Unspent balance at the start of the period', r(d.uc.openingPaise)], ['Received during the period', r(d.uc.receivedPaise)], ['Total available', r(d.uc.availablePaise)], ['Spent during the period', r(d.uc.spentPaise)], ['Unspent balance at the end of the period', r(d.uc.closingPaise)], [], ['Sanctioned', r(d.sanctionedPaise)], ['Released so far', r(d.releasedPaise)], ['Overhead to the institution', r(d.overheadPaise)]], widths: [48, 18], title: [0], header: [6] },
      { name: 'Budget heads', rows: [['Head', 'Sanctioned (INR)', 'Spent in the period (INR)', 'Spent to date (INR)', 'Balance (INR)'], ...d.heads.map((h) => [h.head, r(h.sanctionedPaise), r(h.spentInPeriodPaise), r(h.spentPaise), r(h.balancePaise)])], widths: [20, 18, 22, 18, 16], header: [0] },
      { name: 'Releases', rows: [['Instalment', 'Released on', 'Received on', 'Amount (INR)', 'Reference'], ...d.releases.map((x) => [x.instalment, x.releasedOn, x.receivedOn, r(x.amountPaise), x.reference])], widths: [12, 14, 14, 16, 24], header: [0] },
    ];
    await this.db.withTenant(p.tenantId, (tx) => auditUser(tx, p, 'research.grant_statement_exported', 'grant', id, d.period));
    res.setHeader('content-type', XLSX);
    res.setHeader('content-disposition', `attachment; filename="grant-statement.xlsx"`);
    res.end(xlsx(sheets, this.clock.now()));
  }

  // ---- incentives -------------------------------------------------------------------------------

  /**
   * A teacher claims an incentive for their own paper or patent. The amount comes from the scheme: the best rate the
   * paper qualifies for, a co-author's share, cut to what is left of the yearly cap. One claim per scheme and paper.
   */
  @Post('incentives/claims')
  @Auth('user', FACULTY_ROLES)
  claim(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ClaimBody)) b: z.infer<typeof ClaimBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(researchIncentiveSchemes).where(eq(researchIncentiveSchemes.id, b.schemeId));
      if (!s) throw new NotFoundException('Scheme not found');
      const today = await tenantToday(tx, this.clock);
      if (!s.active || (s.validFrom && today < s.validFrom) || (s.validUntil && today > s.validUntil)) throw new ConflictException({ message: 'This scheme is not open for claims', code: 'SCHEME_CLOSED' });
      const rules = (await qualitySettings(tx, p.tenantId, 'research')).rules;
      let basis: { basis: string; ratePaise: number } | null;
      let first = true;
      if (b.publicationId) {
        if (s.kind !== 'publication') throw new ConflictException('This scheme is for patents');
        const [pub] = await tx.select().from(publications).where(eq(publications.id, b.publicationId));
        if (!pub) throw new NotFoundException('Publication not found');
        const authors = pub.authors as { name: string; userId?: string }[];
        const mine = pub.ownerUserId === p.userId || authors.some((a) => a.userId === p.userId);
        if (!mine) throw new ForbiddenException('You can claim only for your own publications');
        first = authors.length ? authors[0].userId === p.userId || (!authors[0].userId && pub.ownerUserId === p.userId) : true;
        if (s.validFrom && pub.year < Number(s.validFrom.slice(0, 4)) - 1) throw new ConflictException({ message: 'This paper is older than the scheme covers', code: 'OUT_OF_PERIOD' });
        basis = paperBasis(pub, s.rates);
      } else {
        if (s.kind !== 'patent') throw new ConflictException('This scheme is for publications');
        const [pat] = await tx.select().from(patents).where(eq(patents.id, b.patentId!));
        if (!pat) throw new NotFoundException('Patent not found');
        const inventors = pat.inventors as { name: string; userId?: string }[];
        if (pat.ownerUserId !== p.userId && !inventors.some((a) => a.userId === p.userId)) throw new ForbiddenException('You can claim only for your own patents');
        first = inventors.length ? inventors[0].userId === p.userId || (!inventors[0].userId && pat.ownerUserId === p.userId) : true;
        basis = pat.status === 'granted' && s.rates.granted ? { basis: 'granted', ratePaise: s.rates.granted } : ['published', 'granted'].includes(pat.status) && s.rates.published ? { basis: 'published', ratePaise: s.rates.published } : null;
      }
      if (!basis) throw new ConflictException({ message: 'Nothing under this scheme applies to it', code: 'NOT_ELIGIBLE' });
      const fy = financialYear(today);
      const [{ v: already }] = await tx.select({ v: sql<number>`coalesce(sum(${researchIncentiveClaims.amountPaise}), 0)::bigint`.mapWith(Number) }).from(researchIncentiveClaims).where(and(eq(researchIncentiveClaims.schemeId, s.id), eq(researchIncentiveClaims.userId, p.userId), sql`${researchIncentiveClaims.status} <> 'rejected'`, sql`(${researchIncentiveClaims.createdAt} at time zone 'Asia/Kolkata')::date between ${fy.from}::date and ${fy.to}::date`));
      const amount = incentiveAmount(basis.ratePaise, first, Number(rules.coAuthorIncentivePct ?? 50), s.capPerYearPaise, already);
      if (amount <= 0) throw new ConflictException({ message: `You have reached this scheme's limit for ${fy.label}`, code: 'CAP_REACHED' });
      const label = `${basis.basis}${first ? '' : ` (co-author, ${rules.coAuthorIncentivePct ?? 50}%)`}`;
      const [row] = await tx.insert(researchIncentiveClaims).values({ tenantId: p.tenantId, schemeId: s.id, userId: p.userId, publicationId: b.publicationId ?? null, patentId: b.patentId ?? null, basis: label, amountPaise: amount }).onConflictDoNothing().returning();
      if (!row) throw new ConflictException({ message: 'You have already claimed for this under the scheme', code: 'ALREADY_CLAIMED' });
      await auditUser(tx, p, 'research.incentive_claimed', 'incentive_claim', row.id, { schemeId: s.id, basis: label, amountPaise: amount });
      return row;
    });
  }

  // ---- reports ----------------------------------------------------------------------------------

  /** The NIRF RP ratios (PU, QP, FPPP, IPR) for the three financial years ending with `toYear` (the last completed by default). */
  @Get('reports/nirf-params')
  @Auth('user', RESEARCH_VIEW_ROLES)
  nirfParams(@CurrentPrincipal() p: UserPrincipal, @Query('toYear') toQ?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock);
      const last = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4)) - 2;
      const to = toQ && /^\d{4}$/.test(toQ) ? Number(toQ) : last;
      const ys = [to - 2, to - 1, to];
      const one = async <T>(q: ReturnType<typeof sql>) => ((await tx.execute(q)).rows as T[])[0];
      const years = [];
      for (const y of ys) {
        const from = `${y}-04-01`;
        const end = `${y + 1}-03-31`;
        const f = await one<{ n: number }>(sql`select count(distinct sp.user_id)::int as n from staff_profiles sp join user_roles r on r.user_id = sp.user_id and r.role in ('teacher', 'hod', 'principal')
          where coalesce(sp.date_of_joining, '1900-01-01') <= ${end}::date and (sp.date_of_leaving is null or sp.date_of_leaving >= ${from}::date)`);
        const pub = await one<{ n: number; c: number }>(sql`select count(*)::int as n, coalesce(sum(citations), 0)::int as c from publications where year = ${y} and status <> 'retracted' and (indexed_in && array['scopus', 'wos']::text[])`);
        const rs = await one<{ v: number }>(sql`select coalesce(sum(r.amount_paise), 0)::float8 as v from research_grant_releases r join research_grants g on g.id = r.grant_id where g.status <> 'cancelled' and coalesce(r.received_on, r.released_on) between ${from}::date and ${end}::date`);
        const rsNoRel = await one<{ v: number }>(sql`select coalesce(sum(g.sanctioned_paise), 0)::float8 as v from research_grants g where g.status <> 'cancelled' and g.starts_on between ${from}::date and ${end}::date and not exists (select 1 from research_grant_releases r where r.grant_id = g.id)`);
        const cs = await one<{ v: number }>(sql`select coalesce(sum(received_paise), 0)::float8 as v from research_consultancies where status <> 'cancelled' and coalesce(starts_on, created_at::date) between ${from}::date and ${end}::date`);
        years.push({ fy: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, calendarYear: y, faculty: f.n, papers: pub.n, citations: pub.c, researchPaise: Number(rs.v) + Number(rsNoRel.v), consultancyPaise: Number(cs.v) });
      }
      const pt = await one<{ published: number; granted: number }>(sql`select count(*) filter (where status in ('published', 'granted') and coalesce(published_on, filed_on) between ${`${to - 2}-01-01`}::date and ${`${to}-12-31`}::date)::int as published,
        count(*) filter (where status = 'granted' and granted_on between ${`${to - 2}-01-01`}::date and ${`${to}-12-31`}::date)::int as granted from patents`);
      const ratios = nirfRatios({ faculty: years.map((y) => y.faculty), papers: years.map((y) => y.papers), citations: years.map((y) => y.citations), researchPaise: years.map((y) => y.researchPaise), consultancyPaise: years.map((y) => y.consultancyPaise), patentsPublished: pt.published, patentsGranted: pt.granted });
      return { toYear: to, years, ...ratios, note: 'NIRF scores these against all participating institutions; these are the institution\'s own inputs and ratios.' };
    });
  }

  private async nba(tx: Tx, yearQ?: string, departmentId?: string) {
    const today = await tenantToday(tx, this.clock);
    const cur = Number(today.slice(5, 7)) >= 6 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
    const cay = yearQ && /^\d{4}$/.test(yearQ) ? Number(yearQ) : cur - 1;
    const ys = windowOf(String(cay), 3, yearOf(String(cur)).label).reverse();
    const dept = departmentId && z.uuid().safeParse(departmentId).success ? departmentId : null;
    const inDept = (col: ReturnType<typeof sql>) => (dept ? sql`and ${col} = ${dept}` : sql``);
    const rows = [];
    for (const [i, y] of ys.entries()) {
      const q = async (s: ReturnType<typeof sql>) => ((await tx.execute(s)).rows[0] as Record<string, number>);
      const pubs = await q(sql`select count(*) filter (where p.kind = 'journal')::int as journals, count(*) filter (where p.kind = 'conference')::int as conferences, count(*) filter (where p.kind in ('book', 'book_chapter'))::int as books,
          count(*) filter (where p.indexed_in && array['scopus', 'wos']::text[])::int as indexed
        from publications p left join staff_profiles sp on sp.user_id = p.owner_user_id where p.year = ${y.cal} and p.status <> 'retracted' ${inDept(sql`coalesce(p.department_id, sp.department_id)`)}`);
      const phd = await q(sql`select count(*) filter (where s.status = 'awarded' and s.completed_on between ${y.from}::date and ${y.to}::date)::int as awarded,
          count(*) filter (where s.enrolled_on <= ${y.to}::date and (s.status in ('enrolled', 'thesis_submitted') or s.completed_on > ${y.to}::date))::int as guiding
        from research_scholars s left join staff_profiles sp on sp.user_id = s.supervisor_user_id where true ${inDept(sql`coalesce(s.department_id, sp.department_id)`)}`);
      const sr = await q(sql`select count(*)::int as projects, coalesce(round(sum(g.sanctioned_paise) / 1e7, 2), 0)::float8 as lakhs from research_grants g join research_projects rp on rp.id = g.project_id where g.status <> 'cancelled' and g.starts_on between ${y.from}::date and ${y.to}::date ${inDept(sql`rp.department_id`)}`);
      const cs = await q(sql`select count(*)::int as projects, coalesce(round(sum(received_paise) / 1e7, 2), 0)::float8 as lakhs from research_consultancies where status <> 'cancelled' and coalesce(starts_on, created_at::date) between ${y.from}::date and ${y.to}::date ${inDept(sql`department_id`)}`);
      const ip = await q(sql`select count(*) filter (where status in ('filed', 'published', 'granted') and filed_on between ${y.from}::date and ${y.to}::date)::int as filed, count(*) filter (where status = 'granted' and granted_on between ${y.from}::date and ${y.to}::date)::int as granted from patents where true ${inDept(sql`department_id`)}`);
      const fdp = await q(sql`select count(*)::int as n from conferences c left join staff_profiles sp on sp.user_id = c.user_id where c.role = 'organised' and c.held_on between ${y.from}::date and ${y.to}::date ${inDept(sql`sp.department_id`)}`);
      rows.push({ label: i === 0 ? 'CAY' : `CAYm${i}`, year: y.label, journals: pubs.journals, conferences: pubs.conferences, books: pubs.books, indexed: pubs.indexed, phdAwarded: phd.awarded, phdGuiding: phd.guiding, sponsoredProjects: sr.projects, sponsoredLakhs: Number(sr.lakhs), consultancyProjects: cs.projects, consultancyLakhs: Number(cs.lakhs), patentsFiled: ip.filed, patentsGranted: ip.granted, eventsOrganised: fdp.n });
    }
    return { departmentId: dept, years: rows, sponsoredLakhsTotal: Math.round(rows.reduce((s, r) => s + r.sponsoredLakhs, 0) * 100) / 100, consultancyLakhsTotal: Math.round(rows.reduce((s, r) => s + r.consultancyLakhs, 0) * 100) / 100 };
  }

  /** NBA SAR criterion 5 (faculty research and development) for CAY, CAYm1 and CAYm2, for a department or the institution. */
  @Get('reports/nba')
  @Auth('user', RESEARCH_VIEW_ROLES)
  nbaReport(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string, @Query('departmentId') departmentId?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.nba(tx, year, departmentId));
  }

  private async aishe(tx: Tx, yearQ?: string) {
    const today = await tenantToday(tx, this.clock);
    const cur = Number(today.slice(5, 7)) >= 6 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
    const y = yearOf(String(yearQ && /^\d{4}$/.test(yearQ) ? Number(yearQ) : cur - 1));
    // AISHE counts enrolment as on 30 September of the survey year.
    const asOn = `${y.cal}-09-30`;
    const enrolled = (await tx.execute(sql`select coalesce(d.name, 'Not set') as department, s.mode, coalesce(s.category, 'general') as category, coalesce(s.gender, 'not_given') as gender, count(*)::int as n
      from research_scholars s left join departments d on d.id = s.department_id
      where s.programme = 'phd' and s.enrolled_on <= ${asOn}::date and (s.status in ('enrolled', 'thesis_submitted') or s.completed_on > ${asOn}::date)
      group by 1, 2, 3, 4 order by 1, 2, 3, 4`)).rows as { department: string; mode: string; category: string; gender: string; n: number }[];
    const awarded = (await tx.execute(sql`select coalesce(d.name, 'Not set') as department, coalesce(s.gender, 'not_given') as gender, count(*)::int as n from research_scholars s left join departments d on d.id = s.department_id
      where s.programme = 'phd' and s.status = 'awarded' and s.completed_on between ${y.from}::date and ${y.to}::date group by 1, 2 order by 1, 2`)).rows as { department: string; gender: string; n: number }[];
    const fellowships = (await tx.execute(sql`select s.fellowship, coalesce(s.fellowship_agency, '') as agency, count(*)::int as n from research_scholars s
      where s.fellowship <> 'none' and s.enrolled_on <= ${asOn}::date and (s.status in ('enrolled', 'thesis_submitted') or s.completed_on > ${asOn}::date) group by 1, 2 order by 1, 2`)).rows as { fellowship: string; agency: string; n: number }[];
    const departments = [...new Set(enrolled.map((e) => e.department))];
    const table = departments.map((department) => {
      const of = (f: (e: (typeof enrolled)[number]) => boolean) => enrolled.filter((e) => e.department === department && f(e)).reduce((s, e) => s + e.n, 0);
      return {
        department,
        total: of(() => true),
        female: of((e) => e.gender === 'female'),
        fullTime: of((e) => e.mode === 'full_time'),
        partTime: of((e) => e.mode === 'part_time'),
        sc: of((e) => e.category === 'sc'),
        st: of((e) => e.category === 'st'),
        obc: of((e) => e.category === 'obc'),
        ews: of((e) => e.category === 'ews'),
        general: of((e) => e.category === 'general'),
      };
    });
    return { year: y.label, asOn, enrolment: table, awarded: departments.concat(awarded.map((a) => a.department).filter((d) => !departments.includes(d))).map((department) => ({ department, total: awarded.filter((a) => a.department === department).reduce((s, a) => s + a.n, 0), female: awarded.filter((a) => a.department === department && a.gender === 'female').reduce((s, a) => s + a.n, 0) })).filter((r) => r.total > 0), fellowships };
  }

  /** AISHE: Ph.D. enrolment as on 30 September by department, mode, category and women; Ph.D.s awarded; fellowships. */
  @Get('reports/aishe')
  @Auth('user', RESEARCH_VIEW_ROLES)
  aisheReport(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.aishe(tx, year));
  }

  /** NBA criterion 5 and AISHE tables as one workbook. */
  @Get('reports/nba-aishe.xlsx')
  @Auth('user', RESEARCH_VIEW_ROLES)
  async nbaAisheXlsx(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response, @Query('year') year?: string, @Query('departmentId') departmentId?: string) {
    const { n, a } = await this.db.withTenant(p.tenantId, async (tx) => ({ n: await this.nba(tx, year, departmentId), a: await this.aishe(tx, year) }));
    const sheets: Sheet[] = [
      { name: 'NBA criterion 5', rows: [['Item', ...n.years.map((y) => `${y.label} (${y.year})`)], ['Papers in journals', ...n.years.map((y) => y.journals)], ['Papers in conferences', ...n.years.map((y) => y.conferences)], ['Books and chapters', ...n.years.map((y) => y.books)], ['Indexed in Scopus or Web of Science', ...n.years.map((y) => y.indexed)], ['Ph.D.s awarded', ...n.years.map((y) => y.phdAwarded)], ['Ph.D. scholars being guided', ...n.years.map((y) => y.phdGuiding)], ['Sponsored projects', ...n.years.map((y) => y.sponsoredProjects)], ['Sponsored research (INR lakhs)', ...n.years.map((y) => y.sponsoredLakhs)], ['Consultancy projects', ...n.years.map((y) => y.consultancyProjects)], ['Consultancy (INR lakhs)', ...n.years.map((y) => y.consultancyLakhs)], ['Patents filed', ...n.years.map((y) => y.patentsFiled)], ['Patents granted', ...n.years.map((y) => y.patentsGranted)], ['Seminars, workshops and FDPs organised', ...n.years.map((y) => y.eventsOrganised)]], widths: [40, 18, 18, 18], header: [0] },
      { name: 'AISHE PhD enrolment', rows: [[`Ph.D. enrolment as on ${a.asOn}`], ['Department', 'Total', 'Women', 'Full time', 'Part time', 'General', 'SC', 'ST', 'OBC', 'EWS'], ...a.enrolment.map((r) => [r.department, r.total, r.female, r.fullTime, r.partTime, r.general, r.sc, r.st, r.obc, r.ews])], widths: [30, 10, 10, 10, 10, 10, 8, 8, 8, 8], title: [0], header: [1] },
      { name: 'AISHE PhD awarded', rows: [[`Ph.D.s awarded in ${a.year}`], ['Department', 'Total', 'Women'], ...a.awarded.map((r) => [r.department, r.total, r.female])], widths: [30, 10, 10], title: [0], header: [1] },
      { name: 'Fellowships', rows: [['Fellowship', 'Agency', 'Scholars'], ...a.fellowships.map((f) => [f.fellowship.toUpperCase(), f.agency, f.n])], widths: [16, 30, 10], header: [0] },
    ];
    await this.db.withTenant(p.tenantId, (tx) => auditUser(tx, p, 'research.nba_aishe_exported', 'research', undefined, { year: a.year }));
    res.setHeader('content-type', XLSX);
    res.setHeader('content-disposition', `attachment; filename="research-nba-aishe-${a.year}.xlsx"`);
    res.end(xlsx(sheets, this.clock.now()));
  }
}
