import { BadRequestException, Body, Controller, Get, Header, HttpCode, NotFoundException, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { decodeUtf8 } from './csv.js';
import { ImportService, type ImportResult } from './import.service.js';
import { IMPORT_KINDS, TEMPLATES, type ImportKind } from './templates.js';

/** Uploads are small text files; 6 MB is far more than 5,000 rows. */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

const kindOf = (k: string): ImportKind => {
  if (!(IMPORT_KINDS as readonly string[]).includes(k)) throw new NotFoundException('Not found');
  return k as ImportKind;
};
const flag = (v?: string) => v !== undefined && ['true', '1', 'yes'].includes(v.toLowerCase());

/**
 * Bulk import (principal and admin office): `POST /v1/admin/import/{programs|staff|students|timetable}`
 * with the CSV as the body (`text/csv`) or as a multipart `file`. `?dryRun=true` checks without saving;
 * `?replace=true` (timetable) gives each class in the file exactly the file's periods. See
 * docs/operations/deploy.md (onboarding) and docs/operations/import-templates/.
 */
@Controller('v1/admin/import')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Get('templates/:kind')
  @Auth('user', STAFF_ADMIN_ROLES)
  @Header('content-type', 'text/csv; charset=utf-8')
  template(@Param('kind') kind: string): string {
    return TEMPLATES[kindOf(kind)];
  }

  @Post(':kind')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  run(
    @CurrentPrincipal() p: UserPrincipal,
    @Param('kind') kind: string,
    @Body() body: unknown,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query('dryRun') dryRun?: string,
    @Query('replace') replace?: string,
  ): Promise<ImportResult> {
    const k = kindOf(kind);
    const bytes = file?.buffer ?? (Buffer.isBuffer(body) ? body : undefined);
    if (!bytes?.length) throw new BadRequestException('Upload a CSV file');
    const text = decodeUtf8(bytes);
    if (text === null) throw new BadRequestException('The file is not UTF-8 text. Save it as "CSV UTF-8" and try again.');
    return this.imports.run(p, k, text, { dryRun: flag(dryRun), replace: flag(replace) });
  }
}
