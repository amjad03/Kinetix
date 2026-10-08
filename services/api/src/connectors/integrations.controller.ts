import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { and, asc, eq, gte } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { localParts, zonedToInstant } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { classMeetings, connectors, feeInvoices, sections, sponsorInvoices, sponsors, students, tenants, timetableSlots } from '../db/schema.js';
import { BI_DATASETS, ConnectorAdapters, toCsv, type BiDataset } from './adapters.js';
import { ConnectorsService } from './connectors.service.js';

const ADMIN: RoleName[] = ['tenant_admin'];
const LIBRARY: RoleName[] = ['tenant_admin', 'principal', 'librarian'];
const TEACHING: RoleName[] = ['tenant_admin', 'principal', 'hod', 'teacher'];

const MeetingBody = z
  .object({
    connectorId: z.uuid().optional(),
    slotId: z.uuid().optional(),
    /** The class date (needed with a slot). */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    topic: z.string().trim().min(1).max(200).optional(),
    startsAt: z.iso.datetime().optional(),
    durationMin: z.number().int().min(5).max(480).optional(),
  })
  .refine((b) => (b.slotId ? !!b.date : !!b.topic && !!b.startsAt && !!b.durationMin), 'Give a timetable slot and date, or a topic, start time and length');
const LinkBody = z.object({ dataset: z.enum(BI_DATASETS), ttlHours: z.number().int().min(1).max(168).default(24) });

/** What the connected systems offer the rest of the product: library search and loans, online class meetings, signed BI exports. */
@Controller('v1')
export class ConnectorIntegrationsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: ConnectorsService,
    private readonly adapters: ConnectorAdapters,
  ) {}

  /** Catalogue search through the institution's Koha. Anyone signed in may look books up. */
  @Get('connectors/library/search')
  @Auth('user')
  async search(@CurrentPrincipal() p: UserPrincipal, @Query('q') q?: string) {
    const term = (q ?? '').trim();
    if (term.length < 2 || term.length > 100) throw new BadRequestException('Type at least two letters to search');
    const c = await this.db.withTenant(p.tenantId, (tx) => this.svc.resolve(tx, p.tenantId, 'library_koha'));
    return { books: await this.adapters.kohaSearch(c.config, term) };
  }

  /** The books a member has out, by library card number. */
  @Get('connectors/library/loans')
  @Auth('user', LIBRARY)
  async loans(@CurrentPrincipal() p: UserPrincipal, @Query('cardNumber') cardNumber?: string) {
    const card = (cardNumber ?? '').trim();
    if (!card || card.length > 40) throw new BadRequestException('Give the library card number');
    const c = await this.db.withTenant(p.tenantId, (tx) => this.svc.resolve(tx, p.tenantId, 'library_koha'));
    return this.adapters.kohaLoans(c.config, card);
  }

  /** Creates a Zoom or Teams meeting for a timetable slot on a date, or for a free-standing live class. */
  @Post('connectors/video/meetings')
  @Auth('user', TEACHING)
  async createMeeting(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MeetingBody)) b: z.infer<typeof MeetingBody>) {
    const { plan, conn } = await this.db.withTenant(p.tenantId, async (tx) => ({
      plan: await this.planMeeting(tx, p, b),
      conn: await this.svc.resolve(tx, p.tenantId, 'lms_video', b.connectorId),
    }));
    // The outside call happens outside the transaction.
    const made = await this.adapters.createMeeting(conn.config, plan);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(classMeetings)
        .values({ tenantId: p.tenantId, connectorId: conn.id, provider: String(conn.config.provider), slotId: b.slotId, topic: plan.topic, startsAt: plan.startsAt, durationMin: plan.durationMin, externalId: made.externalId, joinUrl: made.joinUrl, hostUrl: made.hostUrl, createdBy: p.userId })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'connector.meeting_created', subjectType: 'class_meeting', subjectId: row.id, data: { provider: row.provider, slotId: b.slotId } });
      return row;
    });
  }

  @Get('connectors/video/meetings')
  @Auth('user', TEACHING)
  meetings(@CurrentPrincipal() p: UserPrincipal, @Query('slotId') slotId?: string) {
    if (slotId && !z.uuid().safeParse(slotId).success) throw new BadRequestException('Bad slotId');
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select().from(classMeetings).where(and(slotId ? eq(classMeetings.slotId, slotId) : undefined, gte(classMeetings.startsAt, new Date(Date.now() - 86400_000)))).orderBy(asc(classMeetings.startsAt)).limit(200),
    );
  }

  private async planMeeting(tx: Tx, p: UserPrincipal, b: z.infer<typeof MeetingBody>): Promise<{ topic: string; startsAt: Date; durationMin: number }> {
    if (!b.slotId) return { topic: b.topic!, startsAt: new Date(b.startsAt!), durationMin: b.durationMin! };
    const [slot] = await tx.select().from(timetableSlots).where(eq(timetableSlots.id, b.slotId));
    if (!slot || slot.archivedAt) throw new NotFoundException('Timetable slot not found');
    if (slot.teacherId !== p.userId && !p.roles.some((r) => ADMIN.includes(r) || r === 'principal')) throw new NotFoundException('Timetable slot not found');
    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
    const zone = tenant?.timezone ?? 'Asia/Kolkata';
    const day = localParts(zonedToInstant(b.date!, '12:00', zone), zone);
    if (day.isoWeekday !== slot.dayOfWeek) throw new BadRequestException('That date is not on the weekday of this slot');
    const startsAt = zonedToInstant(b.date!, slot.startsAt.slice(0, 5), zone);
    const endsAt = zonedToInstant(b.date!, slot.endsAt.slice(0, 5), zone);
    const [sec] = await tx.select({ name: sections.displayName }).from(sections).where(eq(sections.id, slot.sectionId));
    return { topic: b.topic ?? `${sec?.name ?? 'Class'} online class`, startsAt, durationMin: b.durationMin ?? Math.max(5, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000)) };
  }

  /** A signed read-only CSV link for one dataset; paste it into Power BI (Get data, Web). */
  @Post('connectors/:id/bi-links')
  @Auth('user', ADMIN)
  async link(@CurrentPrincipal() p: UserPrincipal, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(LinkBody)) b: z.infer<typeof LinkBody>) {
    const c = await this.db.withTenant(p.tenantId, (tx) => this.svc.resolve(tx, p.tenantId, 'bi_export', id));
    if (!this.adapters.datasets(c.config).includes(b.dataset)) throw new BadRequestException('That dataset is not switched on for this connector');
    const exp = Math.floor(Date.now() / 1000) + b.ttlHours * 3600;
    const sig = this.adapters.sign(String(c.config.signingSecret), id, b.dataset, exp);
    await this.db.withTenant(p.tenantId, (tx) => audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'connector.bi_link_created', subjectType: 'connector', subjectId: id, data: { dataset: b.dataset, ttlHours: b.ttlHours } }));
    return { url: `${req.protocol}://${req.get('host')}/v1/public/bi-export/${id}/${b.dataset}?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** The export itself. No sign-in: the signature in the link is the permission, and it expires. */
  @Get('public/bi-export/:id/:dataset')
  async export(@Param('id', ParseUUIDPipe) id: string, @Param('dataset') dataset: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const denied = () => new NotFoundException('This export link is not valid');
    const expN = Number(exp);
    if (!Number.isInteger(expN) || expN < Math.floor(Date.now() / 1000) || !(BI_DATASETS as readonly string[]).includes(dataset) || typeof sig !== 'string') throw denied();
    const [row] = await this.db.system.select().from(connectors).where(and(eq(connectors.id, id), eq(connectors.type, 'bi_export'), eq(connectors.enabled, true)));
    if (!row) throw denied();
    const config = await this.db.withTenant(row.tenantId, (tx) => this.svc.resolve(tx, row.tenantId, 'bi_export', id)).then((c) => c.config);
    if (!this.adapters.verify(String(config.signingSecret), id, dataset, expN, sig) || !this.adapters.datasets(config).includes(dataset as BiDataset)) throw denied();
    const csv = await this.db.withTenant(row.tenantId, async (tx) => {
      await audit(tx, { tenantId: row.tenantId, actorType: 'system', action: 'connector.bi_export_read', subjectType: 'connector', subjectId: id, data: { dataset } });
      return this.dataset(tx, dataset as BiDataset);
    });
    res.set({ 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }).send(csv);
  }

  private async dataset(tx: Tx, d: BiDataset): Promise<string> {
    if (d === 'students') {
      const rows = await tx.select({ rollNo: students.rollNo, name: students.fullName, className: sections.displayName, status: students.status, enrolledOn: students.enrolledOn }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).orderBy(asc(sections.displayName), asc(students.rollNo)).limit(50_000);
      return toCsv(['roll_no', 'name', 'class', 'status', 'enrolled_on'], rows.map((r) => [r.rollNo, r.name, r.className, r.status, r.enrolledOn]));
    }
    if (d === 'fee_invoices') {
      const rows = await tx
        .select({ id: feeInvoices.id, rollNo: students.rollNo, name: students.fullName, className: sections.displayName, title: feeInvoices.title, amount: feeInvoices.amountPaise, paid: feeInvoices.paidPaise, dueOn: feeInvoices.dueOn, status: feeInvoices.status })
        .from(feeInvoices)
        .innerJoin(students, eq(students.id, feeInvoices.studentId))
        .innerJoin(sections, eq(sections.id, feeInvoices.sectionId))
        .orderBy(asc(feeInvoices.dueOn))
        .limit(50_000);
      return toCsv(['invoice_id', 'roll_no', 'student', 'class', 'title', 'amount_paise', 'paid_paise', 'due_on', 'status'], rows.map((r) => [r.id, r.rollNo, r.name, r.className, r.title, r.amount, r.paid, r.dueOn, r.status]));
    }
    const rows = await tx
      .select({ no: sponsorInvoices.invoiceNo, sponsor: sponsors.name, po: sponsorInvoices.poNumber, title: sponsorInvoices.title, amount: sponsorInvoices.amountPaise, paid: sponsorInvoices.paidPaise, dueOn: sponsorInvoices.dueOn, status: sponsorInvoices.status })
      .from(sponsorInvoices)
      .innerJoin(sponsors, eq(sponsors.id, sponsorInvoices.sponsorId))
      .orderBy(asc(sponsorInvoices.dueOn))
      .limit(50_000);
    return toCsv(['invoice_no', 'sponsor', 'po_number', 'title', 'amount_paise', 'paid_paise', 'due_on', 'status'], rows.map((r) => [r.no, r.sponsor, r.po, r.title, r.amount, r.paid, r.dueOn, r.status]));
  }
}
