import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, localParts, zonedToInstant } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { customReports, institutionProfiles, reportDashboards, reportFavourites, tenants, userRoles, users, type DashboardWidget } from '../db/schema.js';
import { reportRuns, reportSchedules } from '../db/schema-foundation.js';
import { reportRunsTotal } from '../observability/metrics.js';
import { academicYearsOf, DefinitionSchema, FilterSchema, RELATIVE, rolesAllowed, runDefinition, validateDefinition, type Caller, type Definition, type Filter, type RunCtx, type StudioResult } from './engine.js';
import { libraryByKey, localizeDefinition } from './library.js';
import { Mailer } from './mailer.js';
import { addDays } from './queries.js';
import { renderResult, type ExportFormat, type Rendered } from './render.js';
import { datasetByKey, maySeeField, mayUseDataset, type Lang, type SemDataset } from './semantic.js';

/**
 * The report studio's records: saved reports (folders, sharing, favourites), what a person may run,
 * exports with the institution's header, scheduled email delivery with run history and failure
 * tracking, and dashboards. Every query runs as the person (or, for a schedule, as its creator).
 */

export const MGMT: RoleName[] = ['tenant_admin', 'principal'];
const isLeader = (roles: readonly RoleName[]) => roles.some((r) => MGMT.includes(r));

export const LangSchema = z.enum(['en', 'hi', 'kn']).default('en');
export const SourceSchema = z.union([
  z.object({ reportId: z.uuid() }).strict(),
  z.object({ libraryKey: z.string().regex(/^[a-z0-9_.]{3,80}$/) }).strict(),
  z.object({ dataset: z.string().regex(/^[a-z_]{2,40}$/), definition: DefinitionSchema, title: z.string().trim().max(120).optional() }).strict(),
]);
export type Source = z.infer<typeof SourceSchema>;
export const RuntimeSchema = z.array(FilterSchema).max(10).default([]);

export const FREQS = ['daily', 'weekly', 'monthly'] as const;
export type Freq = (typeof FREQS)[number];
export interface ScheduleOptions {
  hour?: number;
  weekday?: number;
  monthDay?: number;
  lang?: Lang;
  runtime?: Filter[];
}

/** A report ready to run: dataset, definition, title, and its reference for favourites and dashboards. */
export interface Resolved {
  ds: SemDataset;
  def: Definition;
  title: string;
  description: string;
  ref: string | null;
  reportId?: string;
  libraryKey?: string;
}

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() || 7;

/** The next run at `hour` local time on a matching day (any day, the weekday, or the day of the month). */
export function nextStudioRun(after: Date, freq: Freq, tz: string, o: ScheduleOptions): Date {
  const hour = `${String(o.hour ?? 6).padStart(2, '0')}:00:00`;
  let date = localParts(after, tz).date;
  for (let i = 0; i < 400; i++) {
    const ok = freq === 'daily' || (freq === 'weekly' && dow(date) === (o.weekday ?? 1)) || (freq === 'monthly' && Number(date.slice(8, 10)) === (o.monthDay ?? 1));
    const at = zonedToInstant(date, hour, tz);
    if (ok && at > after) return at;
    date = addDays(date, 1);
  }
  throw new Error('No next run');
}

const MAX_FAILURES = 5;

@Injectable()
export class StudioService {
  private readonly log = new Logger(StudioService.name);

  constructor(
    private readonly db: DbService,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
  ) {}

  // ----- context and running ----------------------------------------------------------------------

  async timezone(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return t?.tz ?? 'Asia/Kolkata';
  }

  async ctx(tx: Tx, lang: Lang): Promise<RunCtx> {
    const timezone = await this.timezone(tx);
    return { timezone, today: localParts(this.clock.now(), timezone).date, lang, academicYears: await academicYearsOf(tx) };
  }

  /** Runs with a friendly error when the database gives up on a heavy report. */
  async run(tx: Tx, r: Resolved, who: Caller, lang: Lang, opts: { runtime?: Filter[]; limit?: number; extra?: { ref: string; value: string | number | boolean | null }[] } = {}): Promise<StudioResult> {
    try {
      return await runDefinition(tx, r.ds, r.def, who, await this.ctx(tx, lang), opts);
    } catch (e) {
      if ((e as { code?: string }).code === '57014' || (e as { cause?: { code?: string } }).cause?.code === '57014') throw new BadRequestException('This report took too long to run. Add a filter (a date range or a class) and try again.');
      throw e;
    }
  }

  dataset(key: string): SemDataset {
    return datasetByKey(key) ?? (() => {
      throw new BadRequestException('Unknown dataset');
    })();
  }

  /** A saved report, a library report or an unsaved definition, checked against what `p` may see. */
  async resolve(tx: Tx, p: Caller, src: Source, lang: Lang): Promise<Resolved> {
    if ('reportId' in src) {
      const row = await this.viewable(tx, p, src.reportId);
      const ds = this.dataset(row.dataset);
      return { ds, def: DefinitionSchema.parse(row.definition), title: row.name, description: row.description, ref: `custom:${row.id}`, reportId: row.id };
    }
    if ('libraryKey' in src) {
      const lib = libraryByKey(src.libraryKey);
      if (!lib) throw new NotFoundException('Report not found');
      if (!lib.roles.some((r) => p.roles.includes(r))) throw new ForbiddenException('Insufficient role for this report');
      return { ds: this.dataset(lib.dataset), def: localizeDefinition(lib.definition, lang), title: lib.title[lang], description: lib.description[lang], ref: `lib:${lib.key}`, libraryKey: lib.key };
    }
    const ds = this.dataset(src.dataset);
    if (!mayUseDataset(ds, p.roles)) throw new ForbiddenException('Insufficient role for this dataset');
    return { ds, def: src.definition, title: src.title || ds.label[lang], description: ds.description[lang], ref: null };
  }

  async resolveRef(tx: Tx, p: Caller, ref: string, lang: Lang): Promise<Resolved> {
    if (ref.startsWith('custom:')) return this.resolve(tx, p, { reportId: ref.slice(7) }, lang);
    if (ref.startsWith('lib:')) return this.resolve(tx, p, { libraryKey: ref.slice(4) }, lang);
    throw new BadRequestException('Unknown report');
  }

  // ----- saved reports ----------------------------------------------------------------------------

  /** May `p` open this saved report: theirs, a leader, or shared with one of their roles; and its dataset is theirs to use. */
  mayView(row: typeof customReports.$inferSelect, p: Caller): boolean {
    const ds = datasetByKey(row.dataset);
    if (!ds || !mayUseDataset(ds, p.roles)) return false;
    return row.createdBy === p.userId || isLeader(p.roles) || (row.sharedRoles as RoleName[]).some((r) => p.roles.includes(r));
  }

  mayEdit(row: typeof customReports.$inferSelect, p: Caller): boolean {
    return row.createdBy === p.userId || isLeader(p.roles);
  }

  async viewable(tx: Tx, p: Caller, id: string) {
    const [row] = await tx.select().from(customReports).where(eq(customReports.id, id));
    if (!row || !this.mayView(row, p)) throw new NotFoundException('Report not found');
    return row;
  }

  async editable(tx: Tx, p: Caller, id: string) {
    const row = await this.viewable(tx, p, id);
    if (!this.mayEdit(row, p)) throw new ForbiddenException('Only the owner or a leader can change this report');
    return row;
  }

  /** Sharing a report with roles: each role must itself be allowed every field it reads. */
  checkShare(ds: SemDataset, def: Definition, roles: string[]): RoleName[] {
    const allowed = rolesAllowed(ds, def);
    const bad = roles.filter((r) => !allowed.includes(r as RoleName));
    if (bad.length) throw new BadRequestException(`These roles may not see this report's data: ${bad.join(', ')}`);
    return [...new Set(roles)] as RoleName[];
  }

  async favourites(tx: Tx, p: Caller): Promise<Set<string>> {
    const rows = await tx.select({ ref: reportFavourites.reportRef }).from(reportFavourites).where(eq(reportFavourites.userId, p.userId));
    return new Set(rows.map((r) => r.ref));
  }

  async setFavourite(tx: Tx, p: Caller, ref: string, on: boolean) {
    await this.resolveRef(tx, p, ref, 'en');
    if (on) await tx.insert(reportFavourites).values({ tenantId: p.tenantId, userId: p.userId, reportRef: ref }).onConflictDoNothing();
    else await tx.delete(reportFavourites).where(and(eq(reportFavourites.userId, p.userId), eq(reportFavourites.reportRef, ref)));
  }

  // ----- exports ----------------------------------------------------------------------------------

  async export(tx: Tx, p: UserPrincipal, r: Resolved, format: ExportFormat, lang: Lang, runtime: Filter[]): Promise<Rendered & { rows: number }> {
    const res = await this.run(tx, r, p, lang, { runtime, limit: 50_000 });
    const rendered = renderResult(res, format, await this.meta(tx, p.userId, r.title, lang));
    if (r.reportId) await tx.update(customReports).set({ lastRunAt: this.clock.now() }).where(eq(customReports.id, r.reportId));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'report.exported', subjectType: r.reportId ? 'custom_report' : 'report', subjectId: r.reportId, data: { ref: r.ref, dataset: r.ds.key, format, rows: res.rows.length, filters: res.filters } });
    return { ...rendered, rows: res.rows.length };
  }

  /** The header of an export: the institution's name, who generated it and when (local time). */
  async meta(tx: Tx, userId: string, title: string, lang: Lang) {
    const [inst] = await tx.select({ name: institutionProfiles.legalName }).from(institutionProfiles).limit(1);
    const [t] = await tx.select({ name: tenants.name, tz: tenants.timezone }).from(tenants).limit(1);
    const [u] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, userId));
    const now = this.clock.now();
    const local = localParts(now, t?.tz ?? 'Asia/Kolkata');
    return { institution: inst?.name || t?.name || 'KINETIX', title, generatedBy: u?.name ?? 'KINETIX', generatedAt: `${local.date} ${local.time.slice(0, 5)}`, at: now, lang };
  }

  // ----- schedules --------------------------------------------------------------------------------

  /** The people a schedule may send to: every one must be an active user allowed the report's data. */
  async resolveRecipients(tx: Tx, ds: SemDataset, def: Definition, emails: string[], userIds: string[], roles: string[]): Promise<{ emails: string[]; denied: string[] }> {
    const allowed = rolesAllowed(ds, def);
    const conds = [];
    const cleanEmails = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
    if (cleanEmails.length) conds.push(inArray(users.email, cleanEmails));
    if (userIds.length) conds.push(inArray(users.id, userIds));
    const direct = conds.length ? await tx.select({ id: users.id, email: users.email, status: users.status }).from(users).where(sql.join(conds.map((c) => sql`(${c})`), sql` or `)) : [];
    const byRole = roles.length ? await tx.selectDistinct({ id: users.id, email: users.email, status: users.status }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(inArray(userRoles.role, roles as (typeof userRoles.role.enumValues)[number][])) : [];
    const people = [...direct, ...byRole].filter((u, i, a) => a.findIndex((x) => x.id === u.id) === i);
    const ids = people.map((u) => u.id);
    const roleRows = ids.length ? await tx.select({ userId: userRoles.userId, role: userRoles.role }).from(userRoles).where(inArray(userRoles.userId, ids)) : [];
    const ok = (u: { id: string; email: string | null; status: string }) => u.status === 'active' && !!u.email && roleRows.some((r) => r.userId === u.id && allowed.includes(r.role as RoleName));
    const denied = [...cleanEmails.filter((e) => !direct.some((u) => u.email === e)), ...direct.filter((u) => !ok(u)).map((u) => u.email ?? u.id)];
    return { emails: [...new Set(people.filter(ok).map((u) => u.email!.toLowerCase()))], denied };
  }

  scheduleKey(r: Resolved): string {
    if (r.reportId) return `custom.${r.reportId}`;
    if (r.libraryKey) return `lib.${r.libraryKey}`;
    throw new BadRequestException('Save the report before scheduling it');
  }

  /** Who may see and change a schedule: its creator, or a leader. */
  async ownSchedule(tx: Tx, p: Caller, id: string) {
    const [s] = await tx.select().from(reportSchedules).where(eq(reportSchedules.id, id));
    if (!s || !(s.reportKey.startsWith('custom.') || s.reportKey.startsWith('lib.')) || (s.createdBy !== p.userId && !isLeader(p.roles))) throw new NotFoundException('Schedule not found');
    return s;
  }

  refOfKey(key: string): string {
    return key.startsWith('custom.') ? `custom:${key.slice(7)}` : `lib:${key.slice(4)}`;
  }

  /** Runs due studio schedules are claimed by the report scheduler (ReportsService) and handed here. */
  async runSchedule(tenantId: string, id: string, manual?: { by: string }): Promise<{ ok: boolean; error?: string; rows: number; recipients: number }> {
    const now = this.clock.now();
    const claimed = await this.db.withTenant(tenantId, async (tx) => {
      const [s] = manual
        ? await tx.select().from(reportSchedules).where(eq(reportSchedules.id, id)).for('update')
        : await tx.select().from(reportSchedules).where(and(eq(reportSchedules.id, id), eq(reportSchedules.active, true), lte(reportSchedules.nextRunAt, now))).for('update', { skipLocked: true });
      if (!s) return null;
      const tz = await this.timezone(tx);
      const o = this.options(s, tz);
      if (!manual) await tx.update(reportSchedules).set({ lastRunAt: now, nextRunAt: nextStudioRun(s.nextRunAt > now ? s.nextRunAt : now, s.frequency as Freq, tz, o) }).where(eq(reportSchedules.id, id));
      const roles = (await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, s.createdBy))).map((r) => r.role as RoleName);
      const [creator] = await tx.select({ status: users.status }).from(users).where(eq(users.id, s.createdBy));
      return { s, o, roles, creatorActive: creator?.status === 'active' };
    });
    if (!claimed) return { ok: false, error: 'Schedule not found', rows: 0, recipients: 0 };
    const { s, o, roles, creatorActive } = claimed;
    const lang = o.lang ?? 'en';
    const who: Caller = { tenantId, userId: s.createdBy, roles };
    try {
      const out = await this.db.withTenant(tenantId, async (tx) => {
        let r: Resolved;
        try {
          r = await this.resolveRef(tx, who, this.refOfKey(s.reportKey), lang);
        } catch (e) {
          if (e instanceof NotFoundException || e instanceof ForbiddenException) {
            if (!(await this.exists(tx, s.reportKey))) throw new Error('The report no longer exists');
            throw new LostAccess();
          }
          throw e;
        }
        if (!creatorActive || !r.ds.roles.some((x) => roles.includes(x)) || !rolesAllowed(r.ds, r.def).some((x) => roles.includes(x))) throw new LostAccess();
        const res = await this.run(tx, r, who, lang, { runtime: o.runtime ?? [], limit: 50_000 });
        const rendered = renderResult(res, s.format as ExportFormat, await this.meta(tx, s.createdBy, r.title, lang));
        const people = await this.resolveRecipients(tx, r.ds, r.def, s.recipients, s.recipientUserIds, s.recipientRoles);
        return { r, res, rendered, to: people.emails };
      });
      if (out.to.length === 0) throw new Error('Nobody to send to: none of the recipients is an active user allowed to see this report');
      await this.mailer.send({
        to: out.to,
        subject: `KINETIX report: ${out.r.title} (${out.rendered.filename.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''})`,
        text: `Your scheduled report "${out.r.title}" is attached (${out.res.rows.length} rows${out.res.filters.length ? `; ${out.res.filters.join('; ')}` : ''}).\n\nSchedule: ${s.name || s.frequency}. To change or stop it, open Reports > Schedules in the ERP.`,
        attachments: [{ filename: out.rendered.filename, contentType: out.rendered.contentType.split(';')[0], content: out.rendered.body }],
      });
      await this.db.withTenant(tenantId, async (tx) => {
        await this.recordRun(tx, tenantId, { scheduleId: id, key: s.reportKey, format: s.format, rows: out.res.rows.length, status: 'ok', deliveredTo: out.to, requestedBy: manual?.by });
        await tx.update(reportSchedules).set({ lastStatus: 'ok', lastError: null, failureCount: 0, ...(manual ? { lastRunAt: now } : {}) }).where(eq(reportSchedules.id, id));
        await audit(tx, { tenantId, actorType: manual ? 'user' : 'system', actorId: manual?.by, action: 'report.scheduled_sent', subjectType: 'report_schedule', subjectId: id, data: { report: s.reportKey, recipients: out.to.length, rows: out.res.rows.length, format: s.format } });
      });
      return { ok: true, rows: out.res.rows.length, recipients: out.to.length };
    } catch (e) {
      const lost = e instanceof LostAccess;
      const message = lost ? 'The person who scheduled this report no longer has access to it; the schedule was switched off' : (e as Error).message;
      this.log.warn(`Scheduled report ${s.reportKey} (${id}) failed: ${message}`);
      await this.db.withTenant(tenantId, async (tx) => {
        await this.recordRun(tx, tenantId, { scheduleId: id, key: s.reportKey, format: s.format, rows: 0, status: 'failed', error: message, requestedBy: manual?.by });
        const failures = s.failureCount + 1;
        const off = lost || failures >= MAX_FAILURES;
        await tx.update(reportSchedules).set({ lastStatus: 'failed', lastError: message.slice(0, 500), failureCount: failures, ...(off ? { active: false } : {}) }).where(eq(reportSchedules.id, id));
        if (off) await audit(tx, { tenantId, actorType: 'system', action: 'report.schedule_disabled', subjectType: 'report_schedule', subjectId: id, data: { reason: lost ? 'creator lost access' : `failed ${failures} times in a row`, error: message.slice(0, 200) } });
      });
      return { ok: false, error: message, rows: 0, recipients: 0 };
    }
  }

  private async exists(tx: Tx, key: string): Promise<boolean> {
    if (key.startsWith('lib.')) return !!libraryByKey(key.slice(4));
    const [r] = await tx.select({ id: customReports.id }).from(customReports).where(eq(customReports.id, key.slice(7)));
    return !!r;
  }

  /** A schedule's options, with defaults for schedules made before options existed (the day it was due). */
  options(s: typeof reportSchedules.$inferSelect, tz: string): ScheduleOptions {
    const o = (s.options ?? {}) as ScheduleOptions;
    const local = localParts(s.nextRunAt, tz).date;
    return { hour: o.hour ?? 6, weekday: o.weekday ?? dow(local), monthDay: o.monthDay ?? Math.min(28, Number(local.slice(8, 10))), lang: o.lang ?? 'en', runtime: o.runtime ?? [] };
  }

  async recordRun(tx: Tx, tenantId: string, v: { scheduleId?: string; key: string; format: string; rows: number; status: 'ok' | 'failed'; deliveredTo?: string[]; error?: string; requestedBy?: string }) {
    await tx.insert(reportRuns).values({ tenantId, scheduleId: v.scheduleId ?? null, reportKey: v.key, params: {}, format: v.format, rowCount: v.rows, status: v.status, deliveredTo: v.deliveredTo ?? [], error: v.error?.slice(0, 500) ?? null, requestedBy: v.requestedBy ?? null });
    reportRunsTotal.inc({ report: v.key.startsWith('custom.') ? 'custom' : v.key, outcome: v.status });
  }

  // ----- dashboards -------------------------------------------------------------------------------

  mayViewDashboard(d: typeof reportDashboards.$inferSelect, p: Caller): boolean {
    return d.createdBy === p.userId || isLeader(p.roles) || [...(d.sharedRoles as RoleName[]), ...(d.defaultForRoles as RoleName[])].some((r) => p.roles.includes(r));
  }

  async dashboard(tx: Tx, p: Caller, id: string, edit = false) {
    const [d] = await tx.select().from(reportDashboards).where(eq(reportDashboards.id, id));
    if (!d || !this.mayViewDashboard(d, p)) throw new NotFoundException('Dashboard not found');
    if (edit && d.createdBy !== p.userId && !isLeader(p.roles)) throw new ForbiddenException('Only the owner or a leader can change this dashboard');
    return d;
  }

  /** The dashboard a role opens by default: the most recently changed one made the default for any of the person's roles. */
  async home(tx: Tx, p: Caller) {
    const all = await tx.select().from(reportDashboards).orderBy(desc(reportDashboards.updatedAt));
    return all.find((d) => (d.defaultForRoles as RoleName[]).some((r) => p.roles.includes(r))) ?? null;
  }

  /** Runs every widget as the viewer: a widget the viewer may not see says so instead of failing the dashboard. */
  async dashboardData(tx: Tx, p: Caller, d: typeof reportDashboards.$inferSelect, lang: Lang, period?: (typeof RELATIVE)[number]) {
    const out: { id: string; ok: boolean; title?: string; ref: string; chart?: string; result?: StudioResult; error?: string }[] = [];
    for (const w of d.widgets as DashboardWidget[]) {
      try {
        const r = await this.resolveRef(tx, p, w.ref, lang);
        const runtime: Filter[] = period && r.ds.dateField ? [{ field: r.ds.dateField, op: 'relative', value: period }] : [];
        await tx.execute(sql`savepoint widget`);
        try {
          const result = await this.run(tx, r, p, lang, { runtime, limit: 500 });
          await tx.execute(sql`release savepoint widget`);
          out.push({ id: w.id, ok: true, ref: w.ref, title: w.title || r.title, chart: w.chart, result });
        } catch (e) {
          await tx.execute(sql`rollback to savepoint widget`);
          throw e;
        }
      } catch (e) {
        out.push({ id: w.id, ok: false, ref: w.ref, title: w.title, error: e instanceof NotFoundException || e instanceof ForbiddenException ? 'not_allowed' : (e as Error).message });
      }
    }
    return out;
  }

  /** Each widget must be a report the person saving the dashboard may open. */
  async checkWidgets(tx: Tx, p: Caller, widgets: DashboardWidget[]) {
    for (const w of widgets) await this.resolveRef(tx, p, w.ref, 'en');
  }

  // ----- people for recipient pickers -------------------------------------------------------------

  async people(tx: Tx, q: string) {
    const term = q.trim();
    const where = term ? sql`u.status = 'active' and u.email is not null and (u.full_name ilike ${`%${term.replace(/[\\%_]/g, '\\$&')}%`} or u.email ilike ${`%${term.replace(/[\\%_]/g, '\\$&')}%`})` : sql`u.status = 'active' and u.email is not null`;
    const r = await tx.execute(sql`select u.id, u.full_name as name, u.email, array_agg(distinct ur.role::text) as roles from users u join user_roles ur on ur.user_id = u.id where ${where} and ur.role::text not in ('student', 'guardian', 'alumni', 'driver') group by u.id order by u.full_name limit 30`);
    return r.rows as { id: string; name: string; email: string; roles: string[] }[];
  }

  /** Field checks for a definition, without running it. */
  async validate(tx: Tx, ds: SemDataset, def: Definition, p: Caller) {
    validateDefinition(ds, def, p, await this.ctx(tx, 'en'));
  }

  visibleFields(ds: SemDataset, roles: RoleName[]) {
    return ds.fields.filter((f) => maySeeField(f, roles));
  }

  orderedSchedules(tx: Tx, p: Caller) {
    const mine = isLeader(p.roles) ? undefined : eq(reportSchedules.createdBy, p.userId);
    return tx.select().from(reportSchedules).where(and(sql`(${reportSchedules.reportKey} like 'custom.%' or ${reportSchedules.reportKey} like 'lib.%')`, mine)).orderBy(asc(reportSchedules.nextRunAt));
  }
}

class LostAccess extends Error {}
