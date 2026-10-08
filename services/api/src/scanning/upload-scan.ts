import { BeforeApplicationShutdown, ServiceUnavailableException, UnprocessableEntityException, Global, Inject, Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { connect } from 'node:net';
import { audit } from '../common/audit.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { vaultDocuments } from '../db/schema.js';
import { uploadScans } from '../db/schema-foundation.js';
import { FeatureFlags } from '../flags/flags.js';
import { uploadScansTotal } from '../observability/metrics.js';
import { ObjectStorage } from '../storage/storage.service.js';

export interface ScanResult {
  clean: boolean;
  /** The signature name when infected (e.g. Eicar-Test-Signature). */
  signature?: string;
}

/** A virus scanner. Implementations throw when the scanner itself is unavailable (the file stays quarantined and is retried). */
export abstract class VirusScanner {
  abstract readonly enabled: boolean;
  abstract scan(data: Buffer): Promise<ScanResult>;
}

/** The default: scanning is off and uploads are accepted as they are. */
export class DisabledScanner extends VirusScanner {
  readonly enabled = false;
  async scan(): Promise<ScanResult> {
    return { clean: true };
  }
}

/** ClamAV over its `clamd` TCP socket (INSTREAM). */
export class ClamAvScanner extends VirusScanner {
  readonly enabled = true;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 30_000,
  ) {
    super();
  }

  scan(data: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      let reply = '';
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error('clamd timed out')));
      socket.on('error', reject);
      socket.on('data', (d) => (reply += d.toString('utf8')));
      socket.on('close', () => {
        const text = reply.replace(/\0/g, '').trim();
        if (/OK$/.test(text)) resolve({ clean: true });
        else {
          const m = /^stream: (.+) FOUND$/.exec(text);
          if (m) resolve({ clean: false, signature: m[1] });
          else reject(new Error(`clamd answered: ${text || 'nothing'}`));
        }
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let i = 0; i < data.length; i += 64 * 1024) {
          const chunk = data.subarray(i, i + 64 * 1024);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(chunk.length);
          socket.write(len);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

const MAX_ATTEMPTS = 5;
export type ScanState = 'clean' | 'pending';

/**
 * Quarantine-until-clean for uploads. When scanning is on, `register` records a pending scan and the
 * file cannot be downloaded (its `scan_status` is not `clean`) until `scanPending` has had it scanned:
 * clean opens it, infected deletes the object and keeps the record, a scanner outage retries and,
 * after five attempts, leaves it quarantined with status `error` for an administrator to look at.
 */
@Injectable()
export class UploadScanService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly log = new Logger(UploadScanService.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;

  constructor(
    private readonly db: DbService,
    private readonly scanner: VirusScanner,
    private readonly storage: ObjectStorage,
    private readonly flags: FeatureFlags,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get enabled(): boolean {
    return this.scanner.enabled;
  }

  /**
   * Inline scan for small uploads stored outside the vault (homework photos, public admission
   * documents, profile photos). Infected files are refused; when the scanner is down the upload is
   * refused too, so nothing unscanned is stored while scanning is on.
   */
  async assertClean(data: Buffer, name = 'This file'): Promise<void> {
    if (!this.scanner.enabled) return;
    let result: ScanResult;
    try {
      result = await this.scanner.scan(data);
    } catch (e) {
      uploadScansTotal.inc({ outcome: 'error' });
      this.log.warn(`inline scan failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException('Files cannot be checked for viruses right now. Try again in a few minutes.');
    }
    uploadScansTotal.inc({ outcome: result.clean ? 'clean' : 'infected' });
    if (!result.clean) throw new UnprocessableEntityException(`${name} looks unsafe and was not uploaded`);
  }

  /** Call in the upload's transaction once the object is stored. Returns the state the record should start in. */
  async register(tx: Tx, tenantId: string, subjectType: string, subjectId: string, storageKey: string): Promise<ScanState> {
    if (!this.scanner.enabled || !(await this.flags.isEnabled(tx, tenantId, 'documents.virus_scan'))) return 'clean';
    await tx.insert(uploadScans).values({ tenantId, subjectType, subjectId, storageKey }).onConflictDoNothing();
    return 'pending';
  }

  onApplicationBootstrap(): void {
    if (this.scanner.enabled && this.env.SCAN_POLL_MS > 0) {
      this.timer = setInterval(() => void this.scanPending().catch((e) => this.log.error(e)), this.env.SCAN_POLL_MS);
      this.timer.unref();
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  /** Scans every pending upload; returns how many reached a verdict. */
  scanPending(): Promise<number> {
    this.running ??= this.loop().finally(() => (this.running = undefined));
    return this.running;
  }

  private async loop(): Promise<number> {
    let n = 0;
    const seen = new Set<string>();
    for (;;) {
      const done = await this.db.system.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(uploadScans)
          .where(eq(uploadScans.status, 'pending'))
          .orderBy(asc(uploadScans.createdAt))
          .limit(10)
          .for('update', { skipLocked: true })
          .then((rows) => rows.filter((r) => !seen.has(r.id)));
        if (!row) return null;
        seen.add(row.id);
        try {
          const { stream } = await this.storage.get(row.storageKey);
          const verdict = await this.scanner.scan(Buffer.concat(await stream.toArray()));
          await tx.update(uploadScans).set({ status: verdict.clean ? 'clean' : 'infected', signature: verdict.signature ?? null, scannedAt: new Date(), attempts: row.attempts + 1 }).where(eq(uploadScans.id, row.id));
          await this.apply(tx, row, verdict.clean ? 'clean' : 'infected', verdict.signature);
          uploadScansTotal.inc({ outcome: verdict.clean ? 'clean' : 'infected' });
          return true;
        } catch (e) {
          const attempts = row.attempts + 1;
          const dead = attempts >= MAX_ATTEMPTS;
          this.log.warn(`Scan of ${row.subjectType} ${row.subjectId} failed (attempt ${attempts}): ${(e as Error).message}`);
          await tx.update(uploadScans).set({ attempts, ...(dead ? { status: 'error' } : {}) }).where(eq(uploadScans.id, row.id));
          if (dead) await this.apply(tx, row, 'error');
          uploadScansTotal.inc({ outcome: dead ? 'error' : 'retry' });
          return false;
        }
      });
      if (done === null) return n;
      if (done) n++;
    }
  }

  private async apply(tx: Tx, row: typeof uploadScans.$inferSelect, status: 'clean' | 'infected' | 'error', signature?: string): Promise<void> {
    if (row.subjectType === 'vault_document') await tx.update(vaultDocuments).set({ scanStatus: status, ...(status === 'infected' ? { archivedAt: new Date() } : {}) }).where(eq(vaultDocuments.id, row.subjectId));
    if (status === 'infected') await this.storage.delete(row.storageKey).catch(() => undefined);
    if (status !== 'clean') await audit(tx, { tenantId: row.tenantId, actorType: 'system', action: status === 'infected' ? 'upload.infected' : 'upload.scan_failed', subjectType: row.subjectType, subjectId: row.subjectId, data: { signature } });
  }
}

@Global()
@Module({
  providers: [
    { provide: VirusScanner, inject: [ENV], useFactory: (env: Env) => (env.UPLOAD_SCAN === 'clamav' ? new ClamAvScanner(env.CLAMAV_HOST, env.CLAMAV_PORT) : new DisabledScanner()) },
    UploadScanService,
  ],
  exports: [UploadScanService, VirusScanner],
})
export class ScanningModule {}
