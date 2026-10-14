import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { RecordRegistry, type KitCtx } from './entity.js';
import { commitImport, getImport, importTemplate, MAX_IMPORT_BYTES, validateImport } from './import.js';
import { BulkTargetSchema, listPage, listQueryFromParams } from './list.js';
import { RecordsService, type BulkBody } from './records.service.js';

const Values = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/), z.unknown());
const Atomic = z.boolean().optional();
const BulkSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('update'), target: BulkTargetSchema, fields: Values, atomic: Atomic }),
  z.object({ op: z.literal('delete'), target: BulkTargetSchema, atomic: Atomic }),
  z.object({ op: z.literal('move'), target: BulkTargetSchema, to: z.string().trim().min(1).max(100), reason: z.string().trim().max(500).optional(), atomic: Atomic }),
  z.object({ op: z.literal('action'), target: BulkTargetSchema, action: z.string().regex(/^[a-z][a-zA-Z0-9-]{0,40}$/), params: z.unknown().optional(), atomic: Atomic }),
]);
const MoveSchema = z.object({ to: z.string().trim().min(1).max(100), reason: z.string().trim().max(500).optional() });
const ReorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(1000) });
const CommitSchema = z.object({ skipErrors: z.boolean().default(false) });
const ExportQuery = z.object({
  format: z.enum(['csv', 'xlsx']).default('csv'),
  columns: z.string().max(2000).optional(),
  ids: z.string().max(5000 * 37).optional(),
  except: z.string().max(5000 * 37).optional(),
});
const HistoryQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).max(1_000_000).default(0) });

const parse = <T extends z.ZodType>(schema: T, v: unknown): z.infer<T> => {
  const r = schema.safeParse(v);
  if (!r.success) throw new BadRequestException(z.flattenError(r.error));
  return r.data;
};

/**
 * The record depth kit's endpoints, the same for every registered entity (`/v1/records/:entity`): list, meta, one
 * record, add, edit, delete to the recycle bin, duplicate, move, reorder, bulk operations, history, export and
 * import (template → upload and check → commit). Each entity says who may read and who may change it.
 */
@Controller('v1/records')
export class RecordsController {
  constructor(
    private readonly db: DbService,
    private readonly registry: RecordRegistry,
    private readonly records: RecordsService,
  ) {}

  private run<T>(p: UserPrincipal, key: string, write: boolean, fn: (ctx: KitCtx, e: ReturnType<RecordRegistry['get']>) => Promise<T>): Promise<T> {
    const e = this.registry.get(key);
    return this.db.withTenant(p.tenantId, (tx) => {
      const ctx = { tx, p };
      if (write) this.records.assertWrite(ctx, e);
      else this.records.assertRead(ctx, e);
      return fn(ctx, e);
    });
  }

  /** `?q&sort=<key>:<asc|desc>&page&pageSize&f.<filter>=<value>` → `{ rows, total, page, pageSize }`. */
  @Get(':entity')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Query() q: Record<string, string>) {
    const query = listQueryFromParams(q);
    return this.run(p, key, false, (ctx, e) => listPage(e, ctx, query));
  }

  @Get(':entity/meta')
  @Auth('user')
  meta(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string) {
    return this.run(p, key, false, (ctx, e) => this.records.meta(ctx, e));
  }

  /** The list as a file: `?format=csv|xlsx&columns=a,b&ids=<id,id>&except=<id,id>` plus the list's own search, filters and sort. */
  @Get(':entity/export')
  @Auth('user')
  async export(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const x = parse(ExportQuery, q);
    const query = listQueryFromParams({ ...q, page: 1, pageSize: 1 });
    const list = (v?: string) => (v ? parse(z.array(z.uuid()).max(5000), v.split(',').filter(Boolean)) : undefined);
    const file = await this.run(p, key, false, (ctx, e) => this.records.export(ctx, e, query, x.format, x.columns?.split(',').filter(Boolean), list(x.ids), list(x.except)));
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Row-Count', String(file.rows));
    return new StreamableFile(file.body);
  }

  @Get(':entity/import/template')
  @Auth('user')
  async template(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Res({ passthrough: true }) res: Response) {
    const body = await this.run(p, key, true, (ctx, e) => importTemplate(ctx, e));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${key}-import-template.xlsx"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(body);
  }

  /** Upload (multipart `file`, `?mode=insert|upsert`): every row is checked and nothing is saved yet. */
  @Post(':entity/import')
  @HttpCode(200)
  @Auth('user')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  upload(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined, @Query('mode') mode?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Upload a file');
    const m = mode === 'insert' ? 'insert' : 'upsert';
    return this.run(p, key, true, (ctx, e) => validateImport(ctx, e, { name: file.originalname ?? 'upload', bytes: file.buffer }, m));
  }

  @Get(':entity/import/:batchId')
  @Auth('user')
  importReport(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Param('batchId', ParseUUIDPipe) id: string) {
    return this.run(p, key, true, (ctx, e) => getImport(ctx, e, id));
  }

  /** Saves a checked file. With errors nothing is saved, unless `skipErrors` (then the good rows are). */
  @Post(':entity/import/:batchId/commit')
  @HttpCode(200)
  @Auth('user')
  commit(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Param('batchId', ParseUUIDPipe) id: string, @Body(new ZodBody(CommitSchema)) body: z.infer<typeof CommitSchema>) {
    return this.run(p, key, true, (ctx, e) => commitImport(ctx, e, id, body.skipErrors));
  }

  @Post(':entity/bulk')
  @HttpCode(200)
  @Auth('user')
  bulk(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Body(new ZodBody(BulkSchema)) body: z.infer<typeof BulkSchema>) {
    return this.run(p, key, true, (ctx, e) => this.records.bulk(ctx, e, body as BulkBody));
  }

  /** Saves a drag-and-drop order: the ids of one group in their new order. */
  @Post(':entity/reorder')
  @HttpCode(200)
  @Auth('user')
  reorder(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Body(new ZodBody(ReorderSchema)) body: z.infer<typeof ReorderSchema>) {
    return this.run(p, key, true, (ctx, e) => this.records.reorder(ctx, e, body.ids));
  }

  @Post(':entity')
  @Auth('user')
  create(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Body(new ZodBody(Values)) body: z.infer<typeof Values>) {
    return this.run(p, key, true, (ctx, e) => this.records.create(ctx, e, body));
  }

  @Get(':entity/:id')
  @Auth('user')
  one(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(p, key, false, (ctx, e) => this.records.get(ctx, e, id));
  }

  @Get(':entity/:id/history')
  @Auth('user')
  history(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Param('id', ParseUUIDPipe) id: string, @Query() q: Record<string, string>) {
    const h = parse(HistoryQuery, q);
    return this.run(p, key, false, (ctx, e) => this.records.history(ctx, e, id, h.limit, h.offset));
  }

  @Patch(':entity/:id')
  @Auth('user')
  update(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Values)) body: z.infer<typeof Values>) {
    return this.run(p, key, true, (ctx, e) => this.records.update(ctx, e, id, body));
  }

  /** Moves the record to the recycle bin; answers the bin entry so the ERP can offer Undo. */
  @Delete(':entity/:id')
  @Auth('user')
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(p, key, true, (ctx, e) => this.records.remove(ctx, e, id));
  }

  @Post(':entity/:id/duplicate')
  @Auth('user')
  duplicate(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.run(p, key, true, (ctx, e) => this.records.duplicate(ctx, e, id));
  }

  @Post(':entity/:id/move')
  @HttpCode(200)
  @Auth('user')
  move(@CurrentPrincipal() p: UserPrincipal, @Param('entity') key: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MoveSchema)) body: z.infer<typeof MoveSchema>) {
    return this.run(p, key, true, (ctx, e) => this.records.move(ctx, e, id, body.to, body.reason));
  }
}

