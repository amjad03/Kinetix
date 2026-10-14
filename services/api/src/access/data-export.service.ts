import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { zip } from '../analytics/zip.js';
import { audit } from '../common/audit.js';
import { DbService } from '../db/db.service.js';
import { tenantExports } from '../db/schema-governance.js';
import { TENANT_TABLES, tenants, users } from '../db/schema.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { bufferStream, ObjectStorage } from '../storage/storage.service.js';

export const EXPORT_JOB = 'tenant.export';
const EXPIRE_JOB = 'tenant.export-expire';
/** A ready file is kept this long, then deleted. */
const KEEP_DAYS = 7;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const PER_DAY = 3;

/** Columns whose values never leave the database: password hashes, encrypted secrets, tokens and PIN hashes. */
export const SECRET_COLUMN = /(password_hash|passwordHash|_hash$|Hash$|_enc$|Enc$|secret|backup_codes|backupCodes|private_key|api_key|^token$|access_token|refresh_token)/i;

/**
 * Every value of a row that is safe to export; secret columns become null and are named in the manifest. JSON values
 * are cleaned too (a recycle-bin snapshot holds whole rows, secrets included).
 */
export function redact(row: Record<string, unknown>, redacted: Set<string>): Record<string, unknown> {
  const clean = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) return redact(v as Record<string, unknown>, redacted);
    return v;
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_COLUMN.test(k) && v !== null && v !== undefined) {
      redacted.add(k);
      out[k] = null;
    } else out[k] = clean(v);
  }
  return out;
}

/**
 * Backups for the institution: a full export of its data (every tenant table, one JSON file each, in a ZIP with a
 * manifest), made in the background, kept for seven days and downloadable by the principal or administrator.
 */
@Injectable()
export class DataExportService implements OnModuleInit {
  private readonly log = new Logger(DataExportService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly storage: ObjectStorage,
  ) {}

  onModuleInit(): void {
    this.jobs.register(EXPORT_JOB, (job) => this.run(job));
    this.jobs.registerDaily(EXPIRE_JOB, async (job) => void (await this.expire(job.tenantId)));
  }

  list(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: tenantExports.id,
          status: tenantExports.status,
          note: tenantExports.note,
          requestedBy: users.fullName,
          sizeBytes: tenantExports.sizeBytes,
          tableCount: tenantExports.tableCount,
          rowCount: tenantExports.rowCount,
          error: tenantExports.error,
          createdAt: tenantExports.createdAt,
          finishedAt: tenantExports.finishedAt,
          expiresAt: tenantExports.expiresAt,
          downloadedAt: tenantExports.downloadedAt,
        })
        .from(tenantExports)
        .leftJoin(users, eq(users.id, tenantExports.requestedBy))
        .orderBy(desc(tenantExports.createdAt))
        .limit(50),
    );
  }

  /** Queues an export. One at a time, and at most three a day. */
  request(tenantId: string, userId: string, note: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const [busy] = await tx.select({ id: tenantExports.id }).from(tenantExports).where(inArray(tenantExports.status, ['queued', 'running'])).limit(1);
      if (busy) throw new ConflictException('An export is already being made; wait for it to finish');
      const [today] = await tx.select({ n: sql<number>`count(*)::int` }).from(tenantExports).where(gte(tenantExports.createdAt, sql`now() - interval '1 day'`));
      if ((today?.n ?? 0) >= PER_DAY) throw new ConflictException(`At most ${PER_DAY} exports a day; try again tomorrow`);
      const [row] = await tx.insert(tenantExports).values({ tenantId, requestedBy: userId, note }).returning();
      await this.jobs.enqueue(tx, tenantId, EXPORT_JOB, { id: row.id });
      await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'data_export.requested', subjectType: 'tenant_export', subjectId: row.id, data: { note } });
      return row;
    });
  }

  /** The job: reads each table in the tenant's transaction (RLS limits it to this institution), zips and stores it. */
  private async run(job: Job): Promise<void> {
    const id = job.payload.id;
    const tenantId = job.tenantId;
    await this.db.withTenant(tenantId, (tx) => tx.update(tenantExports).set({ status: 'running' }).where(eq(tenantExports.id, id)));
    try {
      const files: { name: string; data: Buffer }[] = [];
      const counts: Record<string, number> = {};
      const redacted: Record<string, string[]> = {};
      let rows = 0;
      const [tenant] = await this.db.withTenant(tenantId, (tx) => tx.select({ slug: tenants.slug, name: tenants.name, kind: tenants.kind, timezone: tenants.timezone, settings: tenants.settings, createdAt: tenants.createdAt }).from(tenants).where(eq(tenants.id, tenantId)));
      for (const table of [...new Set(TENANT_TABLES)].sort()) {
        const data = await this.db.withTenant(tenantId, async (tx) => {
          const exists = await tx.execute(sql`select to_regclass(${`public.${table}`}) as t`);
          if (!(exists.rows[0] as { t: string | null }).t) return null;
          return (await tx.execute(sql`select * from ${sql.identifier(table)}`)).rows as Record<string, unknown>[];
        });
        if (!data) continue;
        const hidden = new Set<string>();
        const clean = data.map((r) => redact(r, hidden));
        if (hidden.size) redacted[table] = [...hidden].sort();
        counts[table] = clean.length;
        rows += clean.length;
        files.push({ name: `tables/${table}.json`, data: Buffer.from(JSON.stringify(clean)) });
      }
      const manifest = {
        format: 'kinetix-tenant-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        institution: { ...tenant, settings: redact((tenant?.settings ?? {}) as Record<string, unknown>, new Set()) },
        tables: counts,
        rows,
        redacted,
        note: 'Each file in tables/ is a JSON array of the table\'s rows for this institution. Secrets (passwords, keys, tokens) are left out.',
      };
      files.unshift({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) });
      const body = zip(files, new Date(), true);
      const key = `exports/${tenantId}/${id}.zip`;
      const size = await this.storage.put(key, bufferStream(body), MAX_BYTES, 'application/zip');
      await this.db.withTenant(tenantId, (tx) =>
        tx
          .update(tenantExports)
          .set({ status: 'ready', fileKey: key, sizeBytes: size, tableCount: Object.keys(counts).length, rowCount: rows, tables: counts, finishedAt: new Date(), expiresAt: new Date(Date.now() + KEEP_DAYS * 86_400_000) })
          .where(eq(tenantExports.id, id)),
      );
    } catch (e) {
      this.log.error(e);
      await this.db.withTenant(tenantId, (tx) => tx.update(tenantExports).set({ status: 'failed', error: e instanceof Error ? e.message.slice(0, 500) : 'Export failed', finishedAt: new Date() }).where(eq(tenantExports.id, id)));
    }
  }

  /** The stored file, for a download (audited). */
  async open(tenantId: string, userId: string, id: string) {
    const row = await this.db.withTenant(tenantId, async (tx) => {
      const [r] = await tx.select().from(tenantExports).where(eq(tenantExports.id, id));
      if (!r) throw new NotFoundException('Export not found');
      if (r.status !== 'ready' || !r.fileKey) throw new ConflictException(r.status === 'expired' ? 'This export has expired; make a new one' : 'This export is not ready yet');
      await tx.update(tenantExports).set({ downloadedAt: new Date() }).where(eq(tenantExports.id, id));
      await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'data_export.downloaded', subjectType: 'tenant_export', subjectId: id });
      return r;
    });
    const { stream, size } = await this.storage.get(row.fileKey!);
    return { stream, size, name: `kinetix-export-${row.createdAt.toISOString().slice(0, 10)}.zip` };
  }

  /** Deletes an export and its file. */
  async remove(tenantId: string, userId: string, id: string): Promise<void> {
    const key = await this.db.withTenant(tenantId, async (tx) => {
      const [r] = await tx.select().from(tenantExports).where(eq(tenantExports.id, id));
      if (!r) throw new NotFoundException('Export not found');
      if (r.status === 'queued' || r.status === 'running') throw new ConflictException('Wait for the export to finish');
      await tx.delete(tenantExports).where(eq(tenantExports.id, id));
      await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'data_export.deleted', subjectType: 'tenant_export', subjectId: id });
      return r.fileKey;
    });
    if (key) await this.storage.delete(key).catch(() => undefined);
  }

  /** Daily: files past their seven days are deleted and the export marked expired. */
  async expire(tenantId: string): Promise<number> {
    const due = await this.db.withTenant(tenantId, (tx) => tx.select({ id: tenantExports.id, key: tenantExports.fileKey }).from(tenantExports).where(and(eq(tenantExports.status, 'ready'), lt(tenantExports.expiresAt, new Date()))));
    for (const d of due) {
      if (d.key) await this.storage.delete(d.key).catch(() => undefined);
      await this.db.withTenant(tenantId, (tx) => tx.update(tenantExports).set({ status: 'expired', fileKey: null }).where(eq(tenantExports.id, d.id)));
    }
    return due.length;
  }
}
