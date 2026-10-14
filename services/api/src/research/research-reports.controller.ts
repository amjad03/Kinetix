import { BadGatewayException, BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Post, Query, Res } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { windowOf, yearOf, SourceCache } from '../accreditation/sources.js';
import { xlsx, type Sheet } from '../accreditation/xlsx.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { publications, userRoles, users } from '../db/schema.js';
import { hasRole } from '../placements/placements.access.js';
import { DoiResolver } from './doi.js';
import { normalizeOrcid, OrcidResolver, validOrcid } from './orcid.js';
import { hIndex, normalizeDoi } from './research-rules.js';
import { FACULTY_ROLES, RESEARCH_ROLES, RESEARCH_VIEW_ROLES } from './roles.js';

const OrcidBody = z.object({ orcid: z.string().trim().min(16).max(60), ownerUserId: z.uuid().optional() });
const KINDS: Record<string, 'journal' | 'conference' | 'book' | 'book_chapter'> = { 'journal-article': 'journal', 'conference-paper': 'conference', book: 'book', 'book-chapter': 'book_chapter' };
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The academic year label (2025-26) that holds a date. */
const yearLabel = (d: string) => {
  const y = Number(d.slice(0, 4));
  return Number(d.slice(5, 7)) >= 6 ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : `${y - 1}-${String(y % 100).padStart(2, '0')}`;
};

/**
 * Research reports and imports: works from ORCID, a faculty member's research profile (with the h-index from the
 * citations recorded), the NIRF research and professional practice (RP) data for three financial years, and the NAAC
 * criterion 3 figures year by year, each also as an Excel workbook.
 */
@Controller('v1/research')
export class ResearchReportsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly orcid: OrcidResolver,
    private readonly doi: DoiResolver,
  ) {}

  /** Records the public works of an ORCID iD that are not yet recorded (by DOI, else by title and year); DOIs are read from Crossref. */
  @Post('publications/import-orcid')
  @HttpCode(200)
  @Auth('user', FACULTY_ROLES)
  async importOrcid(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(OrcidBody)) b: z.infer<typeof OrcidBody>) {
    const id = normalizeOrcid(b.orcid);
    if (!validOrcid(id)) throw new BadRequestException({ message: 'That is not a valid ORCID iD (like 0000-0002-1825-0097)', code: 'INVALID_ORCID' });
    const owner = b.ownerUserId && hasRole(p, RESEARCH_ROLES) ? b.ownerUserId : p.userId;
    let works;
    try {
      works = await this.orcid.works(id);
    } catch {
      throw new BadGatewayException('ORCID could not be reached. Try again in a moment.');
    }
    if (!works) throw new NotFoundException('No public record has that ORCID iD');
    // Registry look-ups happen before the transaction so a slow registry does not hold it.
    const detail = new Map<string, Awaited<ReturnType<DoiResolver['resolve']>>>();
    for (const w of works) {
      const doi = w.doi ? normalizeDoi(w.doi) : null;
      if (doi && !detail.has(doi)) detail.set(doi, await this.doi.resolve(doi).catch(() => null));
    }
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [me] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, owner));
      if (!me) throw new NotFoundException('Teacher not found');
      let added = 0;
      let skipped = 0;
      let incomplete = 0;
      for (const w of works) {
        const doi = w.doi ? normalizeDoi(w.doi) : null;
        const rec = doi ? detail.get(doi) : null;
        const title = rec?.title ?? w.title;
        const year = rec?.year ?? w.year;
        if (!year) {
          incomplete++;
          continue;
        }
        const [dup] = await tx
          .select({ id: publications.id })
          .from(publications)
          .where(doi ? sql`lower(${publications.doi}) = ${doi.toLowerCase()}` : and(sql`lower(${publications.title}) = ${title.toLowerCase()}`, eq(publications.year, year)))
          .limit(1);
        if (dup) {
          skipped++;
          continue;
        }
        const authors = rec?.authors?.length ? rec.authors : [{ name: me.name, userId: owner }];
        await tx.insert(publications).values({ tenantId: p.tenantId, ownerUserId: owner, title, kind: rec?.kind ?? KINDS[w.type] ?? 'journal', venue: rec?.venue ?? w.venue ?? 'Unknown venue', year, doi, issn: rec?.issn ?? null, authors });
        added++;
      }
      await auditUser(tx, p, 'research.orcid_imported', 'user', owner, { orcid: id, found: works.length, added, skipped });
      return { found: works.length, added, skipped, incomplete };
    });
  }

  // ---- faculty research profile -----------------------------------------------------------------

  /** One teacher's research: publications (as owner or co-author, retracted ones apart), citations and h-index, projects, grants, IPR, consultancy, recognitions and scholars. */
  @Get('reports/faculty-profile')
  @Auth('user', FACULTY_ROLES)
  profile(@CurrentPrincipal() p: UserPrincipal, @Query('userId') userId?: string) {
    const who = userId && z.uuid().safeParse(userId).success ? userId : p.userId;
    if (who !== p.userId && !hasRole(p, RESEARCH_VIEW_ROLES)) throw new ForbiddenException("Your account doesn't have access to this.");
    return this.db.withTenant(p.tenantId, (tx) => this.profileOf(tx, who));
  }

  @Get('reports/faculty-profile.xlsx')
  @Auth('user', FACULTY_ROLES)
  async profileXlsx(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response, @Query('userId') userId?: string) {
    const who = userId && z.uuid().safeParse(userId).success ? userId : p.userId;
    if (who !== p.userId && !hasRole(p, RESEARCH_VIEW_ROLES)) throw new ForbiddenException("Your account doesn't have access to this.");
    const d = await this.db.withTenant(p.tenantId, (tx) => this.profileOf(tx, who));
    const sheets: Sheet[] = [
      { name: 'Summary', rows: [[`Research profile: ${d.person.name}`], [d.person.department ?? ''], [], ['Item', 'Figure'], ['Publications', d.summary.publications], ['Indexed (Scopus / Web of Science / UGC-CARE)', d.summary.indexed], ['Citations', d.summary.citations], ['h-index', d.summary.hIndex], ['i10-index', d.summary.i10], ['Retracted papers', d.summary.retracted], ['Projects as investigator', d.summary.projects], ['Grants (INR lakhs)', d.summary.grantLakhs], ['Patents filed / granted', `${d.summary.patents} / ${d.summary.patentsGranted}`], ['Consultancy (INR lakhs)', d.summary.consultancyLakhs], ['Recognitions', d.summary.recognitions], ['Scholars supervised / awarded', `${d.summary.scholars} / ${d.summary.scholarsAwarded}`]], widths: [50, 20], title: [0], header: [3] },
      { name: 'Publications', rows: [['Title', 'Kind', 'Venue', 'Year', 'DOI', 'Indexed in', 'Citations', 'Status'], ...d.publications.map((x) => [x.title, x.kind, x.venue, x.year, x.doi, x.indexed, x.citations, x.status])], widths: [60, 12, 40, 8, 26, 20, 10, 12], header: [0], freeze: 1 },
      { name: 'Projects and grants', rows: [['Project', 'Role', 'Sponsor', 'Starts', 'Status', 'Grants (INR lakhs)'], ...d.projects.map((x) => [x.title, x.role, x.sponsor, x.startsOn, x.status, x.lakhs])], widths: [50, 14, 30, 12, 12, 14], header: [0] },
      { name: 'IPR', rows: [['Title', 'Kind', 'Application no.', 'Filed on', 'Status'], ...d.patents.map((x) => [x.title, x.kind, x.applicationNo, x.filedOn, x.status])], widths: [50, 12, 20, 12, 12], header: [0] },
      { name: 'Recognitions', rows: [['Kind', 'Title', 'Body', 'Level', 'Received on'], ...d.recognitions.map((x) => [x.kind, x.title, x.body, x.level, x.receivedOn])], widths: [16, 40, 30, 14, 12], header: [0] },
    ];
    res.setHeader('content-type', XLSX);
    res.setHeader('content-disposition', `attachment; filename="research-profile.xlsx"`);
    res.end(xlsx(sheets, this.clock.now()));
  }

  private async profileOf(tx: Tx, who: string) {
    const q = async <T>(s: ReturnType<typeof sql>) => (await tx.execute(s)).rows as T[];
    const [person] = await q<{ name: string; department: string | null }>(sql`select u.full_name as name, (select d.name from staff_profiles sp join departments d on d.id = sp.department_id where sp.user_id = u.id) as department from users u where u.id = ${who}`);
    if (!person) throw new NotFoundException('Teacher not found');
    const pubs = await q<{ id: string; title: string; kind: string; venue: string; year: number; doi: string | null; indexed: string; citations: number; status: string }>(sql`select id, title, kind, venue, year, doi, array_to_string(indexed_in, ', ') as indexed, citations, status from publications
      where owner_user_id = ${who} or authors @> ${JSON.stringify([{ userId: who }])}::jsonb order by year desc, title`);
    const live = pubs.filter((x) => x.status !== 'retracted');
    const projects = await q<{ title: string; role: string; sponsor: string; startsOn: string; status: string; lakhs: number }>(sql`select p.code || ' ' || p.title as title, case when p.pi_user_id = ${who} then 'Investigator' else coalesce((select m.role from project_members m where m.project_id = p.id and m.user_id = ${who} limit 1), '') end as role,
      coalesce(p.sponsor_org, '') as sponsor, p.starts_on::text as "startsOn", p.status, coalesce((select sum(g.sanctioned_paise) from research_grants g where g.project_id = p.id), 0)::float8 / 1e7 as lakhs
      from research_projects p where p.pi_user_id = ${who} or exists (select 1 from project_members m where m.project_id = p.id and m.user_id = ${who}) order by p.starts_on desc`);
    const patents = await q<{ title: string; kind: string; applicationNo: string | null; filedOn: string | null; status: string }>(sql`select title, kind, application_no as "applicationNo", filed_on::text as "filedOn", status from patents where owner_user_id = ${who} or inventors @> ${JSON.stringify([{ userId: who }])}::jsonb order by filed_on desc nulls last`);
    const recognitions = await q<{ kind: string; title: string; body: string; level: string; receivedOn: string }>(sql`select kind, title, body, level, received_on::text as "receivedOn" from research_recognitions where user_id = ${who} order by received_on desc`);
    const [c] = await q<{ lakhs: number }>(sql`select coalesce(sum(received_paise), 0)::float8 / 1e7 as lakhs from research_consultancies where lead_user_id = ${who} and status <> 'cancelled'`);
    const [s] = await q<{ n: number; awarded: number }>(sql`select count(*)::int as n, count(*) filter (where status = 'awarded')::int as awarded from research_scholars where supervisor_user_id = ${who}`);
    const citations = live.map((x) => Number(x.citations) || 0);
    return {
      person,
      summary: {
        publications: live.length,
        indexed: live.filter((x) => /scopus|wos|ugc_care/.test(x.indexed)).length,
        citations: citations.reduce((a, b) => a + b, 0),
        hIndex: hIndex(citations),
        i10: citations.filter((x) => x >= 10).length,
        retracted: pubs.length - live.length,
        projects: projects.filter((x) => x.role === 'Investigator').length,
        grantLakhs: Math.round(projects.filter((x) => x.role === 'Investigator').reduce((a, x) => a + Number(x.lakhs), 0) * 100) / 100,
        patents: patents.filter((x) => x.status !== 'draft').length,
        patentsGranted: patents.filter((x) => x.status === 'granted').length,
        consultancyLakhs: Math.round(Number(c.lakhs) * 100) / 100,
        recognitions: recognitions.length,
        scholars: s.n,
        scholarsAwarded: s.awarded,
      },
      publications: pubs,
      projects,
      patents,
      recognitions,
    };
  }

  /** Teachers with any research record, for the profile picker. */
  @Get('reports/faculty')
  @Auth('user', RESEARCH_VIEW_ROLES)
  faculty(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      (
        await tx.execute(sql`select u.id, u.full_name as name,
          (select count(*)::int from publications x where (x.owner_user_id = u.id or x.authors @> jsonb_build_array(jsonb_build_object('userId', u.id::text))) and x.status <> 'retracted') as publications,
          coalesce((select sum(x.citations)::int from publications x where (x.owner_user_id = u.id or x.authors @> jsonb_build_array(jsonb_build_object('userId', u.id::text))) and x.status <> 'retracted'), 0) as citations
          from users u where u.status = 'active' and exists (select 1 from ${userRoles} r where r.user_id = u.id and r.role in ('teacher', 'hod', 'principal', 'research_coordinator')) order by u.full_name`)
      ).rows,
    );
  }

  // ---- NIRF research and professional practice --------------------------------------------------

  /**
   * NIRF RP data for the three financial years before `toYear` (default: the last completed one): sponsored research
   * and consultancy by financial year (projects, agencies or clients, amount), publications and IPR by calendar year.
   */
  @Get('reports/nirf-rp')
  @Auth('user', RESEARCH_VIEW_ROLES)
  async nirf(@CurrentPrincipal() p: UserPrincipal, @Query('toYear') toQ?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.nirfData(tx, toQ));
  }

  @Get('reports/nirf-rp.xlsx')
  @Auth('user', RESEARCH_VIEW_ROLES)
  async nirfXlsx(@CurrentPrincipal() p: UserPrincipal, @Res() res: Response, @Query('toYear') toQ?: string) {
    const d = await this.db.withTenant(p.tenantId, (tx) => this.nirfData(tx, toQ));
    const sheets: Sheet[] = [
      { name: 'Sponsored Research Details', rows: [['Financial Year', ...d.years.map((y) => y.fy)], ['Total no. of Sponsored Projects', ...d.years.map((y) => y.sponsoredProjects)], ['Total no. of Funding Agencies', ...d.years.map((y) => y.agencies)], ['Total Amount Received (Amount in Rupees)', ...d.years.map((y) => y.sponsoredRupees)]], widths: [44, 18, 18, 18], header: [0] },
      { name: 'Consultancy Project Details', rows: [['Financial Year', ...d.years.map((y) => y.fy)], ['Total no. of Consultancy Projects', ...d.years.map((y) => y.consultancyProjects)], ['Total no. of Client Organizations', ...d.years.map((y) => y.clients)], ['Total Amount Received (Amount in Rupees)', ...d.years.map((y) => y.consultancyRupees)]], widths: [44, 18, 18, 18], header: [0] },
      { name: 'Executive Development Programs', rows: [['Financial Year', ...d.years.map((y) => y.fy)], ['Total no. of Executive Development Programs / Management Development Programs', ...d.years.map((y) => y.trainingPrograms)], ['Total no. of Participants', ...d.years.map((y) => y.trainees)], ['Total Annual Earnings (Amount in Rupees)', ...d.years.map((y) => y.trainingRupees)]], widths: [60, 18, 18, 18], header: [0] },
      { name: 'Publications and IPR', rows: [['Calendar Year', ...d.calendar.map((y) => y.year)], ['Indexed publications', ...d.calendar.map((y) => y.indexed)], ['All publications', ...d.calendar.map((y) => y.publications)], ['Citations recorded', ...d.calendar.map((y) => y.citations)], ['No. of Patents Published', ...d.calendar.map((y) => y.patentsPublished)], ['No. of Patents Granted', ...d.calendar.map((y) => y.patentsGranted)], ['Earnings from patents (Amount in Rupees)', ...d.calendar.map((y) => y.licenceRupees)]], widths: [44, 14, 14, 14], header: [0] },
    ];
    await this.db.withTenant(p.tenantId, (tx) => auditUser(tx, p, 'research.nirf_rp_exported', 'research', undefined, { toYear: d.toYear }));
    res.setHeader('content-type', XLSX);
    res.setHeader('content-disposition', `attachment; filename="nirf-rp-${d.toYear}.xlsx"`);
    res.end(xlsx(sheets, this.clock.now()));
  }

  private async nirfData(tx: Tx, toQ?: string) {
    const today = await tenantToday(tx, this.clock);
    // The last completed financial year ends on 31 March before today.
    const lastFyStart = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4)) - 2;
    const to = toQ && /^\d{4}$/.test(toQ) ? Number(toQ) : lastFyStart;
    const fys = [to - 2, to - 1, to];
    const years = [];
    for (const y of fys) {
      const from = `${y}-04-01`;
      const end = `${y + 1}-03-31`;
      const [g] = (await tx.execute(sql`select count(distinct g.project_id)::int as projects, count(distinct lower(g.agency))::int as agencies, coalesce(sum(g.sanctioned_paise), 0)::float8 / 100 as rupees from research_grants g where g.status <> 'cancelled' and g.starts_on between ${from}::date and ${end}::date`)).rows as { projects: number; agencies: number; rupees: number }[];
      const [c] = (await tx.execute(sql`select count(*) filter (where kind <> 'corporate_training')::int as projects, count(distinct lower(client)) filter (where kind <> 'corporate_training')::int as clients, coalesce(sum(received_paise) filter (where kind <> 'corporate_training'), 0)::float8 / 100 as rupees,
          count(*) filter (where kind = 'corporate_training')::int as programs, coalesce(sum(trainees) filter (where kind = 'corporate_training'), 0)::int as trainees, coalesce(sum(received_paise) filter (where kind = 'corporate_training'), 0)::float8 / 100 as training
          from research_consultancies where status <> 'cancelled' and coalesce(starts_on, created_at::date) between ${from}::date and ${end}::date`)).rows as { projects: number; clients: number; rupees: number; programs: number; trainees: number; training: number }[];
      years.push({ fy: `${y}-${String((y + 1) % 100).padStart(2, '0')}`, sponsoredProjects: g.projects, agencies: g.agencies, sponsoredRupees: g.rupees, consultancyProjects: c.projects, clients: c.clients, consultancyRupees: c.rupees, trainingPrograms: c.programs, trainees: c.trainees, trainingRupees: c.training });
    }
    const calendar = [];
    for (const y of fys) {
      const [x] = (await tx.execute(sql`select count(*) filter (where coalesce(array_length(indexed_in, 1), 0) > 0)::int as indexed, count(*)::int as publications, coalesce(sum(citations), 0)::int as citations from publications where year = ${y} and status <> 'retracted'`)).rows as { indexed: number; publications: number; citations: number }[];
      const [pt] = (await tx.execute(sql`select count(*) filter (where status in ('published', 'granted') and coalesce(published_on, filed_on) between ${`${y}-01-01`}::date and ${`${y}-12-31`}::date)::int as published, count(*) filter (where status = 'granted' and granted_on between ${`${y}-01-01`}::date and ${`${y}-12-31`}::date)::int as granted, coalesce(sum(licence_revenue_paise) filter (where granted_on between ${`${y}-01-01`}::date and ${`${y}-12-31`}::date), 0)::float8 / 100 as licence from patents`)).rows as { published: number; granted: number; licence: number }[];
      calendar.push({ year: y, ...x, patentsPublished: pt.published, patentsGranted: pt.granted, licenceRupees: pt.licence });
    }
    return { toYear: to, years, calendar };
  }

  // ---- NAAC criterion 3 ----------------------------------------------------------------------------

  /** NAAC criterion 3 figures for the five academic years ending with `cycle`, from the same ERP sources the accreditation hub uses. */
  @Get('reports/naac-c3')
  @Auth('user', RESEARCH_VIEW_ROLES)
  naac(@CurrentPrincipal() p: UserPrincipal, @Query('cycle') cycleQ?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock);
      const current = yearLabel(today);
      const last = Number(current.slice(0, 4)) - 1;
      const cycle = cycleQ && /^\d{4}-\d{2}$/.test(cycleQ) ? cycleQ : yearOf(String(last)).label;
      const ys = windowOf(cycle, 5, current);
      const cache = new SourceCache(tx);
      const items: [string, string][] = [
        ['grants_govt_lakhs', '3.1 Grants from government agencies (INR lakhs)'],
        ['grants_nongovt_lakhs', '3.1 Grants from non-government agencies (INR lakhs)'],
        ['seed_money_lakhs', '3.1 Seed money (INR lakhs)'],
        ['teacher_fellowships', '3.1 Teachers receiving fellowships'],
        ['research_projects', '3.2 Research projects started'],
        ['ipr_workshops', '3.2 Workshops on research methodology, IPR and entrepreneurship'],
        ['research_awards', '3.3 Research awards and recognitions'],
        ['papers_journal', '3.3 Papers in journals'],
        ['papers_indexed', '3.3 Papers indexed in Scopus or Web of Science'],
        ['books_chapters', '3.3 Books, chapters and conference papers'],
        ['patents_published', '3.3 Patents published'],
        ['patents_granted', '3.3 Patents granted'],
        ['phd_registered', '3.4 Ph.D. scholars registered'],
        ['phd_awarded', '3.4 Ph.D.s awarded'],
        ['consultancy_lakhs', '3.5 Consultancy and corporate training (INR lakhs)'],
        ['extension_activities', '3.6 Extension and outreach activities'],
        ['mous_functional', '3.7 Functional MoUs with activities'],
      ];
      const rows = [];
      for (const [key, label] of items) {
        const values = [];
        for (const y of ys) values.push((await cache.get(key, y)).value);
        rows.push({ key, label, values });
      }
      return { cycle, years: ys.map((y) => y.label), rows };
    });
  }
}
