import { CanActivate, ExecutionContext, applyDecorators, Body, Controller, ForbiddenException, Get, Global, Injectable, Module, NotFoundException, Param, Put, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { Principal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { featureFlags } from '../db/schema-foundation.js';

/** Every flag the product knows, with its default for an institution that never set it. */
export const FLAG_DEFINITIONS = {
  'analytics.reports': { description: 'Reports and analytics (catalogue, KPIs, scheduled reports)', default: true },
  'analytics.accreditation': { description: 'NAAC / NIRF / AISHE data export packs', default: true },
  'search.global': { description: 'Global search across students, staff, courses, documents and reports', default: true },
  'classroom.analytics': { description: 'Classroom analytics from the board (usage, tools, syllabus coverage)', default: true },
  'documents.virus_scan': { description: 'Quarantine uploads until the virus scan is clean (needs UPLOAD_SCAN=clamav on the server)', default: true },
} as const satisfies Record<string, { description: string; default: boolean }>;
export type FlagKey = keyof typeof FLAG_DEFINITIONS;
const ADMIN_ROLES = ['tenant_admin', 'principal'] as const;

/** Per-institution feature flags: a row overrides the default in FLAG_DEFINITIONS. */
@Injectable()
export class FeatureFlags {
  constructor(private readonly db: DbService) {}

  async all(tx: Tx, tenantId: string): Promise<Record<FlagKey, boolean>> {
    const rows = await tx.select().from(featureFlags).where(eq(featureFlags.tenantId, tenantId));
    const out = Object.fromEntries((Object.keys(FLAG_DEFINITIONS) as FlagKey[]).map((k) => [k, FLAG_DEFINITIONS[k].default])) as Record<FlagKey, boolean>;
    for (const r of rows) if (r.key in out) out[r.key as FlagKey] = r.enabled;
    return out;
  }

  async isEnabled(tx: Tx, tenantId: string, key: FlagKey): Promise<boolean> {
    return (await this.all(tx, tenantId))[key];
  }

  async set(tx: Tx, tenantId: string, key: FlagKey, enabled: boolean, actorId: string): Promise<void> {
    await tx
      .insert(featureFlags)
      .values({ tenantId, key, enabled, updatedBy: actorId })
      .onConflictDoUpdate({ target: [featureFlags.tenantId, featureFlags.key], set: { enabled, updatedBy: actorId, updatedAt: new Date() } });
  }
}

export const FEATURE_META = 'kinetix:feature';

/** Rejects with 403 FEATURE_DISABLED when the signed-in institution has the flag off. Runs after AuthGuard. */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
    private readonly flags: FeatureFlags,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const keys = [...new Set(this.reflector.getAllAndMerge<FlagKey[]>(FEATURE_META, [ctx.getHandler(), ctx.getClass()]))];
    if (!keys.length) return true;
    const principal: Principal | undefined = ctx.switchToHttp().getRequest().principal;
    if (!principal) return true; // public endpoints have no tenant
    const all = await this.db.withTenant(principal.tenantId, (tx) => this.flags.all(tx, principal.tenantId));
    const off = keys.find((k) => !all[k]);
    if (off) throw new ForbiddenException({ message: `The feature "${off}" is turned off for this institution`, code: 'FEATURE_DISABLED' });
    return true;
  }
}

/** `@RequireFeature('analytics.reports')` on a controller or handler. */
export const RequireFeature = (key: FlagKey) => applyDecorators(SetMetadata(FEATURE_META, [key]), UseGuards(FeatureGuard));

const FlagBody = z.object({ enabled: z.boolean() });

@Controller('v1')
export class FlagsController {
  constructor(
    private readonly db: DbService,
    private readonly flags: FeatureFlags,
  ) {}

  /** The effective flags for the caller's institution (the apps hide what is off). */
  @Get('features')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.flags.all(tx, p.tenantId));
  }

  @Get('admin/features')
  @Auth('user', [...ADMIN_ROLES])
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const all = await this.flags.all(tx, p.tenantId);
      return (Object.keys(FLAG_DEFINITIONS) as FlagKey[]).map((key) => ({ key, description: FLAG_DEFINITIONS[key].description, default: FLAG_DEFINITIONS[key].default, enabled: all[key] }));
    });
  }

  @Put('admin/features/:key')
  @Auth('user', [...ADMIN_ROLES])
  set(@CurrentPrincipal() p: UserPrincipal, @Param('key') key: string, @Body(new ZodBody(FlagBody)) body: z.infer<typeof FlagBody>) {
    if (!(key in FLAG_DEFINITIONS)) throw new NotFoundException('Unknown feature');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = (await this.flags.all(tx, p.tenantId))[key as FlagKey];
      await this.flags.set(tx, p.tenantId, key as FlagKey, body.enabled, p.userId);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'feature.toggled', subjectType: 'feature_flag', data: { key, before, after: body.enabled } });
      return { key, enabled: body.enabled };
    });
  }
}

@Global()
@Module({ controllers: [FlagsController], providers: [FeatureFlags, FeatureGuard], exports: [FeatureFlags, FeatureGuard] })
export class FlagsModule {}
