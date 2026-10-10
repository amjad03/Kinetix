import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { acctAccounts, acctVoucherLines, acctVouchers, tallyLedgerMap, tallySettings, tallySyncLog } from '../db/schema.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { ensureChart } from '../books/books.service.js';
import { defaultTallyParent, fileXml, ledgerXml, readAnswer, type TallyVoucher, voucherXml } from './tally.xml.js';

const SettingsBody = z.object({
  host: z.string().trim().regex(/^[A-Za-z0-9.-]{1,253}$/, 'Enter a host name or address, without http://'),
  port: z.number().int().min(1).max(65535).default(9000),
  company: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(true),
});
const MapBody = z.object({ accountId: z.uuid(), tallyLedger: z.string().trim().min(1).max(200), tallyParent: z.string().trim().min(1).max(200) });
const MAX_ATTEMPTS = 10;
const TIMEOUT_MS = 8000;

type LogRow = typeof tallySyncLog.$inferSelect;

/** Builds and sends the XML for ledgers and vouchers; the log row records every try. */
@Injectable()
export class TallySync {
  constructor(private readonly db: DbService) {}

  /** The ledger name and Tally group of every account (mapped, or the account's own name and a sensible group). */
  async ledgerNames(tx: Tx) {
    const accounts = await tx.select().from(acctAccounts).orderBy(asc(acctAccounts.code));
    const maps = new Map((await tx.select().from(tallyLedgerMap)).map((m) => [m.accountId, m]));
    return accounts.map((a) => ({ account: a, name: maps.get(a.id)?.tallyLedger ?? a.name, parent: maps.get(a.id)?.tallyParent ?? defaultTallyParent(a.groupType, a.isCashBank, a.code), mapped: maps.has(a.id) }));
  }

  /** Queues every ledger and every voucher that has no log row yet. */
  async queueMissing(tx: Tx, tenantId: string): Promise<{ ledgers: number; vouchers: number }> {
    await ensureChart(tx, tenantId);
    const have = new Set((await tx.select({ k: tallySyncLog.kind, r: tallySyncLog.refId }).from(tallySyncLog)).map((x) => `${x.k}:${x.r}`));
    const ledgers = (await tx.select({ id: acctAccounts.id, name: acctAccounts.name }).from(acctAccounts)).filter((a) => !have.has(`ledger:${a.id}`));
    const vouchers = (await tx.select({ id: acctVouchers.id, number: acctVouchers.number, narration: acctVouchers.narration, voidedAt: acctVouchers.voidedAt }).from(acctVouchers)).filter((v) => !v.voidedAt && !have.has(`voucher:${v.id}`));
    if (ledgers.length) await tx.insert(tallySyncLog).values(ledgers.map((a) => ({ tenantId, kind: 'ledger', refId: a.id, label: a.name })));
    if (vouchers.length) await tx.insert(tallySyncLog).values(vouchers.map((v) => ({ tenantId, kind: 'voucher', refId: v.id, label: `${v.number} ${v.narration}`.slice(0, 200) })));
    return { ledgers: ledgers.length, vouchers: vouchers.length };
  }

  async voucherFor(tx: Tx, id: string): Promise<TallyVoucher | null> {
    const [v] = await tx.select().from(acctVouchers).where(eq(acctVouchers.id, id));
    if (!v || v.voidedAt) return null;
    const names = new Map((await this.ledgerNames(tx)).map((l) => [l.account.id, l.name]));
    const lines = await tx.select().from(acctVoucherLines).where(eq(acctVoucherLines.voucherId, id));
    return { type: v.voucherType, number: v.number, date: v.voucherDate, narration: v.narration, lines: lines.map((l) => ({ ledger: names.get(l.accountId) ?? '', debitPaise: l.debitPaise, creditPaise: l.creditPaise })) };
  }

  /** The XML for one log row, or null when its subject is gone (a voided voucher). */
  async xmlFor(tx: Tx, company: string, row: LogRow): Promise<string | null> {
    if (row.kind === 'ledger') {
      const l = (await this.ledgerNames(tx)).find((x) => x.account.id === row.refId);
      return l ? ledgerXml(company, l) : null;
    }
    const v = await this.voucherFor(tx, row.refId);
    return v ? voucherXml(company, v) : null;
  }

  /** Sends pending and failed rows (ledgers before vouchers) to the configured Tally. */
  async run(tenantId: string, only?: string[]): Promise<{ sent: number; failed: number; skipped: number }> {
    const { cfg, rows } = await this.db.withTenant(tenantId, async (tx) => {
      const [cfg] = await tx.select().from(tallySettings);
      const rows = cfg ? await tx.select().from(tallySyncLog).where(and(inArray(tallySyncLog.status, ['pending', 'failed']), ...(only ? [inArray(tallySyncLog.id, only)] : []))).orderBy(asc(tallySyncLog.kind), asc(tallySyncLog.createdAt)) : [];
      return { cfg, rows };
    });
    if (!cfg) throw new BadRequestException('Set up the Tally connection first');
    if (!cfg.enabled) throw new BadRequestException('Live sync to Tally is switched off');
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const row of rows) {
      if (row.attempts >= MAX_ATTEMPTS && !only) {
        skipped++;
        continue;
      }
      const xml = await this.db.withTenant(tenantId, (tx) => this.xmlFor(tx, cfg.company, row));
      let status: 'sent' | 'failed' = 'sent';
      let error: string | null = null;
      if (xml === null) {
        status = 'sent';
        error = 'Nothing to send any more';
      } else {
        try {
          const res = await fetch(`http://${cfg.host}:${cfg.port}`, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8' }, body: xml, signal: AbortSignal.timeout(TIMEOUT_MS) });
          const answer = res.ok ? readAnswer(await res.text()) : { ok: false as const, message: `Tally answered ${res.status}` };
          if (!answer.ok) {
            status = 'failed';
            error = answer.message;
          }
        } catch (e) {
          status = 'failed';
          error = `Could not reach Tally at ${cfg.host}:${cfg.port} (${(e as Error).message.slice(0, 100)})`;
        }
      }
      await this.db.withTenant(tenantId, (tx) => tx.update(tallySyncLog).set({ status, lastError: error, attempts: row.attempts + 1, requestXml: xml, updatedAt: new Date() }).where(eq(tallySyncLog.id, row.id)));
      if (status === 'sent') sent++;
      else failed++;
    }
    return { sent, failed, skipped };
  }
}

/** The live connection to Tally Prime: settings, ledger mapping, sync log with retry, and the offline XML file. */
@Controller('v1/tally')
export class TallyController {
  constructor(
    private readonly db: DbService,
    private readonly sync: TallySync,
  ) {}

  @Get('settings')
  @Auth('user', FEE_ROLES)
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(tallySettings))[0] ?? null);
  }

  @Put('settings')
  @Auth('user', FEE_ROLES)
  putSettings(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    if (/^169\.254\./.test(b.host)) throw new BadRequestException('That address is not allowed');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(tallySettings).values({ tenantId: p.tenantId, ...b }).onConflictDoUpdate({ target: tallySettings.tenantId, set: { ...b, updatedAt: new Date() } }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tally.settings_saved', subjectType: 'tenant', subjectId: p.tenantId, data: { host: b.host, port: b.port, enabled: b.enabled } });
      return row;
    });
  }

  /** Every account with the Tally ledger it maps to. */
  @Get('mapping')
  @Auth('user', FEE_ROLES)
  mapping(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await ensureChart(tx, p.tenantId);
      return (await this.sync.ledgerNames(tx)).map((l) => ({ accountId: l.account.id, code: l.account.code, accountName: l.account.name, groupType: l.account.groupType, tallyLedger: l.name, tallyParent: l.parent, mapped: l.mapped }));
    });
  }

  @Put('mapping')
  @Auth('user', FEE_ROLES)
  putMapping(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MapBody)) b: z.infer<typeof MapBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select({ id: acctAccounts.id }).from(acctAccounts).where(eq(acctAccounts.id, b.accountId));
      if (!a) throw new NotFoundException('Account not found');
      const [row] = await tx.insert(tallyLedgerMap).values({ tenantId: p.tenantId, ...b }).onConflictDoUpdate({ target: [tallyLedgerMap.tenantId, tallyLedgerMap.accountId], set: { tallyLedger: b.tallyLedger, tallyParent: b.tallyParent } }).returning();
      // The ledger is sent again under its new name.
      await tx.update(tallySyncLog).set({ status: 'pending', attempts: 0 }).where(and(eq(tallySyncLog.kind, 'ledger'), eq(tallySyncLog.refId, b.accountId)));
      return row;
    });
  }

  @Get('log')
  @Auth('user', FEE_ROLES)
  log(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(tallySyncLog).where(status && ['pending', 'sent', 'failed'].includes(status) ? eq(tallySyncLog.status, status) : undefined).orderBy(desc(tallySyncLog.updatedAt)).limit(500);
      const all = await tx.select({ s: tallySyncLog.status }).from(tallySyncLog);
      const count = (s: string) => all.filter((x) => x.s === s).length;
      return { counts: { pending: count('pending'), sent: count('sent'), failed: count('failed') }, rows: rows.map(({ requestXml, ...r }) => ({ ...r, hasXml: !!requestXml })) };
    });
  }

  /** Queues anything not yet in the log, then sends everything pending or failed. */
  @Post('sync')
  @Auth('user', FEE_ROLES)
  async run(@CurrentPrincipal() p: UserPrincipal) {
    const queued = await this.db.withTenant(p.tenantId, (tx) => this.sync.queueMissing(tx, p.tenantId));
    const result = await this.sync.run(p.tenantId);
    await this.db.withTenant(p.tenantId, (tx) => audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tally.sync_run', subjectType: 'tenant', subjectId: p.tenantId, data: { ...queued, ...result } }));
    return { queued, ...result };
  }

  /** Tries one failed row again. */
  @Post('log/:id/retry')
  @Auth('user', FEE_ROLES)
  async retry(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const row = await this.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(tallySyncLog).where(eq(tallySyncLog.id, id)))[0]);
    if (!row) throw new NotFoundException('Not found');
    if (row.status === 'sent') throw new BadRequestException('That one was already sent');
    return this.sync.run(p.tenantId, [id]);
  }

  /**
   * The offline fallback: one XML file with the ledgers and the vouchers not yet in Tally, for
   * Tally's Import Data. Importing it by hand is then confirmed with "mark imported".
   */
  @Get('export.xml')
  @Auth('user', FEE_ROLES)
  exportXml(@CurrentPrincipal() p: UserPrincipal, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [cfg] = await tx.select().from(tallySettings);
      await this.sync.queueMissing(tx, p.tenantId);
      const open = await tx.select().from(tallySyncLog).where(ne(tallySyncLog.status, 'sent')).orderBy(asc(tallySyncLog.createdAt));
      const ledgers = (await this.sync.ledgerNames(tx)).filter((l) => open.some((o) => o.kind === 'ledger' && o.refId === l.account.id)).map((l) => ({ name: l.name, parent: l.parent }));
      const vouchers: TallyVoucher[] = [];
      for (const o of open.filter((x) => x.kind === 'voucher')) {
        const v = await this.sync.voucherFor(tx, o.refId);
        if (v) vouchers.push(v);
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tally.file_exported', subjectType: 'tenant', subjectId: p.tenantId, data: { ledgers: ledgers.length, vouchers: vouchers.length } });
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tally-import.xml"');
      return fileXml(cfg?.company ?? 'Company', ledgers, vouchers);
    });
  }

  @Post('mark-imported')
  @Auth('user', FEE_ROLES)
  markImported(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.update(tallySyncLog).set({ status: 'sent', lastError: 'Imported from the XML file', updatedAt: new Date() }).where(ne(tallySyncLog.status, 'sent')).returning({ id: tallySyncLog.id });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tally.file_imported', subjectType: 'tenant', subjectId: p.tenantId, data: { rows: rows.length } });
      return { marked: rows.length };
    });
  }
}
