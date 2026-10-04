var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from './db.service.js';
import { devices, feePayments, tenants } from './schema.js';
/**
 * The only queries allowed to bypass row-level security. Each one answers
 * "which tenant does this belong to?" for a request that has no tenant context yet.
 * Keep this list short and never return more than the tenant identity.
 */
let SystemLookups = class SystemLookups {
    constructor(db) {
        this.db = db;
    }
    async tenantBySlug(slug) {
        const [row] = await this.db.system
            .select({ id: tenants.id, timezone: tenants.timezone })
            .from(tenants)
            .where(eq(tenants.slug, slug));
        return row;
    }
    async tenantForEnrollmentCode(codeHash) {
        const [row] = await this.db.system
            .select({ tenantId: devices.tenantId, deviceId: devices.id })
            .from(devices)
            .where(eq(devices.enrollmentCodeHash, codeHash));
        return row;
    }
    /** The tenant of an online payment, for the payment gateway's webhook. */
    async tenantForPaymentOrder(orderId) {
        const [row] = await this.db.system
            .select({ tenantId: feePayments.tenantId, paymentId: feePayments.id })
            .from(feePayments)
            .where(eq(feePayments.providerOrderId, orderId));
        return row;
    }
};
SystemLookups = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DbService])
], SystemLookups);
export { SystemLookups };
//# sourceMappingURL=system-lookups.service.js.map