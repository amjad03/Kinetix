import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, BROADCAST_ROLES, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { NOTICE_VERSION } from '../consent/consent.controller.js';
import { DbService, type Tx } from '../db/db.service.js';
import { announcementRecipients, announcements, departments, userRoles, users } from '../db/schema.js';
import { commChannelPrefs, commChannelSettings, commCreditLedger, commSendLog, PAID_CHANNELS, PREF_CHANNELS } from '../db/schema-comms.js';
import { Mailer } from '../analytics/mailer.js';
import { TextSender, WhatsAppSender } from './channels.js';
import { DLT_HEADER, DLT_ID } from './comms.logic.js';
import { isHodOnly } from './comms.controller.js';
import { creditBalance, latestPrefs, startOfLocalDay } from './comms.service.js';
import { hodScope } from './scope.js';

export const CREDIT_ROLES: RoleName[] = ['tenant_admin', 'principal', 'accountant'];
const REPORT_ROLES: RoleName[] = [...BROADCAST_ROLES, 'accountant'];
const Channel = z.enum(['sms', 'whatsapp', 'email', 'push']);

const SettingsBody = z
  .object({
    enabled: z.boolean(),
    senderId: z.string().trim().max(120).default(''),
    dltEntityId: z.string().trim().regex(DLT_ID, 'A DLT entity id is 19 digits').or(z.literal('')).default(''),
    unitCostPaise: z.number().int().min(0).max(10_000),
    hourlyLimit: z.number().int().min(0).max(1_000_000).default(0),
    dailyLimit: z.number().int().min(0).max(10_000_000).default(0),
    lowBalanceUnits: z.number().int().min(0).max(10_000_000).default(0),
  })
  .strict();
const TopUpBody = z.object({
  channel: z.enum(PAID_CHANNELS),
  /** A positive top-up, or a correction (adjust, either sign). */
  kind: z.enum(['topup', 'adjust']).default('topup'),
  units: z.number().int().refine((n) => n !== 0, 'Give the number of messages').refine((n) => Math.abs(n) <= 10_000_000, 'Too many at once'),
  amountPaise: z.number().int().min(0).max(1_000_000_000).default(0),
  reference: z.string().trim().max(80).default(''),
  note: z.string().trim().max(300).default(''),
});
const PrefBody = z.object({ channel: Channel, granted: z.boolean() });
const RecordPrefBody = PrefBody.extend({ userId: z.uuid(), note: z.string().trim().min(3, 'Say what the person signed or said').max(300) });
const Page = z.coerce.number().int().min(1).max(10_000).default(1);
const PageSize = z.coerce.number().int().min(10).max(200).default(50);
const DateQ = z.iso.date().optional();

/** Default for a channel nobody has chosen on: SMS, email and push are part of the service; WhatsApp needs an opt-in. */
const DEFAULT_GRANTED: Record<string, boolean> = { sms: true, email: true, push: true, whatsapp: false };

/**
 * Communication controls: each channel's provider registration (DLT entity id and header, WhatsApp number, from
 * address), price and caps; prepaid credits; consent per channel (DPDP) with the institution's register; the log
 * of every send; and delivery, read and cost reports by channel and department.
 */
@Controller('v1/comms')
export class CommsAdminController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    private readonly sms: TextSender,
    private readonly whatsapp: WhatsAppSender,
    private readonly mailer: Mailer,
  ) {}

  // ---- channels ---------------------------------------------------------------------------------

  /** Each channel's provider and settings, with the delivery-report URL to give the provider. */
  @Get('channels')
  @Auth('user', STAFF_ADMIN_ROLES)
  channels(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(commChannelSettings);
      const base = (this.env.API_PUBLIC_URL ?? '').replace(/\/$/, '');
      const provider = { sms: this.sms.provider, whatsapp: this.whatsapp.provider, email: this.mailer.provider, push: 'fcm' } as const;
      return (['sms', 'whatsapp', 'email', 'push'] as const).map((channel) => {
        const r = rows.find((x) => x.channel === channel);
        return {
          channel,
          provider: provider[channel],
          connected: channel === 'whatsapp' ? this.whatsapp.connected : provider[channel] !== 'console' && provider[channel] !== 'log',
          enabled: r?.enabled ?? true,
          senderId: r?.senderId ?? '',
          dltEntityId: r?.dltEntityId ?? '',
          unitCostPaise: r?.unitCostPaise ?? 0,
          hourlyLimit: r?.hourlyLimit ?? 0,
          dailyLimit: r?.dailyLimit ?? 0,
          lowBalanceUnits: r?.lowBalanceUnits ?? 0,
          reportUrl: r && channel !== 'push' ? `${base}/v1/comms/webhooks/${provider[channel]}/${p.tenantId}/${r.webhookToken}` : null,
          updatedAt: r?.updatedAt ?? null,
        };
      });
    });
  }

  @Put('channels/:channel')
  @Auth('user', STAFF_ADMIN_ROLES)
  saveChannel(@CurrentPrincipal() p: UserPrincipal, @Param('channel') raw: string, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    const channel = Channel.safeParse(raw);
    if (!channel.success) throw new NotFoundException('Unknown channel');
    if (channel.data === 'sms' && b.senderId && !DLT_HEADER.test(b.senderId.toUpperCase())) throw new BadRequestException('A DLT header is 6 letters (or 6 digits for promotional text)');
    if (channel.data === 'email' && b.senderId && !z.email().safeParse(b.senderId).success) throw new BadRequestException('The from-address is not an email address');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [before] = await tx.select().from(commChannelSettings).where(eq(commChannelSettings.channel, channel.data));
      const values = { ...b, senderId: channel.data === 'sms' ? b.senderId.toUpperCase() : b.senderId, updatedBy: p.userId, updatedAt: this.clock.now() };
      const [row] = await tx
        .insert(commChannelSettings)
        .values({ tenantId: p.tenantId, channel: channel.data, provider: channel.data === 'sms' ? this.sms.provider : channel.data === 'whatsapp' ? this.whatsapp.provider : this.mailer.provider, ...values })
        .onConflictDoUpdate({ target: [commChannelSettings.tenantId, commChannelSettings.channel], set: values })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'comms.channel_saved', subjectType: 'comm_channel', subjectId: row.id, before: before ?? null, after: row, fields: ['enabled', 'senderId', 'dltEntityId', 'unitCostPaise', 'hourlyLimit', 'dailyLimit', 'lowBalanceUnits'] });
      return { channel: row.channel, enabled: row.enabled, senderId: row.senderId, dltEntityId: row.dltEntityId, unitCostPaise: row.unitCostPaise, hourlyLimit: row.hourlyLimit, dailyLimit: row.dailyLimit, lowBalanceUnits: row.lowBalanceUnits };
    });
  }

  // ---- credits ----------------------------------------------------------------------------------

  /** Balance per paid channel, what was spent this month and whether it is running low. */
  @Get('credits')
  @Auth('user', CREDIT_ROLES)
  credits(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const settings = await tx.select().from(commChannelSettings);
      const monthStart = sql`date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'`;
      const rows = await tx
        .select({
          channel: commCreditLedger.channel,
          balance: sql<number>`coalesce(sum(${commCreditLedger.units}), 0)::int`,
          spentUnits: sql<number>`coalesce(-sum(${commCreditLedger.units}) filter (where ${commCreditLedger.kind} = 'spend' and ${commCreditLedger.createdAt} >= ${monthStart}), 0)::int`,
          spentPaise: sql<number>`coalesce(-sum(${commCreditLedger.amountPaise}) filter (where ${commCreditLedger.kind} = 'spend' and ${commCreditLedger.createdAt} >= ${monthStart}), 0)::bigint`,
          toppedUpPaise: sql<number>`coalesce(sum(${commCreditLedger.amountPaise}) filter (where ${commCreditLedger.kind} = 'topup'), 0)::bigint`,
          lastTopUp: sql<string | null>`max(${commCreditLedger.createdAt}) filter (where ${commCreditLedger.kind} = 'topup')`,
        })
        .from(commCreditLedger)
        .groupBy(commCreditLedger.channel);
      return PAID_CHANNELS.map((channel) => {
        const r = rows.find((x) => x.channel === channel);
        const s = settings.find((x) => x.channel === channel);
        const balance = r?.balance ?? 0;
        const prepaid = (s?.unitCostPaise ?? 0) > 0;
        return { channel, prepaid, balance, unitCostPaise: s?.unitCostPaise ?? 0, lowBalanceUnits: s?.lowBalanceUnits ?? 0, low: prepaid && balance <= (s?.lowBalanceUnits ?? 0), spentUnitsThisMonth: r?.spentUnits ?? 0, spentPaiseThisMonth: Number(r?.spentPaise ?? 0), toppedUpPaise: Number(r?.toppedUpPaise ?? 0), lastTopUp: r?.lastTopUp ?? null };
      });
    });
  }

  @Post('credits')
  @Auth('user', CREDIT_ROLES)
  topUp(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TopUpBody)) b: z.infer<typeof TopUpBody>) {
    if (b.kind === 'topup' && b.units < 0) throw new BadRequestException('A top-up adds messages; use a correction to take them off');
    if (b.kind === 'adjust' && b.note.length < 3) throw new BadRequestException('Say why the balance is corrected');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await creditBalance(tx, b.channel);
      if (before + b.units < 0) throw new BadRequestException(`The balance would go below zero (${before} left)`);
      const [row] = await tx.insert(commCreditLedger).values({ tenantId: p.tenantId, channel: b.channel, kind: b.kind, units: b.units, amountPaise: b.amountPaise, reference: b.reference, note: b.note, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `comms.credits_${b.kind === 'topup' ? 'added' : 'corrected'}`, subjectType: 'comm_credit', subjectId: row.id, data: { channel: b.channel, units: b.units, amountPaise: b.amountPaise, reference: b.reference, balanceBefore: before, balanceAfter: before + b.units } });
      return { id: row.id, channel: b.channel, balance: before + b.units };
    });
  }

  @Get('credits/ledger')
  @Auth('user', CREDIT_ROLES)
  ledger(@CurrentPrincipal() p: UserPrincipal, @Query('channel') channel?: string, @Query('kind') kind?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const pg = Page.parse(page ?? 1);
    const size = PageSize.parse(pageSize ?? 50);
    const where = and(
      channel ? eq(commCreditLedger.channel, z.enum(PAID_CHANNELS).parse(channel)) : undefined,
      kind ? eq(commCreditLedger.kind, z.enum(['topup', 'spend', 'refund', 'adjust']).parse(kind)) : undefined,
    );
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(commCreditLedger).where(where);
      const rows = await tx
        .select({ id: commCreditLedger.id, channel: commCreditLedger.channel, kind: commCreditLedger.kind, units: commCreditLedger.units, amountPaise: commCreditLedger.amountPaise, reference: commCreditLedger.reference, note: commCreditLedger.note, createdAt: commCreditLedger.createdAt, by: users.fullName })
        .from(commCreditLedger)
        .leftJoin(users, eq(users.id, commCreditLedger.createdBy))
        .where(where)
        .orderBy(desc(commCreditLedger.createdAt))
        .limit(size)
        .offset((pg - 1) * size);
      return { rows, total: n, page: pg, pageSize: size };
    });
  }

  // ---- consent per channel (DPDP) ---------------------------------------------------------------

  /** The caller's own choice per channel (apps' privacy screen). */
  @Get('preferences')
  @Auth('user')
  myPrefs(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.prefsOf(tx, p));
  }

  private async prefsOf(tx: Tx, p: UserPrincipal) {
    {
      const prefs = await latestPrefs(tx, [p.userId]);
      const [u] = await tx.select({ phone: users.phone, email: users.email }).from(users).where(eq(users.id, p.userId));
      return {
        noticeVersion: NOTICE_VERSION,
        channels: PREF_CHANNELS.map((channel) => ({ channel, granted: prefs.get(`${p.userId}:${channel}`) ?? DEFAULT_GRANTED[channel], asked: prefs.has(`${p.userId}:${channel}`), reachable: channel === 'email' ? !!u?.email : channel === 'push' ? true : !!u?.phone })),
        /** In-app messages and emergency alerts always arrive. */
        alwaysOn: ['in_app', 'emergency'],
      };
    }
  }

  @Put('preferences')
  @Auth('user')
  setPref(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PrefBody)) b: z.infer<typeof PrefBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const current = (await latestPrefs(tx, [p.userId])).get(`${p.userId}:${b.channel}`);
      if (current !== b.granted) {
        const [row] = await tx.insert(commChannelPrefs).values({ tenantId: p.tenantId, userId: p.userId, channel: b.channel, granted: b.granted, source: 'app', noticeVersion: NOTICE_VERSION, recordedBy: p.userId }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: b.granted ? 'comms.channel_opt_in' : 'comms.channel_opt_out', subjectType: 'comm_channel_pref', subjectId: row.id, data: { channel: b.channel, source: 'app' } });
      }
      return this.prefsOf(tx, p);
    });
  }

  /** The institution's register: each person's latest choice per channel, filterable and paged. */
  @Get('preferences/register')
  @Auth('user', STAFF_ADMIN_ROLES)
  register(@CurrentPrincipal() p: UserPrincipal, @Query('channel') channel?: string, @Query('granted') granted?: string, @Query('q') q?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const pg = Page.parse(page ?? 1);
    const size = PageSize.parse(pageSize ?? 50);
    const ch = channel ? Channel.parse(channel) : undefined;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const latest = tx
        .selectDistinctOn([commChannelPrefs.userId, commChannelPrefs.channel], { id: commChannelPrefs.id, userId: commChannelPrefs.userId, channel: commChannelPrefs.channel, granted: commChannelPrefs.granted, source: commChannelPrefs.source, note: commChannelPrefs.note, noticeVersion: commChannelPrefs.noticeVersion, at: commChannelPrefs.createdAt, recordedBy: commChannelPrefs.recordedBy })
        .from(commChannelPrefs)
        .orderBy(commChannelPrefs.userId, commChannelPrefs.channel, desc(commChannelPrefs.createdAt))
        .as('l');
      const term = q?.trim().replace(/[%_\\]/g, '');
      const where = and(ch ? eq(latest.channel, ch) : undefined, granted === 'true' || granted === 'false' ? eq(latest.granted, granted === 'true') : undefined, term ? ilike(users.fullName, `%${term}%`) : undefined);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(latest).innerJoin(users, eq(users.id, latest.userId)).where(where);
      const rows = await tx
        .select({ id: latest.id, userId: latest.userId, fullName: users.fullName, channel: latest.channel, granted: latest.granted, source: latest.source, note: latest.note, noticeVersion: latest.noticeVersion, at: latest.at, roles: sql<string[]>`(select array_agg(distinct r.role::text) from user_roles r where r.user_id = ${users.id})` })
        .from(latest)
        .innerJoin(users, eq(users.id, latest.userId))
        .where(where)
        .orderBy(desc(latest.at))
        .limit(size)
        .offset((pg - 1) * size);
      const [counts] = await tx
        .select({ optedOut: sql<number>`count(*) filter (where not ${latest.granted})::int`, optedIn: sql<number>`count(*) filter (where ${latest.granted})::int` })
        .from(latest);
      return { rows, total: n, page: pg, pageSize: size, ...counts };
    });
  }

  /** The office records a choice made on paper or by phone, with what the person signed or said. */
  @Post('preferences/record')
  @Auth('user', STAFF_ADMIN_ROLES)
  recordPref(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RecordPrefBody)) b: z.infer<typeof RecordPrefBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, b.userId));
      if (!u) throw new NotFoundException('Person not found');
      const [row] = await tx.insert(commChannelPrefs).values({ tenantId: p.tenantId, userId: b.userId, channel: b.channel, granted: b.granted, source: 'erp', noticeVersion: NOTICE_VERSION, recordedBy: p.userId, note: b.note }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: b.granted ? 'comms.channel_opt_in' : 'comms.channel_opt_out', subjectType: 'comm_channel_pref', subjectId: row.id, data: { channel: b.channel, userId: b.userId, source: 'erp', note: b.note } });
      return row;
    });
  }

  // ---- send log ---------------------------------------------------------------------------------

  /** Every hand-over and hold-back, newest first, paged on the server. A head of department sees their department's. */
  @Get('log')
  @Auth('user', BROADCAST_ROLES)
  async sendLog(
    @CurrentPrincipal() p: UserPrincipal,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('sourceId') sourceId?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pg = Page.parse(page ?? 1);
    const size = PageSize.parse(pageSize ?? 50);
    const f = DateQ.parse(from || undefined);
    const t = DateQ.parse(to || undefined);
    const st = status ? z.enum(['accepted', 'delivered', 'read', 'failed', 'bounced', 'suppressed', 'deferred']).parse(status) : undefined;
    const src = sourceId ? z.uuid().parse(sourceId) : undefined;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const term = q?.trim().replace(/[%_\\]/g, '');
      const where = and(
        channel ? eq(commSendLog.channel, channel) : undefined,
        st ? eq(commSendLog.status, st) : undefined,
        src ? eq(commSendLog.sourceId, src) : undefined,
        f ? gte(commSendLog.attemptedAt, istDate(f)) : undefined,
        t ? lt(commSendLog.attemptedAt, new Date(istDate(t).getTime() + 86_400_000)) : undefined,
        term ? or(ilike(users.fullName, `%${term}%`), ilike(commSendLog.address, `%${term}%`)) : undefined,
        await this.departmentFilter(tx, p, commSendLog.departmentId),
      );
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(commSendLog).leftJoin(users, eq(users.id, commSendLog.userId)).where(where);
      const sender = sql<string | null>`(select full_name from users s where s.id = ${commSendLog.sentBy})`;
      const rows = await tx
        .select({
          id: commSendLog.id,
          attemptedAt: commSendLog.attemptedAt,
          statusAt: commSendLog.statusAt,
          sourceType: commSendLog.sourceType,
          sourceId: commSendLog.sourceId,
          title: sql<string | null>`coalesce((select c.title from message_campaigns c where c.id = ${commSendLog.sourceId}), (select a.title from announcements a where a.id = ${commSendLog.sourceId}))`,
          recipient: users.fullName,
          channel: commSendLog.channel,
          provider: commSendLog.provider,
          address: commSendLog.address,
          status: commSendLog.status,
          step: commSendLog.step,
          units: commSendLog.units,
          costPaise: commSendLog.costPaise,
          error: commSendLog.error,
          emergency: commSendLog.emergency,
          department: departments.name,
          sentBy: sender,
        })
        .from(commSendLog)
        .leftJoin(users, eq(users.id, commSendLog.userId))
        .leftJoin(departments, eq(departments.id, commSendLog.departmentId))
        .where(where)
        .orderBy(desc(commSendLog.attemptedAt), desc(commSendLog.id))
        .limit(size)
        .offset((pg - 1) * size);
      return { rows, total: n, page: pg, pageSize: size };
    });
  }

  private async departmentFilter(tx: Tx, p: UserPrincipal, col: typeof commSendLog.departmentId | typeof announcements.departmentId): Promise<SQL | undefined> {
    if (!isHodOnly(p)) return undefined;
    const scope = await hodScope(tx, p.userId);
    return scope.departmentIds.length ? inArray(col, scope.departmentIds) : sql`false`;
  }

  // ---- reports ----------------------------------------------------------------------------------

  /**
   * Delivery, read and cost by channel and by department for a period (IST dates, default this month). App notices
   * count as sent when they reach the app, delivered when the app fetched them and read when opened.
   */
  @Get('reports/summary')
  @Auth('user', REPORT_ROLES)
  async summary(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    const now = this.clock.now();
    const f = DateQ.parse(from || undefined);
    const t = DateQ.parse(to || undefined);
    const start = f ? istDate(f) : startOfLocalDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12)), 'Asia/Kolkata');
    const end = t ? new Date(istDate(t).getTime() + 86_400_000) : new Date(now.getTime() + 60_000);
    if (end <= start) throw new BadRequestException('The end date is before the start date');
    if (end.getTime() - start.getTime() > 400 * 86_400_000) throw new BadRequestException('Choose at most about a year');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const dept = await this.departmentFilter(tx, p, commSendLog.departmentId);
      const inRange = and(gte(commSendLog.attemptedAt, start), lt(commSendLog.attemptedAt, end), dept);
      const counts = {
        sent: sql<number>`count(*) filter (where ${commSendLog.status} in ('accepted', 'delivered', 'read', 'bounced') or (${commSendLog.status} = 'failed' and ${commSendLog.providerMessageId} is not null))::int`,
        // An in-app message is in the app as soon as it is handed over.
        delivered: sql<number>`count(*) filter (where ${commSendLog.status} in ('delivered', 'read') or (${commSendLog.channel} = 'in_app' and ${commSendLog.status} = 'accepted'))::int`,
        read: sql<number>`count(*) filter (where ${commSendLog.status} = 'read')::int`,
        failed: sql<number>`count(*) filter (where ${commSendLog.status} in ('failed', 'bounced'))::int`,
        suppressed: sql<number>`count(*) filter (where ${commSendLog.status} = 'suppressed')::int`,
        deferred: sql<number>`count(*) filter (where ${commSendLog.status} = 'deferred')::int`,
        units: sql<number>`coalesce(sum(${commSendLog.units}), 0)::int`,
        costPaise: sql<number>`coalesce(sum(${commSendLog.costPaise}), 0)::int`,
      };
      const byChannel = await tx.select({ channel: commSendLog.channel, ...counts }).from(commSendLog).where(inRange).groupBy(commSendLog.channel).orderBy(commSendLog.channel);
      const byDepartment = await tx
        .select({ departmentId: commSendLog.departmentId, department: sql<string>`coalesce(${departments.name}, 'Institution office')`, ...counts })
        .from(commSendLog)
        .leftJoin(departments, eq(departments.id, commSendLog.departmentId))
        .where(inRange)
        .groupBy(commSendLog.departmentId, departments.name)
        .orderBy(desc(counts.costPaise));
      const byDay = await tx
        .select({ day: sql<string>`to_char(${commSendLog.attemptedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`, sent: counts.sent, delivered: counts.delivered, costPaise: counts.costPaise })
        .from(commSendLog)
        .where(inRange)
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      // App notices: sent to the app, fetched (delivered), opened (read), acknowledged, by the sender's department.
      const adept = await this.departmentFilter(tx, p, announcements.departmentId);
      const apps = await tx
        .select({
          departmentId: announcements.departmentId,
          department: sql<string>`coalesce(${departments.name}, 'Institution office')`,
          channel: announcementRecipients.channel,
          sent: sql<number>`count(*)::int`,
          delivered: sql<number>`count(${announcementRecipients.deliveredAt})::int`,
          read: sql<number>`count(${announcementRecipients.readAt})::int`,
          acknowledged: sql<number>`count(${announcementRecipients.acknowledgedAt})::int`,
        })
        .from(announcementRecipients)
        .innerJoin(announcements, eq(announcements.id, announcementRecipients.announcementId))
        .leftJoin(departments, eq(departments.id, announcements.departmentId))
        .where(and(gte(announcements.sentAt, start), lt(announcements.sentAt, end), adept))
        .groupBy(announcements.departmentId, departments.name, announcementRecipients.channel);
      const total = byChannel.reduce((a, r) => ({ sent: a.sent + r.sent, delivered: a.delivered + r.delivered, failed: a.failed + r.failed, costPaise: a.costPaise + r.costPaise }), { sent: 0, delivered: 0, failed: 0, costPaise: 0 });
      return { from: start.toISOString(), to: end.toISOString(), total, byChannel, byDepartment, byDay, apps };
    });
  }
}

/** The start of a YYYY-MM-DD day in India. */
const istDate = (d: string) => new Date(`${d}T00:00:00+05:30`);
