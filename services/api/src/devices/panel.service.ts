import { createHash } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { devices } from '../db/schema.js';
import { panelLauncherApps, panelReleases, panelRollouts, panelUpdateStatus, type ReleaseChannel, type ReleasePlatform, type UpdateState } from '../db/schema-panel.js';
import { ObjectStorage, TooLargeError } from '../storage/storage.service.js';

/** The biggest release file (an APK or a desktop zip/installer). */
export const MAX_RELEASE_BYTES = 800 * 1024 * 1024;
export const RELEASE_TYPES = [
  'application/vnd.android.package-archive',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'application/x-msdownload',
  'application/x-msi',
  'application/msix',
  'application/x-apple-diskimage',
];

/**
 * Orders app versions such as `1.4.0`, `1.4.0+12` or `v2.0`: numeric parts left to right, the build
 * number after `+` last. Returns < 0 when [a] is older than [b].
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => {
    const [main, build] = v.trim().replace(/^v/i, '').split('+');
    const nums = main.split(/[.-]/).map((p) => Number.parseInt(p, 10)).map((n) => (Number.isFinite(n) ? n : 0));
    while (nums.length < 3) nums.push(0);
    return [...nums.slice(0, 3), Number.parseInt(build ?? '0', 10) || 0];
  };
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** What a board is told about an update it should take. */
export interface UpdateOffer {
  releaseId: string;
  version: string;
  channel: ReleaseChannel;
  notes: string | null;
  fileName: string | null;
  bytes: number | null;
  sha256: string | null;
  /** The board fetches the file here with its device token. */
  url: string;
}

export interface LauncherApp {
  package: string;
  label: string;
  iconUrl: string | null;
}

type Release = typeof panelReleases.$inferSelect;

/** OTA releases of the board app, their rollouts to boards, and the panel home's allow-listed apps. */
@Injectable()
export class PanelService {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly storage: ObjectStorage,
  ) {}

  /** Streams an uploaded release file to storage, with its size and SHA-256. */
  async storeFile(key: string, body: Readable, mime: string): Promise<{ bytes: number; sha256: string }> {
    const hash = createHash('sha256');
    const tap = new Transform({
      transform(chunk: Buffer, _enc, done) {
        hash.update(chunk);
        done(null, chunk);
      },
    });
    body.on('error', (e) => tap.destroy(e));
    try {
      const bytes = await this.storage.put(key, body.pipe(tap), MAX_RELEASE_BYTES, mime);
      if (bytes === 0) throw new BadRequestException('The file is empty');
      return { bytes, sha256: hash.digest('hex') };
    } catch (e) {
      if (e instanceof TooLargeError) throw new PayloadTooLargeException('The release file is too large');
      throw e;
    }
  }

  get(key: string) {
    return this.storage.get(key);
  }

  deleteFile(key: string) {
    return this.storage.delete(key).catch(() => undefined);
  }

  /** The institution's releases and the platform's (RLS shows both), newest first. */
  releases(tx: Tx) {
    return tx.select().from(panelReleases).orderBy(desc(panelReleases.createdAt)).limit(200);
  }

  async release(tx: Tx, id: string): Promise<Release> {
    const [r] = await tx.select().from(panelReleases).where(eq(panelReleases.id, id));
    if (!r) throw new NotFoundException('Release not found');
    return r;
  }

  /** The boards a rollout reaches: the selected ones, or every enrolled board on the release's platform and channel. */
  private async targets(tx: Tx, rollout: typeof panelRollouts.$inferSelect, release: Release) {
    const where =
      rollout.target === 'selected'
        ? rollout.deviceIds.length
          ? inArray(devices.id, rollout.deviceIds)
          : sql`false`
        : and(eq(devices.platform, release.platform), release.channel === 'beta' ? eq(devices.updateChannel, 'beta') : undefined);
    return tx
      .select({ id: devices.id, name: devices.name, platform: devices.platform, appVersion: devices.appVersion, updateChannel: devices.updateChannel, lastSeenAt: devices.lastSeenAt, enrolledAt: devices.enrolledAt })
      .from(devices)
      .where(and(where, sql`${devices.enrolledAt} is not null`))
      .orderBy(asc(devices.name));
  }

  /** A rollout with each board's state: what it reported, else installed when its version has caught up, else pending. */
  async rolloutView(tx: Tx, id: string) {
    const [ro] = await tx.select().from(panelRollouts).where(eq(panelRollouts.id, id));
    if (!ro) throw new NotFoundException('Rollout not found');
    const rel = await this.release(tx, ro.releaseId);
    const boards = await this.targets(tx, ro, rel);
    const statuses = boards.length
      ? await tx.select().from(panelUpdateStatus).where(and(eq(panelUpdateStatus.releaseId, rel.id), inArray(panelUpdateStatus.deviceId, boards.map((b) => b.id))))
      : [];
    const byDevice = new Map(statuses.map((s) => [s.deviceId, s]));
    const rows = boards.map((b) => {
      const s = byDevice.get(b.id);
      const caughtUp = b.appVersion != null && compareVersions(b.appVersion, rel.version) >= 0;
      const state: UpdateState | 'pending' = caughtUp ? 'installed' : (s?.state ?? 'pending');
      return { deviceId: b.id, name: b.name, appVersion: b.appVersion, lastSeenAt: b.lastSeenAt, state, error: state === 'failed' ? (s?.error ?? null) : null, updatedAt: s?.updatedAt ?? null };
    });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;
    return {
      id: ro.id,
      target: ro.target,
      active: ro.active,
      createdAt: ro.createdAt,
      stoppedAt: ro.stoppedAt,
      release: { id: rel.id, version: rel.version, platform: rel.platform, channel: rel.channel, scope: rel.scope },
      counts,
      boards: rows,
    };
  }

  async rollouts(tx: Tx) {
    const list = await tx.select({ id: panelRollouts.id }).from(panelRollouts).orderBy(desc(panelRollouts.createdAt)).limit(50);
    return Promise.all(list.map((r) => this.rolloutView(tx, r.id)));
  }

  async startRollout(tx: Tx, userId: string, tenantId: string, body: { releaseId: string; target: 'all' | 'selected'; deviceIds?: string[] }) {
    const rel = await this.release(tx, body.releaseId);
    if (!rel.fileKey) throw new BadRequestException('Upload the release file before rolling it out');
    const ids = body.target === 'selected' ? [...new Set(body.deviceIds ?? [])] : [];
    if (body.target === 'selected') {
      if (!ids.length) throw new BadRequestException('Choose at least one board');
      const found = await tx.select({ id: devices.id, platform: devices.platform }).from(devices).where(inArray(devices.id, ids));
      if (found.length !== ids.length) throw new NotFoundException('Board not found');
      if (found.some((d) => d.platform && d.platform !== rel.platform)) throw new BadRequestException(`This is a ${rel.platform} release; some boards run another platform`);
    }
    const [ro] = await tx.insert(panelRollouts).values({ tenantId, releaseId: rel.id, target: body.target, deviceIds: ids, createdBy: userId }).returning();
    return this.rolloutView(tx, ro.id);
  }

  async stopRollout(tx: Tx, id: string) {
    const [ro] = await tx.update(panelRollouts).set({ active: false, stoppedAt: this.clock.now() }).where(eq(panelRollouts.id, id)).returning();
    if (!ro) throw new NotFoundException('Rollout not found');
    return this.rolloutView(tx, id);
  }

  /** The newest release rolled out to this board that is newer than what it runs, if any. */
  async offerFor(tx: Tx, tenantId: string, deviceId: string, reportedVersion?: string): Promise<UpdateOffer | null> {
    const [d] = await tx.select({ platform: devices.platform, appVersion: devices.appVersion, updateChannel: devices.updateChannel }).from(devices).where(eq(devices.id, deviceId));
    const running = reportedVersion ?? d?.appVersion;
    if (!d?.platform || !running) return null;
    const rows = await tx
      .select({ r: panelReleases })
      .from(panelRollouts)
      .innerJoin(panelReleases, eq(panelReleases.id, panelRollouts.releaseId))
      .where(
        and(
          eq(panelRollouts.active, true),
          eq(panelReleases.platform, d.platform as ReleasePlatform),
          sql`${panelReleases.fileKey} is not null`,
          or(
            and(eq(panelRollouts.target, 'all'), d.updateChannel === 'beta' ? undefined : eq(panelReleases.channel, 'stable')),
            sql`${deviceId}::uuid = any(${panelRollouts.deviceIds})`,
          ),
        ),
      );
    const newer = rows.map((x) => x.r).filter((r) => compareVersions(r.version, running) > 0);
    if (!newer.length) return null;
    const best = newer.sort((a, b) => compareVersions(b.version, a.version))[0];
    await tx.insert(panelUpdateStatus).values({ tenantId, deviceId, releaseId: best.id, state: 'offered', updatedAt: this.clock.now() }).onConflictDoNothing();
    return {
      releaseId: best.id,
      version: best.version,
      channel: best.channel,
      notes: best.notes,
      fileName: best.fileName,
      bytes: best.fileBytes,
      sha256: best.sha256,
      url: `/v1/devices/me/releases/${best.id}/file`,
    };
  }

  /** A board may fetch a release that an active rollout offers it. */
  async releaseForDevice(tx: Tx, deviceId: string, releaseId: string): Promise<Release> {
    const [d] = await tx.select({ updateChannel: devices.updateChannel, platform: devices.platform }).from(devices).where(eq(devices.id, deviceId));
    const rows = await tx
      .select({ r: panelReleases })
      .from(panelRollouts)
      .innerJoin(panelReleases, eq(panelReleases.id, panelRollouts.releaseId))
      .where(
        and(
          eq(panelRollouts.releaseId, releaseId),
          eq(panelRollouts.active, true),
          or(
            and(eq(panelRollouts.target, 'all'), d?.platform ? eq(panelReleases.platform, d.platform as ReleasePlatform) : sql`false`, d?.updateChannel === 'beta' ? undefined : eq(panelReleases.channel, 'stable')),
            sql`${deviceId}::uuid = any(${panelRollouts.deviceIds})`,
          ),
        ),
      )
      .limit(1);
    const r = rows[0]?.r;
    if (!r?.fileKey) throw new NotFoundException('Release not found');
    return r;
  }

  async reportStatus(tx: Tx, tenantId: string, deviceId: string, releaseId: string, state: UpdateState, error?: string) {
    await this.releaseForDevice(tx, deviceId, releaseId);
    const now = this.clock.now();
    const err = state === 'failed' ? (error ?? 'Failed').slice(0, 300) : null;
    await tx
      .insert(panelUpdateStatus)
      .values({ tenantId, deviceId, releaseId, state, error: err, updatedAt: now })
      .onConflictDoUpdate({ target: [panelUpdateStatus.deviceId, panelUpdateStatus.releaseId], set: { state, error: err, updatedAt: now } });
  }

  async setChannel(tx: Tx, deviceId: string, channel: ReleaseChannel) {
    const [d] = await tx.update(devices).set({ updateChannel: channel }).where(eq(devices.id, deviceId)).returning({ id: devices.id, updateChannel: devices.updateChannel });
    if (!d) throw new NotFoundException('Board not found');
    return d;
  }

  /** The apps the board's home shows: its own list when it has one, else the institution's. */
  async launcherFor(tx: Tx, deviceId: string): Promise<LauncherApp[]> {
    const own = await this.launcherList(tx, deviceId);
    return own.length ? own : this.launcherList(tx, null);
  }

  async launcherList(tx: Tx, deviceId: string | null): Promise<LauncherApp[]> {
    return tx
      .select({ package: panelLauncherApps.package, label: panelLauncherApps.label, iconUrl: panelLauncherApps.iconUrl })
      .from(panelLauncherApps)
      .where(deviceId ? eq(panelLauncherApps.deviceId, deviceId) : isNull(panelLauncherApps.deviceId))
      .orderBy(asc(panelLauncherApps.position));
  }

  async setLauncher(tx: Tx, tenantId: string, deviceId: string | null, apps: LauncherApp[]) {
    if (deviceId) {
      const [d] = await tx.select({ id: devices.id }).from(devices).where(eq(devices.id, deviceId));
      if (!d) throw new NotFoundException('Board not found');
    }
    const seen = new Set<string>();
    const unique = apps.filter((a) => !seen.has(a.package) && seen.add(a.package));
    await tx.delete(panelLauncherApps).where(deviceId ? eq(panelLauncherApps.deviceId, deviceId) : isNull(panelLauncherApps.deviceId));
    if (unique.length) await tx.insert(panelLauncherApps).values(unique.map((a, i) => ({ tenantId, deviceId, package: a.package, label: a.label, iconUrl: a.iconUrl, position: i })));
    return this.launcherList(tx, deviceId);
  }

  /** What a board gets back from its health report: an update to take and its home's apps. */
  panelConfig(tenantId: string, deviceId: string, appVersion?: string) {
    return this.db.withTenant(tenantId, async (tx) => {
      const [d] = await tx.select({ updateChannel: devices.updateChannel }).from(devices).where(eq(devices.id, deviceId));
      return { update: await this.offerFor(tx, tenantId, deviceId, appVersion), launcher: { apps: await this.launcherFor(tx, deviceId) }, updateChannel: d?.updateChannel ?? 'stable' };
    });
  }
}
