import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { readXlsxSheets } from '../common/xlsx.js';
import { Clock, localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { accreditationComments, accreditationEntries, accreditationTasks, dvvQueries } from '../db/schema-accreditation.js';
import { departments, obeEvidence, tenants, users } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { assess, cycleOn, drillDown, type Assessment, type MetricResult } from './engine.js';
import { framework, metricsOf } from './frameworks/index.js';
import type { FlatMetric, FrameworkDef } from './frameworks/types.js';
import { SourceCache, windowOf } from './sources.js';
import { xlsx, type Cell } from './xlsx.js';

export const REMINDER_JOB = 'accreditation.reminders';
const ADMIN_ROLES = ['tenant_admin', 'principal', 'quality_officer'];

/** An academic year label from what people type in a template: 2024-25, 2024-2025, 2024/25 or 2024. */
export function normaliseYear(s: string): string | null {
  const m = /^\s*(\d{4})(?:\s*[-/–]\s*(\d{2}|\d{4}))?\s*$/.exec(String(s ?? ''));
  if (!m) return null;
  const y = Number(m[1]);
  if (m[2] && Number(m[2].slice(-2)) !== (y + 1) % 100) return null;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !['of', 'the', 'and', 'or', 'in', 'for', 'to', 'if', 'any', 'no', 'with', 'as'].includes(w)));

/**
 * Places records from an ERP source under the official template columns: each template column takes the record column
 * whose words it shares most (all of the shorter name's words, or three quarters of them). Columns with no match stay empty.
 */
export function mapToTemplate(template: string[], recordColumns: string[], rows: Cell[][], year: string | null): Cell[][] | null {
  const tw = template.map(words);
  const rw = recordColumns.map(words);
  // Every (template, record) pair whose shorter name shares at least 60% of its words, best first; each column is used once.
  const pairs: { i: number; j: number; score: number }[] = [];
  tw.forEach((t, i) =>
    rw.forEach((r, j) => {
      const inter = [...t].filter((w) => r.has(w)).length;
      const overlap = inter / Math.max(1, Math.min(t.size, r.size));
      if (overlap >= 0.6) pairs.push({ i, j, score: overlap + inter / Math.max(1, new Set([...t, ...r]).size) });
    }),
  );
  const pick: number[] = template.map((t) => (/^(academic )?year$/i.test(t.trim()) && year ? -2 : -1));
  const used = new Set<number>();
  for (const x of pairs.sort((a, b) => b.score - a.score)) {
    if (pick[x.i] !== -1 || used.has(x.j)) continue;
    pick[x.i] = x.j;
    used.add(x.j);
  }
  if (pick.filter((p) => p >= 0).length < Math.min(2, recordColumns.length)) return null;
  return rows.map((r) => pick.map((p) => (p === -2 ? year : p >= 0 ? (r[p] ?? null) : null)));
}

@Injectable()
export class AccreditationService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(REMINDER_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.remind(tx)).then(() => undefined));
  }

  /** The framework for a key or alias, or 404. */
  framework(key: string): FrameworkDef {
    const f = framework(key);
    if (!f) throw new NotFoundException('Unknown framework');
    return f;
  }

  metric(f: FrameworkDef, code: string): FlatMetric {
    const m = metricsOf(f).find((x) => x.code === code);
    if (!m) throw new NotFoundException('Metric not found');
    return m;
  }

  today(): string {
    return cycleOn(this.clock.now());
  }

  assess(tx: Tx, f: FrameworkDef, cycle: string, only?: string[], cache?: SourceCache): Promise<Assessment> {
    return assess(tx, f, cycle, { today: this.today(), only }, cache);
  }

  /** One metric with its year-wise inputs, the records behind them, evidence by year, comments, task and DVV queries. */
  async detail(tx: Tx, f: FrameworkDef, code: string, cycle: string) {
    const m = this.metric(f, code);
    const cache = new SourceCache(tx);
    const a = await this.assess(tx, f, cycle, [code], cache);
    const r = a.metrics[0];
    const entryIds = r.years.map((y) => y.entryId).filter((x): x is string => !!x);
    const ev = entryIds.length
      ? await tx.select({ id: obeEvidence.id, targetId: obeEvidence.targetId, title: obeEvidence.title, url: obeEvidence.url, note: obeEvidence.note, fileName: obeEvidence.fileName, createdAt: obeEvidence.createdAt }).from(obeEvidence).where(and(eq(obeEvidence.scope, 'metric'), inArray(obeEvidence.targetId, entryIds))).orderBy(asc(obeEvidence.createdAt))
      : [];
    const yearOfEntry = new Map(r.years.filter((y) => y.entryId).map((y) => [y.entryId as string, y.year]));
    const entries = entryIds.length ? await tx.select({ id: accreditationEntries.id, cycle: accreditationEntries.cycle, rows: accreditationEntries.dataRows }).from(accreditationEntries).where(inArray(accreditationEntries.id, entryIds)) : [];
    const comments = await tx.select({ id: accreditationComments.id, body: accreditationComments.body, createdAt: accreditationComments.createdAt, userId: accreditationComments.userId, author: users.fullName }).from(accreditationComments).leftJoin(users, eq(users.id, accreditationComments.userId)).where(and(eq(accreditationComments.framework, f.key), eq(accreditationComments.cycle, cycle), eq(accreditationComments.metricCode, code))).orderBy(asc(accreditationComments.createdAt));
    const dvv = await tx.select().from(dvvQueries).where(and(eq(dvvQueries.framework, f.key), eq(dvvQueries.cycle, cycle), eq(dvvQueries.metricCode, code))).orderBy(asc(dvvQueries.createdAt));
    return {
      framework: a.framework,
      cycle,
      window: a.window,
      criterion: f.criteria.find((c) => c.id === m.criterion)?.title ?? '',
      indicator: f.criteria.flatMap((c) => c.indicators).find((k) => k.id === m.indicator)?.title ?? '',
      metric: r,
      dataRows: entries.map((e) => ({ year: e.cycle, rows: e.rows as string[][] })),
      records: await drillDown(tx, f, m, cycle, this.today(), cache),
      evidence: ev.map((e) => ({ ...e, year: yearOfEntry.get(e.targetId) ?? null })),
      comments,
      dvv,
    };
  }

  /** May this user change the metric? The quality team can; a teacher or head can when a task gives them the metric or its criterion. */
  async assertCanEdit(tx: Tx, p: UserPrincipal, f: FrameworkDef, cycle: string, m: FlatMetric): Promise<void> {
    if (p.roles.some((r) => ADMIN_ROLES.includes(r))) return;
    const [t] = await tx.select({ id: accreditationTasks.id }).from(accreditationTasks).where(and(eq(accreditationTasks.framework, f.key), eq(accreditationTasks.cycle, cycle), inArray(accreditationTasks.scope, [m.code, m.criterion]), eq(accreditationTasks.ownerId, p.userId)));
    if (!t) throw new ForbiddenException('This metric is not assigned to you');
  }

  /** Creates the entry of a metric for a year if it is missing and returns it. */
  async ensureEntry(tx: Tx, p: UserPrincipal, f: FrameworkDef, year: string, code: string) {
    await tx.insert(accreditationEntries).values({ tenantId: p.tenantId, body: f.key, cycle: year, metricCode: code, updatedBy: p.userId }).onConflictDoNothing();
    const [row] = await tx.select().from(accreditationEntries).where(and(eq(accreditationEntries.body, f.key), eq(accreditationEntries.cycle, year), eq(accreditationEntries.metricCode, code)));
    return row;
  }

  /** The years a metric covers in a submission ending with `cycle`. */
  yearsOf(f: FrameworkDef, m: FlatMetric, cycle: string): string[] {
    return windowOf(cycle, f.years, this.today()).slice(-Math.min(m.years, f.years)).map((y) => y.label);
  }

  // ---- template and import --------------------------------------------------------------------------------------------

  /** The metric's data template: the official columns with the rows entered so far, the year-wise inputs and the evidence list. */
  async template(tx: Tx, f: FrameworkDef, m: FlatMetric, cycle: string): Promise<Buffer> {
    const a = await this.assess(tx, f, cycle, [m.code]);
    const r = a.metrics[0];
    const multi = r.yearsRequired > 1 && !m.columns.some((c) => /^(academic )?year$/i.test(c.trim()));
    const head = multi ? ['Academic year', ...m.columns] : m.columns;
    const entries = await tx.select({ cycle: accreditationEntries.cycle, rows: accreditationEntries.dataRows }).from(accreditationEntries).where(and(eq(accreditationEntries.body, f.key), eq(accreditationEntries.metricCode, m.code), inArray(accreditationEntries.cycle, a.window)));
    const data: Cell[][] = entries.sort((x, y) => x.cycle.localeCompare(y.cycle)).flatMap((e) => (e.rows as string[][]).map((row) => (multi ? [e.cycle, ...row] : row)));
    const inputHead = ['Academic year', ...m.inputs.map((i) => i.label), 'Value for the year (leave blank to compute)'];
    const inputRows: Cell[][] = r.years.filter((y) => y.required).map((y) => [y.year, ...m.inputs.map((i) => y.inputs.find((x) => x.key === i.key)?.value ?? null), y.source === 'manual' ? y.value : null]);
    const sheets = [
      { name: 'Data template', rows: [[`${f.title}: metric ${m.code} (${m.kind})`], [m.title], [`Formula: ${m.formula}`], [], m.columns.length ? head : ['Narrative (up to 500 words)'], ...(m.columns.length ? data : r.narrative ? [[r.narrative]] : [])], widths: head.map(() => 26), title: [0], header: [4], freeze: 5 },
      ...(m.kind === 'QnM' && !m.options ? [{ name: 'Year-wise inputs', rows: [[`Inputs of ${m.code} for each academic year; inputs marked (ERP) are computed and can be overridden`], [], inputHead.map((h, i) => (i > 0 && i <= m.inputs.length && m.inputs[i - 1].source ? `${h} (ERP)` : h)), ...inputRows], widths: inputHead.map((_, i) => (i ? 24 : 14)), title: [0], header: [2], freeze: 3 }] : []),
      ...(m.options ? [{ name: 'Options', rows: [['Option', 'Available (Yes / No)'], ...m.options.map((o, i) => [o, r.options?.selected?.includes(i) ? 'Yes' : 'No'])], widths: [80, 20], header: [0] }] : []),
      { name: 'Evidence to upload', rows: [['Documents NAAC / NBA / NIRF ask for'], ...m.evidence.map((e) => [e])], widths: [100], header: [0] },
    ];
    return xlsx(sheets, this.clock.now());
  }

  /**
   * Imports a filled template: data template rows (grouped by their academic year column, else filed under `year`),
   * year-wise inputs and options. Returns what was stored per year.
   */
  async importTemplate(tx: Tx, p: UserPrincipal, f: FrameworkDef, m: FlatMetric, cycle: string, year: string, buf: Buffer) {
    let sheets: { name: string; rows: string[][] }[];
    try {
      sheets = readXlsxSheets(buf);
    } catch {
      throw new BadRequestException('The file is not an Excel (.xlsx) workbook');
    }
    const allowed = new Set(this.yearsOf(f, m, cycle));
    const byName = (n: string) => sheets.find((s) => s.name.toLowerCase() === n.toLowerCase());
    const dataSheet = byName('Data template') ?? sheets[0];
    const stored: Record<string, { rows: number; inputs: number; options?: number }> = {};
    const touch = (y: string) => (stored[y] ??= { rows: 0, inputs: 0 });
    const skipped: string[] = [];

    if (m.columns.length && dataSheet) {
      const norm = (s: string) => s.trim().toLowerCase();
      const cols = m.columns.map(norm);
      const hi = dataSheet.rows.findIndex((r) => r.filter((c) => cols.includes(norm(c))).length >= Math.min(2, cols.length));
      if (hi >= 0) {
        const header = dataSheet.rows[hi].map(norm);
        const yearAt = header.includes('academic year') ? header.indexOf('academic year') : header.indexOf('year');
        const at = cols.map((c) => header.indexOf(c));
        const groups = new Map<string, string[][]>();
        for (const raw of dataSheet.rows.slice(hi + 1)) {
          if (!raw.some((c) => String(c ?? '').trim())) continue;
          const y = yearAt >= 0 && String(raw[yearAt] ?? '').trim() ? normaliseYear(raw[yearAt]) : yearAt >= 0 && allowed.size > 1 ? null : year;
          if (!y || !allowed.has(y)) {
            skipped.push(`Row "${raw.filter(Boolean).slice(0, 3).join(' ')}" has no academic year in ${[...allowed].join(', ')}`);
            continue;
          }
          const row = at.map((i) => (i >= 0 ? String(raw[i] ?? '').slice(0, 500) : ''));
          groups.set(y, [...(groups.get(y) ?? []), row]);
        }
        for (const [y, rows] of groups) {
          const e = await this.ensureEntry(tx, p, f, y, m.code);
          await tx.update(accreditationEntries).set({ dataRows: rows.slice(0, 2000), updatedBy: p.userId, updatedAt: new Date() }).where(eq(accreditationEntries.id, e.id));
          touch(y).rows = rows.length;
        }
      }
    }

    const inputSheet = byName('Year-wise inputs');
    if (inputSheet && m.inputs.length) {
      const before = await this.assess(tx, f, cycle, [m.code]);
      const hi = inputSheet.rows.findIndex((r) => /academic year/i.test(r[0] ?? ''));
      for (const raw of inputSheet.rows.slice(hi + 1)) {
        const y = normaliseYear(raw[0] ?? '');
        if (!y || !allowed.has(y)) continue;
        const read = (c: unknown) => {
          const v = String(c ?? '').replace(/,/g, '').trim();
          return v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
        };
        // An input the ERP computes is stored only when the sheet differs from it (an override).
        const auto = Object.fromEntries((before.metrics[0].years.find((c) => c.year === y)?.inputs ?? []).filter((i) => i.source === 'auto').map((i) => [i.key, i.value]));
        const keep: Record<string, number> = {};
        m.inputs.forEach((d, i) => {
          const v = read(raw[i + 1]);
          if (v !== null && auto[d.key] !== v) keep[d.key] = v;
        });
        const value = read(raw[m.inputs.length + 1]);
        if (!Object.keys(keep).length && value === null) continue;
        const e = await this.ensureEntry(tx, p, f, y, m.code);
        await tx.update(accreditationEntries).set({ inputs: { ...((e.inputs as Record<string, number>) ?? {}), ...keep }, ...(value !== null ? { value } : {}), updatedBy: p.userId, updatedAt: new Date() }).where(eq(accreditationEntries.id, e.id));
        touch(y).inputs = Object.keys(keep).length;
      }
    }

    const optSheet = byName('Options');
    if (optSheet && m.options) {
      const picked = m.options.map((o, i) => (optSheet.rows.find((r) => (r[0] ?? '').trim().toLowerCase() === o.toLowerCase())?.[1] ?? '').trim().toLowerCase().startsWith('y') ? i : -1).filter((i) => i >= 0);
      const e = await this.ensureEntry(tx, p, f, cycle, m.code);
      await tx.update(accreditationEntries).set({ options: picked, updatedBy: p.userId, updatedAt: new Date() }).where(eq(accreditationEntries.id, e.id));
      touch(cycle).options = picked.length;
    }
    if (!Object.keys(stored).length) throw new BadRequestException(skipped[0] ?? 'Nothing to import: the workbook has no rows under the template columns');
    return { stored, skipped: skipped.slice(0, 20) };
  }

  // ---- readiness dashboard ----------------------------------------------------------------------------------------------

  /** The executive view: estimate, per-criterion score and completeness with owners and due dates, the largest gaps, tasks and DVV. */
  async readiness(tx: Tx, f: FrameworkDef, cycle: string) {
    const a = await this.assess(tx, f, cycle);
    const today = await this.localToday(tx);
    const tasks = await this.tasks(tx, f, cycle);
    const gapOf = (m: MetricResult) => {
      const reasons: string[] = [];
      if (m.options && m.options.selected === null) reasons.push('options');
      else if (m.kind === 'QlM' && !m.narrative.trim()) reasons.push('narrative');
      else if (m.kind === 'QnM' && !m.options) {
        const missing = m.years.filter((y) => y.required && !y.hasData).map((y) => y.year);
        if (missing.length) reasons.push(`years:${missing.join(',')}`);
      }
      if (m.evidenceRequired.length && m.evidence === 0) reasons.push('evidence');
      return reasons;
    };
    const gaps = a.metrics
      .filter((m) => !m.complete)
      .map((m) => ({ code: m.code, criterion: m.criterion, title: m.title, kind: m.kind, weight: m.weight, completeness: m.completeness, reasons: gapOf(m), owner: m.task?.ownerName ?? m.task?.departmentName ?? null, dueOn: m.task?.dueOn ?? null, status: m.task?.status ?? null, impact: Math.round((m.weight || 1) * (100 - m.completeness)) }))
      .sort((x, y) => y.impact - x.impact);
    const dvv = (await tx.execute(sql`select status, count(*)::int as n from dvv_queries where framework = ${f.key} and cycle = ${cycle} group by status`)).rows as { status: string; n: number }[];
    return {
      framework: a.framework,
      cycle,
      window: a.window,
      estimate: a.estimate,
      completeness: a.completeness,
      criteria: a.criteria.map((c) => {
        const mine = tasks.filter((t) => t.scope === c.id || a.metrics.some((m) => m.criterion === c.id && m.code === t.scope));
        const open = mine.filter((t) => t.status !== 'approved');
        return { ...c, owners: [...new Set(mine.map((t) => t.ownerName ?? t.departmentName).filter(Boolean))], tasks: mine.length, overdue: open.filter((t) => t.dueOn && t.dueOn < today).length, nextDue: open.map((t) => t.dueOn).filter((d): d is string => !!d).sort()[0] ?? null, gaps: gaps.filter((g) => g.criterion === c.id).length };
      }),
      gaps: gaps.slice(0, 50),
      /** Every metric in brief, for the criteria tree. */
      metrics: a.metrics.map((m) => ({ code: m.code, criterion: m.criterion, indicator: m.indicator, kind: m.kind, title: m.title, unit: m.unit, weight: m.weight, value: m.value, valueSource: m.valueSource, score: m.score, maxScore: m.maxScore, completeness: m.completeness, evidence: m.evidence, yearsRequired: m.yearsRequired, task: m.task, dvvOpen: m.dvvOpen, options: m.options ? { count: m.options.labels.length, selected: m.options.selected?.length ?? null } : null, hasNarrative: m.kind === 'QlM' ? !!m.narrative.trim() : null })),
      tasks: tasks.map((t) => ({ ...t, overdue: !!t.dueOn && t.dueOn < today && t.status !== 'approved' })),
      dvv: Object.fromEntries(dvv.map((d) => [d.status, Number(d.n)])),
      today,
    };
  }

  private async localToday(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  async tasks(tx: Tx, f: FrameworkDef, cycle: string) {
    const rows = (await tx.execute(sql`select t.id, t.scope, t.status, t.due_on::text as "dueOn", t.note, t.owner_id as "ownerId", o.full_name as "ownerName", t.reviewer_id as "reviewerId", r.full_name as "reviewerName",
        t.department_id as "departmentId", d.name as "departmentName", t.last_reminded_on::text as "lastRemindedOn", t.updated_at as "updatedAt"
      from accreditation_tasks t left join users o on o.id = t.owner_id left join users r on r.id = t.reviewer_id left join departments d on d.id = t.department_id
      where t.framework = ${f.key} and t.cycle = ${cycle} order by t.due_on nulls last, t.scope`)).rows as { id: string; scope: string; status: string; dueOn: string | null; note: string; ownerId: string | null; ownerName: string | null; reviewerId: string | null; reviewerName: string | null; departmentId: string | null; departmentName: string | null; lastRemindedOn: string | null }[];
    const titles = new Map<string, string>([...f.criteria.map((c) => [c.id, `Criterion ${c.id}: ${c.title}`] as [string, string]), ...metricsOf(f).map((m) => [m.code, m.title] as [string, string])]);
    return rows.map((r) => ({ ...r, title: titles.get(r.scope) ?? r.scope }));
  }

  /** Checks that a task's scope is a metric or a criterion of the framework, and the people named belong to the institution. */
  async assertTask(tx: Tx, f: FrameworkDef, scope: string, ownerId?: string | null, reviewerId?: string | null, departmentId?: string | null) {
    if (!f.criteria.some((c) => c.id === scope) && !metricsOf(f).some((m) => m.code === scope)) throw new BadRequestException('Assign a criterion or a metric of this framework');
    for (const id of [ownerId, reviewerId].filter((x): x is string => !!x)) {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id));
      if (!u) throw new BadRequestException('Choose a member of staff');
    }
    if (departmentId) {
      const [d] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId));
      if (!d) throw new BadRequestException('Choose a department');
    }
  }

  /**
   * Reminds owners (or the head of the assigned department) of tasks that are not approved and fall due within three days
   * or are overdue; each task is reminded at most once a day. Returns how many reminders went out.
   */
  async remind(tx: Tx, only?: { framework: string; cycle: string }): Promise<number> {
    const today = await this.localToday(tx);
    const due = (await tx.execute(sql`select t.id, t.framework, t.cycle, t.scope, t.due_on::text as due_on, coalesce(t.owner_id, d.head_user_id) as user_id
      from accreditation_tasks t left join departments d on d.id = t.department_id
      where t.status not in ('approved', 'submitted') and t.due_on is not null and t.due_on <= ${today}::date + 3
        and (t.last_reminded_on is null or t.last_reminded_on < ${today}::date) and coalesce(t.owner_id, d.head_user_id) is not null
        ${only ? sql`and t.framework = ${only.framework} and t.cycle = ${only.cycle}` : sql``}`)).rows as { id: string; framework: string; cycle: string; scope: string; due_on: string; user_id: string }[];
    for (const t of due) {
      const f = framework(t.framework);
      const what = f ? (metricsOf(f).find((m) => m.code === t.scope) ? `metric ${t.scope}` : `criterion ${t.scope}`) : t.scope;
      const overdue = t.due_on < today;
      await this.notifications.notifyUsers(tx, [t.user_id], { kind: 'task', text: { title: `${f?.title ?? 'Accreditation'}: ${what} ${overdue ? 'is overdue' : `is due on ${t.due_on}`}`, body: `Complete the data and evidence for ${what} (${t.cycle}) and submit it for review.` }, data: { framework: t.framework, cycle: t.cycle, scope: t.scope }, dedupeKey: `accreditation-task:${t.id}:${today}` });
      await tx.update(accreditationTasks).set({ lastRemindedOn: today }).where(eq(accreditationTasks.id, t.id));
    }
    return due.length;
  }

  private scopeWords(f: FrameworkDef, scope: string) {
    const m = metricsOf(f).find((x) => x.code === scope);
    return m ? `metric ${scope} (${m.title.slice(0, 80)})` : `criterion ${scope} (${f.criteria.find((c) => c.id === scope)?.title ?? ''})`;
  }

  /** Tells the owner a metric or criterion was assigned to them. */
  async notifyAssigned(tx: Tx, f: FrameworkDef, t: typeof accreditationTasks.$inferSelect): Promise<void> {
    if (!t.ownerId) return;
    await this.notifications.notifyUsers(tx, [t.ownerId], { kind: 'task', text: { title: `${f.title}: ${this.scopeWords(f, t.scope)} assigned to you`, body: `${t.cycle}${t.dueOn ? `, due ${t.dueOn}` : ''}. Enter the data and upload the evidence, then submit it for review.` }, data: { framework: t.framework, cycle: t.cycle, scope: t.scope }, dedupeKey: `accreditation-assign:${t.id}:${t.ownerId}:${t.dueOn ?? ''}` }, { replace: true });
  }

  /** Tells the reviewer a task was submitted, or the owner it was approved or returned. */
  async notifyStatus(tx: Tx, f: FrameworkDef, t: typeof accreditationTasks.$inferSelect, to: string[]): Promise<void> {
    const word = t.status === 'submitted' ? 'submitted for review' : t.status === 'approved' ? 'approved' : 'returned for changes';
    await this.notifications.notifyUsers(tx, to, { kind: 'task', text: { title: `${f.title}: ${this.scopeWords(f, t.scope)} ${word}`, body: t.note ? t.note.slice(0, 160) : `${t.cycle}` }, data: { framework: t.framework, cycle: t.cycle, scope: t.scope }, dedupeKey: `accreditation-status:${t.id}:${t.status}:${t.updatedAt.toISOString()}` });
  }

  // ---- shared bits for exports ------------------------------------------------------------------------------------------

  async institution(tx: Tx): Promise<string> {
    const r = (await tx.execute(sql`select coalesce(p.legal_name, t.name) as name from tenants t left join institution_profiles p on p.tenant_id = t.id limit 1`)).rows[0] as { name?: string } | undefined;
    return r?.name ?? '';
  }

  async dvvList(tx: Tx, fw: string | null, cycle: string) {
    return tx.select().from(dvvQueries).where(and(eq(dvvQueries.cycle, cycle), fw ? eq(dvvQueries.framework, fw) : undefined)).orderBy(asc(dvvQueries.metricCode), asc(dvvQueries.createdAt));
  }

  /** Latest attainment per programme outcome and course outcome, for the NBA SAR criterion 3 tables. */
  async attainmentRows(tx: Tx) {
    const r = await tx.execute(sql`select p.name as program, x.scope, x.code, x.direct, x.indirect, x.combined, x.target, x.gap, x.met
      from (select distinct on (program_id, target_id) * from attainment_snapshots order by program_id, target_id, computed_at desc) x join programs p on p.id = x.program_id order by p.name, x.scope desc, x.code`);
    return r.rows as { program: string; scope: string; code: string; direct: number | null; indirect: number | null; combined: number | null; target: number; gap: number | null; met: boolean }[];
  }

  async coPoMatrix(tx: Tx) {
    const r = await tx.execute(sql`select p.name as program, co.code as co, po.code as po, m.strength from co_outcome_map m join course_outcomes co on co.id = m.co_id join program_outcomes po on po.id = m.outcome_id
      join co_sets cs on cs.id = co.co_set_id join subjects sj on sj.id = cs.subject_id join programs p on p.id = sj.program_id order by p.name, co.code, po.code`);
    return r.rows as { program: string; co: string; po: string; strength: number }[];
  }
}

export { ADMIN_ROLES };
