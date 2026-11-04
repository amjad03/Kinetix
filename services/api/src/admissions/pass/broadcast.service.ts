import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import { Mailer } from '../../analytics/mailer.js';
import { readSettings } from '../../campus-ops/settings.js';
import { audit } from '../../common/audit.js';
import { localParts } from '../../common/time.js';
import { TextSender, WhatsAppSender } from '../../comms/channels.js';
import { fillTemplate, toE164, waParams } from '../../comms/comms.logic.js';
import { DbService, type Tx } from '../../db/db.service.js';
import { admissionBroadcasts, admissionBroadcastSends } from '../../db/schema-admissions-pass.js';
import { messageTemplates } from '../../db/schema-pathways.js';
import { enquiries, enquiryActivities, programs, tenants } from '../../db/schema.js';
import { JobsService, type Job } from '../../jobs/jobs.service.js';
import { auditActor, type Actor } from '../enquiries.service.js';

export const BROADCAST_JOB = 'admissions.broadcast';
const BATCH = 100;
/** The largest segment one broadcast may reach. */
export const MAX_RECIPIENTS = 5000;

export interface Segment {
  stages?: string[];
  programId?: string;
  sources?: string[];
  campaignId?: string;
  /** Only enquiries whose follow-up is due on or before this day. */
  followUpBy?: string;
  createdFrom?: string;
  createdTo?: string;
}

/** TRAI's window for promotional messages: 09:00 to 21:00 in the institution's time zone. */
export function withinSendingHours(hhmm: string): boolean {
  return hhmm >= '09:00' && hhmm < '21:00';
}

/**
 * Campaign messages to a segment of leads through a registered template: SMS with its DLT template id (TRAI), WhatsApp
 * through the institution's Business account, or email. Families who opted out, merged duplicates and lost leads are
 * left out, each number or address gets one message, and the sending runs in the background in batches, logged on
 * each enquiry's follow-up trail.
 */
@Injectable()
export class BroadcastService implements OnModuleInit {
  private readonly log = new Logger(BroadcastService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly sms: TextSender,
    private readonly whatsapp: WhatsAppSender,
    private readonly mailer: Mailer,
  ) {}

  onModuleInit(): void {
    this.jobs.register(BROADCAST_JOB, (job: Job) => this.run(job.tenantId, String((job.payload as Record<string, string>).id)));
  }

  private where(s: Segment): SQL[] {
    const c: SQL[] = [isNull(enquiries.optedOutAt), isNull(enquiries.mergedIntoId)];
    c.push(s.stages?.length ? inArray(enquiries.stage, s.stages as (typeof enquiries.stage.enumValues)[number][]) : ne(enquiries.stage, 'lost'));
    if (s.programId) c.push(eq(enquiries.programId, s.programId));
    if (s.sources?.length) c.push(inArray(enquiries.source, s.sources as (typeof enquiries.source.enumValues)[number][]));
    if (s.campaignId) c.push(eq(enquiries.campaignId, s.campaignId));
    if (s.followUpBy) c.push(lte(enquiries.nextFollowUpOn, s.followUpBy));
    if (s.createdFrom) c.push(gte(enquiries.createdAt, new Date(`${s.createdFrom}T00:00:00+05:30`)));
    if (s.createdTo) c.push(lte(enquiries.createdAt, new Date(`${s.createdTo}T23:59:59+05:30`)));
    return c;
  }

  /** The recipients of a segment for a channel: one per number (SMS, WhatsApp) or address (email), oldest enquiry first. */
  private async recipients(tx: Tx, s: Segment, channel: string) {
    const rows = await tx.select({ id: enquiries.id, phone: enquiries.phone, email: enquiries.email }).from(enquiries).where(and(...this.where(s))).orderBy(asc(enquiries.createdAt)).limit(MAX_RECIPIENTS * 2);
    const seen = new Set<string>();
    const out: { id: string; skip: string | null }[] = [];
    for (const r of rows) {
      const to = channel === 'email' ? r.email?.trim().toLowerCase() || null : toE164(r.phone);
      if (!to) {
        out.push({ id: r.id, skip: channel === 'email' ? 'No email address' : 'No valid mobile number' });
        continue;
      }
      if (seen.has(to)) continue;
      seen.add(to);
      out.push({ id: r.id, skip: null });
    }
    return out;
  }

  async preview(tx: Tx, s: Segment, channel: 'sms' | 'whatsapp' | 'email') {
    const r = await this.recipients(tx, s, channel);
    const [{ optedOut }] = await tx.select({ optedOut: sql<number>`count(*)::int` }).from(enquiries).where(sql`${enquiries.optedOutAt} is not null`);
    return { recipients: r.filter((x) => !x.skip).length, unreachable: r.filter((x) => x.skip).length, optedOut, limit: MAX_RECIPIENTS };
  }

  /** Queues a broadcast. The same idempotency key returns the broadcast already queued instead of sending twice. */
  async create(tx: Tx, actor: Actor, input: { templateId: string; segment: Segment; campaignId?: string | null; idempotencyKey?: string | null }) {
    if (input.idempotencyKey) {
      const [dup] = await tx.select().from(admissionBroadcasts).where(eq(admissionBroadcasts.idempotencyKey, input.idempotencyKey));
      if (dup) return dup;
    }
    const [t] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, input.templateId));
    if (!t || !t.active) throw new NotFoundException('Template not found');
    if (!['sms', 'whatsapp', 'email'].includes(t.channel)) throw new BadRequestException('Choose an SMS, WhatsApp or email template');
    if (t.channel === 'sms' && !t.dltTemplateId) throw new ConflictException('Register this text with your telecom operator (DLT) and enter its template id first');
    if (t.channel === 'whatsapp' && !this.whatsapp.connected) throw new ConflictException('WhatsApp Business is not connected for this institution');
    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants);
    const rules = (await readSettings(tx, actor.tenantId, 'admissions')).rules;
    if (t.channel !== 'email' && rules.broadcastQuietHours !== false && !withinSendingHours(localParts(new Date(), tenant?.timezone ?? 'Asia/Kolkata').time.slice(0, 5))) throw new ConflictException('Promotional SMS and WhatsApp go out only between 9 am and 9 pm (TRAI). Queue it again in those hours.');
    const list = await this.recipients(tx, input.segment, t.channel);
    const reach = list.filter((x) => !x.skip);
    if (!reach.length) throw new BadRequestException('Nobody in this segment can be reached on this channel');
    if (reach.length > MAX_RECIPIENTS) throw new BadRequestException(`The segment has ${reach.length} recipients; narrow it to ${MAX_RECIPIENTS} or fewer`);
    const [b] = await tx
      .insert(admissionBroadcasts)
      .values({ tenantId: actor.tenantId, campaignId: input.campaignId ?? input.segment.campaignId ?? null, templateId: t.id, channel: t.channel, segment: input.segment as Record<string, unknown>, total: list.length, skipped: list.length - reach.length, idempotencyKey: input.idempotencyKey ?? null, createdBy: actor.userId })
      .returning();
    for (let i = 0; i < list.length; i += 500) {
      await tx.insert(admissionBroadcastSends).values(list.slice(i, i + 500).map((r) => ({ tenantId: actor.tenantId, broadcastId: b.id, enquiryId: r.id, status: r.skip ? 'skipped' : 'queued', reason: r.skip })));
    }
    await this.jobs.enqueue(tx, actor.tenantId, BROADCAST_JOB, { id: b.id });
    await audit(tx, { ...auditActor(actor), action: 'admissions.broadcast_queued.v1', subjectType: 'admission_broadcast', subjectId: b.id, data: { templateId: t.id, channel: t.channel, segment: input.segment, recipients: reach.length } });
    return b;
  }

  /** The background job: sends the queued messages batch by batch; a failure is recorded and the rest continue. */
  async run(tenantId: string, id: string): Promise<void> {
    for (;;) {
      const more = await this.db.withTenant(tenantId, async (tx) => {
        const [b] = await tx.select().from(admissionBroadcasts).where(eq(admissionBroadcasts.id, id)).for('update');
        if (!b || b.status === 'done') return false;
        const [t] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, b.templateId));
        const [inst] = await tx.select({ name: tenants.name }).from(tenants);
        const batch = await tx
          .select({ s: admissionBroadcastSends, e: enquiries, programme: programs.name })
          .from(admissionBroadcastSends)
          .innerJoin(enquiries, eq(enquiries.id, admissionBroadcastSends.enquiryId))
          .leftJoin(programs, eq(programs.id, enquiries.programId))
          .where(and(eq(admissionBroadcastSends.broadcastId, id), eq(admissionBroadcastSends.status, 'queued')))
          .limit(BATCH);
        let sent = 0;
        let failed = 0;
        let skipped = 0;
        for (const r of batch) {
          // Someone may have opted out after the broadcast was queued.
          if (r.e.optedOutAt) {
            await tx.update(admissionBroadcastSends).set({ status: 'skipped', reason: 'Opted out' }).where(eq(admissionBroadcastSends.id, r.s.id));
            skipped++;
            continue;
          }
          const vars = { name: r.e.name, programme: r.programme ?? '', institution: inst?.name ?? '' };
          const text = fillTemplate(t.body, vars).text;
          try {
            if (b.channel === 'sms') await this.sms.send({ to: toE164(r.e.phone)!, text, templateId: t.dltTemplateId!, vars });
            else if (b.channel === 'whatsapp') await this.whatsapp.send({ to: toE164(r.e.phone)!, template: t.waTemplateName || t.key, language: t.waLanguage || t.locale, params: waParams(t.body, vars) });
            else await this.mailer.send({ to: [r.e.email!], subject: fillTemplate(t.subject, vars).text || t.key, text, attachments: [] });
            await tx.update(admissionBroadcastSends).set({ status: 'sent', sentAt: new Date() }).where(eq(admissionBroadcastSends.id, r.s.id));
            await tx.insert(enquiryActivities).values({ tenantId, enquiryId: r.e.id, kind: b.channel === 'email' ? 'email' : b.channel === 'whatsapp' ? 'whatsapp' : 'sms', note: `Campaign message "${t.key}": ${text.slice(0, 280)}`, actorId: b.createdBy });
            sent++;
          } catch (e) {
            this.log.warn(`Broadcast ${id} to enquiry ${r.e.id} failed: ${(e as Error).message.slice(0, 120)}`);
            await tx.update(admissionBroadcastSends).set({ status: 'failed', reason: 'The provider refused the message' }).where(eq(admissionBroadcastSends.id, r.s.id));
            failed++;
          }
        }
        const done = batch.length < BATCH;
        await tx
          .update(admissionBroadcasts)
          .set({ status: done ? 'done' : 'sending', sent: sql`${admissionBroadcasts.sent} + ${sent}`, failed: sql`${admissionBroadcasts.failed} + ${failed}`, skipped: sql`${admissionBroadcasts.skipped} + ${skipped}`, ...(done ? { finishedAt: new Date() } : {}) })
          .where(eq(admissionBroadcasts.id, id));
        return !done;
      });
      if (!more) return;
    }
  }

  async list(tx: Tx, q: { campaignId?: string; page: number; pageSize: number }) {
    const where = q.campaignId ? eq(admissionBroadcasts.campaignId, q.campaignId) : undefined;
    const rows = await tx
      .select({ b: admissionBroadcasts, template: messageTemplates.key })
      .from(admissionBroadcasts)
      .innerJoin(messageTemplates, eq(messageTemplates.id, admissionBroadcasts.templateId))
      .where(where)
      .orderBy(desc(admissionBroadcasts.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(admissionBroadcasts).where(where);
    return { rows: rows.map((r) => ({ ...r.b, template: r.template })), total, page: q.page, pageSize: q.pageSize };
  }

  async sends(tx: Tx, id: string, q: { status?: string; page: number; pageSize: number }) {
    const conds = [eq(admissionBroadcastSends.broadcastId, id), ...(q.status ? [eq(admissionBroadcastSends.status, q.status)] : [])];
    const rows = await tx
      .select({ id: admissionBroadcastSends.id, status: admissionBroadcastSends.status, reason: admissionBroadcastSends.reason, sentAt: admissionBroadcastSends.sentAt, enquiryId: enquiries.id, name: enquiries.name, stage: enquiries.stage })
      .from(admissionBroadcastSends)
      .innerJoin(enquiries, eq(enquiries.id, admissionBroadcastSends.enquiryId))
      .where(and(...conds))
      .orderBy(asc(enquiries.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(admissionBroadcastSends).where(and(...conds));
    return { rows, total, page: q.page, pageSize: q.pageSize };
  }

  /** The family asked to stop (a STOP reply or a call): no campaign message reaches them again. */
  async optOut(tx: Tx, actor: Actor, enquiryId: string, optedOut: boolean) {
    const [e] = await tx.update(enquiries).set({ optedOutAt: optedOut ? new Date() : null, updatedAt: new Date() }).where(eq(enquiries.id, enquiryId)).returning({ id: enquiries.id, optedOutAt: enquiries.optedOutAt });
    if (!e) throw new NotFoundException('Enquiry not found');
    await tx.insert(enquiryActivities).values({ tenantId: actor.tenantId, enquiryId, kind: 'note', note: optedOut ? 'Asked not to receive campaign messages' : 'Agreed to receive campaign messages again', actorId: actor.userId });
    await audit(tx, { ...auditActor(actor), action: optedOut ? 'enquiry.opted_out.v1' : 'enquiry.opted_in.v1', subjectType: 'enquiry', subjectId: enquiryId, data: {} });
    return e;
  }
}
