import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from './db.service.js';
import { devices, feePayments, platformAdmins, tenants, users } from './schema.js';

/**
 * The only queries allowed to bypass row-level security. Each one answers
 * "which tenant does this belong to?" for a request that has no tenant context yet.
 * Keep this list short and never return more than the tenant identity (or, for the platform
 * team, a yes or no).
 */
@Injectable()
export class SystemLookups {
  constructor(private readonly db: DbService) {}

  async tenantBySlug(slug: string): Promise<{ id: string; timezone: string } | undefined> {
    const [row] = await this.db.system
      .select({ id: tenants.id, timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.slug, slug));
    return row;
  }

  async tenantForEnrollmentCode(codeHash: string): Promise<{ tenantId: string; deviceId: string } | undefined> {
    const [row] = await this.db.system
      .select({ tenantId: devices.tenantId, deviceId: devices.id })
      .from(devices)
      .where(eq(devices.enrollmentCodeHash, codeHash));
    return row;
  }

  /** Whether an active user is on the KINETIX platform team (PlatformAdminGuard, GET /v1/me). */
  async isPlatformAdmin(userId: string): Promise<boolean> {
    const [row] = await this.db.system
      .select({ userId: platformAdmins.userId })
      .from(platformAdmins)
      .innerJoin(users, eq(users.id, platformAdmins.userId))
      .where(and(eq(platformAdmins.userId, userId), eq(users.status, 'active')));
    return !!row;
  }

  /** The tenant of an online payment, for the payment gateway's webhook. */
  async tenantForPaymentOrder(orderId: string): Promise<{ tenantId: string; paymentId: string } | undefined> {
    const [row] = await this.db.system
      .select({ tenantId: feePayments.tenantId, paymentId: feePayments.id })
      .from(feePayments)
      .where(eq(feePayments.providerOrderId, orderId));
    return row;
  }
}
