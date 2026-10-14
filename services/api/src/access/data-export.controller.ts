import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DataExportService } from './data-export.service.js';

const RequestBody = z.object({ note: z.string().trim().max(200).default('') });

/** Settings > Backups and export: a full download of the institution's data. Principal and administrator only. */
@Controller('v1/admin/data-exports')
export class DataExportController {
  constructor(private readonly svc: DataExportService) {}

  @Get()
  @Auth('user', STAFF_ADMIN_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.list(p.tenantId);
  }

  @Post()
  @Auth('user', STAFF_ADMIN_ROLES)
  request(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RequestBody)) b: z.infer<typeof RequestBody>) {
    return this.svc.request(p.tenantId, p.userId, b.note);
  }

  @Get(':id/download')
  @Auth('user', STAFF_ADMIN_ROLES)
  async download(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.svc.open(p.tenantId, p.userId, id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(f.size));
    res.setHeader('Content-Disposition', `attachment; filename="${f.name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(f.stream);
  }

  @Delete(':id')
  @HttpCode(204)
  @Auth('user', STAFF_ADMIN_ROLES)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.remove(p.tenantId, p.userId, id);
  }
}
