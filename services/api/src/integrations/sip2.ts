import { Controller, HttpCode, Injectable, Logger, OnModuleDestroy, OnModuleInit, Post, Req } from '@nestjs/common';
import { createServer, type Server } from 'node:net';
import type { Request } from 'express';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Clock, localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { libraryBooks, libraryLoans, students } from '../db/schema.js';
import { credentialTags, apiTokens } from '../db/schema-integrations.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ApiTokenService } from './feeds.controller.js';
import { readRawBody } from './http.js';
import { LibraryDesk } from './library-desk.js';

/** SIP2 timestamp: YYYYMMDD, four blanks, HHMMSS. */
export const sipDate = (d: Date, tz = 'Asia/Kolkata') => {
  const l = localParts(d, tz);
  return `${l.date.replace(/-/g, '')}    ${l.time.replace(/:/g, '')}`;
};

/** The variable-length fields of a SIP2 message: two-letter id followed by the value, ended by "|". */
export function sipFields(rest: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of rest.split('|')) if (part.length >= 2) out[part.slice(0, 2)] = part.slice(2);
  return out;
}

export interface Sip2Session { tenantId: string; actorId: string | null; loggedIn: boolean }

/** Reads the library for SIP2: patrons are found by roll number or card tag, items by their barcode. */
@Injectable()
export class Sip2Service {
  private readonly desk: LibraryDesk;
  constructor(private readonly db: DbService, private readonly clock: Clock, notifications: NotificationsService, private readonly tokens: ApiTokenService) {
    this.desk = new LibraryDesk(clock, notifications);
  }

  /** Handles one SIP2 message and returns the response line (without the terminator). */
  async handle(line: string, session: Sip2Session): Promise<string> {
    const code = line.slice(0, 2);
    if (code === '93') return this.login(line, session);
    if (!session.loggedIn) return code === '99' ? this.statusResponse(session) : '96';
    switch (code) {
      case '99':
        return this.statusResponse(session);
      case '63':
        return this.db.withTenant(session.tenantId, (tx) => this.patron(tx, line, session));
      case '17':
        return this.db.withTenant(session.tenantId, (tx) => this.item(tx, line, session));
      case '11':
        return this.db.withTenant(session.tenantId, (tx) => this.checkout(tx, line, session));
      case '09':
        return this.db.withTenant(session.tenantId, (tx) => this.checkin(tx, line, session));
      case '97':
        return '96';
      default:
        return '96';
    }
  }

  private async login(line: string, session: Sip2Session): Promise<string> {
    const f = sipFields(line.slice(4));
    const user = f.CN ?? '';
    const secret = f.CO ?? '';
    const token = user.startsWith('kxo.') ? user : `kxo.${user}.${secret}`;
    try {
      const { tenantId } = await this.tokens.checkToken(token, 'sip2');
      const actor = await this.db.withTenant(tenantId, async (tx) => (await tx.select({ id: apiTokens.createdBy }).from(apiTokens).where(eq(apiTokens.id, token.split('.')[2])))[0]?.id ?? null);
      session.tenantId = tenantId;
      session.actorId = actor;
      session.loggedIn = true;
      return '941';
    } catch {
      return '940';
    }
  }

  private statusResponse(_session: Sip2Session) {
    return `98YYYNNN003005${sipDate(this.clock.now())}2.00AO|AMKINETIX|BXYYYYYYYYYYYYYYYY|`;
  }

  private async findPatron(tx: Tx, id: string) {
    const [byRoll] = await tx.select({ id: students.id, name: students.fullName, rollNo: students.rollNo, status: students.status }).from(students).where(eq(students.rollNo, id));
    if (byRoll) return byRoll;
    const [tag] = await tx.select({ subjectId: credentialTags.subjectId }).from(credentialTags).where(and(eq(credentialTags.value, id), eq(credentialTags.subjectType, 'student'), eq(credentialTags.active, true)));
    if (!tag) return null;
    const [s] = await tx.select({ id: students.id, name: students.fullName, rollNo: students.rollNo, status: students.status }).from(students).where(eq(students.id, tag.subjectId));
    return s ?? null;
  }

  private async findItem(tx: Tx, barcode: string) {
    const [b] = await tx.select({ id: libraryBooks.id, title: libraryBooks.title, copies: libraryBooks.copies }).from(libraryBooks).where(eq(libraryBooks.barcode, barcode));
    return b ?? null;
  }

  private async patron(tx: Tx, line: string, _s: Sip2Session) {
    const f = sipFields(line.slice(2 + 3 + 18 + 10));
    const date = sipDate(this.clock.now());
    const st = await this.findPatron(tx, f.AA ?? '');
    if (!st) return `64YYYYYYYYYYYYYY000${date}000000000000000000000000000000AO|AA${f.AA ?? ''}|AE|BLN|`;
    const [counts] = await tx.select({ charged: sql<number>`count(*) filter (where returned_at is null)::int`, overdue: sql<number>`count(*) filter (where returned_at is null and due_on < current_date)::int`, fines: sql<number>`coalesce(sum(fine_paise) filter (where fine_paid_at is null), 0)::int` }).from(libraryLoans).where(eq(libraryLoans.studentId, st.id));
    const n = (x: number) => String(x).padStart(4, '0');
    return `64${st.status === 'active' || st.status === 'enrolled' ? ' ' : 'Y'}YYYYYYYYYYYYY000${date}${n(0)}${n(counts.overdue)}${n(counts.charged)}${n(0)}${n(0)}${n(0)}AO|AA${st.rollNo}|AE${st.name}|BLY|BV${(counts.fines / 100).toFixed(2)}|`;
  }

  private async item(tx: Tx, line: string, _s: Sip2Session) {
    const f = sipFields(line.slice(2 + 18));
    const date = sipDate(this.clock.now());
    const b = await this.findItem(tx, f.AB ?? '');
    if (!b) return `1801 01${date}AB${f.AB ?? ''}|AJ|`;
    const [{ out }] = await tx.select({ out: sql<number>`count(*)::int` }).from(libraryLoans).where(and(eq(libraryLoans.bookId, b.id), isNull(libraryLoans.returnedAt)));
    return `18${out >= b.copies ? '04' : '03'}0201${date}AB${f.AB}|AJ${b.title}|`;
  }

  private async checkout(tx: Tx, line: string, s: Sip2Session) {
    const f = sipFields(line.slice(2 + 1 + 1 + 18 + 18));
    const date = sipDate(this.clock.now());
    const st = await this.findPatron(tx, f.AA ?? '');
    const b = await this.findItem(tx, f.AB ?? '');
    if (!st || !b) return `120NNN${date}AO|AA${f.AA ?? ''}|AB${f.AB ?? ''}|AJ${b?.title ?? ''}|AF${!st ? 'Unknown patron' : 'Unknown item'}|`;
    const r = await this.desk.issue(tx, s.tenantId, s.actorId!, b.id, st.id);
    if (!r.ok) return `120NNN${date}AO|AA${f.AA}|AB${f.AB}|AJ${b.title}|AF${r.reason.replace(/_/g, ' ')}|`;
    return `121NNY${date}AO|AA${f.AA}|AB${f.AB}|AJ${b.title}|AH${r.dueOn!.replace(/-/g, '')}    000000|`;
  }

  private async checkin(tx: Tx, line: string, s: Sip2Session) {
    const f = sipFields(line.slice(2 + 1 + 18 + 18));
    const date = sipDate(this.clock.now());
    const b = await this.findItem(tx, f.AB ?? '');
    if (!b) return `100NUN${date}AO|AB${f.AB ?? ''}|AQ|AJ|AF Unknown item|`;
    const r = await this.desk.giveBack(tx, s.tenantId, s.actorId!, b.id);
    return r.ok ? `101YNN${date}AO|AB${f.AB}|AQ|AJ${b.title}|${r.fineP ? `BV${(r.fineP / 100).toFixed(2)}|` : ''}` : `100NUN${date}AO|AB${f.AB}|AQ|AJ${b.title}|AF Not on loan|`;
  }
}

/** The REST side of the bridge: post one SIP2 message as text with a Bearer feed token that has the sip2 scope. */
@Controller('v1/library')
export class Sip2Controller {
  constructor(private readonly sip: Sip2Service, private readonly tokens: ApiTokenService, private readonly db: DbService) {}

  @Post('sip2')
  @HttpCode(200)
  async message(@Req() req: Request) {
    const { tenantId, tokenId } = await this.tokens.check(req, 'sip2');
    const line = (await readRawBody(req, 8192)).toString('utf8').replace(/[\r\n]+$/, '');
    const actor = await this.db.withTenant(tenantId, async (tx) => (await tx.select({ id: apiTokens.createdBy }).from(apiTokens).where(eq(apiTokens.id, tokenId)))[0]?.id ?? null);
    const response = await this.sip.handle(line, { tenantId, actorId: actor, loggedIn: true });
    return { response };
  }
}

/** Optional SIP2 TCP listener for self-check machines and Koha-side tools: set SIP2_PORT to start it. */
@Injectable()
export class Sip2Server implements OnModuleInit, OnModuleDestroy {
  private server?: Server;
  private readonly log = new Logger(Sip2Server.name);
  constructor(private readonly sip: Sip2Service) {}

  onModuleInit() {
    const port = Number(process.env.SIP2_PORT ?? 0);
    if (!port) return;
    this.server = createServer((sock) => {
      const session: Sip2Session = { tenantId: '', actorId: null, loggedIn: false };
      let buf = '';
      sock.on('data', async (d) => {
        buf += d.toString('utf8');
        let i: number;
        while ((i = buf.search(/[\r\n]/)) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line.trim()) sock.write(`${await this.sip.handle(line.trim(), session).catch(() => '96')}\r`);
        }
        if (buf.length > 8192) sock.destroy();
      });
      sock.on('error', () => undefined);
    });
    this.server.listen(port, () => this.log.log(`SIP2 listening on ${port}`));
  }

  onModuleDestroy() {
    this.server?.close();
  }
}
