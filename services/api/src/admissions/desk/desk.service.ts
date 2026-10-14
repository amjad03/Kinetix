import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type { RoleName } from '../../auth/principal.js';
import { Mailer } from '../../analytics/mailer.js';
import { audit } from '../../common/audit.js';
import { TextSender, WhatsAppSender } from '../../comms/channels.js';
import { fillTemplate, toE164 } from '../../comms/comms.logic.js';
import type { Tx } from '../../db/db.service.js';
import { messageTemplates } from '../../db/schema-pathways.js';
import { admissionCustodyItems, admissionRefundSlabs, admissionRequests, applicationDrafts } from '../../db/schema-sis.js';
import { admissionCycles, agentCommissions, applications, enquiries, enquiryActivities, feeInvoices, programs, scholarshipSchemes, sections, students, tenants } from '../../db/schema.js';
import { DomainEvents, EventBus } from '../../events/events.js';
import { LifecycleService } from '../../students/lifecycle.service.js';
import { StudentInfoService } from '../../students/student-info.service.js';
import { AdmissionsService, categoryOf, hashToken, newToken } from '../admissions.service.js';
import { addDays, auditActor, type Actor } from '../enquiries.service.js';
import { normName } from '../dedupe.js';
import { quoteRefund, UGC_SLABS, type RefundSlab } from './refund.js';

/** Who decides admission requests (the second signature of the approval chain). */
export const APPROVER_ROLES: RoleName[] = ['tenant_admin', 'principal'];
export const REQUEST_KINDS = ['management_quota', 'cancellation', 'programme_change'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
/** Saved drafts are kept this long after their last change. */
const DRAFT_DAYS = 30;

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];

/**
 * The admissions office's desk beyond the pipeline: duplicate enquiries and merging, messages to leads (DLT
 * enforced), approval requests (management quota with the donation-free declaration, cancellation with the UGC
 * refund and the agent's commission taken back, change of programme after admission), the original-certificate
 * custody register, saved application drafts, scholarship pre-checks and the admission registers and reports.
 */
@Injectable()
export class DeskService {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly lifecycle: LifecycleService,
    private readonly info: StudentInfoService,
    private readonly events: EventBus,
    private readonly mailer: Mailer,
    private readonly sms: TextSender,
    private readonly whatsapp: WhatsAppSender,
  ) {}

  // ---- duplicate enquiries ------------------------------------------------------------------------------

  /** Other open enquiries that look like the same family: the same phone or email, or the same name in the same place. */
  async enquiryDuplicates(tx: Tx, id: string) {
    const [e] = await tx.select().from(enquiries).where(eq(enquiries.id, id));
    if (!e) throw new NotFoundException('Enquiry not found');
    const others = await tx
      .select({ e: enquiries, programName: programs.name })
      .from(enquiries)
      .leftJoin(programs, eq(programs.id, enquiries.programId))
      .where(and(ne(enquiries.id, id), sql`${enquiries.mergedIntoId} is null`, or(eq(enquiries.phone, e.phone), e.email ? sql`lower(${enquiries.email}) = lower(${e.email})` : undefined, e.city ? sql`lower(${enquiries.city}) = lower(${e.city})` : undefined)))
      .orderBy(desc(enquiries.createdAt))
      .limit(50);
    return others
      .map(({ e: o, programName }) => {
        const reasons = [o.phone === e.phone && 'Same phone', e.email && o.email?.toLowerCase() === e.email.toLowerCase() && 'Same email', normName(o.name) === normName(e.name) && 'Same name'].filter((x): x is string => !!x);
        return { id: o.id, name: o.name, phone: o.phone, email: o.email, stage: o.stage, programName, createdAt: o.createdAt, reasons };
      })
      .filter((o) => o.reasons.length > 1 || o.reasons.includes('Same phone') || o.reasons.includes('Same email'));
  }

  /**
   * Merges enquiries into one: the follow-up trail, campaign, agent, email and programme move to the one kept; the
   * others are closed as lost ("merged") and point to it. Converted enquiries cannot be merged away.
   */
  async mergeEnquiries(tx: Tx, actor: Actor, keepId: string, mergeIds: string[]) {
    const ids = [...new Set(mergeIds.filter((x) => x !== keepId))];
    if (!ids.length) throw new BadRequestException('Choose the enquiries to merge into this one');
    const [keep] = await tx.select().from(enquiries).where(eq(enquiries.id, keepId)).for('update');
    if (!keep) throw new NotFoundException('Enquiry not found');
    if (keep.mergedIntoId) throw new BadRequestException('This enquiry was itself merged into another');
    const others = await tx.select().from(enquiries).where(inArray(enquiries.id, ids)).for('update');
    if (others.length !== ids.length) throw new NotFoundException('Some enquiries were not found');
    if (others.some((o) => o.stage === 'converted')) throw new BadRequestException('An enrolled (converted) enquiry cannot be merged away: keep that one instead');
    if (others.some((o) => o.mergedIntoId)) throw new BadRequestException('Some of these were already merged');
    const fill: Partial<typeof enquiries.$inferInsert> = {};
    for (const o of others) {
      if (!keep.email && !fill.email && o.email) fill.email = o.email;
      if (!keep.programId && !fill.programId && o.programId) fill.programId = o.programId;
      if (!keep.campaignId && !fill.campaignId && o.campaignId) fill.campaignId = o.campaignId;
      if (!keep.agentId && !fill.agentId && o.agentId) fill.agentId = o.agentId;
      if (!keep.applicationId && !fill.applicationId && o.applicationId) fill.applicationId = o.applicationId;
      if (!keep.city && !fill.city && o.city) fill.city = o.city;
    }
    await tx.update(enquiryActivities).set({ enquiryId: keepId }).where(inArray(enquiryActivities.enquiryId, ids));
    await tx.update(enquiries).set({ ...fill, updatedAt: new Date() }).where(eq(enquiries.id, keepId));
    for (const o of others) {
      await tx.update(enquiries).set({ stage: 'lost', lostReason: `Merged into ${keep.name} (${keep.phone})`, mergedIntoId: keepId, nextFollowUpOn: null, updatedAt: new Date() }).where(eq(enquiries.id, o.id));
      await audit(tx, { ...auditActor(actor), action: 'enquiry.merged_elsewhere', subjectType: 'enquiry', subjectId: o.id, changes: { stage: { before: o.stage, after: 'lost' } }, data: { into: keepId } });
    }
    await tx.insert(enquiryActivities).values({ tenantId: actor.tenantId, enquiryId: keepId, kind: 'note', note: `Merged ${others.length} duplicate enquir${others.length === 1 ? 'y' : 'ies'}: ${others.map((o) => o.name).join(', ')}`, actorId: actor.userId });
    await audit(tx, { ...auditActor(actor), action: 'enquiry.enquiries_merged', subjectType: 'enquiry', subjectId: keepId, data: { merged: ids } });
    return { id: keepId, merged: ids.length };
  }

  // ---- messages to leads -------------------------------------------------------------------------------------

  /** The message templates a counsellor may send to leads: SMS (with a registered DLT id), email and WhatsApp. */
  async leadTemplates(tx: Tx) {
    const list = await tx.select().from(messageTemplates).where(and(eq(messageTemplates.active, true), inArray(messageTemplates.channel, ['sms', 'email', 'whatsapp']))).orderBy(asc(messageTemplates.key), asc(messageTemplates.channel));
    return list.map((t) => ({ id: t.id, key: t.key, channel: t.channel, locale: t.locale, subject: t.subject, body: t.body, dltTemplateId: t.dltTemplateId, usable: t.channel !== 'sms' || !!t.dltTemplateId, problem: t.channel === 'sms' && !t.dltTemplateId ? 'Register this text with your telecom operator (DLT) first' : t.channel === 'whatsapp' && !this.whatsapp.connected ? 'WhatsApp Business is not connected' : null }));
  }

  /**
   * Sends a template to one enquiry and logs it on the follow-up trail. SMS must carry its DLT template id (TRAI);
   * WhatsApp needs the institution's Business account. Fills {{name}}, {{programme}}, {{institution}}.
   */
  async messageEnquiry(tx: Tx, actor: Actor, enquiryId: string, templateId: string): Promise<string> {
    const [e] = await tx.select({ e: enquiries, programName: programs.name }).from(enquiries).leftJoin(programs, eq(programs.id, enquiries.programId)).where(eq(enquiries.id, enquiryId));
    if (!e) throw new NotFoundException('Enquiry not found');
    if (e.e.stage === 'lost' && e.e.mergedIntoId) throw new BadRequestException('This enquiry was merged into another');
    const [t] = await tx.select().from(messageTemplates).where(eq(messageTemplates.id, templateId));
    if (!t || !t.active) throw new NotFoundException('Template not found');
    const [inst] = await tx.select({ name: tenants.name }).from(tenants);
    const vars = { name: e.e.name, programme: e.programName ?? '', institution: inst?.name ?? '' };
    const subject = fillTemplate(t.subject, vars).text;
    const text = fillTemplate(t.body, vars).text;
    if (t.channel === 'sms') {
      if (!t.dltTemplateId) throw new ConflictException('Register this text with your telecom operator (DLT) and enter its template id first');
      const to = toE164(e.e.phone);
      if (!to) throw new BadRequestException('No valid mobile number on file');
      await this.sms.send({ to, text, templateId: t.dltTemplateId, vars });
    } else if (t.channel === 'whatsapp') {
      if (!this.whatsapp.connected) throw new ConflictException('WhatsApp Business is not connected for this institution');
      const to = toE164(e.e.phone);
      if (!to) throw new BadRequestException('No valid mobile number on file');
      await this.whatsapp.send(to, t.key, vars);
    } else if (t.channel === 'email') {
      if (!e.e.email) throw new BadRequestException('No email address on file');
      await this.mailer.send({ to: [e.e.email], subject: subject || t.key, text, attachments: [] });
    } else throw new BadRequestException('Choose an SMS, email or WhatsApp template');
    const kind = t.channel === 'email' ? 'email' : t.channel === 'whatsapp' ? 'whatsapp' : 'sms';
    await tx.insert(enquiryActivities).values({ tenantId: actor.tenantId, enquiryId, kind, note: `Sent "${t.key}": ${text.slice(0, 300)}`, actorId: actor.userId });
    if (e.e.stage === 'new') await tx.update(enquiries).set({ stage: 'contacted', updatedAt: new Date() }).where(eq(enquiries.id, enquiryId));
    await audit(tx, { ...auditActor(actor), action: 'enquiry.lead_messaged', subjectType: 'enquiry', subjectId: enquiryId, data: { templateId, channel: t.channel } });
    return `${t.channel.toUpperCase()} sent`;
  }

  // ---- approval requests ---------------------------------------------------------------------------------------

  async refundSlabs(tx: Tx): Promise<RefundSlab[]> {
    const list = await tx.select().from(admissionRefundSlabs).orderBy(asc(admissionRefundSlabs.sortOrder));
    return list.length ? list.map((s) => ({ label: s.label, uptoDays: s.uptoDays, percent: s.percent, deductionPercent: s.deductionPercent, deductionCapPaise: s.deductionCapPaise })) : UGC_SLABS;
  }

  /** Adds the UGC slabs as the institution's own, to edit. */
  async loadUgcSlabs(tx: Tx, actor: Actor) {
    const [has] = await tx.select({ id: admissionRefundSlabs.id }).from(admissionRefundSlabs).limit(1);
    if (has) throw new ConflictException('The refund slabs are already set: edit them instead');
    for (const [i, s] of UGC_SLABS.entries()) await tx.insert(admissionRefundSlabs).values({ tenantId: actor.tenantId, ...s, sortOrder: (i + 1) * 10 });
    await audit(tx, { ...auditActor(actor), action: 'admission_refund_slab.ugc_loaded', subjectType: 'admission_refund_slab', data: { slabs: UGC_SLABS.length } });
    return { added: UGC_SLABS.length };
  }

  /** What the applicant has paid: the application fee and, once enrolled, the fees paid as a student. */
  async paidSoFar(tx: Tx, a: typeof applications.$inferSelect): Promise<number> {
    const [app] = rows<{ paid: number }>(await tx.execute(sql`select coalesce(sum(amount_paise), 0)::float as paid from application_payments where application_id = ${a.id}::uuid and status = 'paid'`));
    const [fees] = a.studentId ? rows<{ paid: number }>(await tx.execute(sql`select coalesce(sum(paid_paise), 0)::float as paid from fee_invoices where student_id = ${a.studentId}::uuid`)) : [{ paid: 0 }];
    return app.paid + fees.paid;
  }

  /** The refund a cancellation on `on` would get under the institution's slabs, from the cycle's last date of admission. */
  async refundQuote(tx: Tx, applicationId: string, on?: string) {
    const a = await this.admissions.application(tx, applicationId);
    const cycle = await this.admissions.cycle(tx, a.cycleId);
    const day = on ?? (await this.lifecycle.today(tx));
    return { lastDate: cycle.closesOn, on: day, ...quoteRefund(await this.refundSlabs(tx), await this.paidSoFar(tx, a), cycle.closesOn, day) };
  }

  /** Raises a request for the principal: management quota, cancellation (with its refund) or programme change. */
  async raiseRequest(tx: Tx, actor: Actor & { userId: string }, applicationId: string, input: { kind: RequestKind; reason: string; declaration?: boolean; toCycleId?: string; cancelOn?: string }) {
    const a = await this.admissions.application(tx, applicationId, true);
    const [open] = await tx.select({ id: admissionRequests.id }).from(admissionRequests).where(and(eq(admissionRequests.applicationId, a.id), eq(admissionRequests.kind, input.kind), eq(admissionRequests.status, 'pending')));
    if (open) throw new ConflictException('A request of this kind is already waiting for a decision');
    let data: Record<string, unknown> = {};
    if (input.kind === 'management_quota') {
      if (!input.declaration) throw new BadRequestException('Confirm the donation-free declaration: no capitation fee or donation was asked for or taken');
      if (a.quota === 'management') throw new BadRequestException('This application is already on the management quota');
      if (['enrolled', 'withdrawn', 'declined', 'rejected'].includes(a.status)) throw new BadRequestException(`An application that is ${a.status} cannot move to the management quota`);
      data = { declaration: true, declaredAt: new Date().toISOString(), fromQuota: a.quota };
    } else if (input.kind === 'cancellation') {
      if (!['offered', 'accepted', 'enrolled'].includes(a.status)) throw new BadRequestException('Only an offered, accepted or enrolled admission can be cancelled');
      data = await this.refundQuote(tx, a.id, input.cancelOn);
    } else {
      if (!input.toCycleId) throw new BadRequestException('Choose the programme (cycle) to move to');
      if (!['offered', 'accepted', 'enrolled'].includes(a.status)) throw new BadRequestException('Only an offered, accepted or enrolled admission can change programme');
      const from = await this.admissions.cycle(tx, a.cycleId);
      const to = await this.admissions.cycle(tx, input.toCycleId);
      if (to.id === from.id) throw new BadRequestException('That is the current programme');
      if (to.academicYearId !== from.academicYearId) throw new BadRequestException('Choose a cycle of the same academic year');
      if ((await this.admissions.seatsLeft(tx, to)) < 1) throw new ConflictException(`No seats are left in ${to.name}`);
      const [names] = rows<{ fromProgramme: string; toProgramme: string }>(await tx.execute(sql`select (select name from programs where id = ${from.programId}::uuid) as "fromProgramme", (select name from programs where id = ${to.programId}::uuid) as "toProgramme"`));
      data = { fromCycleId: from.id, fromCycleName: from.name, toCycleId: to.id, toCycleName: to.name, ...names };
    }
    const [row] = await tx.insert(admissionRequests).values({ tenantId: actor.tenantId, applicationId: a.id, kind: input.kind, reason: input.reason.trim(), data, requestedBy: actor.userId }).returning();
    await audit(tx, { ...auditActor(actor), action: 'admission_request.created', subjectType: 'admission_request', subjectId: row.id, after: { kind: input.kind, reason: row.reason }, data: { applicationId: a.id } });
    await audit(tx, { ...auditActor(actor), action: `admissions.${input.kind}_requested`, subjectType: 'application', subjectId: a.id, data: { requestId: row.id, reason: row.reason } });
    return row;
  }

  /** The principal approves (the change is made) or rejects (with a reason) a request. The requester cannot decide it. */
  async decideRequest(tx: Tx, actor: Actor & { userId: string; roles: RoleName[] }, id: string, decision: 'approve' | 'reject', note?: string | null): Promise<string> {
    const [r] = await tx.select().from(admissionRequests).where(eq(admissionRequests.id, id)).for('update');
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'pending') throw new BadRequestException(`This request is already ${r.status}`);
    if (!actor.roles.some((x) => APPROVER_ROLES.includes(x))) throw new ForbiddenException('Only the principal or the administrator decides admission requests');
    if (r.requestedBy === actor.userId && !actor.roles.includes('tenant_admin')) throw new ForbiddenException('Someone else must decide your own request');
    if (decision === 'reject' && !(note && note.trim().length >= 3)) throw new BadRequestException('Say why the request is rejected');
    let result = 'Rejected';
    let data = r.data;
    if (decision === 'approve') {
      if (r.kind === 'management_quota') result = await this.applyManagementQuota(tx, actor, r.applicationId);
      else if (r.kind === 'cancellation') ({ result, data } = await this.applyCancellation(tx, actor, r));
      else result = await this.applyProgrammeChange(tx, actor, r);
    }
    const status = decision === 'approve' ? 'approved' : 'rejected';
    await tx.update(admissionRequests).set({ status, data, decidedBy: actor.userId, decidedAt: new Date(), decisionNote: note?.trim() || null }).where(eq(admissionRequests.id, id));
    await audit(tx, { ...auditActor(actor), action: `admission_request.request_${status}`, subjectType: 'admission_request', subjectId: id, changes: { status: { before: 'pending', after: status } }, data: { note: note ?? null, result } });
    return result;
  }

  private async applyManagementQuota(tx: Tx, actor: Actor, applicationId: string) {
    const a = await this.admissions.application(tx, applicationId, true);
    await tx.update(applications).set({ quota: 'management', updatedAt: new Date() }).where(eq(applications.id, a.id));
    await audit(tx, { ...auditActor(actor), action: 'admissions.quota_changed', subjectType: 'application', subjectId: a.id, changes: { quota: { before: a.quota, after: 'management' } } });
    return 'Moved to the management quota';
  }

  /**
   * Cancels the admission: an offer or acceptance is withdrawn; an enrolled student is struck off (dropped) with the
   * reason. The refund is worked out again on the day of approval. The agent's commission is taken back: cancelled if
   * not yet paid, recovered from the next payout if it was.
   */
  private async applyCancellation(tx: Tx, actor: Actor & { userId: string }, r: typeof admissionRequests.$inferSelect) {
    const a = await this.admissions.application(tx, r.applicationId, true);
    const quote = await this.refundQuote(tx, a.id);
    const reason = `Admission cancelled: ${r.reason}`;
    if (a.status === 'enrolled') {
      if (a.studentId) {
        const [st] = await tx.select({ status: students.status }).from(students).where(eq(students.id, a.studentId));
        if (st && !['dropped', 'transferred', 'expelled', 'deceased', 'alumni'].includes(st.status)) await this.lifecycle.changeStatus(tx, actor, a.studentId, 'dropped', { reason, approverId: actor.userId });
      }
      await tx.update(applications).set({ status: 'withdrawn', statusReason: reason, updatedAt: new Date() }).where(eq(applications.id, a.id));
      await audit(tx, { ...auditActor(actor), action: 'admissions.application.status_changed.v1', subjectType: 'application', subjectId: a.id, data: { from: 'enrolled', to: 'withdrawn', reason, by: 'approval' } });
    } else if (['offered', 'accepted'].includes(a.status)) await this.admissions.setStatus(tx, actor, a.id, 'withdrawn', reason, { by: 'approval' });
    else throw new BadRequestException(`An application that is ${a.status} cannot be cancelled now`);
    const [c] = await tx.select().from(agentCommissions).where(eq(agentCommissions.applicationId, a.id));
    let clawback: string | null = null;
    if (c && (c.status === 'accrued' || c.status === 'paid')) {
      const next = c.status === 'accrued' ? 'clawed_back' : 'clawback_due';
      await tx.update(agentCommissions).set({ status: next, clawedBackAt: new Date(), note: `${c.note ? `${c.note}; ` : ''}Student withdrew` }).where(eq(agentCommissions.id, c.id));
      clawback = next === 'clawed_back' ? 'Commission cancelled' : 'Commission to be recovered from the next payout';
      await audit(tx, { ...auditActor(actor), action: 'admissions.commission_clawed_back', subjectType: 'application', subjectId: a.id, changes: { commission: { before: c.status, after: next } }, data: { agentId: c.agentId, amountPaise: c.amountPaise } });
    }
    await this.events.emit(tx, actor.tenantId, { type: DomainEvents.AdmissionCancelled, aggregateType: 'application', aggregateId: a.id, actorId: actor.userId, payload: { refundPaise: quote.refundPaise, paidPaise: quote.paidPaise, studentId: a.studentId } });
    const rupees = (p: number) => `Rs ${(p / 100).toLocaleString('en-IN')}`;
    return { result: `Cancelled; refund ${rupees(quote.refundPaise)} of ${rupees(quote.paidPaise)} paid${clawback ? `; ${clawback}` : ''}`, data: { ...r.data, ...quote, approvedQuote: true, clawback } };
  }

  /**
   * Moves the admission to another programme's cycle: the seat in the old cycle is released and one taken in the new.
   * An enrolled student moves to the emptiest class of the new programme's entry term (a programme transfer on their
   * record); fees not yet paid for the old programme are cancelled for the accounts office to raise the new ones.
   */
  private async applyProgrammeChange(tx: Tx, actor: Actor & { userId: string }, r: typeof admissionRequests.$inferSelect) {
    const a = await this.admissions.application(tx, r.applicationId, true);
    const to = await this.admissions.cycle(tx, String(r.data.toCycleId));
    if ((await this.admissions.seatsLeft(tx, to)) < 1) throw new ConflictException(`No seats are left in ${to.name}`);
    await tx.update(applications).set({ cycleId: to.id, updatedAt: new Date() }).where(eq(applications.id, a.id));
    await audit(tx, { ...auditActor(actor), action: 'admissions.programme_changed', subjectType: 'application', subjectId: a.id, changes: { cycleId: { before: a.cycleId, after: to.id } }, data: { reason: r.reason } });
    let moved = '';
    if (a.status === 'enrolled' && a.studentId) {
      const term = a.entryTermOverride ?? to.entryTerm;
      const candidates = await tx.select().from(sections).where(and(eq(sections.programId, to.programId), eq(sections.academicYearId, to.academicYearId), eq(sections.term, term)));
      if (!candidates.length) throw new BadRequestException(`There is no class for term ${term} of the new programme: add it first`);
      const sizes = rows<{ id: string; n: number }>(await tx.execute(sql`select section_id as id, count(*)::int as n from students where section_id in (${sql.join(candidates.map((c) => sql`${c.id}::uuid`), sql`, `)}) group by 1`));
      const size = new Map(sizes.map((s) => [s.id, s.n]));
      const target = [...candidates].sort((x, y) => (size.get(x.id) ?? 0) - (size.get(y.id) ?? 0))[0];
      await this.lifecycle.changeSection(tx, actor, a.studentId, target.id, `Programme changed: ${r.reason}`, { anyProgram: true });
      const cancelled = await tx
        .update(feeInvoices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(feeInvoices.studentId, a.studentId), eq(feeInvoices.status, 'due'), eq(feeInvoices.paidPaise, 0)))
        .returning({ id: feeInvoices.id });
      moved = `; moved to ${target.displayName}${cancelled.length ? `, ${cancelled.length} unpaid fee${cancelled.length === 1 ? '' : 's'} of the old programme cancelled` : ''}`;
      await this.events.emit(tx, actor.tenantId, { type: DomainEvents.ProgrammeChanged, aggregateType: 'student', aggregateId: a.studentId, actorId: actor.userId, payload: { applicationId: a.id, toCycleId: to.id, sectionId: target.id, cancelledInvoices: cancelled.map((c) => c.id) } });
    }
    return `Moved to ${to.name}${moved}`;
  }

  // ---- custody register ------------------------------------------------------------------------------------------

  /** Records originals received from an applicant (or student) into custody. */
  async receiveOriginals(tx: Tx, actor: Actor & { userId: string }, input: { applicationId?: string; studentId?: string; items: { document: string; referenceNo?: string | null }[]; receivedOn?: string; note?: string | null }) {
    let holderName: string;
    let studentId = input.studentId ?? null;
    if (input.applicationId) {
      const a = await this.admissions.application(tx, input.applicationId);
      holderName = a.applicantName;
      studentId = studentId ?? a.studentId;
    } else if (studentId) {
      const s = await this.info.student(tx, studentId);
      holderName = s.fullName;
    } else throw new BadRequestException('Choose the applicant or the student');
    const receivedOn = input.receivedOn ?? (await this.lifecycle.today(tx));
    const out = [];
    for (const it of input.items) {
      const [row] = await tx
        .insert(admissionCustodyItems)
        .values({ tenantId: actor.tenantId, applicationId: input.applicationId ?? null, studentId, holderName, document: it.document.trim(), referenceNo: it.referenceNo?.trim() || null, receivedOn, receivedBy: actor.userId, note: input.note?.trim() || null })
        .returning();
      await audit(tx, { ...auditActor(actor), action: 'custody_item.created', subjectType: 'custody_item', subjectId: row.id, after: { document: row.document, holderName, receivedOn } });
      out.push(row);
    }
    return out;
  }

  /** Returns an original against the receiver's signature (name), on a date. */
  async returnOriginal(tx: Tx, actor: Actor & { userId: string }, id: string, input: { returnedTo: string; acknowledgement: string; returnedOn?: string }): Promise<string> {
    const [it] = await tx.select().from(admissionCustodyItems).where(eq(admissionCustodyItems.id, id)).for('update');
    if (!it) throw new NotFoundException('Not found');
    if (it.status === 'returned') throw new BadRequestException(`Already returned on ${it.returnedOn}`);
    const returnedOn = input.returnedOn ?? (await this.lifecycle.today(tx));
    if (returnedOn < it.receivedOn) throw new BadRequestException('It cannot be returned before it was received');
    await tx.update(admissionCustodyItems).set({ status: 'returned', returnedOn, returnedTo: input.returnedTo.trim(), acknowledgement: input.acknowledgement.trim(), returnedBy: actor.userId, updatedAt: new Date() }).where(eq(admissionCustodyItems.id, id));
    await audit(tx, { ...auditActor(actor), action: 'custody_item.original_returned', subjectType: 'custody_item', subjectId: id, changes: { status: { before: 'held', after: 'returned' } }, data: { returnedTo: input.returnedTo, returnedOn } });
    return `Returned to ${input.returnedTo.trim()}`;
  }

  // ---- saved drafts (public) ---------------------------------------------------------------------------------------

  async createDraft(tx: Tx, tenantId: string, cycleId: string, input: { applicantName?: string; phone?: string; data: Record<string, unknown>; step: number }) {
    const cycle = await this.admissions.cycle(tx, cycleId);
    const today = await this.lifecycle.today(tx);
    if (cycle.status !== 'open' || today < cycle.opensOn || today > cycle.closesOn) throw new BadRequestException('Applications for this program are not open');
    const token = newToken();
    const [d] = await tx
      .insert(applicationDrafts)
      .values({ tenantId, cycleId, tokenHash: hashToken(token), applicantName: (input.applicantName ?? '').slice(0, 120), phone: (input.phone ?? '').slice(0, 30), data: input.data, step: input.step, expiresAt: new Date(Date.now() + DRAFT_DAYS * 86_400_000) })
      .returning();
    return { id: d.id, token, step: d.step, expiresAt: d.expiresAt };
  }

  async draft(tx: Tx, id: string, token: string | undefined) {
    const [d] = await tx.select().from(applicationDrafts).where(eq(applicationDrafts.id, id));
    if (!d || !token || d.tokenHash !== hashToken(token) || d.expiresAt < new Date()) throw new NotFoundException('Draft not found or expired');
    return d;
  }

  async saveDraft(tx: Tx, id: string, token: string | undefined, input: { applicantName?: string; phone?: string; data: Record<string, unknown>; step: number }) {
    const d = await this.draft(tx, id, token);
    if (d.submittedApplicationId) throw new BadRequestException('This application was already submitted');
    const [row] = await tx
      .update(applicationDrafts)
      .set({ applicantName: (input.applicantName ?? d.applicantName).slice(0, 120), phone: (input.phone ?? d.phone).slice(0, 30), data: input.data, step: input.step, expiresAt: new Date(Date.now() + DRAFT_DAYS * 86_400_000), updatedAt: new Date() })
      .where(eq(applicationDrafts.id, id))
      .returning();
    return { id: row.id, step: row.step, expiresAt: row.expiresAt };
  }

  // ---- scholarship pre-check ---------------------------------------------------------------------------------------

  /**
   * The institution's scholarship schemes an applicant may qualify for, judged from the application: the marks
   * percentage (a form answer whose key mentions percent or marks) and the declared family income (an answer whose
   * key mentions income, in rupees). A scheme whose test cannot be judged says what is missing.
   */
  async scholarshipCheck(tx: Tx, applicationId: string) {
    const a = await this.admissions.application(tx, applicationId);
    const answers = a.answers ?? {};
    const num = (re: RegExp) => {
      const k = Object.keys(answers).find((x) => re.test(x));
      const v = k ? Number(answers[k]) : NaN;
      return Number.isFinite(v) ? v : null;
    };
    const pct = num(/percent|marks|aggregate/i);
    const incomeRupees = num(/income/i);
    const schemes = await tx.select().from(scholarshipSchemes).where(eq(scholarshipSchemes.active, true)).orderBy(asc(scholarshipSchemes.name));
    const today = await this.lifecycle.today(tx);
    return {
      category: categoryOf(a),
      percentage: pct,
      familyIncomePaise: incomeRupees === null ? null : Math.round(incomeRupees * 100),
      schemes: schemes
        .filter((s) => !s.validUntil || s.validUntil >= today)
        .map((s) => {
          const reasons: string[] = [];
          let verdict: 'likely' | 'not_eligible' | 'unknown' = 'likely';
          if (s.minPercentage !== null) {
            if (pct === null) {
              verdict = 'unknown';
              reasons.push(`Needs at least ${s.minPercentage}% (marks not on the form)`);
            } else if (pct < s.minPercentage) {
              verdict = 'not_eligible';
              reasons.push(`Needs at least ${s.minPercentage}%, has ${pct}%`);
            }
          }
          if (s.maxIncomePaise !== null) {
            if (incomeRupees === null) {
              if (verdict === 'likely') verdict = 'unknown';
              reasons.push(`Family income must be at most Rs ${(s.maxIncomePaise / 100).toLocaleString('en-IN')} (income not on the form)`);
            } else if (incomeRupees * 100 > s.maxIncomePaise) {
              verdict = 'not_eligible';
              reasons.push(`Family income is above Rs ${(s.maxIncomePaise / 100).toLocaleString('en-IN')}`);
            }
          }
          return { id: s.id, name: s.name, kind: s.kind, value: s.value, verdict, reasons };
        }),
    };
  }

  // ---- reports -----------------------------------------------------------------------------------------------------------

  async report(tx: Tx, kind: string, q: { from?: string; to?: string; yearId?: string; by?: string }) {
    const today = await this.lifecycle.today(tx);
    const from = q.from ?? addDays(today, -30);
    const to = q.to ?? today;
    const year = q.yearId ? sql` and c.academic_year_id = ${q.yearId}::uuid` : sql``;
    switch (kind) {
      case 'daily-register':
        return rows(
          await tx.execute(sql`
            select s.enrolled_on::text as "admittedOn", sp.admission_no as "admissionNo", a.application_no as "applicationNo", a.applicant_name as "name",
              p.name as programme, sec.display_name as "className", s.roll_no as "rollNo", lower(coalesce(a.category, a.answers->>'category')) as category,
              a.gender, a.quota, a.admission_type as "admissionType", a.guardian_name as "guardianName", a.guardian_phone as "guardianPhone"
            from applications a join admission_cycles c on c.id = a.cycle_id join programs p on p.id = c.program_id
            join students s on s.id = a.student_id join sections sec on sec.id = s.section_id
            left join student_profiles sp on sp.student_id = s.id
            where s.enrolled_on between ${from}::date and ${to}::date
            order by s.enrolled_on, sp.admission_no nulls last, a.applicant_name`),
        );
      case 'category-stats':
        return rows(
          await tx.execute(sql`
            with x as (
              select p.name as programme, lower(coalesce(sp.gender, a.gender, '')) as g, lower(coalesce(sp.category, a.category, a.answers->>'category', '')) as cat,
                sp.disability is not null as pwd, coalesce(sp.is_minority, false) as minority
              from applications a join admission_cycles c on c.id = a.cycle_id join programs p on p.id = c.program_id
              left join student_profiles sp on sp.student_id = a.student_id
              where a.status = 'enrolled'${year})
            select programme, count(*)::int as total,
              count(*) filter (where g = 'male')::int as male, count(*) filter (where g = 'female')::int as female, count(*) filter (where g = 'other')::int as transgender,
              count(*) filter (where cat in ('general', 'gen', 'gm'))::int as general, count(*) filter (where cat = 'obc')::int as obc, count(*) filter (where cat = 'sc')::int as sc,
              count(*) filter (where cat = 'st')::int as st, count(*) filter (where cat = 'ews')::int as ews,
              count(*) filter (where pwd)::int as pwd, count(*) filter (where minority)::int as minority
            from x group by programme order by programme`),
        );
      case 'quota-fill': {
        const cycles = await tx.execute(sql`
          select c.id, c.name, c.seats from admission_cycles c where true${year} order by c.name`);
        const out: { cycle: string; kind: string; name: string; seats: number | null; filled: number; vacant: number | null }[] = [];
        for (const c of rows<{ id: string; name: string; seats: number }>(cycles)) {
          const held = rows<{ cat: string | null; quota: string; n: number }>(
            await tx.execute(sql`select lower(coalesce(category, answers->>'category')) as cat, quota, count(*)::int as n from applications where cycle_id = ${c.id}::uuid and status in ('offered', 'accepted', 'enrolled') group by 1, 2`),
          );
          const total = held.reduce((n, h) => n + h.n, 0);
          out.push({ cycle: c.name, kind: 'Total', name: 'All seats', seats: c.seats, filled: total, vacant: c.seats - total });
          const reserved = rows<{ category: string; seats: number }>(await tx.execute(sql`select lower(category) as category, reserved_seats as seats from admission_quotas where cycle_id = ${c.id}::uuid order by category`));
          for (const r of reserved) {
            const filled = held.filter((h) => h.cat === r.category).reduce((n, h) => n + h.n, 0);
            out.push({ cycle: c.name, kind: 'Category', name: r.category.toUpperCase(), seats: r.seats, filled, vacant: r.seats - filled });
          }
          const quotas = new Map<string, number>();
          for (const h of held) quotas.set(h.quota, (quotas.get(h.quota) ?? 0) + h.n);
          for (const [name, filled] of [...quotas].sort()) out.push({ cycle: c.name, kind: 'Quota', name, seats: null, filled, vacant: null });
        }
        return out;
      }
      case 'conversion': {
        const by = q.by === 'source' ? sql`e.source::text` : q.by === 'counsellor' ? sql`coalesce(u.full_name, 'Unassigned')` : sql`coalesce(p.name, 'Undecided')`;
        const lastFrom = addDays(from, -365);
        const lastTo = addDays(to, -365);
        return rows(
          await tx.execute(sql`
            select ${by} as "group",
              count(*) filter (where e.created_at::date between ${from}::date and ${to}::date)::int as enquiries,
              count(*) filter (where e.created_at::date between ${from}::date and ${to}::date and (e.application_id is not null or e.stage in ('applied', 'converted')))::int as applied,
              count(*) filter (where e.created_at::date between ${from}::date and ${to}::date and e.stage = 'converted')::int as enrolled,
              count(*) filter (where e.created_at::date between ${from}::date and ${to}::date and e.stage = 'lost')::int as lost,
              count(*) filter (where e.created_at::date between ${lastFrom}::date and ${lastTo}::date)::int as "lastYearEnquiries",
              count(*) filter (where e.created_at::date between ${lastFrom}::date and ${lastTo}::date and e.stage = 'converted')::int as "lastYearEnrolled"
            from enquiries e left join programs p on p.id = e.program_id left join users u on u.id = e.counsellor_id
            where e.merged_into_id is null and (e.created_at::date between ${from}::date and ${to}::date or e.created_at::date between ${lastFrom}::date and ${lastTo}::date)
            group by 1 order by enquiries desc, 1`),
        );
      }
      case 'agent-statement':
        return rows(
          await tx.execute(sql`
            select ag.name as agent, ag.referral_code as code, ag.kind,
              (select count(*)::int from enquiries e where e.agent_id = ag.id) as referrals,
              (select count(*)::int from applications a where a.agent_id = ag.id or a.enquiry_id in (select id from enquiries where agent_id = ag.id)) as applications,
              (select count(*)::int from agent_commissions c where c.agent_id = ag.id) as enrolled,
              coalesce((select sum(amount_paise) from agent_commissions c where c.agent_id = ag.id and c.status = 'accrued'), 0)::float as "duePaise",
              coalesce((select sum(gross_paise) from agent_payouts po where po.agent_id = ag.id), 0)::float as "paidGrossPaise",
              coalesce((select sum(tds_paise) from agent_payouts po where po.agent_id = ag.id), 0)::float as "tdsPaise",
              coalesce((select sum(net_paise) from agent_payouts po where po.agent_id = ag.id), 0)::float as "paidNetPaise",
              coalesce((select sum(amount_paise) from agent_commissions c where c.agent_id = ag.id and c.status in ('clawed_back', 'clawback_due')), 0)::float as "clawedBackPaise",
              coalesce((select sum(amount_paise) from agent_commissions c where c.agent_id = ag.id and c.status = 'clawback_due'), 0)::float as "toRecoverPaise"
            from admission_agents ag order by ag.name`),
        );
      case 'fee-reconciliation':
        return rows(
          await tx.execute(sql`
            select a.id as "applicationId", a.application_no as "applicationNo", a.applicant_name as name, a.phone, c.name as cycle, c.application_fee_paise::float as "feePaise",
              a.submitted_at::date::text as "submittedOn", (current_date - a.submitted_at::date)::int as "daysPending",
              (select count(*)::int from application_payments ap where ap.application_id = a.id and ap.status = 'created') as "ordersStarted",
              (select count(*)::int from application_payments ap where ap.application_id = a.id and ap.status = 'failed') as "ordersFailed",
              (select max(ap.created_at)::text from application_payments ap where ap.application_id = a.id) as "lastAttemptAt"
            from applications a join admission_cycles c on c.id = a.cycle_id
            where a.fee_status = 'pending' and a.status not in ('withdrawn', 'rejected', 'declined')${year}
            order by a.submitted_at`),
        );
      case 'drafts':
        return rows(
          await tx.execute(sql`
            select d.id, d.applicant_name as name, d.phone, c.name as cycle, d.step, d.created_at::date::text as "startedOn", d.updated_at::date::text as "lastSavedOn", d.expires_at::date::text as "expiresOn"
            from application_drafts d join admission_cycles c on c.id = d.cycle_id
            where d.submitted_application_id is null and d.expires_at > now()${year}
            order by d.updated_at desc`),
        );
      case 'counsellors':
        return rows(
          await tx.execute(sql`
            select u.full_name as counsellor,
              (select count(*)::int from enquiries e where e.counsellor_id = u.id and e.stage not in ('converted', 'lost')) as open,
              (select count(*)::int from enquiries e where e.counsellor_id = u.id and e.stage not in ('converted', 'lost') and e.next_follow_up_on < ${today}::date) as overdue,
              (select count(*)::int from enquiries e where e.counsellor_id = u.id and e.stage not in ('converted', 'lost') and e.next_follow_up_on = ${today}::date) as "dueToday",
              (select count(*)::int from enquiry_activities x where x.actor_id = u.id and x.created_at::date between ${from}::date and ${to}::date and x.kind = 'call') as calls,
              (select count(*)::int from enquiry_activities x where x.actor_id = u.id and x.created_at::date between ${from}::date and ${to}::date and x.kind = 'visit') as visits,
              (select count(*)::int from enquiry_activities x where x.actor_id = u.id and x.created_at::date between ${from}::date and ${to}::date and x.kind in ('sms', 'whatsapp', 'email')) as messages,
              (select count(*)::int from enquiries e where e.counsellor_id = u.id and e.stage = 'converted' and e.updated_at::date between ${from}::date and ${to}::date) as converted
            from users u where u.id in (select ur.user_id from user_roles ur where ur.role in ('admissions_officer', 'counsellor')) and u.status = 'active'
            order by u.full_name`),
        );
      default:
        throw new NotFoundException('Unknown report');
    }
  }

  /** The funnel by day for the dashboard: enquiries, applications and enrolments per day this period and the same days last year. */
  async funnel(tx: Tx, q: { from?: string; to?: string }) {
    const today = await this.lifecycle.today(tx);
    const from = q.from ?? addDays(today, -29);
    const to = q.to ?? today;
    const [now] = rows<{ enquiries: number; applications: number; enrolled: number }>(
      await tx.execute(sql`select
        (select count(*)::int from enquiries where merged_into_id is null and created_at::date between ${from}::date and ${to}::date) as enquiries,
        (select count(*)::int from applications where submitted_at::date between ${from}::date and ${to}::date) as applications,
        (select count(*)::int from students where application_id is not null and enrolled_on between ${from}::date and ${to}::date) as enrolled`),
    );
    const [last] = rows<{ enquiries: number; applications: number; enrolled: number }>(
      await tx.execute(sql`select
        (select count(*)::int from enquiries where merged_into_id is null and created_at::date between ${addDays(from, -365)}::date and ${addDays(to, -365)}::date) as enquiries,
        (select count(*)::int from applications where submitted_at::date between ${addDays(from, -365)}::date and ${addDays(to, -365)}::date) as applications,
        (select count(*)::int from students where application_id is not null and enrolled_on between ${addDays(from, -365)}::date and ${addDays(to, -365)}::date) as enrolled`),
    );
    const days = rows<{ day: string; enquiries: number; applications: number; enrolled: number }>(
      await tx.execute(sql`
        select d::date::text as day,
          (select count(*)::int from enquiries e where e.merged_into_id is null and e.created_at::date = d::date) as enquiries,
          (select count(*)::int from applications a where a.submitted_at::date = d::date) as applications,
          (select count(*)::int from students s where s.application_id is not null and s.enrolled_on = d::date) as enrolled
        from generate_series(${from}::date, ${to}::date, interval '1 day') d order by 1`),
    );
    const pending = await tx.select({ n: sql<number>`count(*)::int` }).from(admissionRequests).where(eq(admissionRequests.status, 'pending'));
    const held = await tx.select({ n: sql<number>`count(*)::int` }).from(admissionCustodyItems).where(eq(admissionCustodyItems.status, 'held'));
    return { from, to, now, lastYear: last, days, pendingRequests: pending[0].n, originalsHeld: held[0].n };
  }

  /** Requests for one application, newest first (for the application page). */
  async requestsFor(tx: Tx, applicationId: string) {
    return tx.select().from(admissionRequests).where(eq(admissionRequests.applicationId, applicationId)).orderBy(desc(admissionRequests.createdAt));
  }

  async custodyFor(tx: Tx, applicationId: string) {
    return tx.select().from(admissionCustodyItems).where(eq(admissionCustodyItems.applicationId, applicationId)).orderBy(asc(admissionCustodyItems.receivedOn), asc(admissionCustodyItems.document));
  }

  /** Lateral entry, transfer admission and nationality, set by the office on an application. */
  async setAdmissionKind(tx: Tx, actor: Actor, applicationId: string, input: { admissionType?: string; entryTermOverride?: number | null; nationality?: string }) {
    const a = await this.admissions.application(tx, applicationId, true);
    if (a.status === 'enrolled' && (input.entryTermOverride !== undefined || input.admissionType !== undefined)) throw new BadRequestException('The applicant is already enrolled: change the class from the student record');
    const cycle = await this.admissions.cycle(tx, a.cycleId);
    const [prog] = await tx.select({ termCount: programs.termCount }).from(programs).where(eq(programs.id, cycle.programId));
    if (input.entryTermOverride && prog && input.entryTermOverride > prog.termCount) throw new BadRequestException(`The programme has ${prog.termCount} terms`);
    const type = input.admissionType ?? a.admissionType;
    if (type === 'regular' && input.entryTermOverride) throw new BadRequestException('A regular admission joins the cycle\'s entry term: choose lateral or transfer');
    const set = { ...(input.admissionType !== undefined && { admissionType: input.admissionType }), ...(input.entryTermOverride !== undefined && { entryTermOverride: input.entryTermOverride }), ...(input.nationality !== undefined && { nationality: input.nationality }), ...(type === 'regular' && { entryTermOverride: null }) };
    const [row] = await tx.update(applications).set({ ...set, updatedAt: new Date() }).where(eq(applications.id, a.id)).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.admission_kind_changed', subjectType: 'application', subjectId: a.id, before: { admissionType: a.admissionType, entryTermOverride: a.entryTermOverride, nationality: a.nationality }, after: { admissionType: row.admissionType, entryTermOverride: row.entryTermOverride, nationality: row.nationality } });
    return row;
  }

  /** Cycles a programme change can move to: same academic year, other programmes. */
  async changeTargets(tx: Tx, applicationId: string) {
    const a = await this.admissions.application(tx, applicationId);
    const cycle = await this.admissions.cycle(tx, a.cycleId);
    const list = await tx.select({ id: admissionCycles.id, name: admissionCycles.name, seats: admissionCycles.seats, programName: programs.name }).from(admissionCycles).innerJoin(programs, eq(programs.id, admissionCycles.programId)).where(and(eq(admissionCycles.academicYearId, cycle.academicYearId), ne(admissionCycles.id, cycle.id))).orderBy(asc(programs.name));
    const out = [];
    for (const c of list) out.push({ ...c, seatsLeft: await this.admissions.seatsLeft(tx, (await this.admissions.cycle(tx, c.id))) });
    return out;
  }
}
