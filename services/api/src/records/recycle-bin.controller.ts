import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { RecycleBinService } from './recycle-bin.service.js';

const ListQuery = z.object({
  module: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/).optional(),
  entity: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
const Ids = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
const Settings = z.object({ retentionDays: z.number().int().min(1).max(3650) });

/**
 * The recycle bin (ERP → Recycle bin): what was deleted through the record kit, by module, with restore and purge,
 * one at a time or many. Each person sees the kinds of records they may change. Retention is a setting.
 */
@Controller('v1/recycle-bin')
export class RecycleBinController {
  constructor(
    private readonly db: DbService,
    private readonly bin: RecycleBinService,
  ) {}

  @Get()
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>) {
    const r = ListQuery.safeParse(q);
    if (!r.success) throw new BadRequestException(z.flattenError(r.error));
    return this.db.withTenant(p.tenantId, (tx) => this.bin.list({ tx, p }, r.data));
  }

  @Get('settings')
  @Auth('user', STAFF_ADMIN_ROLES)
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ retentionDays: await this.bin.retentionDays(tx, p.tenantId) }));
  }

  @Put('settings')
  @Auth('user', STAFF_ADMIN_ROLES)
  saveSettings(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Settings)) body: z.infer<typeof Settings>) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ retentionDays: await this.bin.setRetentionDays({ tx, p }, body.retentionDays) }));
  }

  /** Restores the entries; each result says whether it came back, and why not. */
  @Post('restore')
  @HttpCode(200)
  @Auth('user')
  restore(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Ids)) body: z.infer<typeof Ids>) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ results: await this.bin.restore({ tx, p }, body.ids) }));
  }

  /** Removes the entries for good. */
  @Post('purge')
  @HttpCode(200)
  @Auth('user')
  purge(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Ids)) body: z.infer<typeof Ids>) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ results: await this.bin.purge({ tx, p }, body.ids) }));
  }

  @Get(':id')
  @Auth('user')
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.bin.get({ tx, p }, id);
      return { id: e.id, entity: e.entity, module: e.module, label: e.label, recordId: e.recordId, rowCount: e.rowCount, deletedAt: e.deletedAt.toISOString(), record: e.snapshot.root, linked: countBy(e.snapshot.rows.map((r) => r.table)) };
    });
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Auth('user')
  restoreOne(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await this.bin.restore({ tx, p }, [id]);
      if (r.ok) return r;
      throw r.code === 'NOT_FOUND' ? new NotFoundException('Not found') : new ConflictException({ statusCode: 409, error: 'Conflict', message: r.message, code: r.code });
    });
  }

  @Delete(':id')
  @HttpCode(200)
  @Auth('user')
  purgeOne(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => (await this.bin.purge({ tx, p }, [id]))[0]);
  }
}

const countBy = (xs: string[]) => {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
};
