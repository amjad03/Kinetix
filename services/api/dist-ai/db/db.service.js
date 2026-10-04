var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ENV } from '../config/env.js';
import * as schema from './schema.js';
/**
 * Database access.
 *
 * - `withTenant` is the only way request handlers touch tenant data. It runs on the
 *   `kinetix_app` role inside a transaction whose `app.tenant_id` is set, so row-level
 *   security confines every statement to that tenant.
 * - `system` uses the owner role and bypasses RLS. Only {@link SystemLookups} may use it,
 *   for the few lookups that happen before a tenant is known.
 */
let DbService = class DbService {
    constructor(env) {
        this.appPool = new pg.Pool({ connectionString: env.APP_DATABASE_URL, max: 20 });
        this.systemPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3 });
        this.app = drizzle(this.appPool, { schema });
        this.system = drizzle(this.systemPool, { schema });
    }
    async withTenant(tenantId, fn) {
        return this.app.transaction(async (tx) => {
            await tx.execute(sql `select set_config('app.tenant_id', ${tenantId}, true)`);
            return fn(tx);
        });
    }
    async onModuleDestroy() {
        await Promise.all([this.appPool.end(), this.systemPool.end()]);
    }
};
DbService = __decorate([
    Injectable(),
    __param(0, Inject(ENV)),
    __metadata("design:paramtypes", [Object])
], DbService);
export { DbService };
//# sourceMappingURL=db.service.js.map