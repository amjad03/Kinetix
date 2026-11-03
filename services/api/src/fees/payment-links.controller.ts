import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject, Ip, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeInvoices, guardians, students, tenants, users } from '../db/schema.js';
import { feeStudentProfiles } from '../db/schema-fee-depth.js';
import { feePaymentLinks, type LinkSend } from '../db/schema-fee-flagship.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { settingsOf } from '../fee-accounts/fee-accounts.service.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { feeAccountById } from './fee-accounts-core.js';
import { familyUserIds, type OutChannel, sendFeeMessage } from './fee-messages.js';
import { FEE_ROLES } from './fees.service.js';
import { GatewayFlow } from './gateway-flow.service.js';
import { PaymentGateway } from './payment-gateway.service.js';
import { upiQr } from './upi.js';

export const LINK_EXPIRY_JOB = 'fees.payment_links_expire';
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const Channel = z.enum(['sms', 'whatsapp', 'email']);
const LinkBody = z
  .object({
  invoiceId: z.uuid(),
  /** A set amount (an instalment); otherwise the balance. */
  amountPaise: z.number().int().min(100).max(100_000_000_00).optional(),
  allowPartial: z.boolean().optional(),
  validDays: z.number().int().min(1).max(60).optional(),
  channels: z.array(Channel).max(3).default([]),
  /** The ERP's dialog sends ticks instead of a list. */
  sms: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  email: z.boolean().optional(),
}).transform(({ sms, whatsapp, email, ...b }) => ({ ...b, channels: [...new Set([...b.channels, ...(sms ? ['sms' as const] : []), ...(whatsapp ? ['whatsapp' as const] : []), ...(email ? ['email' as const] : [])])] }));
const ResendBody = z
  .object({ channels: z.array(Channel).max(3).default([]), sms: z.boolean().optional(), whatsapp: z.boolean().optional(), email: z.boolean().optional() })
  .transform(({ sms, whatsapp, email, channels }) => ({ channels: [...new Set([...channels, ...(sms ? ['sms' as const] : []), ...(whatsapp ? ['whatsapp' as const] : []), ...(email ? ['email' as const] : [])])] }))
  .refine((b) => b.channels.length > 0, { message: 'Choose at least one way to send it', path: ['channels'] });
const PublicCheckout = z.object({ amountPaise: z.number().int().min(100).max(100_000_000_00).optional() });

/**
 * Payment links: the accounts office sends a family a link (by SMS, WhatsApp or e-mail through the Communication
 * templates "fee_payment_link") that pays one fee through the fee account's gateway, or by the UPI QR shown with it,
 * without signing in, until it expires. Only a hash of the link's token is kept; the public page shows no more than
 * the fee, the institution and the student's first name.
 */
@Controller()
export class PaymentLinksController {
  private readonly base: string;

  constructor(
    private readonly db: DbService,
    private readonly flow: GatewayFlow,
    private readonly gateway: PaymentGateway,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
    private readonly jobs: JobsService,
    @Inject(ENV) env: Env,
  ) {
    this.base = env.PAY_LINK_BASE_URL.replace(/\/+$/, '');
    this.jobs.registerDaily(LINK_EXPIRY_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.expire(tx)).then(() => undefined));
  }

  private async slug(tx: Tx) {
    const [t] = await tx.select({ slug: tenants.slug, name: tenants.name }).from(tenants);
    return t;
  }

  /** Marks links past their time expired. */
  async expire(tx: Tx): Promise<number> {
    const rows = await tx.update(feePaymentLinks).set({ status: 'expired' }).where(and(eq(feePaymentLinks.status, 'active'), lt(feePaymentLinks.expiresAt, this.clock.now()))).returning({ id: feePaymentLinks.id });
    return rows.length;
  }

  @Post('v1/fees/payment-links')
  @Auth('user', FEE_ROLES)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LinkBody)) b: z.infer<typeof LinkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, b.invoiceId));
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'due') throw new ConflictException('This fee has nothing due');
      const balance = inv.amountPaise - inv.paidPaise;
      const amount = b.amountPaise ?? balance;
      if (amount > balance) throw new BadRequestException('That is more than the balance due');
      const s = await settingsOf(tx, p.tenantId);
      const days = b.validDays ?? s.online.linkValidDays ?? 7;
      const token = randomBytes(24).toString('base64url');
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${p.tenantId}:payment-links`}))`);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(feePaymentLinks);
      const number = `PL-${String(n + 1).padStart(5, '0')}`;
      const [row] = await tx
        .insert(feePaymentLinks)
        .values({ tenantId: p.tenantId, tokenHash: hashToken(token), number, studentId: inv.studentId, invoiceId: inv.id, amountPaise: amount, allowPartial: b.allowPartial ?? false, expiresAt: new Date(this.clock.now().getTime() + days * 86400_000), channels: b.channels, createdBy: p.userId, createdAt: this.clock.now() })
        .returning();
      const t = await this.slug(tx);
      const url = `${this.base}/${t.slug}/${token}`;
      const sent = await this.send(tx, p, row, url, b.channels);
      await auditUser(tx, p, 'fees.payment_link_created', 'fee_payment_link', row.id, { number, invoiceId: inv.id, amountPaise: amount, expiresAt: row.expiresAt, channels: b.channels });
      return { ...this.view(row), sent, url };
    });
  }

  /** Sends (again) on these channels; the link itself is the same. A new link is needed to get its URL again. */
  @Post('v1/fees/payment-links/:id/resend')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  resend(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ResendBody)) b: z.infer<typeof ResendBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(feePaymentLinks).where(eq(feePaymentLinks.id, id)).for('update');
      if (!row) throw new NotFoundException('Link not found');
      if (row.status !== 'active' || row.expiresAt < this.clock.now()) throw new ConflictException('This link is no longer open; make a new one');
      // The token is not kept, so a resend issues a fresh token for the same link (the old URL stops working).
      const token = randomBytes(24).toString('base64url');
      await tx.update(feePaymentLinks).set({ tokenHash: hashToken(token) }).where(eq(feePaymentLinks.id, id));
      const t = await this.slug(tx);
      const sent = await this.send(tx, p, row, `${this.base}/${t.slug}/${token}`, b.channels, `resend-${Date.now()}`);
      await auditUser(tx, p, 'fees.payment_link_resent', 'fee_payment_link', id, { channels: b.channels });
      return { ...this.view((await tx.select().from(feePaymentLinks).where(eq(feePaymentLinks.id, id)))[0]), sent };
    });
  }

  @Post('v1/fees/payment-links/:id/cancel')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(feePaymentLinks).set({ status: 'cancelled' }).where(and(eq(feePaymentLinks.id, id), eq(feePaymentLinks.status, 'active'))).returning();
      if (!row) throw new ConflictException('Only an open link can be cancelled');
      await auditUser(tx, p, 'fees.payment_link_cancelled', 'fee_payment_link', id);
      return this.view(row);
    });
  }

  @Get('v1/fees/payment-links')
  @Auth('user', FEE_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('studentId') studentId?: string, @Query('page') page?: string) {
    const st = z.enum(['active', 'paid', 'expired', 'cancelled']).optional().safeParse(status || undefined);
    if (!st.success || (studentId && !z.uuid().safeParse(studentId).success)) throw new BadRequestException('Bad filter');
    const pg = Math.max(1, Math.min(1000, Number(page ?? 1) || 1));
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.expire(tx);
      const where = and(st.data ? eq(feePaymentLinks.status, st.data) : undefined, studentId ? eq(feePaymentLinks.studentId, studentId) : undefined);
      const rows = await tx
        .select({ link: feePaymentLinks, student: students.fullName, rollNo: students.rollNo, title: feeInvoices.title, invoiceNo: feeInvoices.invoiceNo })
        .from(feePaymentLinks)
        .innerJoin(students, eq(students.id, feePaymentLinks.studentId))
        .innerJoin(feeInvoices, eq(feeInvoices.id, feePaymentLinks.invoiceId))
        .where(where)
        .orderBy(desc(feePaymentLinks.createdAt))
        .limit(50)
        .offset((pg - 1) * 50);
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(feePaymentLinks).where(where);
      return { rows: rows.map((r) => ({ ...this.view(r.link), student: r.student, rollNo: r.rollNo, title: r.title, invoiceNo: r.invoiceNo })), total, page: pg, pageSize: 50 };
    });
  }

  // ---- The public page ------------------------------------------------------------------------------------

  /** What the family sees on opening the link: the fee, the amount, the institution, and the UPI QR. */
  @Get('v1/public/pay/:slug/:token')
  async open(@Param('slug') slug: string, @Param('token') token: string, @Ip() ip: string) {
    await this.limiter.hit(`paylink:${ip}`, 60, 60_000);
    const found = await this.find(slug, token);
    if (!found) return { status: 'not_found' as const };
    return this.db.withTenant(found.tenantId, async (tx) => {
      const [row] = await tx.select().from(feePaymentLinks).where(eq(feePaymentLinks.id, found.linkId));
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, row.invoiceId));
      const [st] = await tx.select({ fullName: students.fullName }).from(students).where(eq(students.id, row.studentId));
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      const balance = inv.amountPaise - inv.paidPaise;
      const status = row.status === 'active' && row.expiresAt < this.clock.now() ? 'expired' : row.status === 'active' && (inv.status !== 'due' || balance <= 0) ? 'paid' : row.status;
      if (!row.openedAt) await tx.update(feePaymentLinks).set({ openedAt: this.clock.now() }).where(eq(feePaymentLinks.id, row.id));
      const amount = Math.min(row.amountPaise, Math.max(0, balance));
      const account = await feeAccountById(tx, inv.feeAccountId);
      const [prof] = await tx.select({ ref: feeStudentProfiles.feeRef }).from(feeStudentProfiles).where(eq(feeStudentProfiles.studentId, row.studentId));
      const online = await this.gateway.availableName(tx, inv.feeAccountId);
      return {
        status,
        number: row.number,
        institution: account?.name ?? t.name,
        studentFirstName: (st?.fullName ?? '').split(' ')[0],
        title: inv.title,
        invoiceNo: inv.invoiceNo,
        amountPaise: amount,
        balancePaise: Math.max(0, balance),
        allowPartial: row.allowPartial,
        expiresAt: row.expiresAt,
        onlinePayments: status === 'active' ? online : null,
        upi: status === 'active' ? upiQr({ vpa: account?.upiVpa, payee: account?.upiPayeeName ?? account?.name ?? t.name, amountPaise: amount, reference: `${prof?.ref ?? ''}${row.number}`, note: `${inv.title}`.slice(0, 40) }) : null,
      };
    });
  }

  /** Starts the payment from the link (no sign-in): the order is made in the fee account's gateway. */
  @Post('v1/public/pay/:slug/:token/checkout')
  async checkout(@Param('slug') slug: string, @Param('token') token: string, @Body(new ZodBody(PublicCheckout)) b: z.infer<typeof PublicCheckout>, @Ip() ip: string) {
    await this.limiter.hit(`paylink-checkout:${ip}`, 10, 60_000);
    const found = await this.find(slug, token);
    if (!found) throw new NotFoundException('This link is not valid');
    const prep = await this.db.withTenant(found.tenantId, async (tx) => {
      const [row] = await tx.select().from(feePaymentLinks).where(eq(feePaymentLinks.id, found.linkId));
      if (row.status !== 'active' || row.expiresAt < this.clock.now()) throw new ConflictException('This link has expired or was already used');
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, row.invoiceId));
      const balance = inv.amountPaise - inv.paidPaise;
      const fixed = Math.min(row.amountPaise, balance);
      const amount = row.allowPartial && b.amountPaise ? b.amountPaise : fixed;
      if (amount > fixed) throw new BadRequestException('That is more than this link pays');
      // The payer is the family on record (the gateway needs a name, phone and e-mail).
      const [g] = await tx.select({ name: users.fullName, email: users.email, phone: users.phone }).from(guardians).innerJoin(users, eq(users.id, guardians.userId)).where(eq(guardians.studentId, row.studentId)).limit(1);
      return { row, amount, payer: { name: g?.name ?? 'Parent', email: g?.email ?? '', phone: g?.phone ?? '' } };
    });
    return this.flow.startCheckout(found.tenantId, null, prep.row.invoiceId, { amountPaise: prep.amount, linkId: prep.row.id, payer: prep.payer });
  }

  /** After the gateway's page or SDK returns: asks the gateway and answers paid, pending or failed. */
  @Post('v1/public/pay/:slug/:token/payments/:paymentId/refresh')
  @HttpCode(200)
  async refresh(@Param('slug') slug: string, @Param('token') token: string, @Param('paymentId', ParseUUIDPipe) paymentId: string, @Ip() ip: string) {
    await this.limiter.hit(`paylink-refresh:${ip}`, 30, 60_000);
    const found = await this.find(slug, token);
    if (!found) throw new NotFoundException('This link is not valid');
    const mine = await this.db.withTenant(found.tenantId, async (tx) => (await tx.execute<{ n: number }>(sql`select count(*)::int as n from fee_payments where id = ${paymentId}::uuid and link_id = ${found.linkId}::uuid`)).rows[0].n > 0);
    if (!mine) throw new NotFoundException('Payment not found');
    const r = await this.flow.refresh(found.tenantId, paymentId);
    return { status: r.status, receiptNo: r.receiptNo ?? null };
  }

  private async find(slug: string, token: string): Promise<{ tenantId: string; linkId: string } | null> {
    if (!/^[a-z0-9-]{1,64}$/.test(slug) || !TOKEN.test(token)) return null;
    const tenant = await this.lookups.tenantBySlug(slug);
    if (!tenant) return null;
    const [row] = await this.db.withTenant(tenant.id, (tx) => tx.select({ id: feePaymentLinks.id }).from(feePaymentLinks).where(eq(feePaymentLinks.tokenHash, hashToken(token))));
    return row ? { tenantId: tenant.id, linkId: row.id } : null;
  }

  /** In-app notice to the family always; SMS, WhatsApp and e-mail through the "fee_payment_link" templates. */
  private async send(tx: Tx, p: UserPrincipal, row: typeof feePaymentLinks.$inferSelect, url: string, channels: OutChannel[], dedupe = 'first'): Promise<LinkSend[]> {
    const ids = await familyUserIds(tx, row.studentId);
    const [st] = await tx.select({ name: students.fullName }).from(students).where(eq(students.id, row.studentId));
    const amount = `₹${(row.amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    const expires = row.expiresAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
    await this.notifications.feeDeskNotice(tx, row.studentId, { text: { en: { title: 'Fee payment link', body: `Pay ${amount} for ${st?.name ?? 'your child'} online by ${expires}: ${url}` }, hi: { title: 'शुल्क भुगतान लिंक', body: `${st?.name ?? 'आपके बच्चे'} के लिए ${amount} का ऑनलाइन भुगतान ${expires} तक करें: ${url}` }, kn: { title: 'ಶುಲ್ಕ ಪಾವತಿ ಲಿಂಕ್', body: `${st?.name ?? 'ನಿಮ್ಮ ಮಗು'} ಅವರಿಗೆ ${amount} ಅನ್ನು ${expires} ಒಳಗೆ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ: ${url}` } }, data: { linkId: row.id, studentId: row.studentId, url }, dedupeKey: `paylink:${row.id}:${dedupe}` });
    const out: LinkSend[] = [];
    for (const ch of channels) {
      const r = await sendFeeMessage(tx, { tenantId: p.tenantId, key: 'fee_payment_link', channel: ch, userIds: ids, vars: { student: st?.name ?? '', amount, link: url, expires }, title: `Payment link ${row.number}`, dedupe: `paylink ${row.id} ${dedupe}`, createdBy: p.userId, at: this.clock.now() });
      out.push({ channel: ch, to: `${ids.length} family member${ids.length === 1 ? '' : 's'}`, at: this.clock.now().toISOString(), ok: r.ok, ...(r.ok ? {} : { error: r.error }) });
    }
    if (out.length) await tx.update(feePaymentLinks).set({ sent: sql`${feePaymentLinks.sent} || ${JSON.stringify(out)}::jsonb` }).where(eq(feePaymentLinks.id, row.id));
    return out;
  }

  private view(r: typeof feePaymentLinks.$inferSelect) {
    const { tokenHash: _t, ...rest } = r;
    return { ...rest, status: r.status === 'active' && r.expiresAt < this.clock.now() ? 'expired' : r.status };
  }
}

