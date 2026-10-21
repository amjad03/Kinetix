import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { createInstitution, parseArgs, SlugTakenError, UsageError } from '../db/create-institution.js';
import { DbService } from '../db/db.service.js';
import { tenants } from '../db/schema.js';
import { EDITIONS } from '../institution/edition.js';
import { invalidateModuleGate } from '../institution/module-gate.interceptor.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

const Edition = z.enum(EDITIONS);
const CreateBody = z.object({
  slug: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(['school', 'college', 'university']),
  edition: Edition.default('full'),
  timezone: z.string().trim().max(60).optional(),
  campus: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  yearLabel: z.string().trim().min(1).max(20),
  yearStart: z.string(),
  yearEnd: z.string(),
  adminName: z.string().trim().min(1).max(200),
  adminEmail: z.string().trim().min(3).max(200),
  adminPhone: z.string().trim().max(20).optional(),
});
const PatchBody = z
  .object({ name: z.string().trim().min(1).max(200).optional(), edition: Edition.optional() })
  .refine((b) => b.name !== undefined || b.edition !== undefined, 'Nothing to change');

const TENANT = { id: tenants.id, slug: tenants.slug, name: tenants.name, kind: tenants.kind, edition: tenants.edition, timezone: tenants.timezone, createdAt: tenants.createdAt };

/**
 * Institutions as the KINETIX platform team sees them: list, create (with the first
 * administrator, as `pnpm db:create-institution` does) and set the edition (full ERP + board, or
 * the Zynetix board edition). Owner role, like the rest of the platform area.
 */
@Controller('v1/platform/tenants')
@Auth('user')
@UseGuards(PlatformAdminGuard)
export class PlatformTenantsController {
  constructor(private readonly db: DbService) {}

  @Get()
  list() {
    return this.db.system.select(TENANT).from(tenants).orderBy(asc(tenants.name));
  }

  /** Creates the institution, its first campus and year, and its administrator; the temporary password is shown once. */
  @Post()
  async create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateBody)) b: z.infer<typeof CreateBody>) {
    const argv = ['--slug', b.slug, '--name', b.name, '--kind', b.kind, '--edition', b.edition, '--year-label', b.yearLabel, '--year-start', b.yearStart, '--year-end', b.yearEnd, '--admin-name', b.adminName, '--admin-email', b.adminEmail];
    for (const [flag, v] of [['timezone', b.timezone], ['campus', b.campus], ['city', b.city], ['admin-phone', b.adminPhone]] as const) if (v) argv.push(`--${flag}`, v);
    let args;
    try {
      args = parseArgs(argv);
    } catch (e) {
      if (e instanceof UsageError) throw new BadRequestException(e.message.replace(/--([a-z-]+)/g, (_, f: string) => f.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())));
      throw e;
    }
    try {
      const r = await createInstitution(this.db.system, args);
      await this.db.withTenant(p.tenantId, (tx) =>
        audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'platform.tenant.created', subjectType: 'tenant', subjectId: r.tenant.id, data: { slug: r.tenant.slug, edition: r.tenant.edition } }),
      );
      return {
        tenant: { id: r.tenant.id, slug: r.tenant.slug, name: r.tenant.name, kind: r.tenant.kind, edition: r.tenant.edition, timezone: r.tenant.timezone },
        admin: { id: r.admin.id, fullName: r.admin.fullName, email: r.admin.email, temporaryPassword: r.password },
      };
    } catch (e) {
      if (e instanceof SlugTakenError) throw new ConflictException(e.message);
      throw e;
    }
  }

  /** Renames an institution or switches its edition; the API applies the new edition at once. */
  @Patch(':id')
  async update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PatchBody)) b: z.infer<typeof PatchBody>) {
    const [t] = await this.db.system.update(tenants).set(b).where(eq(tenants.id, id)).returning(TENANT);
    if (!t) throw new NotFoundException('Institution not found');
    invalidateModuleGate(id);
    await this.db.withTenant(p.tenantId, (tx) => audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'platform.tenant.updated', subjectType: 'tenant', subjectId: id, data: b }));
    return t;
  }
}
