import { BadRequestException, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, HttpException, NotFoundException, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { scormAttempts, scormPackages } from '../db/schema-integrations.js';
import { lmsXapiState, lmsXapiStatements } from '../db/schema-lms.js';
import { syncPackageProgress } from '../lms/package-progress.js';
import { readRawBody } from './http.js';
import { type PackageToken, PackageTokens } from './package-tokens.js';

const VERB = 'http://adlnet.gov/expapi/verbs/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a cmi5 unit's moveOn rule asks for, met or not. */
export function moveOnMet(rule: string, completed: boolean, passed: boolean): boolean {
  switch (rule) {
    case 'Completed':
      return completed;
    case 'Passed':
      return passed;
    case 'CompletedAndPassed':
      return completed && passed;
    case 'CompletedOrPassed':
      return completed || passed;
    default:
      return completed || passed;
  }
}

interface Statement {
  id?: string;
  actor?: { account?: { homePage?: string; name?: string }; mbox?: string };
  verb?: { id?: string };
  object?: { id?: string; objectType?: string };
  result?: { score?: { scaled?: number; raw?: number; max?: number }; success?: boolean; completion?: boolean; duration?: string };
  context?: { registration?: string };
  timestamp?: string;
}

/**
 * The small xAPI Learning Record Store that cmi5 units talk to: the one-use fetch link that hands the unit its
 * credential, statements (stored, and turned into the attempt's status, score and the course item's progress), and the
 * state documents (LMS.LaunchData and the unit's own). Every call carries the credential of one learner and package,
 * and reads or writes nothing else.
 */
@Controller('v1/xapi')
export class XapiController {
  constructor(
    private readonly db: DbService,
    private readonly tokens: PackageTokens,
    private readonly clock: Clock,
  ) {}

  /** cmi5 "fetch": the first call hands out the unit's credential; any later call with the same link is an error. */
  @Post('fetch/:token')
  @HttpCode(200)
  async fetch(@Param('token') token: string, @Res() res: Response) {
    let t: PackageToken;
    try {
      t = this.tokens.open(token, 'f');
    } catch {
      res.status(400).json({ 'error-code': '3', 'error-text': 'This launch link is not valid or has expired' });
      return;
    }
    const first = await this.db.withTenant(t.tenant, async (tx) => {
      const used = await tx.insert(lmsXapiState).values({ tenantId: t.tenant, packageId: t.pkg, userId: t.user!, registration: t.reg ?? null, activityId: '__fetch__', stateId: t.jti!, content: '1' }).onConflictDoNothing().returning({ id: lmsXapiState.id });
      return used.length > 0;
    });
    if (!first) {
      res.status(400).json({ 'error-code': '1', 'error-text': 'This launch link was already used' });
      return;
    }
    const x = this.tokens.sign({ s: 'x', pkg: t.pkg, tenant: t.tenant, user: t.user, reg: t.reg }, 6 * 3_600_000);
    res.json({ 'auth-token': Buffer.from(`cmi5:${x}`).toString('base64') });
  }

  private cred(auth: string | undefined): PackageToken {
    const m = /^Basic\s+(.+)$/i.exec(auth ?? '');
    if (!m) throw new ForbiddenException('xAPI credential missing');
    const raw = Buffer.from(m[1], 'base64').toString();
    if (!raw.startsWith('cmi5:')) throw new ForbiddenException('xAPI credential not valid');
    return this.tokens.open(raw.slice(5), 'x');
  }

  /** One statement (`?statementId=`) as the unit sends it. */
  @Put('statements')
  @HttpCode(204)
  async putStatement(@Headers('authorization') auth: string, @Query('statementId') statementId: string, @Req() req: Request) {
    const t = this.cred(auth);
    if (!UUID.test(statementId ?? '')) throw new BadRequestException('statementId must be a UUID');
    const body = req.body as Statement;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Send one statement');
    if (body.id && body.id !== statementId) throw new HttpException('The statement id does not match statementId', 409);
    await this.db.withTenant(t.tenant, (tx) => this.store(tx, t, [{ ...body, id: statementId }]));
  }

  /** One statement or a list of them; answers with their ids. */
  @Post('statements')
  @HttpCode(200)
  async postStatements(@Headers('authorization') auth: string, @Req() req: Request) {
    const t = this.cred(auth);
    const list = (Array.isArray(req.body) ? req.body : [req.body]) as Statement[];
    if (!list.length || list.length > 50 || list.some((s) => !s || typeof s !== 'object')) throw new BadRequestException('Send between 1 and 50 statements');
    return this.db.withTenant(t.tenant, (tx) => this.store(tx, t, list));
  }

  /** The learner's own statements for this package, newest first. */
  @Get('statements')
  async getStatements(@Headers('authorization') auth: string, @Query('statementId') statementId?: string) {
    const t = this.cred(auth);
    return this.db.withTenant(t.tenant, async (tx) => {
      const where = and(eq(lmsXapiStatements.packageId, t.pkg), eq(lmsXapiStatements.userId, t.user!), statementId && UUID.test(statementId) ? eq(lmsXapiStatements.id, statementId) : undefined);
      const rows = await tx.select({ s: lmsXapiStatements.statement }).from(lmsXapiStatements).where(where).orderBy(desc(lmsXapiStatements.storedAt)).limit(50);
      if (statementId) {
        if (!rows.length) throw new NotFoundException('Statement not found');
        return rows[0].s;
      }
      return { statements: rows.map((r) => r.s), more: '' };
    });
  }

  private async store(tx: Tx, t: PackageToken, list: Statement[]): Promise<string[]> {
    const [pkg] = await tx.select().from(scormPackages).where(eq(scormPackages.id, t.pkg));
    if (!pkg) throw new NotFoundException('Package not found');
    const now = this.clock.now();
    const ids: string[] = [];
    let completed = false;
    let passed: boolean | null = null;
    let scaled: number | null = null;
    for (const s of list) {
      if (s.id !== undefined && !UUID.test(String(s.id))) throw new BadRequestException('A statement id must be a UUID');
      if (typeof s.verb?.id !== 'string' || typeof s.object?.id !== 'string') throw new BadRequestException('A statement needs a verb id and an object id');
      if (s.actor?.account?.name !== t.user) throw new ForbiddenException('Statements may be sent only for the learner of this launch');
      const reg = s.context?.registration;
      if (reg !== undefined && reg !== t.reg) throw new ForbiddenException('The registration is not this launch');
      const id = s.id ?? randomUUID();
      const raw = s.result?.score;
      const sc = typeof raw?.scaled === 'number' && raw.scaled >= -1 && raw.scaled <= 1 ? raw.scaled : typeof raw?.raw === 'number' && typeof raw?.max === 'number' && raw.max > 0 ? raw.raw / raw.max : null;
      const stored = { ...s, id, stored: now.toISOString(), timestamp: s.timestamp ?? now.toISOString(), authority: { objectType: 'Agent', account: { homePage: 'urn:zynetix', name: 'lms' } } };
      const json = JSON.stringify(stored);
      if (json.length > 64_000) throw new BadRequestException('A statement is too large');
      const ins = await tx
        .insert(lmsXapiStatements)
        .values({ id, tenantId: t.tenant, packageId: t.pkg, userId: t.user!, registration: t.reg ?? null, verb: s.verb.id.slice(0, 300), objectId: s.object.id.slice(0, 500), resultScaled: sc, resultSuccess: typeof s.result?.success === 'boolean' ? s.result.success : null, resultCompletion: typeof s.result?.completion === 'boolean' ? s.result.completion : null, duration: s.result?.duration?.slice(0, 40) ?? null, statement: stored as Record<string, unknown> })
        .onConflictDoNothing()
        .returning({ id: lmsXapiStatements.id });
      if (!ins.length) {
        // The same id again is fine (a retry); it must be the same learner's.
        const [old] = await tx.select({ user: lmsXapiStatements.userId }).from(lmsXapiStatements).where(eq(lmsXapiStatements.id, id));
        if (old?.user !== t.user) throw new HttpException('That statement id is taken', 409);
      }
      ids.push(id);
      if (s.object.id === pkg.auId) {
        if (s.verb.id === `${VERB}completed`) completed = true;
        if (s.verb.id === `${VERB}passed`) passed = true;
        if (s.verb.id === `${VERB}failed` && passed !== true) passed = false;
        if (sc !== null && (s.verb.id === `${VERB}passed` || s.verb.id === `${VERB}failed` || scaled === null)) scaled = sc;
      }
    }
    if (completed || passed !== null || scaled !== null) await this.applyOutcome(tx, t, pkg, { completed, passed, scaled }, now);
    return ids;
  }

  /** The attempt's status and score from cmi5 verbs, then the course item's progress by the unit's moveOn rule. */
  private async applyOutcome(tx: Tx, t: PackageToken, pkg: typeof scormPackages.$inferSelect, o: { completed: boolean; passed: boolean | null; scaled: number | null }, now: Date) {
    const [att] = await tx.select().from(scormAttempts).where(and(eq(scormAttempts.packageId, t.pkg), eq(scormAttempts.userId, t.user!)));
    const was = att?.lessonStatus ?? 'not attempted';
    const wasCompleted = was === 'completed' || was === 'passed' || att?.cmi?.completed === 'true';
    const wasPassed = was === 'passed';
    const completed = wasCompleted || o.completed;
    const passed = wasPassed || o.passed === true;
    const status = passed ? 'passed' : o.passed === false && !wasPassed ? 'failed' : completed ? 'completed' : 'incomplete';
    const score = o.scaled !== null ? Math.round(o.scaled * 10000) / 100 : (att?.scoreRaw ?? null);
    const cmi = { ...(att?.cmi ?? {}), completed: String(completed), passed: String(passed) };
    if (att) await tx.update(scormAttempts).set({ lessonStatus: status, scoreRaw: score, cmi, updatedAt: now }).where(eq(scormAttempts.id, att.id));
    else await tx.insert(scormAttempts).values({ tenantId: t.tenant, packageId: t.pkg, userId: t.user!, lessonStatus: status, scoreRaw: score, cmi, updatedAt: now });
    const met = moveOnMet(pkg.moveOn ?? 'NotApplicable', completed, passed);
    await syncPackageProgress(tx, t.tenant, t.pkg, t.user!, { completed: met, passed: met ? (passed || null) : o.passed === false ? false : null, scorePct: score }, now);
  }

  // ---- state documents ----------------------------------------------------------------------------

  private stateWhere(t: PackageToken, activityId: string, stateId: string, registration?: string) {
    if (!activityId || !stateId || activityId.length > 500 || stateId.length > 200 || stateId === '__fetch__') throw new BadRequestException('activityId and stateId are required');
    if (registration !== undefined && registration !== t.reg) throw new ForbiddenException('The registration is not this launch');
    return and(eq(lmsXapiState.packageId, t.pkg), eq(lmsXapiState.userId, t.user!), t.reg ? eq(lmsXapiState.registration, t.reg) : isNull(lmsXapiState.registration), eq(lmsXapiState.activityId, activityId), eq(lmsXapiState.stateId, stateId));
  }

  @Get('activities/state')
  async getState(@Headers('authorization') auth: string, @Query('activityId') activityId: string, @Query('stateId') stateId: string, @Query('registration') registration: string | undefined, @Res() res: Response) {
    const t = this.cred(auth);
    const row = await this.db.withTenant(t.tenant, async (tx) => (await tx.select().from(lmsXapiState).where(this.stateWhere(t, activityId, stateId, registration)))[0]);
    if (!row) throw new NotFoundException('No such state');
    res.setHeader('Content-Type', row.contentType);
    res.setHeader('Last-Modified', row.updatedAt.toUTCString());
    res.send(row.content);
  }

  @Put('activities/state')
  @HttpCode(204)
  putState(@Headers('authorization') auth: string, @Query('activityId') activityId: string, @Query('stateId') stateId: string, @Query('registration') registration: string | undefined, @Req() req: Request) {
    return this.saveState(auth, activityId, stateId, registration, req, false);
  }

  @Post('activities/state')
  @HttpCode(204)
  postState(@Headers('authorization') auth: string, @Query('activityId') activityId: string, @Query('stateId') stateId: string, @Query('registration') registration: string | undefined, @Req() req: Request) {
    return this.saveState(auth, activityId, stateId, registration, req, true);
  }

  @Delete('activities/state')
  @HttpCode(204)
  async deleteState(@Headers('authorization') auth: string, @Query('activityId') activityId: string, @Query('stateId') stateId: string, @Query('registration') registration?: string) {
    const t = this.cred(auth);
    if (stateId === 'LMS.LaunchData') throw new ForbiddenException('LMS.LaunchData belongs to the LMS');
    await this.db.withTenant(t.tenant, (tx) => tx.delete(lmsXapiState).where(this.stateWhere(t, activityId, stateId, registration)));
  }

  /** PUT replaces; POST merges JSON objects (xAPI). LMS.LaunchData is the LMS's own and cannot be changed by the unit. */
  private async saveState(auth: string, activityId: string, stateId: string, registration: string | undefined, req: Request, merge: boolean) {
    const t = this.cred(auth);
    if (stateId === 'LMS.LaunchData') throw new ForbiddenException('LMS.LaunchData belongs to the LMS');
    const isJson = !!req.is('application/json');
    const content = isJson ? JSON.stringify(req.body ?? {}) : (await readRawBody(req, 64 * 1024)).toString('utf8');
    if (content.length > 64 * 1024) throw new BadRequestException('A state document is at most 64 KB');
    const contentType = isJson ? 'application/json' : (req.get('content-type') ?? 'application/octet-stream').slice(0, 100);
    await this.db.withTenant(t.tenant, async (tx) => {
      const where = this.stateWhere(t, activityId, stateId, registration);
      const [cur] = await tx.select().from(lmsXapiState).where(where);
      let next = content;
      if (merge && cur && isJson && cur.contentType === 'application/json') {
        const a = JSON.parse(cur.content) as unknown;
        const b = req.body as unknown;
        if (!a || typeof a !== 'object' || Array.isArray(a) || !b || typeof b !== 'object' || Array.isArray(b)) throw new BadRequestException('Only JSON objects can be merged');
        next = JSON.stringify({ ...(a as object), ...(b as object) });
      }
      if (cur) await tx.update(lmsXapiState).set({ content: next, contentType, updatedAt: this.clock.now() }).where(eq(lmsXapiState.id, cur.id));
      else await tx.insert(lmsXapiState).values({ tenantId: t.tenant, packageId: t.pkg, userId: t.user!, registration: t.reg ?? null, activityId, stateId, contentType, content: next });
    });
  }

  /** Learner preferences are not kept; cmi5 units then use their own defaults. */
  @Get('agents/profile')
  agentProfile(@Headers('authorization') auth: string) {
    this.cred(auth);
    throw new NotFoundException('No profile');
  }
}
