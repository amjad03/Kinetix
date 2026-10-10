import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { ENTITY_FIELDS, MIGRATION_ENTITIES } from './migration.logic.js';
import { MigrationService } from './migration.service.js';

/** Uploads are spreadsheets of up to 20,000 rows. */
const MAX_UPLOAD = 12 * 1024 * 1024;
const MappingBody = z.object({ name: z.string().trim().min(1).max(80), mapping: z.record(z.string(), z.string().max(200)) });
const flag = (v: unknown) => typeof v === 'string' && ['true', '1', 'yes'].includes(v.toLowerCase());

/**
 * Data migration from Linways-style and Excel exports (principal and admin office):
 * `POST v1/admin/data-migration/:entity/preview` reads the headings and suggests a column mapping,
 * `.../run` imports with a mapping (`dryRun=true` checks only), batches can be rolled back, and mappings are saved by name.
 */
@Controller('v1/admin/data-migration')
export class MigrationController {
  constructor(private readonly svc: MigrationService) {}

  @Get('entities')
  @Auth('user', STAFF_ADMIN_ROLES)
  entities() {
    return MIGRATION_ENTITIES.map((e) => ({ entity: e, fields: ENTITY_FIELDS[e] }));
  }

  @Post(':entity/preview')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD, files: 1 } }))
  preview(@Param('entity') entity: string, @UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Upload a CSV or Excel file');
    return this.svc.preview(this.svc.entity(entity), file.buffer);
  }

  @Post(':entity/run')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD, files: 1 } }))
  run(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('entity') entity: string,
    @Body() body: { mapping?: string; dryRun?: string; partial?: string },
    @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Upload a CSV or Excel file');
    let mapping: unknown;
    try {
      mapping = JSON.parse(body.mapping ?? '');
    } catch {
      throw new BadRequestException('The mapping is not valid');
    }
    const parsed = z.record(z.string(), z.string().max(200)).safeParse(mapping);
    if (!parsed.success) throw new BadRequestException('The mapping is not valid');
    return this.svc.run(p, { entity: this.svc.entity(entity), bytes: file.buffer, fileName: file.originalname ?? 'upload', mapping: parsed.data, dryRun: flag(body.dryRun), partial: flag(body.partial) });
  }

  @Get('mappings')
  @Auth('user', STAFF_ADMIN_ROLES)
  mappings(@CurrentPrincipal() p: UserPrincipal, @Query('entity') entity?: string) {
    return this.svc.listMappings(p, entity);
  }

  @Post('mappings/:entity')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  saveMapping(@CurrentPrincipal() p: UserPrincipal, @Param('entity') entity: string, @Body(new ZodBody(MappingBody)) b: z.infer<typeof MappingBody>) {
    return this.svc.saveMapping(p, this.svc.entity(entity), b.name, b.mapping);
  }

  @Delete('mappings/:id')
  @Auth('user', STAFF_ADMIN_ROLES)
  deleteMapping(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteMapping(p, id);
  }

  @Get('batches')
  @Auth('user', STAFF_ADMIN_ROLES)
  batches(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.listBatches(p);
  }

  @Get('batches/:id')
  @Auth('user', STAFF_ADMIN_ROLES)
  batch(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.batch(p, id);
  }

  @Post('batches/:id/rollback')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  rollback(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.rollback(p, id);
  }
}
