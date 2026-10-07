import { Controller, Get, Inject, Ip, Param } from '@nestjs/common';
import type { CertificateVerification, IdCardVerification } from '@kinetix/shared';
import { eq } from 'drizzle-orm';
import { localParts } from '../common/time.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { certificates, departments, designations, sections, staffProfiles, students, tenants, users } from '../db/schema.js';
import { longDate, parseIdCardCode } from './render.js';

/**
 * Public verification for the QR codes on certificates and ID cards. No sign-in; rate limited
 * per address; answers reveal no more than the document itself shows. Tokens are random 128-bit
 * values, so they cannot be guessed or enumerated.
 */
@Controller('v1/public')
export class PublicVerifyController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
  ) {}

  @Get('verify/:slug/:token')
  async verify(@Param('slug') slug: string, @Param('token') token: string, @Ip() ip: string): Promise<CertificateVerification> {
    await this.limiter.hit(`verify:${ip}`, 30, 60_000);
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) && /^[0-9a-f]{32}$/.test(token) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant) return { status: 'not_found' };
    return this.db.withTenant(tenant.id, async (tx) => {
      const [c] = await tx.select().from(certificates).where(eq(certificates.verifyToken, token));
      if (!c || (c.status !== 'issued' && c.status !== 'revoked')) return { status: 'not_found' as const };
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      const subject = c.studentId ? (await tx.select({ n: students.fullName }).from(students).where(eq(students.id, c.studentId)))[0]?.n : (await tx.select({ n: users.fullName }).from(users).where(eq(users.id, c.staffUserId!)))[0]?.n;
      return {
        status: c.status === 'revoked' ? ('revoked' as const) : ('valid' as const),
        institution: t.name,
        title: c.renderedTitle ?? undefined,
        serialNo: c.serialNo ?? undefined,
        subjectName: subject,
        issuedOn: c.issuedAt ? longDate(localParts(c.issuedAt, tenant.timezone).date) : undefined,
        ...(c.revokedAt ? { revokedOn: longDate(localParts(c.revokedAt, tenant.timezone).date) } : {}),
      };
    });
  }

  @Get('verify-id/:slug/:code')
  async verifyId(@Param('slug') slug: string, @Param('code') code: string, @Ip() ip: string): Promise<IdCardVerification> {
    await this.limiter.hit(`verify:${ip}`, 30, 60_000);
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    const who = tenant ? parseIdCardCode(this.env.JWT_SECRET, tenant.id, code) : null;
    if (!tenant || !who) return { status: 'not_found' };
    return this.db.withTenant(tenant.id, async (tx) => {
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      if (who.kind === 'student') {
        const [s] = await tx.select({ name: students.fullName, status: students.status, className: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, who.id));
        if (!s) return { status: 'not_found' as const };
        return { status: s.status === 'active' ? ('valid' as const) : ('inactive' as const), institution: t.name, kind: 'student' as const, name: s.name, detail: s.className };
      }
      const [u] = await tx
        .select({ name: users.fullName, status: users.status, left: staffProfiles.status, designation: designations.name, department: departments.name })
        .from(users)
        .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
        .leftJoin(designations, eq(designations.id, staffProfiles.designationId))
        .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
        .where(eq(users.id, who.id));
      if (!u) return { status: 'not_found' as const };
      return { status: u.status === 'active' && u.left !== 'exited' ? ('valid' as const) : ('inactive' as const), institution: t.name, kind: 'staff' as const, name: u.name, detail: [u.designation, u.department].filter(Boolean).join(', ') || undefined };
    });
  }
}
