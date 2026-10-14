import { ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, count, desc, eq, getTableName, ilike, inArray, lt, or, type SQL } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { deletedRecords, tenants, users, type TenantSettings } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { hasRole, RecordRegistry, type KitCtx, type RecordEntity } from './entity.js';
import { captureAndDelete, restoreSnapshot, type RestoreReport } from './snapshot.js';

export const PURGE_JOB = 'records.purge-bin';
export const DEFAULT_RETENTION_DAYS = 90;

export interface BinEntry {
  id: string;
  entity: string;
  module: string;
  label: string;
  recordId: string;
  rowCount: number;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  /** When the purge job removes it for good. */
  purgeOn: string;
}

/** One record's result in a bulk restore or purge. */
export interface BinResult {
  id: string;
  label: string;
  ok: boolean;
  message?: string;
  code?: string;
  restored?: RestoreReport;
}

/**
 * The recycle bin: deleting a record through the kit keeps it here (with everything deleted along with it) for the
 * retention period, so it can be restored. A daily job purges older entries. Each entry is visible only to people
 * who may change that kind of record.
 */
@Injectable()
export class RecycleBinService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(PURGE_JOB, (job: Job) => this.purgeExpired(job.tenantId).then(() => undefined));
  }

  /** Moves a record to the bin. Audited as `<subject>.deleted` with its fields before the delete. */
  async moveToBin(ctx: KitCtx, e: RecordEntity, id: string, row: Record<string, unknown>): Promise<{ binId: string; label: string; rows: number }> {
    const label = e.label(row);
    const reason = await e.remove?.guard?.(ctx, id);
    if (reason) throw new ForbiddenException({ statusCode: 403, error: 'Forbidden', code: 'RECORD_DELETE_REFUSED', message: reason });
    const tableName = getTableName(e.table);
    const snap = await captureAndDelete(ctx.tx, tableName, id, label, e.remove?.dependents);
    const { count: rowCount, ...snapshot } = snap;
    const [entry] = await ctx.tx
      .insert(deletedRecords)
      .values({ tenantId: ctx.p.tenantId, entity: e.key, module: e.module, tableName, recordId: id, label, snapshot, rowCount, deletedBy: ctx.p.userId, deletedAt: this.clock.now() })
      .returning({ id: deletedRecords.id });
    await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `${e.subjectType}.deleted`, subjectType: e.subjectType, subjectId: id, before: row, data: { label, binId: entry.id, rows: rowCount } });
    return { binId: entry.id, label, rows: rowCount };
  }

  async retentionDays(tx: Tx, tenantId: string): Promise<number> {
    const [t] = await tx.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId));
    const d = (t?.settings as TenantSettings | undefined)?.recycleBinRetentionDays;
    return typeof d === 'number' && d >= 1 ? d : DEFAULT_RETENTION_DAYS;
  }

  async setRetentionDays(ctx: KitCtx, days: number): Promise<number> {
    const [t] = await ctx.tx.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, ctx.p.tenantId));
    const before = (t.settings as TenantSettings).recycleBinRetentionDays ?? DEFAULT_RETENTION_DAYS;
    await ctx.tx
      .update(tenants)
      .set({ settings: { ...(t.settings as TenantSettings), recycleBinRetentionDays: days } })
      .where(eq(tenants.id, ctx.p.tenantId));
    await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'settings.updated', subjectType: 'tenant', subjectId: ctx.p.tenantId, changes: before === days ? {} : { recycleBinRetentionDays: { before, after: days } } });
    return days;
  }

  /** The entity keys whose bin entries this person may see (they may change that kind of record). */
  private visibleEntities(ctx: KitCtx): string[] {
    return this.registry
      .all()
      .filter((e) => hasRole(ctx.p, e.roles.write))
      .map((e) => e.key);
  }

  async list(ctx: KitCtx, f: { module?: string; entity?: string; q?: string; page: number; pageSize: number }) {
    const keys = this.visibleEntities(ctx);
    const retention = await this.retentionDays(ctx.tx, ctx.p.tenantId);
    const modules = [...new Set(this.registry.all().filter((e) => keys.includes(e.key)).map((e) => e.module))].sort();
    if (!keys.length) return { rows: [] as BinEntry[], total: 0, page: 1, pageSize: f.pageSize, retentionDays: retention, modules, entities: [] as { key: string; module: string }[] };
    const q = f.q?.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    const where: SQL | undefined = and(
      inArray(deletedRecords.entity, keys),
      f.module ? eq(deletedRecords.module, f.module) : undefined,
      f.entity ? eq(deletedRecords.entity, f.entity) : undefined,
      q ? or(ilike(deletedRecords.label, `%${q}%`), eq(deletedRecords.recordId, f.q!.trim())) : undefined,
    );
    const [{ n }] = await ctx.tx.select({ n: count() }).from(deletedRecords).where(where);
    const page = Math.min(f.page, Math.max(1, Math.ceil(n / f.pageSize)));
    const rows = await ctx.tx
      .select({ e: deletedRecords, by: users.fullName })
      .from(deletedRecords)
      .leftJoin(users, eq(users.id, deletedRecords.deletedBy))
      .where(where)
      .orderBy(desc(deletedRecords.deletedAt), desc(deletedRecords.id))
      .limit(f.pageSize)
      .offset((page - 1) * f.pageSize);
    return {
      rows: rows.map(({ e, by }): BinEntry => ({
        id: e.id,
        entity: e.entity,
        module: e.module,
        label: e.label,
        recordId: e.recordId,
        rowCount: e.rowCount,
        deletedAt: e.deletedAt.toISOString(),
        deletedBy: e.deletedBy ? { id: e.deletedBy, name: by ?? '' } : null,
        purgeOn: new Date(e.deletedAt.getTime() + retention * 86_400_000).toISOString(),
      })),
      total: n,
      page,
      pageSize: f.pageSize,
      retentionDays: retention,
      modules,
      entities: this.registry
        .all()
        .filter((e) => keys.includes(e.key))
        .map((e) => ({ key: e.key, module: e.module })),
    };
  }

  /** Entries by id that this person may act on; others read as missing. */
  private async entries(ctx: KitCtx, ids: string[]) {
    const keys = this.visibleEntities(ctx);
    if (!keys.length) return [];
    return ctx.tx
      .select()
      .from(deletedRecords)
      .where(and(inArray(deletedRecords.id, ids), inArray(deletedRecords.entity, keys)));
  }

  /** Restores entries one by one; each either comes back whole or is reported with the reason. */
  async restore(ctx: KitCtx, ids: string[]): Promise<BinResult[]> {
    const found = new Map((await this.entries(ctx, ids)).map((e) => [e.id, e]));
    // Parents first: a class restored in the same request lets its students come back too.
    const ordered = [...found.values()].sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime());
    const done = new Map<string, BinResult>();
    let progress = true;
    let pending = ordered;
    while (pending.length && progress) {
      progress = false;
      const next: typeof pending = [];
      for (const entry of pending) {
        try {
          const report = await ctx.tx.transaction((sp) => this.restoreOne({ tx: sp, p: ctx.p }, entry));
          done.set(entry.id, { id: entry.id, label: entry.label, ok: true, restored: report });
          progress = true;
        } catch (e) {
          const body = (e as { getResponse?: () => unknown }).getResponse?.() as { message?: string; code?: string } | undefined;
          if (body?.code === 'RESTORE_PARENT_MISSING') next.push(entry);
          done.set(entry.id, { id: entry.id, label: entry.label, ok: false, message: body?.message ?? 'This record could not be restored', code: body?.code ?? 'RESTORE_FAILED' });
          if (!body) throw e;
        }
      }
      pending = progress ? next : [];
    }
    return ids.map((id) => done.get(id) ?? { id, label: '', ok: false, message: 'Not found', code: 'NOT_FOUND' });
  }

  private async restoreOne(ctx: KitCtx, entry: typeof deletedRecords.$inferSelect): Promise<RestoreReport> {
    const e = this.registry.find(entry.entity);
    const report = await restoreSnapshot(ctx.tx, entry.tableName, entry.snapshot, entry.label, async (table, recordId) => {
      const [parent] = await ctx.tx
        .select({ label: deletedRecords.label })
        .from(deletedRecords)
        .where(and(eq(deletedRecords.tableName, table), eq(deletedRecords.recordId, recordId)))
        .orderBy(desc(deletedRecords.deletedAt))
        .limit(1);
      return parent?.label ?? null;
    });
    await ctx.tx.delete(deletedRecords).where(eq(deletedRecords.id, entry.id));
    await audit(ctx.tx, {
      tenantId: ctx.p.tenantId,
      actorType: 'user',
      actorId: ctx.p.userId,
      action: `${e?.subjectType ?? entry.entity}.restored`,
      subjectType: e?.subjectType ?? entry.entity,
      subjectId: entry.recordId,
      data: { label: entry.label, binId: entry.id, restored: report.restored, skipped: report.skipped },
    });
    return report;
  }

  /** Removes entries for good. */
  async purge(ctx: KitCtx, ids: string[]): Promise<BinResult[]> {
    const found = new Map((await this.entries(ctx, ids)).map((e) => [e.id, e]));
    const out: BinResult[] = [];
    for (const id of ids) {
      const entry = found.get(id);
      if (!entry) {
        out.push({ id, label: '', ok: false, message: 'Not found', code: 'NOT_FOUND' });
        continue;
      }
      await ctx.tx.delete(deletedRecords).where(eq(deletedRecords.id, id));
      const e = this.registry.find(entry.entity);
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `${e?.subjectType ?? entry.entity}.purged`, subjectType: e?.subjectType ?? entry.entity, subjectId: entry.recordId, data: { label: entry.label, binId: id } });
      out.push({ id, label: entry.label, ok: true });
    }
    return out;
  }

  async get(ctx: KitCtx, id: string) {
    const [entry] = await this.entries(ctx, [id]);
    if (!entry) throw new NotFoundException('Not found');
    return entry;
  }

  /** The daily purge: entries older than the institution's retention period. Returns how many went. */
  async purgeExpired(tenantId: string): Promise<number> {
    return this.db.withTenant(tenantId, async (tx) => {
      const days = await this.retentionDays(tx, tenantId);
      const cutoff = new Date(this.clock.now().getTime() - days * 86_400_000);
      const gone = await tx.delete(deletedRecords).where(lt(deletedRecords.deletedAt, cutoff)).returning({ id: deletedRecords.id });
      if (gone.length) await audit(tx, { tenantId, actorType: 'system', action: 'recycle_bin.purged', subjectType: 'recycle_bin', data: { entries: gone.length, retentionDays: days } });
      return gone.length;
    });
  }
}

