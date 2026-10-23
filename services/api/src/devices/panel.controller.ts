import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { panelReleases, RELEASE_CHANNELS, RELEASE_PLATFORMS, UPDATE_STATES } from '../db/schema-panel.js';
import { PlatformAdminGuard } from '../platform/platform-admin.guard.js';
import { MAX_RELEASE_BYTES, PanelService, RELEASE_TYPES } from './panel.service.js';

const ReleaseBody = z.object({
  platform: z.enum(RELEASE_PLATFORMS),
  version: z.string().trim().regex(/^v?\d+(\.\d+){0,3}([-.][0-9A-Za-z.]+)?(\+\d+)?$/, 'A version looks like 1.4.0 or 1.4.0+12'),
  channel: z.enum(RELEASE_CHANNELS).default('stable'),
  notes: z.string().trim().max(2000).optional(),
});

const RolloutBody = z.object({ releaseId: z.uuid(), target: z.enum(['all', 'selected']), deviceIds: z.array(z.uuid()).max(500).optional() });
const ChannelBody = z.object({ channel: z.enum(RELEASE_CHANNELS) });
const PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
const LauncherBody = z.object({
  deviceId: z.uuid().nullable(),
  apps: z
    .array(z.object({ package: z.string().trim().max(150).regex(PACKAGE, 'A package name looks like com.android.chrome'), label: z.string().trim().min(1).max(60), iconUrl: z.url().max(500).nullable().optional() }))
    .max(40),
});
const StatusBody = z.object({ state: z.enum(UPDATE_STATES), error: z.string().max(300).optional() });

/** The upload's file type and a safe file name (from `x-file-name`). */
function uploadMeta(req: Request): { mime: string; name: string } {
  const mime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!RELEASE_TYPES.includes(mime)) throw new BadRequestException(`Unsupported file type "${mime}"; upload an APK, zip or installer`);
  if (Number(req.headers['content-length'] ?? 0) > MAX_RELEASE_BYTES) throw new BadRequestException('The release file is too large');
  const raw = decodeURIComponent(String(req.headers['x-file-name'] ?? 'release'));
  const name = raw.replace(/[^\w.+-]+/g, '_').slice(0, 120) || 'release';
  return { mime, name };
}

async function sendFile(panel: PanelService, res: Response, r: typeof panelReleases.$inferSelect) {
  if (!r.fileKey) throw new BadRequestException('This release has no file yet');
  const { stream, size } = await panel.get(r.fileKey);
  res.setHeader('content-type', r.fileMime ?? 'application/octet-stream');
  res.setHeader('content-length', size);
  res.setHeader('content-disposition', `attachment; filename="${r.fileName ?? 'release'}"`);
  if (r.sha256) res.setHeader('x-sha256', r.sha256);
  stream.pipe(res);
}

/**
 * Panel updates and the panel home in the Zynetix dashboard: an institution admin uploads a build
 * of the board app (or uses one the platform published), rolls it out to all or chosen boards and
 * follows each board's state; and picks the apps the panel home shows.
 */
@Controller('v1/panel')
@Auth('user', STAFF_ADMIN_ROLES)
export class PanelController {
  constructor(
    private readonly db: DbService,
    private readonly panel: PanelService,
  ) {}

  @Get('releases')
  releases(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.panel.releases(tx));
  }

  @Post('releases')
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReleaseBody)) b: z.infer<typeof ReleaseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.insert(panelReleases).values({ tenantId: p.tenantId, scope: 'institution', platform: b.platform, version: b.version, channel: b.channel, notes: b.notes || null, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'panel.release.created', subjectType: 'panel_release', subjectId: r.id, data: { version: r.version, platform: r.platform, channel: r.channel } });
      return r;
    });
  }

  /** The release file, streamed straight to storage (`content-type` and `x-file-name` headers). */
  @Put('releases/:id/file')
  async upload(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { mime, name } = uploadMeta(req);
    const r = await this.db.withTenant(p.tenantId, (tx) => this.panel.release(tx, id));
    if (r.scope !== 'institution') throw new BadRequestException('Platform releases are managed by the platform team');
    const key = `tenants/${p.tenantId}/panel-releases/${id}/${name}`;
    const f = await this.panel.storeFile(key, req, mime);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.update(panelReleases).set({ fileKey: key, fileName: name, fileMime: mime, fileBytes: f.bytes, sha256: f.sha256 }).where(eq(panelReleases.id, id)).returning();
      if (r.fileKey && r.fileKey !== key) await this.panel.deleteFile(r.fileKey);
      return u;
    });
  }

  @Get('releases/:id/file')
  async download(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const r = await this.db.withTenant(p.tenantId, (tx) => this.panel.release(tx, id));
    await sendFile(this.panel, res, r);
  }

  @Delete('releases/:id')
  @HttpCode(204)
  async remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const key = await this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.panel.release(tx, id);
      if (r.scope !== 'institution') throw new BadRequestException('Platform releases are managed by the platform team');
      await tx.delete(panelReleases).where(eq(panelReleases.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'panel.release.deleted', subjectType: 'panel_release', subjectId: id, data: { version: r.version } });
      return r.fileKey;
    });
    if (key) await this.panel.deleteFile(key);
  }

  @Get('rollouts')
  rollouts(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.panel.rollouts(tx));
  }

  @Get('rollouts/:id')
  rollout(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.panel.rolloutView(tx, id));
  }

  @Post('rollouts')
  start(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RolloutBody)) b: z.infer<typeof RolloutBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.panel.startRollout(tx, p.userId, p.tenantId, b);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'panel.rollout.started', subjectType: 'panel_rollout', subjectId: v.id, data: { releaseId: b.releaseId, target: b.target, boards: v.boards.length } });
      return v;
    });
  }

  @Post('rollouts/:id/stop')
  @HttpCode(200)
  stop(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = await this.panel.stopRollout(tx, id);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'panel.rollout.stopped', subjectType: 'panel_rollout', subjectId: id });
      return v;
    });
  }

  @Put('devices/:id/channel')
  channel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ChannelBody)) b: z.infer<typeof ChannelBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.panel.setChannel(tx, id, b.channel));
  }

  /** The panel home's apps: the institution's list (no `deviceId`) or one board's own. */
  @Get('launcher')
  launcher(@CurrentPrincipal() p: UserPrincipal, @Query('deviceId') deviceId?: string) {
    if (deviceId && !z.uuid().safeParse(deviceId).success) throw new BadRequestException('Bad deviceId');
    return this.db.withTenant(p.tenantId, async (tx) => ({ deviceId: deviceId ?? null, apps: await this.panel.launcherList(tx, deviceId ?? null) }));
  }

  @Put('launcher')
  setLauncher(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LauncherBody)) b: z.infer<typeof LauncherBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const apps = await this.panel.setLauncher(tx, p.tenantId, b.deviceId, b.apps.map((a) => ({ package: a.package, label: a.label, iconUrl: a.iconUrl ?? null })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'panel.launcher.updated', subjectType: 'device', subjectId: b.deviceId ?? p.tenantId, data: { packages: apps.map((a) => a.package) } });
      return { deviceId: b.deviceId, apps };
    });
  }
}

/** The board's side: what to update to (also in its health report's answer), the file, and how it went. */
@Controller('v1/devices/me')
@Auth(['device', 'board'])
export class PanelDeviceController {
  constructor(
    private readonly db: DbService,
    private readonly panel: PanelService,
    private readonly limiter: RateLimiter,
  ) {}

  @Get('panel')
  config(@CurrentPrincipal() p: DevicePrincipal) {
    return this.panel.panelConfig(p.tenantId, p.deviceId);
  }

  @Get('releases/:id/file')
  async file(@CurrentPrincipal() p: DevicePrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    await this.limiter.hit(`release-dl:${p.deviceId}`, 10, 3600_000);
    const r = await this.db.withTenant(p.tenantId, (tx) => this.panel.releaseForDevice(tx, p.deviceId, id));
    await sendFile(this.panel, res, r);
  }

  @Post('releases/:id/status')
  @HttpCode(204)
  async status(@CurrentPrincipal() p: DevicePrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StatusBody)) b: z.infer<typeof StatusBody>) {
    await this.limiter.hit(`release-st:${p.deviceId}`, 60, 60_000);
    await this.db.withTenant(p.tenantId, (tx) => this.panel.reportStatus(tx, p.tenantId, p.deviceId, id, b.state, b.error));
  }
}

/** The platform team publishes builds every institution can roll out (owner role: the app role cannot write platform rows). */
@Controller('v1/platform/panel-releases')
@Auth('user')
@UseGuards(PlatformAdminGuard)
export class PlatformPanelController {
  constructor(
    private readonly db: DbService,
    private readonly panel: PanelService,
  ) {}

  @Get()
  list() {
    return this.db.system.select().from(panelReleases).where(eq(panelReleases.scope, 'platform')).orderBy(panelReleases.createdAt);
  }

  @Post()
  async create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReleaseBody)) b: z.infer<typeof ReleaseBody>) {
    const [r] = await this.db.system.insert(panelReleases).values({ tenantId: null, scope: 'platform', platform: b.platform, version: b.version, channel: b.channel, notes: b.notes || null, createdBy: p.userId }).returning();
    return r;
  }

  @Put(':id/file')
  async upload(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { mime, name } = uploadMeta(req);
    const [r] = await this.db.system.select().from(panelReleases).where(eq(panelReleases.id, id));
    if (!r || r.scope !== 'platform') throw new BadRequestException('Release not found');
    const key = `platform/panel-releases/${id}/${name}`;
    const f = await this.panel.storeFile(key, req, mime);
    const [u] = await this.db.system.update(panelReleases).set({ fileKey: key, fileName: name, fileMime: mime, fileBytes: f.bytes, sha256: f.sha256 }).where(eq(panelReleases.id, id)).returning();
    if (r.fileKey && r.fileKey !== key) await this.panel.deleteFile(r.fileKey);
    return u;
  }
}
