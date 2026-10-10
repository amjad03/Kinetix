import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { apiTokens } from '../db/schema-integrations.js';
import { INTEGRATION_ADMIN, safeEqual, sha256 } from './common.js';

const ADMIN = [...INTEGRATION_ADMIN] as RoleName[];

interface Field { col: string; type: 'String' | 'Int64' | 'Double' | 'Date' | 'DateTimeOffset' | 'Guid' | 'Boolean' }
interface Entity { set: string; scope: string; from: string; key: string; fields: Record<string, Field> }
const f = (col: string, type: Field['type'] = 'String'): Field => ({ col, type });

/** The entities the read-only feed exposes. Names and columns are fixed here; nothing from a request reaches the SQL text. */
export const ENTITIES: Entity[] = [
  { set: 'Students', scope: 'odata:students', from: 'students s join sections sec on sec.id = s.section_id join programs pr on pr.id = sec.program_id', key: 'Id', fields: { Id: f('s.id', 'Guid'), RollNo: f('s.roll_no'), FullName: f('s.full_name'), Status: f('s.status'), Section: f('sec.display_name'), Program: f('pr.name'), EnrolledOn: f('s.enrolled_on', 'Date') } },
  { set: 'AttendanceRecords', scope: 'odata:attendance', from: 'attendance_records a', key: 'Id', fields: { Id: f('a.id', 'Guid'), StudentId: f('a.student_id', 'Guid'), SectionId: f('a.section_id', 'Guid'), Date: f('a.date', 'Date'), Status: f('a.status') } },
  { set: 'FeeInvoices', scope: 'odata:fees', from: 'fee_invoices i', key: 'Id', fields: { Id: f('i.id', 'Guid'), StudentId: f('i.student_id', 'Guid'), Title: f('i.title'), AmountPaise: f('i.amount_paise', 'Int64'), PaidPaise: f('i.paid_paise', 'Int64'), DueOn: f('i.due_on', 'Date'), Status: f('i.status') } },
  { set: 'ExamResults', scope: 'odata:results', from: 'exam_results r join exam_sessions x on x.id = r.session_id', key: 'Id', fields: { Id: f('r.id', 'Guid'), StudentId: f('r.student_id', 'Guid'), Session: f('x.name'), Sgpa: f('r.sgpa', 'Double'), Cgpa: f('r.cgpa', 'Double'), CreditsEarned: f('r.credits_earned', 'Double'), Outcome: f('r.outcome') } },
  { set: 'LibraryLoans', scope: 'odata:library', from: 'library_loans l', key: 'Id', fields: { Id: f('l.id', 'Guid'), BookId: f('l.book_id', 'Guid'), StudentId: f('l.student_id', 'Guid'), IssuedAt: f('l.issued_at', 'DateTimeOffset'), DueOn: f('l.due_on', 'Date'), ReturnedAt: f('l.returned_at', 'DateTimeOffset'), FinePaise: f('l.fine_paise', 'Int64') } },
];
export const FEED_SCOPES = [...ENTITIES.map((e) => e.scope), 'sip2'];

const TokenBody = z.object({ name: z.string().trim().min(1).max(80), scopes: z.array(z.enum(FEED_SCOPES as [string, ...string[]])).min(1) });
const OPS: Record<string, string> = { eq: '=', ne: '<>', gt: '>', ge: '>=', lt: '<', le: '<=' };

/** Parses `Field op literal [and ...]` into SQL fragments; anything else is a 400. */
export function odataFilter(entity: Entity, filter: string | undefined) {
  if (!filter) return [];
  return filter.split(/\s+and\s+/i).map((clause) => {
    const m = clause.trim().match(/^(\w+)\s+(eq|ne|gt|ge|lt|le)\s+(.+)$/i);
    const field = m && entity.fields[m[1]];
    if (!m || !field) throw new BadRequestException(`Unsupported $filter near "${clause.slice(0, 40)}"`);
    const raw = m[3].trim();
    const lit = raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw;
    if (raw === 'null') return sql`${sql.raw(field.col)} is ${sql.raw(m[2].toLowerCase() === 'ne' ? 'not null' : 'null')}`;
    const typedLiteral = field.type === 'Date' || field.type === 'DateTimeOffset' || field.type === 'Guid';
    if (!(raw.startsWith("'") && raw.endsWith("'")) && !(typedLiteral && /^[\w:.+-]+$/.test(raw)) && !/^-?\d+(\.\d+)?$/.test(raw) && raw !== 'null') throw new BadRequestException(`Unsupported value in $filter: "${raw.slice(0, 30)}"`);
    if (field.type === 'Int64' || field.type === 'Double') {
      if (!Number.isFinite(Number(lit))) throw new BadRequestException(`"${lit}" is not a number`);
      return sql`${sql.raw(field.col)} ${sql.raw(OPS[m[2].toLowerCase()])} ${Number(lit)}`;
    }
    return sql`${sql.raw(field.col)}::text ${sql.raw(OPS[m[2].toLowerCase()])} ${lit}`;
  });
}

/** Checks a feed token (`kxo.<tenant>.<id>.<secret>` as a Bearer token, or as the Basic-auth password) and its scope. */
@Injectable()
export class ApiTokenService {
  constructor(private readonly db: DbService, private readonly clock: Clock) {}

  async check(req: Request, scope: string): Promise<{ tenantId: string; tokenId: string }> {
    const h = req.headers.authorization ?? '';
    let token = '';
    if (/^bearer /i.test(h)) token = h.slice(7).trim();
    else if (/^basic /i.test(h)) token = Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':');
    return this.checkToken(token, scope);
  }

  async checkToken(token: string, scope: string): Promise<{ tenantId: string; tokenId: string }> {
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'kxo' || !/^[0-9a-f-]{36}$/.test(parts[1]) || !/^[0-9a-f-]{36}$/.test(parts[2])) throw new UnauthorizedException('A feed token is required');
    const [, tenantId, tokenId, secret] = parts;
    return this.db.withTenant(tenantId, async (tx) => {
      const [row] = await tx.select().from(apiTokens).where(eq(apiTokens.id, tokenId));
      if (!row || row.revokedAt || !safeEqual(row.secretHash, sha256(secret))) throw new UnauthorizedException('That feed token is not valid');
      if (!row.scopes.includes(scope)) throw new ForbiddenException(`This token cannot read ${scope.replace('odata:', '')}`);
      await tx.update(apiTokens).set({ lastUsedAt: this.clock.now() }).where(eq(apiTokens.id, tokenId));
      return { tenantId, tokenId };
    });
  }
}

/** Scoped API tokens, and the read-only OData v4 feed that Power BI and Excel connect to. */
@Controller('v1')
export class FeedsController {
  constructor(private readonly db: DbService, private readonly tokens: ApiTokenService) {}

  @Get('api-tokens')
  @Auth('user', ADMIN)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ scopes: FEED_SCOPES, tokens: await tx.select({ id: apiTokens.id, name: apiTokens.name, scopes: apiTokens.scopes, revokedAt: apiTokens.revokedAt, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt }).from(apiTokens).orderBy(desc(apiTokens.createdAt)) }));
  }

  /** Creates a token. It is shown once. */
  @Post('api-tokens')
  @Auth('user', ADMIN)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TokenBody)) b: z.infer<typeof TokenBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const secret = randomBytes(24).toString('base64url');
      const [row] = await tx.insert(apiTokens).values({ tenantId: p.tenantId, name: b.name, scopes: [...new Set(b.scopes)], secretHash: sha256(secret), createdBy: p.userId }).returning({ id: apiTokens.id, name: apiTokens.name, scopes: apiTokens.scopes });
      await auditUser(tx, p, 'api_token.created', 'api_token', row.id, { scopes: b.scopes });
      return { ...row, token: `kxo.${p.tenantId}.${row.id}.${secret}` };
    });
  }

  @Delete('api-tokens/:id')
  @HttpCode(204)
  @Auth('user', ADMIN)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id)).returning({ id: apiTokens.id });
      if (!row) throw new NotFoundException('Token not found');
      await auditUser(tx, p, 'api_token.revoked', 'api_token', id);
    });
  }

  // ---- OData ---------------------------------------------------------------------------------

  @Get('odata')
  @Header('content-type', 'application/json;odata.metadata=minimal')
  async service(@Req() req: Request) {
    const scopesOf = await this.visible(req);
    return { '@odata.context': `${this.base(req)}/$metadata`, value: ENTITIES.filter((e) => scopesOf.includes(e.scope)).map((e) => ({ name: e.set, kind: 'EntitySet', url: e.set })) };
  }

  @Get('odata/$metadata')
  @Header('content-type', 'application/xml')
  async metadata(@Req() req: Request) {
    const scopes = await this.visible(req);
    const ents = ENTITIES.filter((e) => scopes.includes(e.scope));
    return `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices><Schema Namespace="Kinetix" xmlns="http://docs.oasis-open.org/odata/ns/edm">${ents
      .map((e) => `<EntityType Name="${e.set.replace(/s$/, '')}"><Key><PropertyRef Name="${e.key}"/></Key>${Object.entries(e.fields).map(([n, fl]) => `<Property Name="${n}" Type="Edm.${fl.type}"${n === e.key ? ' Nullable="false"' : ''}/>`).join('')}</EntityType>`)
      .join('')}<EntityContainer Name="Container">${ents.map((e) => `<EntitySet Name="${e.set}" EntityType="Kinetix.${e.set.replace(/s$/, '')}"/>`).join('')}</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
  }

  @Get('odata/:set')
  @Header('content-type', 'application/json;odata.metadata=minimal')
  async read(@Req() req: Request, @Param('set') set: string, @Query() q: Record<string, string>) {
    const entity = ENTITIES.find((e) => e.set === set);
    if (!entity) throw new NotFoundException(`There is no entity set ${set}`);
    const { tenantId, tokenId } = await this.tokens.check(req, entity.scope);
    const top = Math.min(Math.max(Number(q.$top ?? 1000) || 1000, 1), 5000);
    const skip = Math.max(Number(q.$skip ?? 0) || 0, 0);
    const select = q.$select ? q.$select.split(',').map((s) => s.trim()) : Object.keys(entity.fields);
    const bad = select.find((s) => !entity.fields[s]);
    if (bad) throw new BadRequestException(`Unknown property ${bad}`);
    const where = odataFilter(entity, q.$filter);
    const whereSql = where.length ? sql` where ${sql.join(where, sql` and `)}` : sql``;
    return this.db.withTenant(tenantId, async (tx) => {
      const cols = sql.join(select.map((s) => sql`${sql.raw(entity.fields[s].col)} as ${sql.identifier(s)}`), sql`, `);
      const rows = (await tx.execute(sql`select ${cols} from ${sql.raw(entity.from)}${whereSql} order by ${sql.raw(entity.fields[entity.key].col)} limit ${top + 1} offset ${skip}`)).rows as Record<string, unknown>[];
      const page = rows.slice(0, top).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? (entity.fields[k]?.type === 'Date' ? v.toISOString().slice(0, 10) : v.toISOString()) : entity.fields[k]?.type === 'Int64' && v != null ? Number(v) : v])));
      const out: Record<string, unknown> = { '@odata.context': `${this.base(req)}/$metadata#${set}`, value: page };
      if (q.$count === 'true') out['@odata.count'] = Number(((await tx.execute(sql`select count(*)::int as n from ${sql.raw(entity.from)}${whereSql}`)).rows[0] as { n: number }).n);
      if (rows.length > top) out['@odata.nextLink'] = `${this.base(req)}/${set}?${new URLSearchParams({ ...q, $skip: String(skip + top), $top: String(top) }).toString()}`;
      await audit(tx, { tenantId, actorType: 'system', action: 'odata.read', subjectType: 'api_token', subjectId: tokenId, data: { set, rows: page.length } });
      return out;
    });
  }

  private base(req: Request) {
    return `${req.protocol}://${req.get('host')}/v1/odata`;
  }

  private async visible(req: Request): Promise<string[]> {
    const probe = ENTITIES[0].scope;
    // Any valid feed token may see the service document; it lists only what its scopes allow.
    const h = req.headers.authorization ?? '';
    const token = /^bearer /i.test(h) ? h.slice(7).trim() : /^basic /i.test(h) ? Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':') : '';
    const parts = token.split('.');
    if (parts.length !== 4) throw new UnauthorizedException('A feed token is required');
    try {
      await this.tokens.checkToken(token, probe);
    } catch (e) {
      if (!(e instanceof ForbiddenException)) throw e;
    }
    return this.db.withTenant(parts[1], async (tx: Tx) => {
      const [row] = await tx.select({ scopes: apiTokens.scopes, revokedAt: apiTokens.revokedAt }).from(apiTokens).where(eq(apiTokens.id, parts[2]));
      return row && !row.revokedAt ? row.scopes : [];
    });
  }
}
