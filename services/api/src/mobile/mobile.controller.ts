import { BadRequestException, Body, Controller, Get, HttpCode, Ip, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AllowDuringMfaSetup, Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { notificationKind } from '../db/schema.js';
import { APP_PLATFORMS, MOBILE_APPS, appReleases, clientErrorReports, userNotificationPrefs } from '../db/schema-mobile.js';
import { PlatformAdminGuard } from '../platform/platform-admin.guard.js';
import { crashFingerprint, parseVersion, scrubCrashText, updateStatus } from './mobile.logic.js';

const App = z.enum(MOBILE_APPS);
const Platform = z.enum(APP_PLATFORMS);
const Version = z.string().trim().max(40).refine((v) => parseVersion(v) !== null, 'Use a version like 1.4.2');

const CheckQuery = z.object({ app: App, platform: Platform, version: Version });

const ReleaseBody = z.object({
  app: App,
  platform: Platform,
  minVersion: Version,
  latestVersion: Version,
  storeUrl: z.union([z.literal(''), z.url().max(500).refine((u) => u.startsWith('https://'), 'Use an https:// link')]),
  message: z.string().trim().max(300).default(''),
});

const CrashBody = z.object({
  app: App,
  platform: z.string().trim().min(1).max(20),
  appVersion: Version,
  osVersion: z.string().trim().max(80).default(''),
  kind: z.enum(['flutter', 'platform', 'zone', 'isolate']),
  fatal: z.boolean().default(false),
  message: z.string().min(1).max(4000),
  stack: z.string().max(20000).default(''),
  /** The institution the app is signed in to, if any (its slug, not a person). */
  tenant: z.string().trim().max(100).regex(/^[a-z0-9-]*$/).default(''),
});

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 22:00');
const PrefsBody = z
  .object({
    pushOff: z.array(z.enum(notificationKind.enumValues)).max(notificationKind.enumValues.length),
    quietStart: HHMM.nullable(),
    quietEnd: HHMM.nullable(),
  })
  .refine((b) => (b.quietStart === null) === (b.quietEnd === null), 'Give both ends of the quiet hours')
  .refine((b) => b.quietStart === null || b.quietStart !== b.quietEnd, 'Quiet hours must end at a different time');

/**
 * What the apps ask before sign-in: is this version still allowed (forced update below the minimum), and where
 * crash reports go. Both are public (no account needed, a crash can happen on the sign-in screen), rate limited
 * per address, and keep no personal data.
 */
@Controller('v1/public')
export class MobilePublicController {
  constructor(
    private readonly db: DbService,
    private readonly limiter: RateLimiter,
  ) {}

  /** `update_required`: the app shows only the update screen; `update_available`: a dismissable prompt. */
  @Get('app-versions/check')
  async check(@Query('app') app: string, @Query('platform') platform: string, @Query('version') version: string, @Ip() ip: string) {
    await this.limiter.hit(`app-version:${ip}`, 60, 60_000);
    const q = CheckQuery.safeParse({ app, platform, version });
    if (!q.success) throw new BadRequestException(q.error.issues[0]?.message ?? 'Give app, platform and version');
    const [r] = await this.db.system.select().from(appReleases).where(and(eq(appReleases.app, q.data.app), eq(appReleases.platform, q.data.platform)));
    const minVersion = r?.minVersion ?? '0.0.0';
    const latestVersion = r?.latestVersion ?? '0.0.0';
    return { status: updateStatus(q.data.version, minVersion, latestVersion), minVersion, latestVersion, storeUrl: r?.storeUrl ?? '', message: r?.message ?? '' };
  }

  /** A crash in an app, scrubbed and grouped (one row per fingerprint and version, with a count). */
  @Post('client-errors')
  @HttpCode(202)
  async crash(@Body(new ZodBody(CrashBody)) b: z.infer<typeof CrashBody>, @Ip() ip: string) {
    await this.limiter.hit(`client-errors:${ip}`, 30, 60_000);
    const message = scrubCrashText(b.message, 1000);
    const stack = scrubCrashText(b.stack, 8000);
    const fingerprint = crashFingerprint(b.app, b.kind, message, stack);
    await this.db.system
      .insert(clientErrorReports)
      .values({ app: b.app, platform: b.platform, appVersion: b.appVersion, osVersion: scrubCrashText(b.osVersion, 80), kind: b.kind, fatal: b.fatal, message, stack, fingerprint, tenantSlug: b.tenant })
      .onConflictDoUpdate({
        target: [clientErrorReports.fingerprint, clientErrorReports.appVersion],
        set: { occurrences: sql`${clientErrorReports.occurrences} + 1`, lastSeenAt: sql`now()`, resolvedAt: null, fatal: sql`${clientErrorReports.fatal} or excluded.fatal` },
      });
    return { received: true };
  }
}

/** The platform team: app versions per platform (forced and recommended updates) and the apps' crash reports. */
@Controller('v1/platform')
@Auth('user')
@UseGuards(PlatformAdminGuard)
export class MobilePlatformController {
  constructor(private readonly db: DbService) {}

  @Get('app-releases')
  releases() {
    return this.db.system.select().from(appReleases).orderBy(asc(appReleases.app), asc(appReleases.platform));
  }

  /** Sets the minimum and latest versions of one app on one platform. The minimum may not be newer than the latest. */
  @Put('app-releases')
  async setRelease(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReleaseBody)) b: z.infer<typeof ReleaseBody>) {
    if (updateStatus(b.latestVersion, b.minVersion, b.minVersion) === 'update_required') throw new BadRequestException('The minimum version cannot be newer than the latest');
    return this.db.system.transaction(async (tx) => {
      const [row] = await tx
        .insert(appReleases)
        .values({ ...b, updatedBy: p.userId })
        .onConflictDoUpdate({ target: [appReleases.app, appReleases.platform], set: { minVersion: b.minVersion, latestVersion: b.latestVersion, storeUrl: b.storeUrl, message: b.message, updatedBy: p.userId, updatedAt: new Date() } })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'platform.app_release_set', subjectType: 'app_release', subjectId: row.id, data: { app: b.app, platform: b.platform, minVersion: b.minVersion, latestVersion: b.latestVersion } });
      return row;
    });
  }

  /** Open crash groups, most recent first (`?app=teacher`, `?resolved=true` for the closed ones). */
  @Get('client-errors')
  crashes(@Query('app') app?: string, @Query('resolved') resolved?: string, @Query('limit') limit?: string) {
    const a = App.safeParse(app);
    const n = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return this.db.system
      .select()
      .from(clientErrorReports)
      .where(and(a.success ? eq(clientErrorReports.app, a.data) : undefined, resolved === 'true' ? sql`${clientErrorReports.resolvedAt} is not null` : isNull(clientErrorReports.resolvedAt)))
      .orderBy(desc(clientErrorReports.lastSeenAt))
      .limit(n);
  }

  /** Marks a crash group fixed; it opens again if the same crash comes back on that version. */
  @Post('client-errors/:id/resolve')
  @HttpCode(204)
  async resolve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.system.transaction(async (tx) => {
      const rows = await tx.update(clientErrorReports).set({ resolvedAt: new Date() }).where(eq(clientErrorReports.id, id)).returning({ id: clientErrorReports.id });
      if (!rows.length) throw new NotFoundException('That crash report does not exist');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'platform.client_error_resolved', subjectType: 'client_error_report', subjectId: id });
    });
  }
}

/** Profile → Notifications in the apps: kinds that should not buzz the phone, and personal quiet hours. */
@Controller('v1/me/notification-preferences')
export class NotificationPrefsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  @Get()
  @Auth('user')
  @AllowDuringMfaSetup()
  get(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(userNotificationPrefs).where(eq(userNotificationPrefs.userId, p.userId));
      return { kinds: notificationKind.enumValues, pushOff: row?.pushOff ?? [], quietStart: row?.quietStart ?? null, quietEnd: row?.quietEnd ?? null };
    });
  }

  @Put()
  @Auth('user')
  @AllowDuringMfaSetup()
  set(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PrefsBody)) b: z.infer<typeof PrefsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const pushOff = [...new Set(b.pushOff)].sort();
      const [row] = await tx
        .insert(userNotificationPrefs)
        .values({ tenantId: p.tenantId, userId: p.userId, pushOff, quietStart: b.quietStart, quietEnd: b.quietEnd })
        .onConflictDoUpdate({ target: userNotificationPrefs.userId, set: { pushOff, quietStart: b.quietStart, quietEnd: b.quietEnd, updatedAt: this.clock.now() } })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'notifications.preferences_set', subjectType: 'user', subjectId: p.userId, data: { pushOff, quietStart: b.quietStart, quietEnd: b.quietEnd } });
      return { kinds: notificationKind.enumValues, pushOff: row.pushOff, quietStart: row.quietStart, quietEnd: row.quietEnd };
    });
  }
}
