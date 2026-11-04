import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { programOptions } from '../admin/structure.records.js';
import { audit } from '../common/audit.js';
import { alumniProfiles, placementCompanies, programs, sections, students, users } from '../db/schema.js';
import { placementCompanyContacts } from '../db/schema-placements.js';
import { apprenticeships, placementDocuments, placementInteractions, placementReferrals } from '../db/schema-placements-pass.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { DateText, OptionalRef, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { Rupees } from '../records/money.js';
import { type ApprenticeCategory, natsGovtSharePaise } from './placement-pass.logic.js';
import { PLACEMENT_ROLES, PLACEMENT_VIEW_ROLES } from './placements.access.js';
import { studentOptions } from './placements.records.js';
import { PlacementsService } from './placements.service.js';

/**
 * The placements pass's lists on the record kit: the recruiter interaction log, students' placement documents (the
 * verification queue), apprenticeships under NATS, and alumni referrals.
 */

const opt = (pairs: [string, string][]): FieldOption[] => pairs.map(([value, label]) => ({ value, label }));
const pick = (list: FieldOption[]) => (v: string) => list.some((o) => o.value === v);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const label = (list: FieldOption[]) => (v: unknown) => list.find((o) => o.value === v)?.label ?? String(v ?? '');

export const INTERACTION_KIND = opt([['call', 'Call'], ['email', 'Email'], ['meeting', 'Meeting'], ['campus_visit', 'Campus visit'], ['linkedin', 'LinkedIn message'], ['other', 'Other']]);
export const DOC_KIND = opt([['resume', 'Resume'], ['marks_10', 'Class 10 marks card'], ['marks_12', 'Class 12 / PUC marks card'], ['diploma', 'Diploma marks card'], ['semester_marks', 'Semester marks cards'], ['id_proof', 'ID proof'], ['photo', 'Photograph'], ['other', 'Other']]);
const DOC_STATUS = opt([['pending', 'Waiting for verification'], ['verified', 'Verified'], ['rejected', 'Rejected']]);
const APPRENTICE_CATEGORY = opt([['graduate', 'Graduate'], ['diploma', 'Diploma'], ['vocational', 'Vocational']]);
const APPRENTICE_STATUS = opt([['enrolled', 'Enrolled on NATS'], ['contract_registered', 'Contract registered'], ['ongoing', 'Ongoing'], ['completed', 'Completed'], ['terminated', 'Ended early']]);
export const REFERRAL_STATUS = opt([['requested', 'Requested'], ['referred', 'Referred'], ['interviewing', 'Interviewing'], ['hired', 'Hired'], ['declined', 'Declined'], ['closed', 'Closed']]);
const APPRENTICE_MOVES: Record<string, string[]> = { enrolled: ['contract_registered', 'terminated'], contract_registered: ['ongoing', 'terminated'], ongoing: ['completed', 'terminated'], completed: [], terminated: [] };
export const canMoveApprenticeship = (from: string, to: string) => (APPRENTICE_MOVES[from] ?? []).includes(to);
const RupeesNum = z.coerce.number().min(0).max(1_000_000);

async function companyOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: placementCompanies.id, name: placementCompanies.name }).from(placementCompanies).orderBy(asc(placementCompanies.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function alumniOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: alumniProfiles.id, name: alumniProfiles.fullName, employer: alumniProfiles.employer }).from(alumniProfiles).orderBy(asc(alumniProfiles.fullName))).map((r) => ({ value: r.id, label: r.employer ? `${r.name} (${r.employer})` : r.name }));
}

@Injectable()
export class PlacementPassRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly svc: PlacementsService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.interactions(), this.documents(), this.apprenticeships(), this.referrals()]) this.registry.register(e);
  }

  // ---- recruiter interaction log -------------------------------------------------------------------

  private interactions(): RecordEntity {
    const by = alias(users, 'by');
    return {
      key: 'placement-interactions',
      module: 'placements',
      table: placementInteractions,
      subjectType: 'placement_interaction',
      roles: { read: PLACEMENT_VIEW_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.companyName}: ${r.summary}`,
      list: {
        select: { id: placementInteractions.id, companyId: placementInteractions.companyId, companyName: placementCompanies.name, contactId: placementInteractions.contactId, contactName: placementCompanyContacts.name, kind: placementInteractions.kind, happenedOn: placementInteractions.happenedOn, summary: placementInteractions.summary, outcome: placementInteractions.outcome, nextAction: placementInteractions.nextAction, followUpOn: placementInteractions.followUpOn, followUpDone: placementInteractions.followUpDone, recordedBy: by.fullName, createdAt: placementInteractions.createdAt },
        joins: (q) => q.innerJoin(placementCompanies, eq(placementCompanies.id, placementInteractions.companyId)).leftJoin(placementCompanyContacts, eq(placementCompanyContacts.id, placementInteractions.contactId)).leftJoin(by, eq(by.id, placementInteractions.recordedBy)),
        search: [placementCompanies.name, placementInteractions.summary, placementInteractions.outcome, placementInteractions.nextAction],
        filters: {
          company: { label: 'Company', options: companyOptions, where: (v) => uuidEq(placementInteractions.companyId, v) },
          kind: { label: 'Kind', options: INTERACTION_KIND, where: (v) => (pick(INTERACTION_KIND)(v) ? eq(placementInteractions.kind, v) : undefined) },
          followUp: { label: 'Follow-up', options: opt([['due', 'Due by today'], ['open', 'Planned'], ['done', 'Done']]), where: (v) => (v === 'due' ? sql`not ${placementInteractions.followUpDone} and ${placementInteractions.followUpOn} <= (now() at time zone 'Asia/Kolkata')::date` : v === 'open' ? sql`not ${placementInteractions.followUpDone} and ${placementInteractions.followUpOn} is not null` : v === 'done' ? eq(placementInteractions.followUpDone, true) : undefined) },
        },
        sorts: { happened: placementInteractions.happenedOn, company: placementCompanies.name, followUp: placementInteractions.followUpOn },
        defaultSort: { id: 'happened', dir: 'desc' },
      },
      fields: {
        companyId: { label: 'Company', type: 'select', schema: Ref, column: placementInteractions.companyId, options: companyOptions, required: true, edit: false },
        contactId: { label: 'With', type: 'select', schema: OptionalRef, column: placementInteractions.contactId, options: async (ctx) => (await ctx.tx.select({ id: placementCompanyContacts.id, name: placementCompanyContacts.name, company: placementCompanies.name }).from(placementCompanyContacts).innerJoin(placementCompanies, eq(placementCompanies.id, placementCompanyContacts.companyId)).orderBy(asc(placementCompanies.name), asc(placementCompanyContacts.name))).map((r) => ({ value: r.id, label: r.name, group: r.company })) },
        kind: { label: 'Kind', type: 'select', schema: z.enum(['call', 'email', 'meeting', 'campus_visit', 'linkedin', 'other']), column: placementInteractions.kind, options: INTERACTION_KIND, required: true },
        happenedOn: { label: 'On', type: 'date', schema: Day, column: placementInteractions.happenedOn, required: true },
        summary: { label: 'What was discussed', type: 'textarea', schema: Text(1000), column: placementInteractions.summary, required: true },
        outcome: { label: 'Outcome', type: 'text', schema: z.string().trim().max(300), column: placementInteractions.outcome },
        nextAction: { label: 'Next step', type: 'text', schema: z.string().trim().max(300), column: placementInteractions.nextAction },
        followUpOn: { label: 'Follow up on', type: 'date', schema: DateText, column: placementInteractions.followUpOn },
        followUpDone: { label: 'Follow-up done', type: 'boolean', schema: z.boolean(), column: placementInteractions.followUpDone, bulk: true, create: false },
      },
      create: async (ctx, v) => {
        const [c] = await ctx.tx.select({ id: placementCompanies.id, stage: placementCompanies.crmStage }).from(placementCompanies).where(eq(placementCompanies.id, String(v.companyId)));
        if (!c) throw new BadRequestException({ formErrors: [], fieldErrors: { companyId: ['Choose a company'] } });
        if (v.contactId) {
          const [k] = await ctx.tx.select({ companyId: placementCompanyContacts.companyId }).from(placementCompanyContacts).where(eq(placementCompanyContacts.id, String(v.contactId)));
          if (k?.companyId !== c.id) throw new BadRequestException({ formErrors: [], fieldErrors: { contactId: ['This person is not at that company'] } });
        }
        const [row] = await ctx.tx.insert(placementInteractions).values({ tenantId: ctx.p.tenantId, companyId: c.id, contactId: (v.contactId as string | null) ?? null, kind: String(v.kind), happenedOn: String(v.happenedOn), summary: String(v.summary), outcome: String(v.outcome ?? ''), nextAction: String(v.nextAction ?? ''), followUpOn: (v.followUpOn as string | null) ?? null, recordedBy: ctx.p.userId }).returning({ id: placementInteractions.id });
        // A first contact moves a prospect along.
        if (c.stage === 'prospect') {
          await ctx.tx.update(placementCompanies).set({ crmStage: 'contacted' }).where(eq(placementCompanies.id, c.id));
          await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'placement.company_stage', subjectType: 'company', subjectId: c.id, before: { crmStage: 'prospect' }, after: { crmStage: 'contacted' } });
        }
        return row.id;
      },
      validate: async (ctx, id) => {
        const [r] = await ctx.tx.select({ on: placementInteractions.happenedOn, f: placementInteractions.followUpOn }).from(placementInteractions).where(eq(placementInteractions.id, id));
        return r?.f && r.f < r.on ? 'The follow-up is before the interaction' : null;
      },
      actions: {
        followedUp: {
          label: 'Mark followed up',
          apply: async (ctx, id) => {
            const [r] = await ctx.tx.update(placementInteractions).set({ followUpDone: true }).where(and(eq(placementInteractions.id, id), eq(placementInteractions.followUpDone, false))).returning({ id: placementInteractions.id });
            if (!r) throw new ConflictException('Already followed up');
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'placement.follow_up_done', subjectType: 'placement_interaction', subjectId: id, before: { followUpDone: false }, after: { followUpDone: true } });
          },
        },
      },
      columns: [
        { key: 'happenedOn', header: 'On' },
        { key: 'companyName', header: 'Company' },
        { key: 'contactName', header: 'With' },
        { key: 'kind', header: 'Kind', value: (r) => label(INTERACTION_KIND)(r.kind) },
        { key: 'summary', header: 'Discussed' },
        { key: 'outcome', header: 'Outcome' },
        { key: 'nextAction', header: 'Next step' },
        { key: 'followUpOn', header: 'Follow up on' },
        { key: 'followUpDone', header: 'Done', value: (r) => (r.followUpDone ? 'Yes' : 'No') },
        { key: 'recordedBy', header: 'Recorded by' },
      ],
      import: {
        columns: [
          { key: 'company', header: 'Company', required: true, example: 'Brightwave Technologies' },
          { key: 'kind', header: 'Kind', required: true, options: INTERACTION_KIND.map((o) => o.value), example: 'call' },
          { key: 'on', header: 'On', required: true, example: '2026-10-12' },
          { key: 'summary', header: 'What was discussed', required: true, example: 'Asked for the 2027 hiring plan' },
          { key: 'outcome', header: 'Outcome' },
          { key: 'next', header: 'Next step' },
          { key: 'follow_up', header: 'Follow up on', example: '2026-10-26' },
        ],
        key: ['company', 'on', 'summary'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: placementInteractions.id }).from(placementInteractions).innerJoin(placementCompanies, eq(placementCompanies.id, placementInteractions.companyId)).where(and(sql`lower(${placementCompanies.name}) = ${lc(r.get('company'))}`, sql`${placementInteractions.happenedOn}::text = ${r.get('on')}`, eq(placementInteractions.summary, r.get('summary')))).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'company');
            const [c] = await tx.select({ id: placementCompanies.id }).from(placementCompanies).where(sql`lower(${placementCompanies.name}) = ${lc(name)}`).limit(1);
            if (!c) fail('No company of this name', name);
            const kind = required(r, 'kind');
            if (!pick(INTERACTION_KIND)(kind)) fail('Unknown kind', kind);
            const on = required(r, 'on');
            const follow = r.get('follow_up') || null;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || (follow && (!/^\d{4}-\d{2}-\d{2}$/.test(follow) || follow < on))) fail('Use dates like 2026-10-12, the follow-up on or after', `${on} ${follow ?? ''}`);
            const summary = required(r, 'summary');
            const [hit] = await tx.select({ id: placementInteractions.id }).from(placementInteractions).where(and(eq(placementInteractions.companyId, c!.id), eq(placementInteractions.happenedOn, on), eq(placementInteractions.summary, summary))).limit(1);
            if (hit) return outcome(false, false, [name, on]);
            await tx.insert(placementInteractions).values({ tenantId: ctx.p.tenantId, companyId: c!.id, kind, happenedOn: on, summary, outcome: r.get('outcome'), nextAction: r.get('next'), followUpOn: follow, recordedBy: ctx.p.userId });
            return outcome(true, false, [name, on]);
          }),
      },
    };
  }

  // ---- placement documents (verification queue) ------------------------------------------------------

  private documents(): RecordEntity {
    const reviewer = alias(users, 'reviewer');
    const review = (status: 'verified' | 'rejected') => async (ctx: KitCtx, id: string, params: unknown) => {
      const reason = status === 'rejected' ? String((params as { reason?: string } | undefined)?.reason ?? '').trim() : '';
      if (status === 'rejected' && reason.length < 3) throw new BadRequestException('Say why the document is rejected');
      const [d] = await ctx.tx.select().from(placementDocuments).where(eq(placementDocuments.id, id)).for('update');
      if (!d) throw new ConflictException('Document not found');
      if (d.status === status) throw new ConflictException(`Already ${status}`);
      await ctx.tx.update(placementDocuments).set({ status, rejectReason: reason || null, reviewedBy: ctx.p.userId, reviewedAt: new Date() }).where(eq(placementDocuments.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `placement.document_${status}`, subjectType: 'placement_document', subjectId: id, before: { status: d.status }, after: { status, rejectReason: reason || null } });
      const what = label(DOC_KIND)(d.kind);
      await this.svc.notifyStudent(ctx.tx, d.studentId, 'Placement documents', status === 'verified' ? `Your ${what.toLowerCase()} is verified` : `Your ${what.toLowerCase()} was not accepted: ${reason}. Upload it again.`, `doc:${id}:${status}`);
    };
    return {
      key: 'placement-documents',
      module: 'placements',
      table: placementDocuments,
      subjectType: 'placement_document',
      roles: { read: PLACEMENT_VIEW_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.rollNo} ${r.fullName} · ${label(DOC_KIND)(r.kind)}`,
      list: {
        select: { id: placementDocuments.id, studentId: placementDocuments.studentId, rollNo: students.rollNo, fullName: students.fullName, className: sections.displayName, programName: programs.name, kind: placementDocuments.kind, title: placementDocuments.title, contentType: placementDocuments.contentType, sizeBytes: placementDocuments.sizeBytes, status: placementDocuments.status, rejectReason: placementDocuments.rejectReason, reviewedBy: reviewer.fullName, reviewedAt: placementDocuments.reviewedAt, createdAt: placementDocuments.createdAt },
        joins: (q) => q.innerJoin(students, eq(students.id, placementDocuments.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)).leftJoin(reviewer, eq(reviewer.id, placementDocuments.reviewedBy)),
        search: [students.fullName, students.rollNo, placementDocuments.title],
        filters: {
          status: { label: 'Status', options: DOC_STATUS, where: (v) => (pick(DOC_STATUS)(v) ? eq(placementDocuments.status, v) : undefined) },
          kind: { label: 'Document', options: DOC_KIND, where: (v) => (pick(DOC_KIND)(v) ? eq(placementDocuments.kind, v) : undefined) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(sections.programId, v) },
        },
        sorts: { uploaded: placementDocuments.createdAt, student: students.fullName, roll: students.rollNo, kind: placementDocuments.kind },
        defaultSort: { id: 'uploaded', dir: 'desc' },
      },
      // Files come in through POST /v1/placements/students/:id/documents (scanned and typed); the kit reviews them.
      fields: {
        title: { label: 'Title', type: 'text', schema: Text(160), column: placementDocuments.title, required: true },
        kind: { label: 'Document', type: 'select', schema: z.enum(['resume', 'marks_10', 'marks_12', 'diploma', 'semester_marks', 'id_proof', 'photo', 'other']), column: placementDocuments.kind, options: DOC_KIND, required: true },
      },
      create: async () => {
        throw new BadRequestException('Upload the file from the student’s placement documents');
      },
      actions: {
        verify: { label: 'Verify', apply: review('verified') },
        reject: { label: 'Reject', tone: 'danger', inputs: [{ key: 'reason', label: 'Why', type: 'textarea', required: true }], params: z.object({ reason: z.string().trim().min(3).max(300) }), apply: review('rejected') },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'programName', header: 'Programme' },
        { key: 'kind', header: 'Document', value: (r) => label(DOC_KIND)(r.kind) },
        { key: 'title', header: 'Title' },
        { key: 'createdAt', header: 'Uploaded', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt ?? '').slice(0, 10)) },
        { key: 'status', header: 'Status', value: (r) => label(DOC_STATUS)(r.status) },
        { key: 'rejectReason', header: 'Reason' },
        { key: 'reviewedBy', header: 'Reviewed by' },
      ],
    };
  }

  // ---- apprenticeships (NATS) ----------------------------------------------------------------------

  private apprenticeships(): RecordEntity {
    const paid = sql<number>`(select coalesce(sum(x.employer_paid_paise), 0)::int from apprenticeship_stipends x where x.apprenticeship_id = "apprenticeships"."id")`;
    const dbt = sql<number>`(select coalesce(sum(x.dbt_paise), 0)::int from apprenticeship_stipends x where x.apprenticeship_id = "apprenticeships"."id")`;
    const share = async (ctx: KitCtx, id: string) => {
      const [a] = await ctx.tx.select().from(apprenticeships).where(eq(apprenticeships.id, id));
      if (!a) return;
      if (a.endsOn < a.startsOn) throw new BadRequestException({ formErrors: [], fieldErrors: { endsOn: ['The end date is before the start date'] } });
      const rules = (await this.svc.rules(ctx.tx, ctx.p.tenantId)).nats;
      const govt = natsGovtSharePaise(a.category as ApprenticeCategory, a.stipendPaise, rules);
      if (govt !== a.govtSharePaise) await ctx.tx.update(apprenticeships).set({ govtSharePaise: govt }).where(eq(apprenticeships.id, id));
    };
    const move = (to: string) => async (ctx: KitCtx, id: string, params: unknown) => {
      const [a] = await ctx.tx.select().from(apprenticeships).where(eq(apprenticeships.id, id)).for('update');
      if (!a || !canMoveApprenticeship(a.status, to)) throw new ConflictException(`An apprenticeship that is ${a?.status ?? 'missing'} cannot become ${to}`);
      const p = (params ?? {}) as { contractNo?: string; certificateNo?: string; certificateOn?: string };
      const set: Partial<typeof apprenticeships.$inferInsert> = { status: to };
      if (to === 'contract_registered') {
        if (!p.contractNo?.trim() && !a.contractNo) throw new BadRequestException('Give the contract number from the NATS portal');
        if (p.contractNo?.trim()) set.contractNo = p.contractNo.trim();
      }
      if (to === 'completed') {
        if (!p.certificateNo?.trim()) throw new BadRequestException('Give the certificate of proficiency number');
        set.certificateNo = p.certificateNo.trim();
        set.certificateOn = p.certificateOn ?? (await this.svc.today(ctx.tx));
      }
      await ctx.tx.update(apprenticeships).set(set).where(eq(apprenticeships.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `placement.apprenticeship_${to}`, subjectType: 'apprenticeship', subjectId: id, before: { status: a.status }, after: set as Record<string, unknown> });
    };
    return {
      key: 'apprenticeships',
      module: 'placements',
      table: apprenticeships,
      subjectType: 'apprenticeship',
      roles: { read: PLACEMENT_VIEW_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.rollNo} ${r.fullName} · ${r.establishment}`,
      list: {
        select: { id: apprenticeships.id, studentId: apprenticeships.studentId, rollNo: students.rollNo, fullName: students.fullName, programName: programs.name, companyId: apprenticeships.companyId, establishment: apprenticeships.establishment, establishmentCode: apprenticeships.establishmentCode, natsEnrolmentNo: apprenticeships.natsEnrolmentNo, contractNo: apprenticeships.contractNo, category: apprenticeships.category, role: apprenticeships.role, startsOn: apprenticeships.startsOn, endsOn: apprenticeships.endsOn, stipendPaise: apprenticeships.stipendPaise, stipendRupees: sql<number>`(${apprenticeships.stipendPaise} / 100.0)::float8`, govtSharePaise: apprenticeships.govtSharePaise, status: apprenticeships.status, certificateNo: apprenticeships.certificateNo, certificateOn: apprenticeships.certificateOn, note: apprenticeships.note, paidPaise: paid, dbtPaise: dbt },
        joins: (q) => q.innerJoin(students, eq(students.id, apprenticeships.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)),
        search: [students.fullName, students.rollNo, apprenticeships.establishment, apprenticeships.natsEnrolmentNo, apprenticeships.contractNo],
        filters: {
          status: { label: 'Status', options: APPRENTICE_STATUS, where: (v) => (pick(APPRENTICE_STATUS)(v) ? eq(apprenticeships.status, v) : undefined) },
          category: { label: 'Category', options: APPRENTICE_CATEGORY, where: (v) => (pick(APPRENTICE_CATEGORY)(v) ? eq(apprenticeships.category, v) : undefined) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(sections.programId, v) },
        },
        sorts: { starts: apprenticeships.startsOn, student: students.fullName, establishment: apprenticeships.establishment, stipend: apprenticeships.stipendPaise },
        defaultSort: { id: 'starts', dir: 'desc' },
      },
      fields: {
        studentId: { label: 'Student', type: 'select', schema: Ref, column: apprenticeships.studentId, options: studentOptions, required: true, edit: false },
        companyId: { label: 'Company (if registered)', type: 'select', schema: OptionalRef, column: apprenticeships.companyId, options: companyOptions },
        establishment: { label: 'Establishment', type: 'text', schema: Text(160), column: apprenticeships.establishment, required: true },
        establishmentCode: { label: 'Establishment id (NATS)', type: 'text', schema: z.string().trim().max(40), column: apprenticeships.establishmentCode },
        natsEnrolmentNo: { label: 'NATS enrolment number', type: 'text', schema: z.string().trim().max(40), column: apprenticeships.natsEnrolmentNo },
        category: { label: 'Category', type: 'select', schema: z.enum(['graduate', 'diploma', 'vocational']), column: apprenticeships.category, options: APPRENTICE_CATEGORY, required: true },
        role: { label: 'Role or trade', type: 'text', schema: Text(160), column: apprenticeships.role, required: true },
        startsOn: { label: 'Starts on', type: 'date', schema: Day, column: apprenticeships.startsOn, required: true },
        endsOn: { label: 'Ends on', type: 'date', schema: Day, column: apprenticeships.endsOn, required: true },
        stipendPaise: { label: 'Monthly stipend (₹)', type: 'number', schema: Rupees, column: apprenticeships.stipendPaise, rowKey: 'stipendRupees', required: true, help: 'At least the statutory minimum for the category (Settings → Placements)' },
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: apprenticeships.note },
      },
      create: async (ctx, v) => {
        const [row] = await ctx.tx.insert(apprenticeships).values({ tenantId: ctx.p.tenantId, studentId: String(v.studentId), companyId: (v.companyId as string | null) ?? null, establishment: String(v.establishment), establishmentCode: String(v.establishmentCode ?? ''), natsEnrolmentNo: String(v.natsEnrolmentNo ?? ''), category: String(v.category), role: String(v.role), startsOn: String(v.startsOn), endsOn: String(v.endsOn), stipendPaise: Number(v.stipendPaise), note: String(v.note ?? ''), createdBy: ctx.p.userId }).returning({ id: apprenticeships.id });
        return row.id;
      },
      // The Government share follows the stipend and category; a stipend under the statutory minimum is refused.
      check: async (ctx, id) => {
        await share(ctx, id);
        const [a] = await ctx.tx.select().from(apprenticeships).where(eq(apprenticeships.id, id));
        const n = (await this.svc.rules(ctx.tx, ctx.p.tenantId)).nats;
        const min = Math.round((a.category === 'graduate' ? n.minGraduate : n.minDiploma) * 100);
        if (a.stipendPaise < min) throw new BadRequestException({ formErrors: [], fieldErrors: { stipendPaise: [`Below the statutory minimum of ₹${(min / 100).toLocaleString('en-IN')} a month for this category`] } });
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: apprenticeships.status }).from(apprenticeships).where(eq(apprenticeships.id, id)))[0]?.s === 'completed' ? 'A completed apprenticeship stays on the register' : null) },
      actions: {
        registerContract: { label: 'Contract registered', inputs: [{ key: 'contractNo', label: 'Contract number', type: 'text', required: true }], params: z.object({ contractNo: z.string().trim().min(3).max(40) }), apply: move('contract_registered') },
        start: { label: 'Started', apply: move('ongoing') },
        complete: { label: 'Completed', inputs: [{ key: 'certificateNo', label: 'Certificate of proficiency number', type: 'text', required: true }], params: z.object({ certificateNo: z.string().trim().min(3).max(60), certificateOn: Day.optional() }), apply: move('completed') },
        terminate: { label: 'Ended early', tone: 'danger', apply: move('terminated') },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'programName', header: 'Programme' },
        { key: 'establishment', header: 'Establishment' },
        { key: 'natsEnrolmentNo', header: 'NATS enrolment' },
        { key: 'contractNo', header: 'Contract no' },
        { key: 'category', header: 'Category', value: (r) => label(APPRENTICE_CATEGORY)(r.category) },
        { key: 'role', header: 'Role' },
        { key: 'startsOn', header: 'From' },
        { key: 'endsOn', header: 'To' },
        { key: 'stipendPaise', header: 'Stipend (₹ a month)', value: (r) => Number(r.stipendPaise) / 100 },
        { key: 'govtSharePaise', header: 'Government share (₹ a month)', value: (r) => Number(r.govtSharePaise) / 100 },
        { key: 'paidPaise', header: 'Stipend paid (₹)', value: (r) => Number(r.paidPaise) / 100 },
        { key: 'dbtPaise', header: 'DBT credited (₹)', value: (r) => Number(r.dbtPaise) / 100 },
        { key: 'status', header: 'Status', value: (r) => label(APPRENTICE_STATUS)(r.status) },
        { key: 'certificateNo', header: 'Certificate' },
      ],
      import: {
        columns: [
          { key: 'roll_no', header: 'Roll number', required: true, example: 'BCA21001' },
          { key: 'establishment', header: 'Establishment', required: true, example: 'Hoysala Logistics' },
          { key: 'category', header: 'Category', required: true, options: ['graduate', 'diploma', 'vocational'], example: 'graduate' },
          { key: 'role', header: 'Role or trade', required: true, example: 'Graduate apprentice, operations' },
          { key: 'starts_on', header: 'Starts on', required: true, example: '2026-07-01' },
          { key: 'ends_on', header: 'Ends on', required: true, example: '2027-06-30' },
          { key: 'stipend', header: 'Monthly stipend (₹)', required: true, example: '12300' },
          { key: 'enrolment', header: 'NATS enrolment number' },
        ],
        key: ['roll_no', 'establishment', 'starts_on'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: apprenticeships.id }).from(apprenticeships).innerJoin(students, eq(students.id, apprenticeships.studentId)).where(and(sql`lower(${students.rollNo}) = ${lc(r.get('roll_no'))}`, sql`lower(${apprenticeships.establishment}) = ${lc(r.get('establishment'))}`, sql`${apprenticeships.startsOn}::text = ${r.get('starts_on')}`)).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const roll = required(r, 'roll_no');
            const [s] = await tx.select({ id: students.id }).from(students).where(sql`lower(${students.rollNo}) = ${lc(roll)}`).limit(1);
            if (!s) fail('No student with this roll number', roll);
            const category = required(r, 'category');
            if (!pick(APPRENTICE_CATEGORY)(category)) fail('Use graduate, diploma or vocational', category);
            const [startsOn, endsOn] = [required(r, 'starts_on'), required(r, 'ends_on')];
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn) fail('Use dates like 2026-07-01, the end after the start', `${startsOn} ${endsOn}`);
            const rupees = RupeesNum.safeParse(required(r, 'stipend'));
            if (!rupees.success) fail('Give the stipend in rupees', r.get('stipend'));
            const establishment = required(r, 'establishment');
            const stipendPaise = Math.round(rupees.data! * 100);
            const n = (await this.svc.rules(tx, ctx.p.tenantId)).nats;
            const min = Math.round((category === 'graduate' ? n.minGraduate : n.minDiploma) * 100);
            if (stipendPaise < min) fail(`Below the statutory minimum of ₹${min / 100}`, r.get('stipend'));
            const values = { category, role: required(r, 'role'), endsOn, stipendPaise, govtSharePaise: natsGovtSharePaise(category as ApprenticeCategory, stipendPaise, n), natsEnrolmentNo: r.get('enrolment') };
            const [hit] = await tx.select().from(apprenticeships).where(and(eq(apprenticeships.studentId, s!.id), sql`lower(${apprenticeships.establishment}) = ${lc(establishment)}`, eq(apprenticeships.startsOn, startsOn))).limit(1);
            if (!hit) {
              await tx.insert(apprenticeships).values({ tenantId: ctx.p.tenantId, studentId: s!.id, establishment, startsOn, createdBy: ctx.p.userId, ...values });
              return outcome(true, false, [roll, establishment]);
            }
            const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => hit[k] !== values[k]);
            if (changed) await tx.update(apprenticeships).set(values).where(eq(apprenticeships.id, hit.id));
            return outcome(false, changed, [roll, establishment]);
          }),
      },
    };
  }

  // ---- alumni referrals ------------------------------------------------------------------------------

  private referrals(): RecordEntity {
    const move = (to: string) => async (ctx: KitCtx, id: string, params: unknown) => {
      const [r] = await ctx.tx.select().from(placementReferrals).where(eq(placementReferrals.id, id)).for('update');
      if (!r || ['hired', 'declined', 'closed'].includes(r.status)) throw new ConflictException(`A ${r?.status ?? 'missing'} referral cannot change`);
      const note = String((params as { note?: string } | undefined)?.note ?? '').trim();
      await ctx.tx.update(placementReferrals).set({ status: to, note: note || r.note, updatedAt: new Date() }).where(eq(placementReferrals.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `placement.referral_${to}`, subjectType: 'placement_referral', subjectId: id, before: { status: r.status }, after: { status: to } });
      await this.svc.notifyStudent(ctx.tx, r.studentId, `Referral: ${r.company}`, `${label(REFERRAL_STATUS)(to)}${note ? `: ${note}` : ''}`, `referral:${id}:${to}`);
    };
    return {
      key: 'placement-referrals',
      module: 'placements',
      table: placementReferrals,
      subjectType: 'placement_referral',
      roles: { read: PLACEMENT_VIEW_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.rollNo} ${r.fullName} · ${r.company}`,
      list: {
        select: { id: placementReferrals.id, studentId: placementReferrals.studentId, rollNo: students.rollNo, fullName: students.fullName, programName: programs.name, alumniId: placementReferrals.alumniId, alumniName: alumniProfiles.fullName, alumniEmployer: alumniProfiles.employer, company: placementReferrals.company, role: placementReferrals.role, message: placementReferrals.message, status: placementReferrals.status, note: placementReferrals.note, createdAt: placementReferrals.createdAt, updatedAt: placementReferrals.updatedAt },
        joins: (q) => q.innerJoin(students, eq(students.id, placementReferrals.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)).innerJoin(alumniProfiles, eq(alumniProfiles.id, placementReferrals.alumniId)),
        search: [students.fullName, students.rollNo, placementReferrals.company, alumniProfiles.fullName],
        filters: { status: { label: 'Status', options: REFERRAL_STATUS, where: (v) => (pick(REFERRAL_STATUS)(v) ? eq(placementReferrals.status, v) : undefined) } },
        sorts: { created: placementReferrals.createdAt, student: students.fullName, company: placementReferrals.company },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        studentId: { label: 'Student', type: 'select', schema: Ref, column: placementReferrals.studentId, options: studentOptions, required: true, edit: false },
        alumniId: { label: 'Alumnus', type: 'select', schema: Ref, column: placementReferrals.alumniId, options: alumniOptions, required: true, edit: false },
        company: { label: 'Company', type: 'text', schema: Text(160), column: placementReferrals.company, required: true },
        role: { label: 'Role', type: 'text', schema: z.string().trim().max(160), column: placementReferrals.role },
        message: { label: 'Message', type: 'textarea', schema: z.string().trim().max(1000), column: placementReferrals.message },
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: placementReferrals.note },
      },
      actions: {
        referred: { label: 'Referred', inputs: [{ key: 'note', label: 'Note', type: 'text' }], params: z.object({ note: z.string().trim().max(300).optional() }).optional(), apply: move('referred') },
        interviewing: { label: 'Interviewing', apply: move('interviewing') },
        hired: { label: 'Hired', apply: move('hired') },
        declined: { label: 'Declined', tone: 'danger', inputs: [{ key: 'note', label: 'Why', type: 'text' }], params: z.object({ note: z.string().trim().max(300).optional() }).optional(), apply: move('declined') },
        close: { label: 'Close', apply: move('closed') },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'alumniName', header: 'Alumnus' },
        { key: 'alumniEmployer', header: 'Works at' },
        { key: 'company', header: 'Company' },
        { key: 'role', header: 'Role' },
        { key: 'status', header: 'Status', value: (r) => label(REFERRAL_STATUS)(r.status) },
        { key: 'note', header: 'Note' },
      ],
    };
  }
}
