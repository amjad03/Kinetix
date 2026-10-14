import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { APPLICATION_MOVES, ENQUIRY_SOURCES, ENQUIRY_STAGES, NATIONALITIES, type ApplicationStatus, type EnquirySource, type EnquiryStage } from '@kinetix/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { programOptions } from '../../admin/structure.records.js';
import { normalizePhone } from '../../auth/phone.js';
import type { RoleName } from '../../auth/principal.js';
import { Phone } from '../../common/zod-fields.js';
import { admissionAssignmentRules, admissionCustodyItems, admissionRefundSlabs, admissionRequests } from '../../db/schema-sis.js';
import {
  academicYears,
  admissionAgents,
  admissionCampaigns,
  admissionCycles,
  admissionInterviews,
  applications,
  enquiries,
  entranceQuestions,
  programs,
  userRoles,
  users,
} from '../../db/schema.js';
import { fail, lc, outcome, required } from '../../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../../records/entity.js';
import { copyName, DateText, Int, OptionalRef, OptionalText, Ref, Text, uuidEq } from '../../records/helpers.js';
import { eachRow } from '../../records/import.js';
import { ADMISSIONS_ROLES } from '../admissions.controller.js';
import { AdmissionsService, hashToken, newToken } from '../admissions.service.js';
import { AgentsService } from '../agents.service.js';
import { EnquiriesService } from '../enquiries.service.js';
import { InterviewsService } from '../interviews.service.js';
import { APPROVER_ROLES, DeskService } from './desk.service.js';

const cap = (v: string) => v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const opts = (values: readonly string[], label: (v: string) => string = cap): FieldOption[] => values.map((v) => ({ value: v, label: label(v) }));
const SOURCE_LABELS: Record<string, string> = { web: 'Website', walk_in: 'Walk-in', phone: 'Phone', campaign: 'Campaign', referral: 'Referral', import: 'Import', whatsapp: 'WhatsApp', fair: 'Education fair', meta: 'Meta lead ad', google: 'Google lead form', email: 'Email' };
const SOURCES = opts(ENQUIRY_SOURCES, (v) => SOURCE_LABELS[v] ?? cap(v));
const STAGES = opts(ENQUIRY_STAGES);
const APP_STATUSES = opts(Object.keys(APPLICATION_MOVES));
const QUOTAS = opts(['merit', 'management', 'nri', 'sports', 'pwd', 'other']);
const ADMISSION_TYPES = opts(['regular', 'lateral', 'transfer']);
const NATIONALITY_OPTS = opts(NATIONALITIES, (v) => (v === 'nri' ? 'NRI' : cap(v)));
const GENDERS = opts(['female', 'male', 'other']);
const YES_NO: FieldOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
const rupees = z.coerce.number().min(0).max(100_000_000);
const toPaise = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const yesNo = (col: unknown) => (v: string) => (v === 'yes' ? sql`${col} = true` : v === 'no' ? sql`${col} = false` : undefined);

/** Staff who may own an enquiry: the admissions office, counsellors, the principal and the administrator. */
async function counsellorOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const list = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.role, ['admissions_officer', 'counsellor', 'principal', 'tenant_admin']), eq(users.status, 'active')))
    .orderBy(asc(users.fullName));
  return list.map((u) => ({ value: u.id, label: u.name }));
}

async function cycleOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const list = await ctx.tx.select({ id: admissionCycles.id, name: admissionCycles.name, year: academicYears.label }).from(admissionCycles).innerJoin(academicYears, eq(academicYears.id, admissionCycles.academicYearId)).orderBy(asc(academicYears.label), asc(admissionCycles.name));
  return list.map((c) => ({ value: c.id, label: c.name, group: c.year }));
}

async function yearOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const list = await ctx.tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).orderBy(asc(academicYears.startsOn));
  return list.map((y) => ({ value: y.id, label: y.label }));
}

async function campaignOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const list = await ctx.tx.select({ id: admissionCampaigns.id, name: admissionCampaigns.name }).from(admissionCampaigns).orderBy(asc(admissionCampaigns.name));
  return list.map((c) => ({ value: c.id, label: c.name }));
}

/** Names, emails or phones of counsellors (comma separated) → their user ids; unknown ones are refused. */
async function counsellorIdsFrom(ctx: KitCtx, text: string): Promise<string[]> {
  const wanted = [...new Set(text.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];
  const all = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName, email: users.email, phone: users.phone })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.role, ['admissions_officer', 'counsellor', 'principal', 'tenant_admin']), eq(users.status, 'active')));
  return wanted.map((w) => {
    const hit = all.find((u) => u.id === w || lc(u.name) === lc(w) || (u.email && lc(u.email) === lc(w)) || (u.phone && u.phone === normalizePhone(w)));
    if (!hit) throw new BadRequestException(`${w} is not an active admissions officer or counsellor`);
    return hit.id;
  });
}

/**
 * The admissions lists as record kit entities: enquiries (assign, message, mark lost, import), applications (review,
 * reject, reopen, withdraw; counter applications and their import), cycles, campaigns, agents, interviews, entrance
 * questions, counsellor assignment rules, approval requests, refund slabs and the original-certificate custody register.
 */
@Injectable()
export class AdmissionsDeskRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly admissions: AdmissionsService,
    private readonly enquiriesSvc: EnquiriesService,
    private readonly agents: AgentsService,
    private readonly interviews: InterviewsService,
    private readonly desk: DeskService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.enquiries(), this.applications(), this.cycles(), this.campaigns(), this.agentsEntity(), this.interviewsEntity(), this.questions(), this.rules(), this.requests(), this.slabs(), this.custody()]) this.registry.register(e);
  }

  private actor = (ctx: KitCtx) => ({ tenantId: ctx.p.tenantId, userId: ctx.p.userId });

  // ---- enquiries -----------------------------------------------------------------------------------------

  enquiries(): RecordEntity {
    const e = enquiries;
    const counsellor = alias(users, 'counsellor');
    const lastActivity = sql<string | null>`(select max(a.created_at) from enquiry_activities a where a.enquiry_id = ${e.id})`;
    const activities = sql<number>`(select count(*)::int from enquiry_activities a where a.enquiry_id = ${e.id})`;
    return {
      key: 'enquiries',
      module: 'admissions',
      table: e,
      subjectType: 'enquiry',
      roles: { read: [...ADMISSIONS_ROLES, 'counsellor'], write: [...ADMISSIONS_ROLES, 'counsellor'] },
      label: (r) => `${r.name} (${r.phone})`,
      list: {
        select: {
          id: e.id,
          name: e.name,
          phone: e.phone,
          email: e.email,
          programId: e.programId,
          programName: programs.name,
          source: e.source,
          stage: e.stage,
          counsellorId: e.counsellorId,
          counsellorName: counsellor.fullName,
          campaignId: e.campaignId,
          campaignName: admissionCampaigns.name,
          agentName: admissionAgents.name,
          city: e.city,
          region: e.region,
          leadScore: e.leadScore,
          nextFollowUpOn: e.nextFollowUpOn,
          lostReason: e.lostReason,
          message: e.message,
          utmSource: e.utmSource,
          utmMedium: e.utmMedium,
          utmCampaign: e.utmCampaign,
          applicationId: e.applicationId,
          mergedIntoId: e.mergedIntoId,
          activities,
          lastActivity,
          createdAt: e.createdAt,
        },
        joins: (q) => q.leftJoin(programs, eq(programs.id, e.programId)).leftJoin(counsellor, eq(counsellor.id, e.counsellorId)).leftJoin(admissionCampaigns, eq(admissionCampaigns.id, e.campaignId)).leftJoin(admissionAgents, eq(admissionAgents.id, e.agentId)),
        search: [e.name, e.phone, e.email, e.city],
        filters: {
          stage: { label: 'Stage', options: STAGES, where: (v) => ((ENQUIRY_STAGES as readonly string[]).includes(v) ? eq(e.stage, v as EnquiryStage) : undefined) },
          source: { label: 'Source', options: SOURCES, where: (v) => ((ENQUIRY_SOURCES as readonly string[]).includes(v) ? eq(e.source, v as EnquirySource) : undefined) },
          counsellor: { label: 'Counsellor', options: async (ctx) => [{ value: 'none', label: 'Unassigned' }, ...(await counsellorOptions(ctx))], where: (v) => (v === 'none' ? sql`${e.counsellorId} is null` : uuidEq(e.counsellorId, v)) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(e.programId, v) },
          campaign: { label: 'Campaign', options: campaignOptions, where: (v) => uuidEq(e.campaignId, v) },
          followUp: {
            label: 'Follow-up',
            options: [
              { value: 'due', label: 'Due today or overdue' },
              { value: 'none', label: 'No follow-up set' },
            ],
            where: (v) => (v === 'due' ? sql`${e.nextFollowUpOn} <= current_date and ${e.stage} not in ('converted', 'lost')` : v === 'none' ? sql`${e.nextFollowUpOn} is null and ${e.stage} not in ('converted', 'lost')` : undefined),
          },
        },
        sorts: { created: e.createdAt, name: e.name, stage: e.stage, score: e.leadScore, followUp: e.nextFollowUpOn, counsellor: counsellor.fullName, programme: programs.name, lastActivity },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: e.name, required: true },
        phone: { label: 'Phone', type: 'phone', schema: Phone, column: e.phone, required: true },
        email: { label: 'Email', type: 'email', schema: z.union([z.email().max(200), z.literal('')]).nullable().transform((v) => v || null), column: e.email },
        programId: { label: 'Programme', type: 'select', schema: OptionalRef, column: e.programId, options: programOptions, bulk: true },
        source: { label: 'Source', type: 'select', schema: z.enum(ENQUIRY_SOURCES), column: e.source, options: SOURCES, required: true },
        city: { label: 'City or town', type: 'text', schema: OptionalText(80), column: e.city, bulk: true },
        region: { label: 'District or state', type: 'text', schema: OptionalText(80), column: e.region, bulk: true },
        counsellorId: {
          label: 'Counsellor',
          type: 'select',
          schema: OptionalRef,
          options: counsellorOptions,
          bulk: true,
          help: 'Left empty, the assignment rules choose',
          apply: async (ctx, id, v) => void (await this.enquiriesSvc.assign(ctx.tx, this.actor(ctx), id, (v as string | null) ?? null)),
        },
        nextFollowUpOn: { label: 'Next follow-up', type: 'date', schema: DateText, column: e.nextFollowUpOn, bulk: true },
        stage: {
          label: 'Stage',
          type: 'select',
          schema: z.enum(ENQUIRY_STAGES),
          options: STAGES.filter((s) => s.value !== 'converted' && s.value !== 'lost'),
          create: false,
          bulk: true,
          help: 'Converted comes from enrolment; use Mark lost with a reason',
          apply: async (ctx, id, v) => {
            const [cur] = await ctx.tx.select({ stage: e.stage }).from(e).where(eq(e.id, id));
            if (cur?.stage !== v) await this.enquiriesSvc.moveStage(ctx.tx, this.actor(ctx), id, v as EnquiryStage);
          },
        },
        message: { label: 'What they asked', type: 'textarea', schema: OptionalText(1000), column: e.message },
      },
      create: async (ctx, v) => {
        const res = await this.enquiriesSvc.create(
          ctx.tx,
          this.actor(ctx),
          { name: String(v.name), phone: String(v.phone), email: (v.email as string | null) ?? null, programId: (v.programId as string | null) ?? null, source: v.source as EnquirySource, message: (v.message as string | null) ?? null, counsellorId: (v.counsellorId as string | null) ?? null, nextFollowUpOn: (v.nextFollowUpOn as string | null) ?? null, city: (v.city as string | null) ?? null, region: (v.region as string | null) ?? null },
          await this.admissions.today(ctx.tx),
        );
        return res.enquiry.id;
      },
      move: {
        label: 'Reassign to counsellor',
        options: counsellorOptions,
        apply: async (ctx, id, to) => void (await this.enquiriesSvc.assign(ctx.tx, this.actor(ctx), id, to)),
      },
      actions: {
        message: {
          label: 'Send a message',
          params: z.object({ templateId: z.uuid() }),
          apply: (ctx, id, p) => this.desk.messageEnquiry(ctx.tx, this.actor(ctx), id, (p as { templateId: string }).templateId),
        },
        lost: {
          label: 'Mark lost',
          tone: 'danger',
          params: z.object({ reason: z.string({ error: 'Say why the enquiry was lost' }).trim().min(3, 'Say why the enquiry was lost').max(500) }),
          apply: async (ctx, id, p) => void (await this.enquiriesSvc.moveStage(ctx.tx, this.actor(ctx), id, 'lost', (p as { reason: string }).reason)),
        },
      },
      remove: {
        guard: async (ctx, id) => {
          const [r] = await ctx.tx.select({ stage: e.stage }).from(e).where(eq(e.id, id));
          return r?.stage === 'converted' ? 'This enquiry became an admission and stays on record' : null;
        },
      },
      columns: [
        { key: 'createdAt', header: 'Received' },
        { key: 'name', header: 'Name' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
        { key: 'programName', header: 'Programme' },
        { key: 'source', header: 'Source', value: (r) => SOURCE_LABELS[String(r.source)] ?? String(r.source) },
        { key: 'stage', header: 'Stage' },
        { key: 'counsellorName', header: 'Counsellor' },
        { key: 'nextFollowUpOn', header: 'Next follow-up' },
        { key: 'leadScore', header: 'Lead score' },
        { key: 'city', header: 'City' },
        { key: 'region', header: 'District or state' },
        { key: 'campaignName', header: 'Campaign' },
        { key: 'agentName', header: 'Agent' },
        { key: 'utmSource', header: 'UTM source' },
        { key: 'utmMedium', header: 'UTM medium' },
        { key: 'utmCampaign', header: 'UTM campaign' },
        { key: 'lostReason', header: 'Lost because' },
        { key: 'activities', header: 'Follow-ups logged' },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Name', required: true, example: 'Kavya Rao' },
          { key: 'phone', header: 'Phone', required: true, help: 'The same phone and programme twice is one enquiry', example: '+919900000301' },
          { key: 'email', header: 'Email' },
          { key: 'programme', header: 'Programme', help: 'As named in the institution', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
          { key: 'source', header: 'Source', options: [...ENQUIRY_SOURCES], help: 'Default: import', example: 'fair' },
          { key: 'city', header: 'City or town' },
          { key: 'region', header: 'District or state' },
          { key: 'counsellor_email', header: 'Counsellor email', help: 'Left empty, the assignment rules choose' },
          { key: 'follow_up_on', header: 'Next follow-up', help: 'Like 2026-10-20' },
          { key: 'message', header: 'What they asked' },
        ],
        key: ['phone'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: e.id }).from(e).where(and(eq(e.phone, normalizePhone(r.get('phone'))), sql`${e.stage} not in ('converted', 'lost')`)).limit(1))[0],
        run: async (ctx, rows) => {
          const progs = await programOptions(ctx);
          const today = await this.admissions.today(ctx.tx);
          return eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'name');
            const phone = normalizePhone(required(r, 'phone'));
            if (!/^\+\d{8,15}$/.test(phone)) fail('Enter a valid mobile number', r.get('phone'));
            const prog = r.get('programme') ? progs.find((p) => lc(p.label) === lc(r.get('programme'))) : undefined;
            if (r.get('programme') && !prog) fail('No programme with this name', r.get('programme'));
            const source = (lc(r.get('source')) || 'import') as EnquirySource;
            if (!(ENQUIRY_SOURCES as readonly string[]).includes(source)) fail('Choose one of the listed values', r.get('source'));
            let counsellorId: string | null = null;
            if (r.get('counsellor_email')) {
              const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.email, lc(r.get('counsellor_email'))));
              if (!u) fail('No member of staff with this email or phone', r.get('counsellor_email'));
              counsellorId = u!.id;
            }
            const followUp = r.get('follow_up_on');
            if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) fail('Use a date like 2026-10-15', followUp);
            const res = await this.enquiriesSvc.create(tx, this.actor({ tx, p: ctx.p }), { name, phone, email: r.get('email') || null, programId: prog?.value ?? null, source, counsellorId, nextFollowUpOn: followUp || null, message: r.get('message') || null, city: r.get('city') || null, region: r.get('region') || null }, today);
            return outcome(!res.duplicate, false, [name, res.duplicate ? 'already an open enquiry: noted on it' : '']);
          });
        },
      },
    };
  }

  // ---- applications ------------------------------------------------------------------------------------------

  applications(): RecordEntity {
    const a = applications;
    const docsPending = sql<number>`(select count(*)::int from application_documents d where d.application_id = ${a.id} and d.status <> 'verified')`;
    const setStatus = (to: ApplicationStatus, reasonRequired = false) => ({
      params: reasonRequired ? z.object({ reason: z.string({ error: 'Give a reason' }).trim().min(3, 'Give a reason').max(500) }) : z.object({ reason: z.string().trim().max(500).optional() }),
      apply: async (ctx: KitCtx, id: string, p: unknown) => void (await this.admissions.setStatus(ctx.tx, this.actor(ctx), id, to, (p as { reason?: string }).reason ?? null)),
    });
    return {
      key: 'applications',
      module: 'admissions',
      table: a,
      subjectType: 'application',
      roles: { read: ADMISSIONS_ROLES, write: ADMISSIONS_ROLES },
      label: (r) => `${r.applicationNo} ${r.applicantName}`,
      list: {
        select: {
          id: a.id,
          applicationNo: a.applicationNo,
          applicantName: a.applicantName,
          dateOfBirth: a.dateOfBirth,
          gender: a.gender,
          phone: a.phone,
          email: a.email,
          guardianName: a.guardianName,
          guardianPhone: a.guardianPhone,
          guardianEmail: a.guardianEmail,
          guardianRelation: a.guardianRelation,
          cycleId: a.cycleId,
          cycleName: admissionCycles.name,
          programName: programs.name,
          status: a.status,
          statusReason: a.statusReason,
          feeStatus: a.feeStatus,
          category: a.category,
          quota: a.quota,
          admissionType: a.admissionType,
          entryTermOverride: a.entryTermOverride,
          nationality: a.nationality,
          meritScore: a.meritScore,
          meritRank: a.meritRank,
          docsPending,
          studentId: a.studentId,
          submittedAt: a.submittedAt,
        },
        joins: (q) => q.innerJoin(admissionCycles, eq(admissionCycles.id, a.cycleId)).innerJoin(programs, eq(programs.id, admissionCycles.programId)),
        search: [a.applicantName, a.applicationNo, a.phone, a.guardianPhone, a.email],
        filters: {
          cycle: { label: 'Cycle', options: cycleOptions, where: (v) => uuidEq(a.cycleId, v) },
          status: { label: 'Status', options: APP_STATUSES, where: (v) => (Object.keys(APPLICATION_MOVES).includes(v) ? eq(a.status, v as ApplicationStatus) : undefined) },
          fee: { label: 'Application fee', options: opts(['none', 'pending', 'paid', 'waived']), where: (v) => (['none', 'pending', 'paid', 'waived'].includes(v) ? eq(a.feeStatus, v as 'none') : undefined) },
          quota: { label: 'Quota', options: QUOTAS, where: (v) => eq(a.quota, v) },
          admissionType: { label: 'Admission type', options: ADMISSION_TYPES, where: (v) => eq(a.admissionType, v) },
          nationality: { label: 'Nationality', options: NATIONALITY_OPTS, where: (v) => eq(a.nationality, v) },
          documents: { label: 'Documents', options: [{ value: 'pending', label: 'Documents to verify' }], where: (v) => (v === 'pending' ? sql`${docsPending} > 0` : undefined) },
        },
        sorts: { submitted: a.submittedAt, name: a.applicantName, number: a.applicationNo, status: a.status, merit: a.meritScore, rank: a.meritRank, cycle: admissionCycles.name },
        defaultSort: { id: 'submitted', dir: 'desc' },
      },
      fields: {
        cycleId: { label: 'Cycle', type: 'select', schema: Ref, options: cycleOptions, required: true, edit: false, help: 'To change the programme later, raise a programme change' },
        applicantName: { label: 'Applicant name', type: 'text', schema: Text(120), column: a.applicantName, required: true },
        dateOfBirth: { label: 'Date of birth', type: 'date', schema: DateText, column: a.dateOfBirth },
        gender: { label: 'Gender', type: 'select', schema: z.enum(['female', 'male', 'other']).nullable(), column: a.gender, options: GENDERS },
        phone: { label: 'Phone', type: 'phone', schema: Phone, column: a.phone, required: true },
        email: { label: 'Email', type: 'email', schema: z.union([z.email().max(200), z.literal('')]).nullable().transform((v) => v || null), column: a.email },
        guardianName: { label: 'Guardian name', type: 'text', schema: Text(120), column: a.guardianName, required: true },
        guardianPhone: { label: 'Guardian phone', type: 'phone', schema: Phone, column: a.guardianPhone, required: true },
        guardianRelation: { label: 'Guardian relation', type: 'select', schema: z.enum(['father', 'mother', 'guardian', 'parent', 'grandparent', 'sibling']), column: a.guardianRelation, options: opts(['father', 'mother', 'guardian', 'parent', 'grandparent', 'sibling']) },
        category: { label: 'Seat category', type: 'text', schema: OptionalText(40), column: a.category, bulk: true, help: 'GEN, OBC, SC, ST, EWS or the quota category' },
        nationality: { label: 'Nationality', type: 'select', schema: z.enum(NATIONALITIES), options: NATIONALITY_OPTS, bulk: true, apply: async (ctx, id, v) => void (await this.desk.setAdmissionKind(ctx.tx, this.actor(ctx), id, { nationality: String(v) })) },
        admissionType: { label: 'Admission type', type: 'select', schema: z.enum(['regular', 'lateral', 'transfer']), options: ADMISSION_TYPES, apply: async (ctx, id, v) => void (await this.desk.setAdmissionKind(ctx.tx, this.actor(ctx), id, { admissionType: String(v) })) },
        entryTermOverride: { label: 'Joins in term', type: 'number', schema: Int(1, 20).nullable(), create: false, help: 'For a lateral or transfer admission', apply: async (ctx, id, v) => void (await this.desk.setAdmissionKind(ctx.tx, this.actor(ctx), id, { entryTermOverride: (v as number | null) ?? null })) },
      },
      create: (ctx, v) => this.counterApplication(ctx, v),
      actions: {
        review: { label: 'Start review', ...setStatus('under_review') },
        reject: { label: 'Reject', tone: 'danger', ...setStatus('rejected', true) },
        reopen: {
          label: 'Reopen for review',
          params: z.object({ reason: z.string({ error: 'Give a reason' }).trim().min(3, 'Give a reason').max(500) }),
          apply: async (ctx, id, p) => {
            const [cur] = await ctx.tx.select({ status: a.status }).from(a).where(eq(a.id, id));
            if (cur?.status !== 'rejected' && cur?.status !== 'ineligible') throw new BadRequestException('Only a rejected or ineligible application can be reopened');
            await this.admissions.setStatus(ctx.tx, this.actor(ctx), id, 'under_review', `Reopened: ${(p as { reason: string }).reason}`);
          },
        },
        withdraw: { label: 'Withdraw', tone: 'danger', ...setStatus('withdrawn', true) },
      },
      remove: {
        guard: async (ctx, id) => {
          const [r] = await ctx.tx.select({ status: a.status }).from(a).where(eq(a.id, id));
          return r?.status === 'enrolled' ? 'This applicant is enrolled: cancel the admission instead' : null;
        },
      },
      columns: [
        { key: 'applicationNo', header: 'Application no' },
        { key: 'applicantName', header: 'Applicant' },
        { key: 'dateOfBirth', header: 'Date of birth' },
        { key: 'gender', header: 'Gender' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
        { key: 'guardianName', header: 'Guardian' },
        { key: 'guardianPhone', header: 'Guardian phone' },
        { key: 'cycleName', header: 'Cycle' },
        { key: 'programName', header: 'Programme' },
        { key: 'status', header: 'Status' },
        { key: 'feeStatus', header: 'Application fee' },
        { key: 'category', header: 'Category' },
        { key: 'quota', header: 'Quota' },
        { key: 'admissionType', header: 'Admission type' },
        { key: 'nationality', header: 'Nationality' },
        { key: 'meritScore', header: 'Merit score' },
        { key: 'meritRank', header: 'Merit rank' },
        { key: 'docsPending', header: 'Documents to verify' },
        { key: 'submittedAt', header: 'Submitted' },
      ],
      import: {
        columns: [
          { key: 'cycle', header: 'Cycle', required: true, help: 'The cycle as named', options: async (ctx) => (await cycleOptions(ctx)).map((o) => o.label) },
          { key: 'applicant_name', header: 'Applicant name', required: true, example: 'Kavya Rao' },
          { key: 'phone', header: 'Phone', required: true, example: '+919900000401' },
          { key: 'date_of_birth', header: 'Date of birth', example: '2008-06-15' },
          { key: 'gender', header: 'Gender', options: ['female', 'male', 'other'] },
          { key: 'email', header: 'Email' },
          { key: 'guardian_name', header: 'Guardian name', required: true, example: 'Ramesh Rao' },
          { key: 'guardian_phone', header: 'Guardian phone', required: true, example: '+919900000402' },
          { key: 'guardian_relation', header: 'Guardian relation', options: ['father', 'mother', 'guardian', 'parent', 'grandparent', 'sibling'] },
          { key: 'category', header: 'Seat category' },
          { key: 'nationality', header: 'Nationality', options: [...NATIONALITIES] },
          { key: 'admission_type', header: 'Admission type', options: ['regular', 'lateral', 'transfer'] },
        ],
        key: ['cycle', 'phone', 'applicant_name'],
        exists: async (ctx, r) => {
          const cyc = (await cycleOptions(ctx)).find((c) => lc(c.label) === lc(r.get('cycle')));
          if (!cyc) return false;
          return !!(await ctx.tx.select({ id: a.id }).from(a).where(and(eq(a.cycleId, cyc.value), eq(a.phone, normalizePhone(r.get('phone'))), sql`lower(${a.applicantName}) = ${lc(r.get('applicant_name'))}`)).limit(1))[0];
        },
        run: async (ctx, rows) => {
          const cycles = await cycleOptions(ctx);
          return eachRow(ctx.tx, rows, async (tx, r) => {
            const cyc = cycles.find((c) => lc(c.label) === lc(required(r, 'cycle')));
            if (!cyc) fail('No admission cycle with this name', r.get('cycle'));
            const name = required(r, 'applicant_name');
            const phone = normalizePhone(required(r, 'phone'));
            const [dup] = await tx.select({ id: a.id }).from(a).where(and(eq(a.cycleId, cyc!.value), eq(a.phone, phone), sql`lower(${a.applicantName}) = ${lc(name)}`)).limit(1);
            if (dup) return outcome(false, false, [name, 'already applied']);
            const gender = lc(r.get('gender'));
            if (gender && !['female', 'male', 'other'].includes(gender)) fail('Choose one of the listed values', gender);
            const nationality = lc(r.get('nationality')) || 'indian';
            if (!(NATIONALITIES as readonly string[]).includes(nationality)) fail('Choose one of the listed values', nationality);
            const type = lc(r.get('admission_type')) || 'regular';
            if (!['regular', 'lateral', 'transfer'].includes(type)) fail('Choose one of the listed values', type);
            const dob = r.get('date_of_birth');
            if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) fail('Use a date like 2026-10-15', dob);
            const gPhone = normalizePhone(required(r, 'guardian_phone'));
            if (!/^\+\d{8,15}$/.test(phone) || !/^\+\d{8,15}$/.test(gPhone)) fail('Enter a valid mobile number', r.get('phone'));
            await this.counterApplication({ tx, p: ctx.p }, { cycleId: cyc!.value, applicantName: name, phone, guardianName: required(r, 'guardian_name'), guardianPhone: gPhone, guardianRelation: lc(r.get('guardian_relation')) || 'parent', email: r.get('email') || null, gender: gender || null, dateOfBirth: dob || null, category: r.get('category') || null, nationality, admissionType: type });
            return outcome(true, false, [name, cyc!.label]);
          });
        },
      },
    };
  }

  /** An application taken at the counter (walk-in or a paper form), numbered in the cycle's series. */
  private async counterApplication(ctx: KitCtx, v: Record<string, unknown>): Promise<string> {
    const cycle = await this.admissions.cycle(ctx.tx, String(v.cycleId));
    if (cycle.status === 'draft') throw new BadRequestException('Open the cycle before taking applications');
    const applicationNo = await this.admissions.nextApplicationNo(ctx.tx, cycle);
    const [row] = await ctx.tx
      .insert(applications)
      .values({
        tenantId: ctx.p.tenantId,
        cycleId: cycle.id,
        applicationNo,
        applicantName: String(v.applicantName),
        dateOfBirth: (v.dateOfBirth as string | null) ?? null,
        gender: (v.gender as string | null) ?? null,
        phone: String(v.phone),
        email: (v.email as string | null) ?? null,
        guardianName: String(v.guardianName),
        guardianPhone: String(v.guardianPhone),
        guardianRelation: (v.guardianRelation as string | undefined) ?? 'parent',
        category: (v.category as string | null) ?? null,
        nationality: (v.nationality as string | undefined) ?? 'indian',
        admissionType: (v.admissionType as string | undefined) ?? 'regular',
        accessTokenHash: hashToken(newToken()),
        feeStatus: cycle.applicationFeePaise > 0 ? 'pending' : 'none',
      })
      .returning({ id: applications.id });
    return row.id;
  }

  // ---- cycles, campaigns, agents --------------------------------------------------------------------------------

  /** Cycles are added with their full setup (form, documents, rules: POST /v1/admissions/cycles); the list edits, opens, closes, duplicates and bins them. */
  cycles(): RecordEntity {
    const c = admissionCycles;
    const total = sql<number>`(select count(*)::int from applications a where a.cycle_id = ${c.id})`;
    const held = sql<number>`(select count(*)::int from applications a where a.cycle_id = ${c.id} and a.status in ('offered', 'accepted', 'enrolled'))`;
    const enrolled = sql<number>`(select count(*)::int from applications a where a.cycle_id = ${c.id} and a.status = 'enrolled')`;
    return {
      key: 'admission-cycles',
      module: 'admissions',
      table: c,
      subjectType: 'admission_cycle',
      roles: { read: ADMISSIONS_ROLES, write: ADMISSIONS_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: c.id, name: c.name, programId: c.programId, programName: programs.name, academicYearId: c.academicYearId, yearLabel: academicYears.label, status: c.status, entryTerm: c.entryTerm, seats: c.seats, opensOn: c.opensOn, closesOn: c.closesOn, feeRupees: sql<number>`(${c.applicationFeePaise} / 100.0)::float`, offerValidDays: c.offerValidDays, applications: total, held, enrolled },
        joins: (q) => q.innerJoin(programs, eq(programs.id, c.programId)).innerJoin(academicYears, eq(academicYears.id, c.academicYearId)),
        search: [c.name, programs.name],
        filters: {
          status: { label: 'Status', options: opts(['draft', 'open', 'closed']), where: (v) => (['draft', 'open', 'closed'].includes(v) ? eq(c.status, v as 'open') : undefined) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(c.programId, v) },
          year: { label: 'Academic year', options: yearOptions, where: (v) => uuidEq(c.academicYearId, v) },
        },
        sorts: { name: c.name, programme: programs.name, opens: c.opensOn, closes: c.closesOn, seats: c.seats, applications: total },
        defaultSort: { id: 'closes', dir: 'desc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: c.name, create: false },
        entryTerm: { label: 'Joins in term', type: 'number', schema: Int(1, 20), column: c.entryTerm, create: false },
        seats: { label: 'Seats', type: 'number', schema: Int(1, 10_000), create: false, apply: async (ctx, id, v) => void (await this.admissions.updateCycle(ctx.tx, this.actor(ctx), id, { seats: Number(v) })) },
        opensOn: { label: 'Opens on', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), create: false, apply: async (ctx, id, v) => void (await this.admissions.updateCycle(ctx.tx, this.actor(ctx), id, { opensOn: String(v) })) },
        closesOn: { label: 'Last date', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), create: false, help: 'The last date of admission (refunds count from it)', apply: async (ctx, id, v) => void (await this.admissions.updateCycle(ctx.tx, this.actor(ctx), id, { closesOn: String(v) })) },
        feeRupees: { label: 'Application fee (Rs)', type: 'number', schema: rupees, create: false, apply: async (ctx, id, v) => void (await this.admissions.updateCycle(ctx.tx, this.actor(ctx), id, { applicationFeePaise: toPaise(v) })) },
        offerValidDays: { label: 'Offer open for (days)', type: 'number', schema: Int(1, 60), column: c.offerValidDays, create: false, bulk: true },
        status: { label: 'Status', type: 'select', schema: z.enum(['draft', 'open', 'closed']), options: opts(['draft', 'open', 'closed']), create: false, bulk: true, apply: async (ctx, id, v) => void (await this.admissions.setCycleStatus(ctx.tx, this.actor(ctx), id, v as 'open')) },
      },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, c, c.name, String(row.name)), status: 'draft', created_by: ctx.p.userId }),
      columns: [
        { key: 'name', header: 'Cycle' },
        { key: 'programName', header: 'Programme' },
        { key: 'yearLabel', header: 'Year' },
        { key: 'status', header: 'Status' },
        { key: 'entryTerm', header: 'Joins in term' },
        { key: 'seats', header: 'Seats' },
        { key: 'held', header: 'Seats offered or taken' },
        { key: 'enrolled', header: 'Enrolled' },
        { key: 'applications', header: 'Applications' },
        { key: 'opensOn', header: 'Opens on' },
        { key: 'closesOn', header: 'Last date' },
        { key: 'feeRupees', header: 'Application fee (Rs)' },
      ],
    };
  }

  campaigns(): RecordEntity {
    const c = admissionCampaigns;
    const leads = sql<number>`(select count(*)::int from enquiries e where e.campaign_id = ${c.id})`;
    const won = sql<number>`(select count(*)::int from enquiries e where e.campaign_id = ${c.id} and e.stage = 'converted')`;
    return {
      key: 'admission-campaigns',
      module: 'admissions',
      table: c,
      subjectType: 'admission_campaign',
      roles: { read: ADMISSIONS_ROLES, write: ADMISSIONS_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: c.id, name: c.name, channel: c.channel, utmSource: c.utmSource, utmMedium: c.utmMedium, utmCampaign: c.utmCampaign, startsOn: c.startsOn, endsOn: c.endsOn, budgetRupees: sql<number>`(${c.budgetPaise} / 100.0)::float`, active: c.active, leads, enrolled: won, costPerLeadRupees: sql<number | null>`case when ${leads} > 0 then round(${c.budgetPaise} / 100.0 / ${leads}, 2)::float end`, costPerAdmissionRupees: sql<number | null>`case when ${won} > 0 then round(${c.budgetPaise} / 100.0 / ${won}, 2)::float end` },
        search: [c.name, c.channel, c.utmCampaign],
        filters: { active: { label: 'Running', options: YES_NO, where: yesNo(c.active) }, channel: { label: 'Channel', options: async (ctx) => (await ctx.tx.selectDistinct({ ch: c.channel }).from(c).orderBy(c.channel)).map((x) => ({ value: x.ch, label: x.ch })), where: (v) => eq(c.channel, v) } },
        sorts: { name: c.name, starts: c.startsOn, budget: c.budgetPaise, leads, enrolled: won },
        defaultSort: { id: 'starts', dir: 'desc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: c.name, required: true },
        channel: { label: 'Channel', type: 'text', schema: Text(60), column: c.channel, required: true, bulk: true, help: 'Newspaper, Meta, Google, fair, hoardings…' },
        utmSource: { label: 'UTM source', type: 'text', schema: OptionalText(80), column: c.utmSource },
        utmMedium: { label: 'UTM medium', type: 'text', schema: OptionalText(80), column: c.utmMedium },
        utmCampaign: { label: 'UTM campaign', type: 'text', schema: OptionalText(80), column: c.utmCampaign, help: 'Enquiries arriving with this tag are counted here' },
        startsOn: { label: 'Starts on', type: 'date', schema: DateText, column: c.startsOn },
        endsOn: { label: 'Ends on', type: 'date', schema: DateText, column: c.endsOn, bulk: true },
        budgetRupees: { label: 'Spend (Rs)', type: 'number', schema: rupees, apply: async (ctx, id, v) => void (await ctx.tx.update(c).set({ budgetPaise: toPaise(v) }).where(eq(c.id, id))) },
        active: { label: 'Running', type: 'boolean', schema: z.boolean(), column: c.active, bulk: true },
      },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, c, c.name, String(row.name)), utm_campaign: null, created_by: ctx.p.userId }),
      columns: [
        { key: 'name', header: 'Campaign' },
        { key: 'channel', header: 'Channel' },
        { key: 'startsOn', header: 'Starts on' },
        { key: 'endsOn', header: 'Ends on' },
        { key: 'budgetRupees', header: 'Spend (Rs)' },
        { key: 'leads', header: 'Enquiries' },
        { key: 'enrolled', header: 'Enrolled' },
        { key: 'costPerLeadRupees', header: 'Cost per enquiry (Rs)' },
        { key: 'costPerAdmissionRupees', header: 'Cost per admission (Rs)' },
        { key: 'utmSource', header: 'UTM source' },
        { key: 'utmMedium', header: 'UTM medium' },
        { key: 'utmCampaign', header: 'UTM campaign' },
        { key: 'active', header: 'Running' },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Name', required: true, help: 'Rows are matched on it', example: 'Deccan Herald June' },
          { key: 'channel', header: 'Channel', required: true, example: 'Newspaper' },
          { key: 'starts_on', header: 'Starts on', example: '2026-06-01' },
          { key: 'ends_on', header: 'Ends on' },
          { key: 'spend', header: 'Spend (Rs)', example: '45000' },
          { key: 'utm_campaign', header: 'UTM campaign' },
        ],
        key: ['name'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: c.id }).from(c).where(sql`lower(${c.name}) = ${lc(r.get('name'))}`).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'name');
            const spend = r.get('spend') ? Number(r.get('spend').replace(/,/g, '')) : 0;
            if (!Number.isFinite(spend) || spend < 0) fail('This value is not valid', r.get('spend'));
            for (const k of ['starts_on', 'ends_on']) if (r.get(k) && !/^\d{4}-\d{2}-\d{2}$/.test(r.get(k))) fail('Use a date like 2026-10-15', r.get(k));
            const values = { channel: required(r, 'channel'), startsOn: r.get('starts_on') || null, endsOn: r.get('ends_on') || null, budgetPaise: Math.round(spend * 100), utmCampaign: r.get('utm_campaign') || null };
            const [found] = await tx.select().from(c).where(sql`lower(${c.name}) = ${lc(name)}`);
            if (!found) {
              await tx.insert(c).values({ tenantId: ctx.p.tenantId, name, ...values, createdBy: ctx.p.userId });
              return outcome(true, false, [name]);
            }
            await tx.update(c).set(values).where(eq(c.id, found.id));
            return outcome(false, true, [name]);
          }),
      },
    };
  }

  agentsEntity(): RecordEntity {
    const g = admissionAgents;
    const referrals = sql<number>`(select count(*)::int from enquiries e where e.agent_id = ${g.id})`;
    const enrolled = sql<number>`(select count(*)::int from agent_commissions c where c.agent_id = ${g.id} and c.status <> 'clawed_back')`;
    const due = sql<number>`(select coalesce(sum(amount_paise), 0)::float / 100 from agent_commissions c where c.agent_id = ${g.id} and c.status = 'accrued')`;
    return {
      key: 'admission-agents',
      module: 'admissions',
      table: g,
      subjectType: 'admission_agent',
      roles: { read: ADMISSIONS_ROLES, write: ADMISSIONS_ROLES },
      label: (r) => `${r.name} (${r.referralCode})`,
      list: {
        select: { id: g.id, name: g.name, kind: g.kind, phone: g.phone, email: g.email, referralCode: g.referralCode, commissionRupees: sql<number>`(${g.commissionPaise} / 100.0)::float`, active: g.active, referrals, enrolled, dueRupees: due, createdAt: g.createdAt },
        search: [g.name, g.referralCode, g.phone, g.email],
        filters: { kind: { label: 'Kind', options: opts(['agent', 'partner']), where: (v) => eq(g.kind, v) }, active: { label: 'Active', options: YES_NO, where: yesNo(g.active) } },
        sorts: { name: g.name, referrals, enrolled, due, created: g.createdAt },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: g.name, required: true },
        kind: { label: 'Kind', type: 'select', schema: z.enum(['agent', 'partner']), column: g.kind, options: opts(['agent', 'partner']), required: true, bulk: true },
        phone: { label: 'Phone', type: 'phone', schema: z.union([Phone, z.literal('')]).nullable().transform((v) => v || null), column: g.phone },
        email: { label: 'Email', type: 'email', schema: z.union([z.email().max(200), z.literal('')]).nullable().transform((v) => v || null), column: g.email },
        referralCode: { label: 'Referral code', type: 'text', schema: z.union([z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,20}$/, 'Use 4 to 20 letters, digits or dashes'), z.literal('')]).nullable().transform((v) => v || null), edit: false, help: 'Left empty, one is made from the name' },
        commissionRupees: { label: 'Commission per admission (Rs)', type: 'number', schema: rupees, help: 'Used when no commission rule applies', apply: async (ctx, id, v) => void (await ctx.tx.update(g).set({ commissionPaise: toPaise(v) }).where(eq(g.id, id))) },
        active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: g.active, bulk: true },
      },
      create: async (ctx, v) => (await this.agents.create(ctx.tx, this.actor(ctx), { name: String(v.name), kind: v.kind as 'agent', phone: (v.phone as string | null) ?? null, email: (v.email as string | null) ?? null, commissionPaise: toPaise(v.commissionRupees), referralCode: (v.referralCode as string | null) ?? null })).id,
      remove: {
        guard: async (ctx, id) => {
          const [{ n }] = (await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from agent_commissions where agent_id = ${id}::uuid`)).rows;
          return n > 0 ? 'This agent has commissions on record: mark them inactive instead' : null;
        },
      },
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'kind', header: 'Kind' },
        { key: 'referralCode', header: 'Referral code' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
        { key: 'commissionRupees', header: 'Commission (Rs)' },
        { key: 'referrals', header: 'Referrals' },
        { key: 'enrolled', header: 'Enrolled' },
        { key: 'dueRupees', header: 'Due (Rs)' },
        { key: 'active', header: 'Active' },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Name', required: true, example: 'Bright Future Consultants' },
          { key: 'kind', header: 'Kind', options: ['agent', 'partner'], example: 'agent' },
          { key: 'referral_code', header: 'Referral code', help: 'Rows are matched on it; left empty, one is made', example: 'BFC101' },
          { key: 'phone', header: 'Phone' },
          { key: 'email', header: 'Email' },
          { key: 'commission', header: 'Commission per admission (Rs)', example: '5000' },
        ],
        key: ['referral_code'],
        exists: async (ctx, r) => !!r.get('referral_code') && !!(await ctx.tx.select({ id: g.id }).from(g).where(eq(g.referralCode, r.get('referral_code').toUpperCase())).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'name');
            const kind = (lc(r.get('kind')) || 'agent') as 'agent';
            if (!['agent', 'partner'].includes(kind)) fail('Choose one of the listed values', kind);
            const commission = r.get('commission') ? Number(r.get('commission').replace(/,/g, '')) : 0;
            if (!Number.isFinite(commission) || commission < 0) fail('This value is not valid', r.get('commission'));
            const code = r.get('referral_code').toUpperCase();
            const phone = r.get('phone') ? normalizePhone(r.get('phone')) : null;
            const [found] = code ? await tx.select().from(g).where(eq(g.referralCode, code)) : [];
            if (found) {
              await tx.update(g).set({ name, kind, phone: phone ?? found.phone, email: r.get('email') || found.email, commissionPaise: Math.round(commission * 100) }).where(eq(g.id, found.id));
              return outcome(false, true, [name]);
            }
            const row = await this.agents.create(tx, this.actor({ tx, p: ctx.p }), { name, kind, phone, email: r.get('email') || null, commissionPaise: Math.round(commission * 100), referralCode: code || null });
            return outcome(true, false, [name, row.referralCode]);
          }),
      },
    };
  }

  // ---- interviews and entrance questions ------------------------------------------------------------------------------

  interviewsEntity(): RecordEntity {
    const i = admissionInterviews;
    return {
      key: 'admission-interviews',
      module: 'admissions',
      table: i,
      subjectType: 'admission_interview',
      roles: { read: [...ADMISSIONS_ROLES, 'hod', 'teacher'], write: ADMISSIONS_ROLES },
      label: (r) => `${r.applicantName} (${String(r.slotAt).slice(0, 16)})`,
      list: {
        select: { id: i.id, applicationId: i.applicationId, applicationNo: applications.applicationNo, applicantName: applications.applicantName, cycleName: admissionCycles.name, slotAt: i.slotAt, venue: i.venue, panelNames: sql<string>`(select coalesce(string_agg(x->>'name', ', '), '') from jsonb_array_elements(${i.panel}) x)`, status: i.status, outcome: i.outcome, score: i.score, maxScore: i.maxScore, remarks: i.remarks },
        joins: (q) => q.innerJoin(applications, eq(applications.id, i.applicationId)).innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId)),
        search: [applications.applicantName, applications.applicationNo, i.venue],
        filters: {
          status: { label: 'Status', options: opts(['scheduled', 'done', 'cancelled', 'no_show']), where: (v) => eq(i.status, v) },
          outcome: { label: 'Outcome', options: opts(['selected', 'waitlisted', 'rejected']), where: (v) => eq(i.outcome, v) },
          cycle: { label: 'Cycle', options: cycleOptions, where: (v) => uuidEq(applications.cycleId, v) },
          when: { label: 'When', options: [{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }], where: (v) => (v === 'today' ? sql`${i.slotAt}::date = current_date` : v === 'upcoming' ? sql`${i.slotAt} >= now()` : v === 'past' ? sql`${i.slotAt} < now()` : undefined) },
        },
        sorts: { slot: i.slotAt, applicant: applications.applicantName, score: i.score, status: i.status },
        defaultSort: { id: 'slot', dir: 'asc' },
      },
      fields: {
        venue: { label: 'Venue', type: 'text', schema: OptionalText(120), bulk: true, apply: async (ctx, id, v) => void (await this.interviews.reschedule(ctx.tx, this.actor(ctx), id, { venue: (v as string | null) ?? null })) },
        remarks: { label: 'Remarks', type: 'textarea', schema: OptionalText(1000), column: i.remarks },
      },
      actions: {
        noShow: { label: 'Mark did not come', apply: async (ctx, id) => void (await this.interviews.markNoShow(ctx.tx, this.actor(ctx), id)) },
        cancel: { label: 'Cancel interview', tone: 'danger', apply: async (ctx, id) => void (await this.interviews.reschedule(ctx.tx, this.actor(ctx), id, { cancel: true })) },
      },
      columns: [
        { key: 'slotAt', header: 'When' },
        { key: 'applicationNo', header: 'Application no' },
        { key: 'applicantName', header: 'Applicant' },
        { key: 'cycleName', header: 'Cycle' },
        { key: 'venue', header: 'Venue' },
        { key: 'panelNames', header: 'Panel' },
        { key: 'status', header: 'Status' },
        { key: 'outcome', header: 'Outcome' },
        { key: 'score', header: 'Score' },
        { key: 'maxScore', header: 'Out of' },
        { key: 'remarks', header: 'Remarks' },
      ],
    };
  }

  questions(): RecordEntity {
    const q = entranceQuestions;
    const optionsText = sql<string>`(select coalesce(string_agg(x, E'\n'), '') from jsonb_array_elements_text(${q.options}) x)`;
    const Options = z
      .string()
      .max(4000)
      .transform((s) => s.split('\n').map((x) => x.trim()).filter(Boolean))
      .refine((l) => l.length >= 2 && l.length <= 6, 'Give two to six options, one per line');
    return {
      key: 'entrance-questions',
      module: 'admissions',
      table: q,
      subjectType: 'entrance_question',
      roles: { read: ADMISSIONS_ROLES, write: ADMISSIONS_ROLES },
      label: (r) => String(r.question).slice(0, 80),
      list: {
        select: { id: q.id, topic: q.topic, question: q.question, optionsText, correct: sql<number>`(${q.correctIndex} + 1)`, marks: q.marks, active: q.active, programId: q.programId, programName: programs.name },
        joins: (x) => x.leftJoin(programs, eq(programs.id, q.programId)),
        search: [q.question, q.topic],
        filters: {
          topic: { label: 'Topic', options: async (ctx) => (await ctx.tx.selectDistinct({ t: q.topic }).from(q).orderBy(q.topic)).map((x) => ({ value: x.t, label: x.t })), where: (v) => eq(q.topic, v) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(q.programId, v) },
          active: { label: 'In use', options: YES_NO, where: yesNo(q.active) },
        },
        sorts: { topic: q.topic, question: q.question, marks: q.marks },
        defaultSort: { id: 'topic', dir: 'asc' },
        tiebreak: [q.question],
      },
      fields: {
        topic: { label: 'Topic', type: 'text', schema: Text(80), column: q.topic, required: true, bulk: true },
        question: { label: 'Question', type: 'textarea', schema: Text(2000), column: q.question, required: true },
        options: { label: 'Options', type: 'textarea', schema: Options, column: q.options, rowKey: 'optionsText', required: true, help: 'One per line, two to six' },
        correct: { label: 'Correct option (number)', type: 'number', schema: Int(1, 6), required: true, rowKey: 'correct', apply: async (ctx, id, v) => {
          const [row] = await ctx.tx.select({ options: q.options }).from(q).where(eq(q.id, id));
          if (Number(v) > (row?.options.length ?? 0)) throw new BadRequestException('The correct option must be one of the options');
          await ctx.tx.update(q).set({ correctIndex: Number(v) - 1 }).where(eq(q.id, id));
        } },
        marks: { label: 'Marks', type: 'number', schema: z.coerce.number().min(0.25).max(100), column: q.marks, bulk: true },
        programId: { label: 'Programme', type: 'select', schema: OptionalRef, column: q.programId, options: programOptions, bulk: true, help: 'Empty: any programme' },
        active: { label: 'In use', type: 'boolean', schema: z.boolean(), column: q.active, bulk: true },
      },
      create: async (ctx, v) => {
        const options = v.options as string[];
        const correct = Number(v.correct);
        if (correct > options.length) throw new BadRequestException('The correct option must be one of the options');
        const [row] = await ctx.tx.insert(q).values({ tenantId: ctx.p.tenantId, topic: String(v.topic), question: String(v.question), options, correctIndex: correct - 1, marks: Number(v.marks ?? 1), programId: (v.programId as string | null) ?? null, active: v.active === undefined ? true : !!v.active }).returning({ id: q.id });
        return row.id;
      },
      duplicate: (_ctx, row) => ({ question: `${row.question} (copy)` }),
      columns: [
        { key: 'topic', header: 'Topic' },
        { key: 'question', header: 'Question' },
        { key: 'optionsText', header: 'Options' },
        { key: 'correct', header: 'Correct option' },
        { key: 'marks', header: 'Marks' },
        { key: 'programName', header: 'Programme' },
        { key: 'active', header: 'In use' },
      ],
      import: {
        columns: [
          { key: 'topic', header: 'Topic', required: true, example: 'Aptitude' },
          { key: 'question', header: 'Question', required: true, help: 'Rows are matched on the question text', example: 'What is 15% of 200?' },
          { key: 'option_1', header: 'Option 1', required: true, example: '20' },
          { key: 'option_2', header: 'Option 2', required: true, example: '30' },
          { key: 'option_3', header: 'Option 3', example: '35' },
          { key: 'option_4', header: 'Option 4', example: '40' },
          { key: 'correct', header: 'Correct option (number)', required: true, options: ['1', '2', '3', '4'], example: '2' },
          { key: 'marks', header: 'Marks', example: '1' },
        ],
        key: ['question'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: q.id }).from(q).where(sql`lower(${q.question}) = ${lc(r.get('question'))}`).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const question = required(r, 'question');
            const options = ['option_1', 'option_2', 'option_3', 'option_4'].map((k) => r.get(k)).filter(Boolean);
            if (options.length < 2) fail('Give at least two choices', question);
            const correct = Number(required(r, 'correct'));
            if (!Number.isInteger(correct) || correct < 1 || correct > options.length) fail('The correct option must be one of the options', r.get('correct'));
            const marks = r.get('marks') ? Number(r.get('marks')) : 1;
            if (!Number.isFinite(marks) || marks <= 0) fail('This value is not valid', r.get('marks'));
            const values = { topic: required(r, 'topic'), options, correctIndex: correct - 1, marks };
            const [found] = await tx.select().from(q).where(sql`lower(${q.question}) = ${lc(question)}`);
            if (!found) {
              await tx.insert(q).values({ tenantId: ctx.p.tenantId, question, ...values });
              return outcome(true, false, [question.slice(0, 60)]);
            }
            await tx.update(q).set(values).where(eq(q.id, found.id));
            return outcome(false, true, [question.slice(0, 60)]);
          }),
      },
    };
  }

  // ---- assignment rules, requests, refund slabs, custody -----------------------------------------------------------------

  rules(): RecordEntity {
    const r = admissionAssignmentRules;
    const names = sql<string>`(select coalesce(string_agg(u.full_name, ', ' order by u.full_name), '') from users u where u.id::text in (select jsonb_array_elements_text(${r.counsellorIds})))`;
    return {
      key: 'assignment-rules',
      module: 'admissions',
      table: r,
      subjectType: 'assignment_rule',
      roles: { read: ADMISSIONS_ROLES, write: ADMISSIONS_ROLES },
      label: (x) => String(x.name),
      list: {
        select: { id: r.id, name: r.name, programId: r.programId, programName: programs.name, source: r.source, region: r.region, mode: r.mode, counsellorNames: names, counsellorCount: sql<number>`jsonb_array_length(${r.counsellorIds})`, active: r.active, sortOrder: r.sortOrder },
        joins: (q) => q.leftJoin(programs, eq(programs.id, r.programId)),
        search: [r.name, r.region],
        filters: { active: { label: 'Active', options: YES_NO, where: yesNo(r.active) }, mode: { label: 'How', options: [{ value: 'round_robin', label: 'By turns' }, { value: 'least_loaded', label: 'Fewest open enquiries' }], where: (v) => eq(r.mode, v) } },
        sorts: { order: r.sortOrder, name: r.name },
        defaultSort: { id: 'order', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: r.name, required: true },
        programId: { label: 'Programme', type: 'select', schema: OptionalRef, column: r.programId, options: programOptions, help: 'Empty: any programme' },
        source: { label: 'Source', type: 'select', schema: z.union([z.enum(ENQUIRY_SOURCES), z.literal('')]).nullable().transform((v) => v || null), column: r.source, options: SOURCES, help: 'Empty: any source' },
        region: { label: 'City or region', type: 'text', schema: OptionalText(80), column: r.region, help: 'Empty: anywhere' },
        mode: { label: 'How', type: 'select', schema: z.enum(['round_robin', 'least_loaded']), column: r.mode, options: [{ value: 'round_robin', label: 'By turns' }, { value: 'least_loaded', label: 'Fewest open enquiries' }], required: true, bulk: true },
        counsellors: {
          label: 'Counsellors',
          type: 'textarea',
          schema: Text(2000),
          rowKey: 'counsellorNames',
          required: true,
          help: 'Names or emails, separated by commas',
          apply: async (ctx, id, v) => {
            const ids = await counsellorIdsFrom(ctx, String(v));
            if (!ids.length) throw new BadRequestException('Name at least one counsellor');
            await ctx.tx.update(r).set({ counsellorIds: ids, nextIndex: 0 }).where(eq(r.id, id));
          },
        },
        active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: r.active, bulk: true },
      },
      order: { column: r.sortOrder },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, r, r.name, String(row.name)), next_index: 0 }),
      columns: [
        { key: 'name', header: 'Rule' },
        { key: 'programName', header: 'Programme' },
        { key: 'source', header: 'Source' },
        { key: 'region', header: 'City or region' },
        { key: 'mode', header: 'How' },
        { key: 'counsellorNames', header: 'Counsellors' },
        { key: 'active', header: 'Active' },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Rule', required: true, help: 'Rows are matched on it', example: 'Mysuru walk-ins' },
          { key: 'programme', header: 'Programme', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
          { key: 'source', header: 'Source', options: [...ENQUIRY_SOURCES] },
          { key: 'region', header: 'City or region', example: 'Mysuru' },
          { key: 'mode', header: 'How', options: ['round_robin', 'least_loaded'], example: 'round_robin' },
          { key: 'counsellors', header: 'Counsellors', required: true, help: 'Emails, separated by commas' },
        ],
        key: ['name'],
        exists: async (ctx, row) => !!(await ctx.tx.select({ id: r.id }).from(r).where(sql`lower(${r.name}) = ${lc(row.get('name'))}`).limit(1))[0],
        run: async (ctx, rows) => {
          const progs = await programOptions(ctx);
          return eachRow(ctx.tx, rows, async (tx, row) => {
            const name = required(row, 'name');
            const prog = row.get('programme') ? progs.find((p) => lc(p.label) === lc(row.get('programme'))) : undefined;
            if (row.get('programme') && !prog) fail('No programme with this name', row.get('programme'));
            const source = lc(row.get('source')) || null;
            if (source && !(ENQUIRY_SOURCES as readonly string[]).includes(source)) fail('Choose one of the listed values', source);
            const mode = lc(row.get('mode')) || 'round_robin';
            if (!['round_robin', 'least_loaded'].includes(mode)) fail('Choose one of the listed values', mode);
            let ids: string[];
            try {
              ids = await counsellorIdsFrom({ tx, p: ctx.p }, required(row, 'counsellors'));
            } catch (e) {
              return fail((e as Error).message, row.get('counsellors'));
            }
            const values = { programId: prog?.value ?? null, source, region: row.get('region') || null, mode, counsellorIds: ids };
            const [found] = await tx.select().from(r).where(sql`lower(${r.name}) = ${lc(name)}`);
            if (!found) {
              await tx.insert(r).values({ tenantId: ctx.p.tenantId, name, ...values, sortOrder: 1_000_000 });
              return outcome(true, false, [name]);
            }
            await tx.update(r).set(values).where(eq(r.id, found.id));
            return outcome(false, true, [name]);
          });
        },
      },
    };
  }

  requests(): RecordEntity {
    const r = admissionRequests;
    const requester = alias(users, 'requester');
    const decider = alias(users, 'decider');
    const KINDS = [
      { value: 'management_quota', label: 'Management quota' },
      { value: 'cancellation', label: 'Cancellation and refund' },
      { value: 'programme_change', label: 'Change of programme' },
    ];
    const decide = (decision: 'approve' | 'reject') => ({
      roles: APPROVER_ROLES,
      params: decision === 'reject' ? z.object({ note: z.string({ error: 'Say why the request is rejected' }).trim().min(3, 'Say why the request is rejected').max(500) }) : z.object({ note: z.string().trim().max(500).optional() }),
      apply: (ctx: KitCtx, id: string, p: unknown) => this.desk.decideRequest(ctx.tx, { ...this.actor(ctx), roles: ctx.p.roles as RoleName[] }, id, decision, (p as { note?: string }).note),
    });
    return {
      key: 'admission-requests',
      module: 'admissions',
      table: r,
      subjectType: 'admission_request',
      roles: { read: ADMISSIONS_ROLES, write: ADMISSIONS_ROLES },
      label: (x) => `${x.applicantName}: ${KINDS.find((k) => k.value === x.kind)?.label ?? x.kind}`,
      list: {
        select: {
          id: r.id,
          applicationId: r.applicationId,
          applicationNo: applications.applicationNo,
          applicantName: applications.applicantName,
          applicationStatus: applications.status,
          cycleName: admissionCycles.name,
          kind: r.kind,
          status: r.status,
          reason: r.reason,
          data: r.data,
          refundPaise: sql<number | null>`(${r.data} ->> 'refundPaise')::float`,
          paidPaise: sql<number | null>`(${r.data} ->> 'paidPaise')::float`,
          toCycleName: sql<string | null>`${r.data} ->> 'toCycleName'`,
          requesterName: requester.fullName,
          deciderName: decider.fullName,
          decisionNote: r.decisionNote,
          decidedAt: r.decidedAt,
          createdAt: r.createdAt,
        },
        joins: (q) => q.innerJoin(applications, eq(applications.id, r.applicationId)).innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId)).leftJoin(requester, eq(requester.id, r.requestedBy)).leftJoin(decider, eq(decider.id, r.decidedBy)),
        search: [applications.applicantName, applications.applicationNo, r.reason],
        filters: { status: { label: 'Status', options: opts(['pending', 'approved', 'rejected']), where: (v) => eq(r.status, v) }, kind: { label: 'Kind', options: KINDS, where: (v) => eq(r.kind, v) } },
        sorts: { created: r.createdAt, applicant: applications.applicantName, kind: r.kind, status: r.status, decided: r.decidedAt },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      actions: { approve: { label: 'Approve', ...decide('approve') }, reject: { label: 'Reject', tone: 'danger', ...decide('reject') } },
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ status: r.status }).from(r).where(eq(r.id, id));
          return x && x.status !== 'pending' ? 'A decided request stays on record' : null;
        },
      },
      columns: [
        { key: 'createdAt', header: 'Raised on' },
        { key: 'applicationNo', header: 'Application no' },
        { key: 'applicantName', header: 'Applicant' },
        { key: 'cycleName', header: 'Cycle' },
        { key: 'kind', header: 'Kind', value: (x) => KINDS.find((k) => k.value === x.kind)?.label ?? String(x.kind) },
        { key: 'reason', header: 'Reason' },
        { key: 'paidPaise', header: 'Paid (paise)' },
        { key: 'refundPaise', header: 'Refund (paise)' },
        { key: 'toCycleName', header: 'Move to' },
        { key: 'status', header: 'Status' },
        { key: 'requesterName', header: 'Raised by' },
        { key: 'deciderName', header: 'Decided by' },
        { key: 'decisionNote', header: 'Note' },
      ],
    };
  }

  slabs(): RecordEntity {
    const s = admissionRefundSlabs;
    return {
      key: 'refund-slabs',
      module: 'admissions',
      table: s,
      subjectType: 'admission_refund_slab',
      roles: { read: ADMISSIONS_ROLES, write: ['tenant_admin', 'principal'] },
      label: (x) => String(x.label),
      list: {
        select: { id: s.id, label: s.label, uptoDays: s.uptoDays, percent: s.percent, deductionPercent: s.deductionPercent, deductionCapRupees: sql<number>`(${s.deductionCapPaise} / 100.0)::float`, sortOrder: s.sortOrder },
        search: [s.label],
        sorts: { order: s.sortOrder, days: s.uptoDays },
        defaultSort: { id: 'order', dir: 'asc' },
      },
      fields: {
        label: { label: 'Slab', type: 'text', schema: Text(160), column: s.label, required: true },
        uptoDays: { label: 'Up to days after the last date', type: 'number', schema: z.union([z.coerce.number().int().min(-365).max(3650), z.literal(''), z.null()]).transform((v) => (v === '' ? null : v)), column: s.uptoDays, help: 'Negative: before the last date; empty: any later day' },
        percent: { label: 'Refund (%)', type: 'number', schema: Int(0, 100), column: s.percent, required: true },
        deductionPercent: { label: 'Processing charge (%)', type: 'number', schema: Int(0, 100), column: s.deductionPercent },
        deductionCapRupees: { label: 'Processing charge at most (Rs)', type: 'number', schema: rupees, help: '0: no cap', apply: async (ctx, id, v) => void (await ctx.tx.update(s).set({ deductionCapPaise: toPaise(v) }).where(eq(s.id, id))) },
      },
      order: { column: s.sortOrder },
      duplicate: (_ctx, row) => ({ label: `${row.label} (copy)` }),
      columns: [
        { key: 'label', header: 'Slab' },
        { key: 'uptoDays', header: 'Up to days after the last date' },
        { key: 'percent', header: 'Refund (%)' },
        { key: 'deductionPercent', header: 'Processing charge (%)' },
        { key: 'deductionCapRupees', header: 'Charge at most (Rs)' },
      ],
    };
  }

  custody(): RecordEntity {
    const c = admissionCustodyItems;
    const receiver = alias(users, 'receiver');
    return {
      key: 'custody-register',
      module: 'admissions',
      table: c,
      subjectType: 'custody_item',
      roles: { read: [...ADMISSIONS_ROLES, 'accountant'], write: ADMISSIONS_ROLES },
      label: (x) => `${x.document} of ${x.holderName}`,
      list: {
        select: { id: c.id, holderName: c.holderName, document: c.document, referenceNo: c.referenceNo, receivedOn: c.receivedOn, receivedByName: receiver.fullName, status: c.status, returnedOn: c.returnedOn, returnedTo: c.returnedTo, acknowledgement: c.acknowledgement, note: c.note, applicationId: c.applicationId, applicationNo: applications.applicationNo, studentId: c.studentId },
        joins: (q) => q.leftJoin(applications, eq(applications.id, c.applicationId)).leftJoin(receiver, eq(receiver.id, c.receivedBy)),
        search: [c.holderName, c.document, c.referenceNo, applications.applicationNo],
        filters: { status: { label: 'Status', options: [{ value: 'held', label: 'In custody' }, { value: 'returned', label: 'Returned' }], where: (v) => eq(c.status, v) } },
        sorts: { received: c.receivedOn, holder: c.holderName, document: c.document, returned: c.returnedOn },
        defaultSort: { id: 'received', dir: 'desc' },
      },
      fields: {
        holderName: { label: 'Whose', type: 'text', schema: Text(120), column: c.holderName, required: true },
        document: { label: 'Document', type: 'text', schema: Text(160), column: c.document, required: true, help: '10th marks card, transfer certificate, migration certificate…' },
        referenceNo: { label: 'Serial or reference', type: 'text', schema: OptionalText(80), column: c.referenceNo },
        receivedOn: { label: 'Received on', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: c.receivedOn, required: true },
        note: { label: 'Note', type: 'text', schema: OptionalText(300), column: c.note },
      },
      create: async (ctx, v) => {
        const [row] = await ctx.tx.insert(c).values({ tenantId: ctx.p.tenantId, holderName: String(v.holderName), document: String(v.document), referenceNo: (v.referenceNo as string | null) ?? null, receivedOn: String(v.receivedOn), receivedBy: ctx.p.userId, note: (v.note as string | null) ?? null }).returning({ id: c.id });
        return row.id;
      },
      actions: {
        return: {
          label: 'Return to the owner',
          params: z.object({ returnedTo: z.string().trim().min(2).max(120), acknowledgement: z.string({ error: 'Who signed for it' }).trim().min(2, 'Who signed for it').max(200), returnedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
          apply: (ctx, id, p) => this.desk.returnOriginal(ctx.tx, this.actor(ctx), id, p as { returnedTo: string; acknowledgement: string; returnedOn?: string }),
        },
      },
      columns: [
        { key: 'receivedOn', header: 'Received on' },
        { key: 'holderName', header: 'Whose' },
        { key: 'applicationNo', header: 'Application no' },
        { key: 'document', header: 'Document' },
        { key: 'referenceNo', header: 'Serial or reference' },
        { key: 'receivedByName', header: 'Received by' },
        { key: 'status', header: 'Status' },
        { key: 'returnedOn', header: 'Returned on' },
        { key: 'returnedTo', header: 'Returned to' },
        { key: 'acknowledgement', header: 'Signed by' },
      ],
      import: {
        columns: [
          { key: 'holder', header: 'Whose', required: true, example: 'Kavya Rao' },
          { key: 'document', header: 'Document', required: true, example: '10th marks card' },
          { key: 'reference', header: 'Serial or reference' },
          { key: 'received_on', header: 'Received on', required: true, example: '2026-06-10' },
          { key: 'application_no', header: 'Application number', help: 'Optional: links it to the application' },
        ],
        key: ['holder', 'document'],
        exists: async (ctx, row) => !!(await ctx.tx.select({ id: c.id }).from(c).where(and(sql`lower(${c.holderName}) = ${lc(row.get('holder'))}`, sql`lower(${c.document}) = ${lc(row.get('document'))}`, eq(c.status, 'held'))).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, row) => {
            const holder = required(row, 'holder');
            const document = required(row, 'document');
            const on = required(row, 'received_on');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) fail('Use a date like 2026-10-15', on);
            let applicationId: string | null = null;
            let studentId: string | null = null;
            if (row.get('application_no')) {
              const [a] = await tx.select({ id: applications.id, studentId: applications.studentId }).from(applications).where(eq(applications.applicationNo, row.get('application_no')));
              if (!a) fail('No application with this number', row.get('application_no'));
              applicationId = a!.id;
              studentId = a!.studentId;
            }
            const [found] = await tx.select({ id: c.id }).from(c).where(and(sql`lower(${c.holderName}) = ${lc(holder)}`, sql`lower(${c.document}) = ${lc(document)}`, eq(c.status, 'held')));
            if (found) return outcome(false, false, [holder, document, 'already in custody']);
            await tx.insert(c).values({ tenantId: ctx.p.tenantId, holderName: holder, document, referenceNo: row.get('reference') || null, receivedOn: on, receivedBy: ctx.p.userId, applicationId, studentId });
            return outcome(true, false, [holder, document]);
          }),
      },
    };
  }
}
