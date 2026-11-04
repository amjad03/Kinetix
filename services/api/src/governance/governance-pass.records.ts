import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { RoleName } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import { nextNumber } from '../common/ops.js';
import { qualified } from '../campus-life/kit-shared.js';
import { roleName } from '../db/schema.js';
import { complianceDeadlines, disclosureItems, governancePolicies, governancePolicyVersions, rtiRequests } from '../db/schema-governance-pass.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecordRegistry, type CustomAction, type KitCtx, type RecordEntity } from '../records/entity.js';
import { choices, kitEntity, parseParams, rowOf } from '../research/kit.js';
import { GOVERNANCE_ROLES } from './governance.controller.js';
import { govTexts } from './governance-texts.js';
import { POLICY_CATEGORIES } from './policies.controller.js';
import { AUTHORITIES, nextOccurrence, RECURRENCES, RTI_PAGE_PAISE, RTI_REFUSAL_SECTIONS, rtiAppealDueOn, rtiAppealWindowEnds, rtiDueOn, rtiLate, rtiTransferBy, type Recurrence } from './statutory.js';

/** Who keeps the RTI register: the office (the PIO is named on each request). */
export const RTI_ROLES: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];

const blank = (max: number) => z.string().trim().max(max).default('');
/** Not-null text columns: an empty value is stored as '' (the kit's default for optional text is null). */
function blanks(e: RecordEntity, keys: Record<string, number>) {
  for (const [k, max] of Object.entries(keys)) e.fields![k].schema = blank(max);
}
const Note = (min: number, label: string) => z.object({ note: z.string().trim().min(min, label).max(4000) });
const today = (ctx: KitCtx, clock: Clock) => tenantToday(ctx.tx, clock);

/**
 * The governance pass's registers as record kit lists: policies (versions are handled on the policy's page), the RTI
 * register with its statutory clock and its steps as actions, the compliance calendar (done rolls a recurring deadline
 * on), and the typed lines of the mandatory disclosure page.
 */
@Injectable()
export class GovernancePassRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.policies());
    this.registry.register(this.rti());
    this.registry.register(this.deadlines());
    this.registry.register(this.disclosure());
  }

  // ---- policies ---------------------------------------------------------------------------------------------------

  private policies(): RecordEntity {
    const pub = sql`(select v.version from governance_policy_versions v where v.policy_id = ${qualified('governance_policies')} and v.status = 'published')`;
    const e = kitEntity({
      key: 'governance-policies',
      module: 'governance',
      table: governancePolicies,
      subjectType: 'policy',
      roles: { read: GOVERNANCE_ROLES, write: GOVERNANCE_ROLES },
      title: 'title',
      fields: {
        code: { label: 'Code', kind: 'text', column: governancePolicies.code, required: true, max: 32, edit: false, example: 'POL/HR/01', help: 'Capitals, digits, dots, dashes or slashes' },
        title: { label: 'Title', kind: 'text', column: governancePolicies.title, required: true, max: 200, example: 'Code of conduct for staff' },
        category: { label: 'Category', kind: 'select', column: governancePolicies.category, options: choices(POLICY_CATEGORIES), required: true, bulk: true, example: 'hr' },
        ownerUserId: { label: 'Owner', kind: 'user', column: governancePolicies.ownerUserId, bulk: true },
        reviewMonths: { label: 'Review every (months)', kind: 'number', column: governancePolicies.reviewMonths, int: true, min: 1, max: 120, bulk: true, example: '24' },
        public: { label: 'On the public disclosure page', kind: 'boolean', column: governancePolicies.public, bulk: true },
        audience: { label: 'Must be acknowledged by', kind: 'tags', column: governancePolicies.audience, options: choices(roleName.enumValues), help: 'Roles, for example teacher, student' },
        status: { label: 'Status', kind: 'select', column: governancePolicies.status, options: choices(['active', 'retired']), create: false, bulk: true },
      },
      extra: {
        nextReviewOn: governancePolicies.nextReviewOn,
        publishedVersion: sql<number | null>`${pub}`,
        openVersion: sql<string | null>`(select v.status from governance_policy_versions v where v.policy_id = ${qualified('governance_policies')} and v.status in ('draft', 'in_review', 'approved') order by v.version desc limit 1)`,
        acknowledged: sql<number>`(select count(*)::int from governance_policy_acks a join governance_policy_versions v on v.id = a.version_id where v.policy_id = ${qualified('governance_policies')} and v.status = 'published')`,
        reviewDue: sql<boolean>`(${governancePolicies.nextReviewOn} is not null and ${governancePolicies.nextReviewOn} <= (now() at time zone 'Asia/Kolkata')::date and ${governancePolicies.status} = 'active')`,
      },
      filters: {
        review: { label: 'Review', options: choices(['due']), where: (v) => (v === 'due' ? sql`${governancePolicies.nextReviewOn} <= (now() at time zone 'Asia/Kolkata')::date and ${governancePolicies.status} = 'active'` : undefined) },
        published: { label: 'Published', options: choices(['yes', 'no']), where: (v) => (v === 'yes' ? sql`${pub} is not null` : v === 'no' ? sql`${pub} is null` : undefined) },
      },
      sorts: { nextReviewOn: governancePolicies.nextReviewOn },
      search: [governancePolicies.title, governancePolicies.code],
      defaultSort: { id: 'code', dir: 'asc' },
      importKey: ['code'],
      noImport: true,
      exportExtra: [
        { key: 'publishedVersion', header: 'Published version' },
        { key: 'nextReviewOn', header: 'Next review' },
        { key: 'acknowledged', header: 'Acknowledged' },
      ],
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ id: governancePolicyVersions.id }).from(governancePolicyVersions).where(and(eq(governancePolicyVersions.policyId, id), sql`${governancePolicyVersions.status} in ('published', 'superseded')`)).limit(1)).length ? 'A policy that was published stays on record; retire it instead' : null) },
    });
    e.fields!.body = { label: 'Policy text (first version)', type: 'textarea', schema: z.string().trim().min(20, 'Write the policy text').max(100_000), required: true, edit: false, apply: async () => undefined };
    e.create = async (ctx, v) => {
      const code = String(v.code ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9_/.-]{1,30}$/.test(code)) throw new BadRequestException('Use capitals, digits, dots, dashes or slashes for the code');
      const [dup] = await ctx.tx.select({ id: governancePolicies.id }).from(governancePolicies).where(eq(governancePolicies.code, code));
      if (dup) throw new ConflictException('A policy with this code already exists');
      const [pol] = await ctx.tx
        .insert(governancePolicies)
        .values({ tenantId: ctx.p.tenantId, code, title: String(v.title), category: String(v.category), ownerUserId: (v.ownerUserId as string | null) ?? ctx.p.userId, reviewMonths: Number(v.reviewMonths ?? 24) || 24, public: !!v.public, audience: (v.audience as string[] | null) ?? [], createdBy: ctx.p.userId })
        .returning({ id: governancePolicies.id });
      await ctx.tx.insert(governancePolicyVersions).values({ tenantId: ctx.p.tenantId, policyId: pol.id, version: 1, body: String(v.body), changeNote: 'First version', authoredBy: ctx.p.userId });
      return pol.id;
    };
    return e;
  }

  // ---- RTI --------------------------------------------------------------------------------------------------------

  private rti(): RecordEntity {
    const clock = this.clock;
    const days = sql<number | null>`case when ${rtiRequests.status} in ('received', 'transferred') then (${rtiRequests.dueOn} - (now() at time zone 'Asia/Kolkata')::date) end`;
    const step = (label: string, inputs: CustomAction['inputs'], params: z.ZodType, run: (ctx: KitCtx, row: typeof rtiRequests.$inferSelect, params: never, day: string) => Promise<Partial<typeof rtiRequests.$inferInsert>>, tone?: 'danger'): CustomAction => ({
      label,
      inputs,
      params,
      tone,
      apply: async (ctx, id, raw) => {
        const [row] = await ctx.tx.select().from(rtiRequests).where(eq(rtiRequests.id, id)).for('update');
        if (!row) throw new BadRequestException('Request not found');
        const day = await today(ctx, clock);
        const set = await run(ctx, row, parseParams(params, raw) as never, day);
        await ctx.tx.update(rtiRequests).set(set).where(eq(rtiRequests.id, id));
        await auditUser(ctx.tx, ctx.p, `rti.${label.toLowerCase().replace(/[^a-z]+/g, '_')}`, 'rti_request', id, { status: set.status ?? row.status });
      },
    });
    const open = (r: { status: string }) => {
      if (!['received', 'transferred'].includes(r.status)) throw new ConflictException('This request has been answered');
    };
    const e = kitEntity({
      key: 'rti-requests',
      module: 'governance',
      table: rtiRequests,
      subjectType: 'rti_request',
      roles: { read: RTI_ROLES, write: RTI_ROLES },
      title: 'subject',
      label: (r) => `${String(r.requestNo ?? '')} ${String(r.subject ?? '')}`.trim(),
      fields: {
        applicantName: { label: 'Applicant', kind: 'text', column: rtiRequests.applicantName, required: true, max: 160, example: 'R. Mehta' },
        address: { label: 'Address', kind: 'textarea', column: rtiRequests.address, max: 500 },
        phone: { label: 'Phone', kind: 'text', column: rtiRequests.phone, max: 20 },
        email: { label: 'E-mail', kind: 'text', column: rtiRequests.email, max: 160 },
        receivedOn: { label: 'Received on', kind: 'date', column: rtiRequests.receivedOn, required: true, example: '2026-10-15' },
        mode: { label: 'Received by', kind: 'select', column: rtiRequests.mode, options: choices(['post', 'online', 'in_person', 'email']), required: true, example: 'post' },
        viaApio: { label: 'Through an assistant PIO (5 more days)', kind: 'boolean', column: rtiRequests.viaApio },
        lifeLiberty: { label: 'Life or liberty (48 hours)', kind: 'boolean', column: rtiRequests.lifeLiberty },
        bpl: { label: 'Below the poverty line (no fee)', kind: 'boolean', column: rtiRequests.bpl },
        feePaise: { label: 'Application fee paid', kind: 'money', column: rtiRequests.feePaise, example: '10' },
        feeRef: { label: 'Fee reference (IPO, DD, receipt)', kind: 'text', column: rtiRequests.feeRef, max: 80 },
        subject: { label: 'Subject', kind: 'text', column: rtiRequests.subject, required: true, max: 200, example: 'Copies of the admission merit list 2026' },
        information: { label: 'Information sought', kind: 'textarea', column: rtiRequests.information, required: true, max: 8000 },
        pioUserId: { label: 'Public Information Officer', kind: 'user', column: rtiRequests.pioUserId, bulk: true },
      },
      extra: {
        requestNo: rtiRequests.requestNo,
        dueOn: rtiRequests.dueOn,
        status: rtiRequests.status,
        daysLeft: days,
        overdue: sql<boolean>`(${rtiRequests.status} in ('received', 'transferred') and ${rtiRequests.dueOn} < (now() at time zone 'Asia/Kolkata')::date)`,
        transferredTo: rtiRequests.transferredTo,
        transferredOn: rtiRequests.transferredOn,
        repliedOn: rtiRequests.repliedOn,
        rejectionSection: rtiRequests.rejectionSection,
        additionalFeeRupees: sql<number>`(${rtiRequests.additionalFeePaise} / 100.0)::float8`,
        appealFiledOn: rtiRequests.appealFiledOn,
        appealDueOn: rtiRequests.appealDueOn,
        appealOutcome: rtiRequests.appealOutcome,
        reply: rtiRequests.reply,
      },
      filters: {
        status: { label: 'Status', options: choices(['received', 'transferred', 'replied', 'rejected', 'closed']), where: (v) => (['received', 'transferred', 'replied', 'rejected', 'closed'].includes(v) ? eq(rtiRequests.status, v) : undefined) },
        due: { label: 'Reply', options: choices(['overdue', 'week', 'open']), where: (v) => (v === 'overdue' ? sql`${rtiRequests.status} in ('received', 'transferred') and ${rtiRequests.dueOn} < (now() at time zone 'Asia/Kolkata')::date` : v === 'week' ? sql`${rtiRequests.status} in ('received', 'transferred') and ${rtiRequests.dueOn} between (now() at time zone 'Asia/Kolkata')::date and (now() at time zone 'Asia/Kolkata')::date + 7` : v === 'open' ? sql`${rtiRequests.status} in ('received', 'transferred')` : undefined) },
        appeal: { label: 'First appeal', options: choices(['pending', 'decided']), where: (v) => (v === 'pending' ? sql`${rtiRequests.appealFiledOn} is not null and ${rtiRequests.appealOutcome} = ''` : v === 'decided' ? sql`${rtiRequests.appealOutcome} <> ''` : undefined) },
      },
      sorts: { dueOn: rtiRequests.dueOn, requestNo: rtiRequests.requestNo, status: rtiRequests.status },
      search: [rtiRequests.requestNo, rtiRequests.applicantName, rtiRequests.subject],
      defaultSort: { id: 'receivedOn', dir: 'desc' },
      noImport: true,
      exportExtra: [
        { key: 'requestNo', header: 'Request no.' },
        { key: 'dueOn', header: 'Reply due' },
        { key: 'status', header: 'Status' },
        { key: 'transferredTo', header: 'Transferred to' },
        { key: 'repliedOn', header: 'Replied on' },
        { key: 'rejectionSection', header: 'Refused under section' },
        { key: 'additionalFeeRupees', header: 'Further fee (₹)' },
        { key: 'appealFiledOn', header: 'First appeal filed' },
        { key: 'appealOutcome', header: 'Appeal outcome' },
      ],
      remove: { guard: async (ctx, id) => ((await rowOf(ctx, rtiRequests, id)).status === 'received' ? null : 'An answered request stays on the register') },
      actions: {
        transfer: step('Transfer', [{ key: 'to', label: 'Public authority it goes to', type: 'text', required: true }], z.object({ to: z.string().trim().min(3).max(200) }), async (_ctx, r, p: { to: string }, day) => {
          open(r);
          if (r.status === 'transferred') throw new ConflictException('Already transferred');
          // Section 6(3): within 5 days; a late transfer is still recorded, and the register shows the date.
          void rtiTransferBy(r.receivedOn);
          return { status: 'transferred', transferredTo: p.to, transferredOn: day };
        }),
        reply: step('Reply', [{ key: 'reply', label: 'Reply sent', type: 'textarea', required: true }, { key: 'pages', label: 'Pages supplied (₹2 a page)', type: 'number' }], z.object({ reply: z.string().trim().min(5).max(8000), pages: z.coerce.number().int().min(0).max(100000).optional() }), async (_ctx, r, p: { reply: string; pages?: number }, day) => {
          open(r);
          // Section 7(6): free when late; nothing below the poverty line.
          const fee = r.bpl || rtiLate(r.dueOn, day) ? 0 : (p.pages ?? 0) * RTI_PAGE_PAISE;
          return { status: 'replied', reply: p.reply, repliedOn: day, additionalFeePaise: fee };
        }),
        reject: step('Refuse', [{ key: 'section', label: 'Section (for example 8(1)(j))', type: 'text', required: true }, { key: 'reason', label: 'Reasons given to the applicant', type: 'textarea', required: true }], z.object({ section: z.enum(RTI_REFUSAL_SECTIONS, { message: `Use one of ${RTI_REFUSAL_SECTIONS.join(', ')}` }), reason: z.string().trim().min(10).max(4000) }), async (_ctx, r, p: { section: string; reason: string }, day) => {
          open(r);
          return { status: 'rejected', rejectionSection: p.section, reply: p.reason, repliedOn: day };
        }, 'danger'),
        appeal: step('First appeal', [{ key: 'grounds', label: 'Grounds of appeal', type: 'textarea', required: true }], z.object({ grounds: z.string().trim().min(5).max(4000) }), async (_ctx, r, p: { grounds: string }, day) => {
          if (r.appealFiledOn) throw new ConflictException('A first appeal is already on record');
          const from = r.repliedOn ?? r.dueOn;
          if (!r.repliedOn && day <= r.dueOn) throw new ConflictException('An appeal lies after a reply, or once the reply is overdue');
          if (day > rtiAppealWindowEnds(from)) throw new ConflictException('The 30 days for a first appeal have passed (the appellate authority may still condone the delay; record it with a note)');
          return { appealFiledOn: day, appealGrounds: p.grounds, appealDueOn: rtiAppealDueOn(day) };
        }),
        // The first appellate authority's order: allowed, partly allowed or dismissed, each with the order's text.
        ...Object.fromEntries(
          ([['appealAllowed', 'allowed', 'Appeal allowed'], ['appealPartly', 'partly_allowed', 'Appeal partly allowed'], ['appealDismissed', 'dismissed', 'Appeal dismissed']] as const).map(([key, outcome, label]) => [
            key,
            step(label, [{ key: 'decision', label: 'Order of the appellate authority', type: 'textarea', required: true }], z.object({ decision: z.string().trim().min(5).max(4000) }), async (ctx, r, p: { decision: string }, day) => {
              if (!r.appealFiledOn || r.appealOutcome) throw new ConflictException('No first appeal is waiting');
              return { appealOutcome: outcome, appealDecision: p.decision, appealDecidedOn: day, faaUserId: ctx.p.userId };
            }),
          ]),
        ),
        close: step('Close', [{ key: 'note', label: 'Note', type: 'textarea' }], z.object({ note: z.string().trim().max(1000).optional() }), async (_ctx, r) => {
          if (['received', 'transferred'].includes(r.status) && r.status !== 'transferred') throw new ConflictException('Reply or transfer the request before closing it');
          return { status: 'closed' };
        }),
      },
    });
    blanks(e, { address: 500, phone: 20, email: 160, feeRef: 80 });
    // A new request gets its number and the statutory reply date; the PIO is told.
    e.create = async (ctx, v) => {
      const receivedOn = String(v.receivedOn);
      const requestNo = await nextNumber(ctx.tx, ctx.p.tenantId, 'RTI');
      const dueOn = rtiDueOn(receivedOn, { lifeLiberty: !!v.lifeLiberty, viaApio: !!v.viaApio });
      const str = (k: string) => String(v[k] ?? '');
      const [row] = await ctx.tx
        .insert(rtiRequests)
        .values({ tenantId: ctx.p.tenantId, requestNo, applicantName: str('applicantName'), address: str('address'), phone: str('phone'), email: str('email'), receivedOn, mode: str('mode') || 'post', viaApio: !!v.viaApio, lifeLiberty: !!v.lifeLiberty, bpl: !!v.bpl, feePaise: Math.round(Number(v.feePaise ?? 0) * 100), feeRef: str('feeRef'), subject: str('subject'), information: str('information'), pioUserId: (v.pioUserId as string | null) ?? null, dueOn, createdBy: ctx.p.userId })
        .returning({ id: rtiRequests.id });
      if (v.pioUserId) await this.notifications.notifyUsers(ctx.tx, [String(v.pioUserId)], { kind: 'task', text: govTexts.rtiAssigned({ no: requestNo, subject: str('subject'), dueOn }), data: { rtiId: row.id }, dedupeKey: `rti-assigned:${row.id}` });
      return row.id;
    };
    e.check = async (ctx, id) => {
      const r = await rowOf(ctx, rtiRequests, id);
      if (String(r.status) !== 'received') return;
      const due = rtiDueOn(String(r.receivedOn ?? r.received_on), { lifeLiberty: !!(r.lifeLiberty ?? r.life_liberty), viaApio: !!(r.viaApio ?? r.via_apio) });
      await ctx.tx.update(rtiRequests).set({ dueOn: due }).where(eq(rtiRequests.id, id));
    };
    return e;
  }

  // ---- compliance calendar ----------------------------------------------------------------------------------------

  private deadlines(): RecordEntity {
    const clock = this.clock;
    const state = sql<string>`case when ${complianceDeadlines.status} <> 'pending' then ${complianceDeadlines.status} when ${complianceDeadlines.dueOn} < (now() at time zone 'Asia/Kolkata')::date then 'overdue' when ${complianceDeadlines.dueOn} <= (now() at time zone 'Asia/Kolkata')::date + 30 then 'due_soon' else 'upcoming' end`;
    const e = kitEntity({
      key: 'compliance-deadlines',
      module: 'governance',
      table: complianceDeadlines,
      subjectType: 'compliance_deadline',
      roles: { read: GOVERNANCE_ROLES, write: GOVERNANCE_ROLES },
      title: 'title',
      fields: {
        title: { label: 'Deadline', kind: 'text', column: complianceDeadlines.title, required: true, max: 200, example: 'AISHE DCF-II uploaded' },
        authority: { label: 'Authority', kind: 'select', column: complianceDeadlines.authority, options: choices(AUTHORITIES, { ugc: 'UGC', aicte: 'AICTE', naac: 'NAAC', nirf: 'NIRF', aishe: 'AISHE', nba: 'NBA', income_tax: 'Income tax', epfo: 'EPFO' }), required: true, bulk: true, example: 'aishe' },
        dueOn: { label: 'Due on', kind: 'date', column: complianceDeadlines.dueOn, required: true, example: '2027-01-31' },
        recurrence: { label: 'Repeats', kind: 'select', column: complianceDeadlines.recurrence, options: choices(RECURRENCES), required: true, bulk: true, example: 'annual' },
        ownerUserId: { label: 'Owner', kind: 'user', column: complianceDeadlines.ownerUserId, bulk: true },
        reference: { label: 'Reference (portal id, letter)', kind: 'text', column: complianceDeadlines.reference, max: 200 },
        note: { label: 'Note', kind: 'textarea', column: complianceDeadlines.note, max: 2000 },
      },
      extra: {
        status: complianceDeadlines.status,
        state,
        daysLeft: sql<number>`(${complianceDeadlines.dueOn} - (now() at time zone 'Asia/Kolkata')::date)`,
        completedOn: complianceDeadlines.completedOn,
        remindDays: sql<string>`array_to_string(${complianceDeadlines.remindDays}, ', ')`,
        remindersSent: complianceDeadlines.remindersSent,
        frameworkKey: complianceDeadlines.frameworkKey,
      },
      filters: { state: { label: 'State', options: choices(['overdue', 'due_soon', 'upcoming', 'done', 'missed', 'waived']), where: (v) => (['overdue', 'due_soon', 'upcoming', 'done', 'missed', 'waived'].includes(v) ? sql`${state} = ${v}` : undefined) } },
      sorts: { dueOn: complianceDeadlines.dueOn, state },
      search: [complianceDeadlines.title, complianceDeadlines.reference],
      defaultSort: { id: 'dueOn', dir: 'asc' },
      importKey: ['title', 'dueOn'],
      defaults: (ctx) => ({ createdBy: ctx.p.userId }),
      exportExtra: [
        { key: 'status', header: 'Status' },
        { key: 'completedOn', header: 'Done on' },
        { key: 'remindDays', header: 'Reminders (days before)' },
      ],
      actions: {
        done: {
          label: 'Mark done',
          inputs: [{ key: 'note', label: 'Reference or acknowledgement number', type: 'text' }],
          params: z.object({ note: z.string().trim().max(200).optional() }),
          apply: async (ctx, id, raw) => {
            const { note } = parseParams(z.object({ note: z.string().trim().max(200).optional() }), raw);
            const msg = await this.completeDeadline(ctx, id, note ?? '', await today(ctx, clock));
            return msg;
          },
        },
        waive: { label: 'Not applicable', tone: 'danger', inputs: [{ key: 'note', label: 'Why it does not apply', type: 'textarea', required: true }], params: Note(5, 'Say why'), apply: async (ctx, id, raw) => {
          const { note } = parseParams(Note(5, 'Say why'), raw);
          const r = await rowOf(ctx, complianceDeadlines, id);
          if (r.status !== 'pending') throw new ConflictException('Only a pending deadline can be waived');
          await ctx.tx.update(complianceDeadlines).set({ status: 'waived', note: [String(r.note ?? ''), note].filter(Boolean).join('\n') }).where(eq(complianceDeadlines.id, id));
          await auditUser(ctx.tx, ctx.p, 'compliance.waived', 'compliance_deadline', id, {});
        } },
        reopen: { label: 'Reopen', apply: async (ctx, id) => {
          const r = await rowOf(ctx, complianceDeadlines, id);
          if (r.status === 'pending') throw new ConflictException('It is already open');
          if (r.nextId ?? r.next_id) throw new ConflictException('The next occurrence was created from this one; reopen that instead');
          await ctx.tx.update(complianceDeadlines).set({ status: 'pending', completedOn: null }).where(eq(complianceDeadlines.id, id));
          await auditUser(ctx.tx, ctx.p, 'compliance.reopened', 'compliance_deadline', id, {});
        } },
      },
    });
    blanks(e, { reference: 200, note: 2000 });
    return e;
  }

  /** Marks a deadline done; a recurring one gets its next occurrence (once). Shared with the calendar endpoint. */
  async completeDeadline(ctx: KitCtx, id: string, reference: string, day: string): Promise<string> {
    const [r] = await ctx.tx.select().from(complianceDeadlines).where(eq(complianceDeadlines.id, id)).for('update');
    if (!r) throw new BadRequestException('Deadline not found');
    if (r.status !== 'pending') throw new ConflictException('This deadline is not open');
    let nextId: string | null = null;
    const nextDue = nextOccurrence(r.dueOn, r.recurrence as Recurrence);
    if (nextDue) {
      const [n] = await ctx.tx
        .insert(complianceDeadlines)
        .values({ tenantId: r.tenantId, title: r.title, authority: r.authority, frameworkKey: r.frameworkKey, dueOn: nextDue, recurrence: r.recurrence, ownerUserId: r.ownerUserId, remindDays: r.remindDays, note: '', createdBy: ctx.p.userId })
        .returning({ id: complianceDeadlines.id });
      nextId = n.id;
    }
    await ctx.tx.update(complianceDeadlines).set({ status: 'done', completedOn: day, reference: reference || r.reference, nextId }).where(eq(complianceDeadlines.id, id));
    await auditUser(ctx.tx, ctx.p, 'compliance.done', 'compliance_deadline', id, { onTime: day <= r.dueOn, nextDue });
    return nextDue ? `Done; next due ${nextDue}` : 'Done';
  }

  // ---- disclosure lines -------------------------------------------------------------------------------------------

  private disclosure(): RecordEntity {
    const e = kitEntity({
      key: 'disclosure-items',
      module: 'governance',
      table: disclosureItems,
      subjectType: 'disclosure_item',
      roles: { read: GOVERNANCE_ROLES, write: GOVERNANCE_ROLES },
      title: 'label',
      fields: {
        section: { label: 'Section', kind: 'select', column: disclosureItems.section, options: choices(['about', 'approvals', 'governance', 'academics', 'fees', 'infrastructure', 'other']), required: true, bulk: true, example: 'approvals' },
        label: { label: 'Item', kind: 'text', column: disclosureItems.label, required: true, max: 200, example: 'AICTE permanent id' },
        value: { label: 'Value', kind: 'textarea', column: disclosureItems.value, max: 4000, example: '1-1234567890' },
        url: { label: 'Link to the document', kind: 'text', column: disclosureItems.url, max: 500 },
        public: { label: 'Shown publicly', kind: 'boolean', column: disclosureItems.public, bulk: true },
      },
      extra: { sortOrder: disclosureItems.sortOrder, updatedAt: sql<string>`to_char(${disclosureItems.updatedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')` },
      defaults: (ctx) => ({ updatedBy: ctx.p.userId }),
      defaultSort: { id: 'section', dir: 'asc' },
      importKey: ['section', 'label'],
      order: { column: disclosureItems.sortOrder },
    });
    blanks(e, { value: 4000, url: 500 });
    e.check = async (ctx, id) => {
      const r = await rowOf(ctx, disclosureItems, id);
      const url = String(r.url ?? '');
      if (url && !/^https?:\/\//.test(url)) throw new BadRequestException('A link starts with http:// or https://');
      await ctx.tx.update(disclosureItems).set({ updatedAt: clockNow(this.clock), updatedBy: ctx.p.userId }).where(eq(disclosureItems.id, id));
    };
    return e;
  }
}

const clockNow = (c: Clock) => c.now();
