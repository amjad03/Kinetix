import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { zonedToInstant } from '../common/time.js';
import { jobInterviews } from '../db/schema-hr2.js';
import { departments, designations, jobApplicants, jobOpenings, users } from '../db/schema.js';
import { fail, outcome } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity, type RecordField } from '../records/entity.js';
import { copyName, DateText, OptionalRef, OptionalText, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { HR_ROLES } from './hr.access.js';
import { HrService } from './hr.service.js';
import { choiceFilter, departmentChoices, labelOf, OptionalNumber, opts, Rupees, rupeesOf } from './kit-shared.js';

export const OPENING_STATUS = opts([
  ['requested', 'Awaiting approval'],
  ['rejected', 'Not approved'],
  ['open', 'Open'],
  ['on_hold', 'On hold'],
  ['closed', 'Closed'],
]);
const SETTABLE_STATUS = OPENING_STATUS.filter((s) => ['open', 'on_hold', 'closed'].includes(s.value));
export const STAGES = opts([
  ['applied', 'Applied'],
  ['screening', 'Shortlisted'],
  ['interview', 'Interview'],
  ['offer', 'Offer'],
  ['hired', 'Hired'],
  ['rejected', 'Rejected'],
  ['withdrawn', 'Withdrawn'],
]);
const SOURCES = opts([
  ['direct', 'Applied directly'],
  ['advertisement', 'Newspaper advertisement'],
  ['portal', 'Job portal'],
  ['referral', 'Referral'],
  ['campus', 'Campus drive'],
  ['walk_in', 'Walk-in'],
]);
export const INTERVIEW_KINDS = opts([
  ['interview', 'Interview'],
  ['demo_class', 'Demonstration class'],
  ['written_test', 'Written test'],
  ['hr', 'HR discussion'],
]);
const MODES = opts([
  ['in_person', 'In person'],
  ['online', 'Online'],
]);
export const INTERVIEW_STATUS = opts([
  ['scheduled', 'Scheduled'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
]);
const TERMINAL = ['hired', 'rejected', 'withdrawn'];
const sel = (o: FieldOption[]) => z.enum(o.map((x) => x.value) as [string, ...string[]]);
const Bool = z.coerce.boolean();

async function designationChoices(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: designations.id, name: designations.name }).from(designations).orderBy(asc(designations.sortOrder), asc(designations.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}
async function openingChoices(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: jobOpenings.id, title: jobOpenings.title, status: jobOpenings.status }).from(jobOpenings).where(inArray(jobOpenings.status, ['open', 'on_hold'])).orderBy(desc(jobOpenings.createdAt));
  return rows.map((r) => ({ value: r.id, label: r.title, group: r.status === 'on_hold' ? 'On hold' : undefined }));
}
async function applicantChoices(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .select({ id: jobApplicants.id, name: jobApplicants.fullName, opening: jobOpenings.title })
    .from(jobApplicants)
    .innerJoin(jobOpenings, eq(jobOpenings.id, jobApplicants.openingId))
    .where(inArray(jobApplicants.stage, ['applied', 'screening', 'interview', 'offer']))
    .orderBy(asc(jobApplicants.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name, group: r.opening }));
}
/** Staff who can sit on an interview panel. */
async function panelChoices(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.execute<{ id: string; full_name: string }>(sql`select distinct u.id, u.full_name from users u join user_roles r on r.user_id = u.id where u.status = 'active' and r.role::text in ('tenant_admin', 'principal', 'hod', 'hr_manager') order by u.full_name`);
  return rows.rows.map((r) => ({ value: r.id, label: r.full_name }));
}

const avgScore = sql<number | null>`(select round(avg(s.total)::numeric, 1)::float8 from job_interview_scores s join job_interviews i on i.id = s.interview_id where i.applicant_id = ${jobApplicants.id} and i.status <> 'cancelled')`;

@Injectable()
export class RecruitmentRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly hr: HrService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.openings(), this.applicants(), this.interviews()]) this.registry.register(e);
  }

  private openings(): RecordEntity {
    const o = jobOpenings;
    const applicants = sql<number>`(select count(*)::int from job_applicants a where a.opening_id = ${o.id})`;
    const inProcess = sql<number>`(select count(*)::int from job_applicants a where a.opening_id = ${o.id} and a.stage in ('screening', 'interview', 'offer'))`;
    const hired = sql<number>`(select count(*)::int from job_applicants a where a.opening_id = ${o.id} and a.stage = 'hired')`;
    const setStatus = (to: string) => async (ctx: KitCtx, id: string) => {
      const [x] = await ctx.tx.select({ status: o.status }).from(o).where(eq(o.id, id));
      if (!x) throw new NotFoundException('Opening not found');
      if (['requested', 'rejected'].includes(x.status)) throw new ConflictException('This requisition has not been approved');
      if (x.status === to) return 'No change';
      await ctx.tx.update(o).set({ status: to }).where(eq(o.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'job_opening.updated', subjectType: 'job_opening', subjectId: id, changes: { status: { before: x.status, after: to } } });
    };
    return {
      key: 'job-openings',
      module: 'hr',
      table: o,
      subjectType: 'job_opening',
      roles: { read: HR_ROLES, write: HR_ROLES },
      label: (r) => String(r.title),
      list: {
        select: { id: o.id, title: o.title, departmentId: o.departmentId, departmentName: departments.name, designationId: o.designationId, designationName: designations.name, positions: o.positions, description: o.description, status: o.status, closesOn: o.closesOn, justification: o.justification, applicants, inProcess, hired, createdAt: o.createdAt },
        joins: (q) => q.leftJoin(departments, eq(departments.id, o.departmentId)).leftJoin(designations, eq(designations.id, o.designationId)),
        search: [o.title, o.description, departments.name],
        filters: {
          status: choiceFilter('Status', OPENING_STATUS, o.status),
          department: { label: 'Department', options: departmentChoices, where: (v) => uuidEq(o.departmentId, v) },
          designation: { label: 'Designation', options: designationChoices, where: (v) => uuidEq(o.designationId, v) },
        },
        sorts: { title: o.title, created: o.createdAt, closes: o.closesOn, applicants, positions: o.positions },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        title: { label: 'Title', type: 'text', schema: Text(120), column: o.title, required: true },
        departmentId: { label: 'Department', type: 'select', schema: OptionalRef, column: o.departmentId, options: departmentChoices, bulk: true },
        designationId: { label: 'Designation', type: 'select', schema: OptionalRef, column: o.designationId, options: designationChoices, bulk: true },
        positions: { label: 'Positions', type: 'number', schema: z.coerce.number().int().min(1).max(500), column: o.positions, required: true },
        closesOn: { label: 'Applications close on', type: 'date', schema: DateText, column: o.closesOn, bulk: true },
        status: { label: 'Status', type: 'select', schema: sel(SETTABLE_STATUS), column: o.status, options: SETTABLE_STATUS, create: false, bulk: true },
        description: { label: 'Description and eligibility', type: 'textarea', schema: z.string().trim().max(5000).default(''), column: o.description },
      },
      create: async (ctx, v) => {
        const [row] = await ctx.tx
          .insert(o)
          .values({ tenantId: ctx.p.tenantId, title: String(v.title), departmentId: (v.departmentId as string | null) ?? null, designationId: (v.designationId as string | null) ?? null, positions: Number(v.positions ?? 1), closesOn: (v.closesOn as string | null) ?? null, description: String(v.description ?? ''), status: 'open', createdBy: ctx.p.userId })
          .returning({ id: o.id });
        return row.id;
      },
      duplicate: async (ctx, row) => ({ title: await copyName(ctx.tx, o, o.title, String(row.title)), status: 'open', approved_by: null, approved_at: null, decision_note: null, created_by: ctx.p.userId, created_at: new Date() }),
      remove: {
        guard: async (ctx, id) => {
          const [h] = await ctx.tx.select({ id: jobApplicants.id }).from(jobApplicants).where(and(eq(jobApplicants.openingId, id), eq(jobApplicants.stage, 'hired'))).limit(1);
          return h ? 'Someone was hired through this opening: close it instead' : null;
        },
      },
      actions: {
        close: { label: 'Close', apply: setStatus('closed') },
        hold: { label: 'Put on hold', apply: setStatus('on_hold') },
        reopen: { label: 'Reopen', apply: setStatus('open') },
      },
      columns: [
        { key: 'title', header: 'Title' },
        { key: 'departmentName', header: 'Department' },
        { key: 'designationName', header: 'Designation' },
        { key: 'positions', header: 'Positions' },
        { key: 'status', header: 'Status', value: (r) => labelOf(OPENING_STATUS, r.status) },
        { key: 'closesOn', header: 'Closes on' },
        { key: 'applicants', header: 'Applicants' },
        { key: 'inProcess', header: 'In process' },
        { key: 'hired', header: 'Hired' },
      ],
    };
  }

  private applicants(): RecordEntity {
    const a = jobApplicants;
    const o = jobOpenings;
    const stageTo = async (ctx: KitCtx, id: string, to: string, note?: string) => {
      const [x] = await ctx.tx.select().from(a).where(eq(a.id, id)).for('update');
      if (!x) throw new NotFoundException('Applicant not found');
      if (TERMINAL.includes(x.stage)) throw new ConflictException(`This applicant is already ${labelOf(STAGES, x.stage).toLowerCase()}`);
      if (x.stage === to) return 'No change';
      const history = [...x.stageHistory, { stage: to, at: new Date().toISOString(), by: ctx.p.userId, ...(note ? { note } : {}) }];
      await ctx.tx.update(a).set({ stage: to, stageHistory: history }).where(eq(a.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'recruitment.stage_changed', subjectType: 'job_applicant', subjectId: id, changes: { stage: { before: x.stage, after: to } }, data: { from: x.stage, to, note } });
    };
    const Note = z.object({ note: z.string().trim().max(500).optional() });
    const f = (label: string, column: RecordField['column'], schema: z.ZodType, extra: Partial<RecordField> = {}): RecordField => ({ label, type: 'text', schema, column, ...extra });
    return {
      key: 'job-applicants',
      module: 'hr',
      table: a,
      subjectType: 'job_applicant',
      roles: { read: HR_ROLES, write: HR_ROLES },
      label: (r) => String(r.fullName),
      list: {
        select: {
          id: a.id,
          openingId: a.openingId,
          openingTitle: o.title,
          fullName: a.fullName,
          email: a.email,
          phone: a.phone,
          stage: a.stage,
          qualification: a.qualification,
          experienceYears: a.experienceYears,
          phd: a.phd,
          netSet: a.netSet,
          currentOrganisation: a.currentOrganisation,
          expectedCtc: rupeesOf(a.expectedCtcPaise),
          source: a.source,
          screeningScore: a.screeningScore,
          interviewScore: avgScore,
          hasResume: sql<boolean>`(${a.resumeKey} is not null)`,
          resumeName: a.resumeName,
          hiredUserId: a.hiredUserId,
          notes: a.notes,
          createdAt: a.createdAt,
        },
        joins: (q) => q.innerJoin(o, eq(o.id, a.openingId)),
        search: [a.fullName, a.email, a.phone, a.qualification, a.currentOrganisation],
        filters: {
          opening: { label: 'Opening', options: async (ctx) => (await ctx.tx.select({ id: o.id, title: o.title }).from(o).orderBy(desc(o.createdAt))).map((r) => ({ value: r.id, label: r.title })), where: (v) => uuidEq(a.openingId, v) },
          stage: { label: 'Stage', options: [{ value: 'active', label: 'Still in process' }, ...STAGES], where: (v) => (v === 'active' ? inArray(a.stage, ['applied', 'screening', 'interview', 'offer']) : STAGES.some((s) => s.value === v) ? eq(a.stage, v) : undefined) },
          source: choiceFilter('Source', SOURCES, a.source),
          eligibility: { label: 'Eligibility', options: opts([['phd', 'Has a Ph.D.'], ['net', 'NET / SET'], ['either', 'Ph.D. or NET / SET']]), where: (v) => (v === 'phd' ? eq(a.phd, true) : v === 'net' ? eq(a.netSet, true) : v === 'either' ? sql`(${a.phd} or ${a.netSet})` : undefined) },
        },
        sorts: { name: a.fullName, applied: a.createdAt, experience: sql`coalesce(${a.experienceYears}, -1)`, screening: sql`coalesce(${a.screeningScore}, -1)`, interview: sql`coalesce(${avgScore}, -1)`, stage: a.stage },
        defaultSort: { id: 'applied', dir: 'desc' },
      },
      fields: {
        openingId: { label: 'Opening', type: 'select', schema: z.uuid(), column: a.openingId, options: openingChoices, required: true, edit: false },
        fullName: f('Full name', a.fullName, Text(120), { required: true }),
        email: { label: 'Email', type: 'email', schema: z.union([z.email(), z.literal(''), z.null()]).transform((v) => v || null), column: a.email },
        phone: { label: 'Phone', type: 'phone', schema: OptionalText(20), column: a.phone },
        qualification: f('Highest qualification', a.qualification, z.string().trim().max(200).default('')),
        experienceYears: { label: 'Experience (years)', type: 'number', schema: OptionalNumber(0, 60), column: a.experienceYears },
        phd: { label: 'Has a Ph.D.', type: 'boolean', schema: Bool, column: a.phd },
        netSet: { label: 'Cleared NET / SET', type: 'boolean', schema: Bool, column: a.netSet },
        currentOrganisation: f('Current organisation', a.currentOrganisation, z.string().trim().max(200).default('')),
        expectedCtcPaise: { label: 'Expected pay a year (₹)', type: 'number', schema: Rupees, column: a.expectedCtcPaise, rowKey: 'expectedCtc' },
        source: { label: 'Source', type: 'select', schema: sel(SOURCES), column: a.source, options: SOURCES, bulk: true },
        screeningScore: { label: 'Screening score (out of 100)', type: 'number', schema: OptionalNumber(0, 100), column: a.screeningScore, create: false },
        notes: { label: 'Notes', type: 'textarea', schema: z.string().trim().max(2000).default(''), column: a.notes },
      },
      create: async (ctx, v) => {
        const [op] = await ctx.tx.select({ status: o.status }).from(o).where(eq(o.id, String(v.openingId)));
        if (!op) throw new NotFoundException('Opening not found');
        if (op.status !== 'open' && op.status !== 'on_hold') throw new ConflictException('This opening is not taking applications');
        if (v.email) {
          const [dup] = await ctx.tx.select({ id: a.id }).from(a).where(and(eq(a.openingId, String(v.openingId)), sql`lower(${a.email}) = ${String(v.email).toLowerCase()}`));
          if (dup) throw new ConflictException('This person has already applied for the opening');
        }
        const [row] = await ctx.tx
          .insert(a)
          .values({
            tenantId: ctx.p.tenantId,
            openingId: String(v.openingId),
            fullName: String(v.fullName),
            email: (v.email as string | null) ?? null,
            phone: (v.phone as string | null) ?? null,
            qualification: String(v.qualification ?? ''),
            experienceYears: (v.experienceYears as number | null) ?? null,
            phd: !!v.phd,
            netSet: !!v.netSet,
            currentOrganisation: String(v.currentOrganisation ?? ''),
            expectedCtcPaise: (v.expectedCtcPaise as number | null) ?? null,
            source: String(v.source ?? 'direct'),
            notes: String(v.notes ?? ''),
            stageHistory: [{ stage: 'applied', at: new Date().toISOString(), by: ctx.p.userId }],
          })
          .returning({ id: a.id });
        return row.id;
      },
      move: {
        label: 'Move to another opening',
        options: openingChoices,
        reason: true,
        apply: async (ctx, id, to, reason) => {
          const [x] = await ctx.tx.select().from(a).where(eq(a.id, id));
          if (!x) throw new NotFoundException('Applicant not found');
          if (TERMINAL.includes(x.stage)) throw new ConflictException('This applicant has left the process');
          await ctx.tx.update(a).set({ openingId: to, stageHistory: [...x.stageHistory, { stage: x.stage, at: new Date().toISOString(), by: ctx.p.userId, note: `Moved: ${reason ?? ''}` }] }).where(eq(a.id, id));
          await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'job_applicant.moved', subjectType: 'job_applicant', subjectId: id, changes: { opening_id: { before: x.openingId, after: to } }, data: { reason } });
        },
      },
      remove: {
        guard: async (ctx, id) => {
          const [x] = await ctx.tx.select({ stage: a.stage }).from(a).where(eq(a.id, id));
          return x?.stage === 'hired' ? 'A hired applicant is part of the staff record' : null;
        },
      },
      actions: {
        shortlist: { label: 'Shortlist', params: Note, apply: (ctx, id, p) => stageTo(ctx, id, 'screening', (p as { note?: string } | undefined)?.note) },
        interview: { label: 'Move to interview', params: Note, apply: (ctx, id, p) => stageTo(ctx, id, 'interview', (p as { note?: string } | undefined)?.note) },
        reject: { label: 'Reject', tone: 'danger', params: Note, apply: (ctx, id, p) => stageTo(ctx, id, 'rejected', (p as { note?: string } | undefined)?.note) },
        withdraw: { label: 'Mark withdrawn', params: Note, apply: (ctx, id, p) => stageTo(ctx, id, 'withdrawn', (p as { note?: string } | undefined)?.note) },
      },
      columns: [
        { key: 'fullName', header: 'Name' },
        { key: 'openingTitle', header: 'Opening' },
        { key: 'email', header: 'Email' },
        { key: 'phone', header: 'Phone' },
        { key: 'stage', header: 'Stage', value: (r) => labelOf(STAGES, r.stage) },
        { key: 'qualification', header: 'Qualification' },
        { key: 'experienceYears', header: 'Experience (years)' },
        { key: 'phd', header: 'Ph.D.', value: (r) => (r.phd ? 'Yes' : 'No') },
        { key: 'netSet', header: 'NET / SET', value: (r) => (r.netSet ? 'Yes' : 'No') },
        { key: 'expectedCtc', header: 'Expected pay a year (₹)' },
        { key: 'source', header: 'Source', value: (r) => labelOf(SOURCES, r.source) },
        { key: 'screeningScore', header: 'Screening score' },
        { key: 'interviewScore', header: 'Interview score' },
      ],
      import: {
        columns: [
          { key: 'opening', header: 'Opening', required: true, help: 'The title of an open opening', options: async (ctx) => (await openingChoices(ctx)).map((x) => x.label), example: 'Assistant professor, Commerce' },
          { key: 'full_name', header: 'Full name', required: true, example: 'Kavya Shetty' },
          { key: 'email', header: 'Email', help: 'Applicants are matched on email within an opening', example: 'kavya@example.in' },
          { key: 'phone', header: 'Phone', example: '9845012345' },
          { key: 'qualification', header: 'Highest qualification', example: 'M.Com., NET' },
          { key: 'experience', header: 'Experience (years)', example: '4' },
          { key: 'phd', header: 'Ph.D. (yes/no)', options: ['yes', 'no'], example: 'no' },
          { key: 'net_set', header: 'NET / SET (yes/no)', options: ['yes', 'no'], example: 'yes' },
          { key: 'source', header: 'Source', options: SOURCES.map((x) => x.value), example: 'portal' },
        ],
        key: ['opening', 'email'],
        exists: async (ctx, r) => {
          if (!r.get('email')) return false;
          const [hit] = await ctx.tx.select({ id: a.id }).from(a).innerJoin(o, eq(o.id, a.openingId)).where(and(sql`lower(${o.title}) = ${r.get('opening').toLowerCase()}`, sql`lower(${a.email}) = ${r.get('email').toLowerCase()}`)).limit(1);
          return !!hit;
        },
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const [op] = await tx.select({ id: o.id }).from(o).where(and(sql`lower(${o.title}) = ${r.get('opening').toLowerCase()}`, inArray(o.status, ['open', 'on_hold']))).limit(1);
            if (!op) fail('No open opening with this title', r.get('opening') || '(empty)');
            const name = r.get('full_name') || fail('This value is required', 'full_name');
            const email = r.get('email').toLowerCase() || null;
            if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Enter a valid email address', email);
            const exp = r.get('experience');
            if (exp && !(Number(exp) >= 0 && Number(exp) <= 60)) fail('This value is not valid', exp);
            const source = r.get('source') || 'direct';
            if (!SOURCES.some((s) => s.value === source)) fail('Choose one of the listed values', source);
            const values = { fullName: name, phone: r.get('phone') || null, qualification: r.get('qualification'), experienceYears: exp ? Number(exp) : null, phd: /^y/i.test(r.get('phd')), netSet: /^y/i.test(r.get('net_set')), source };
            const [found] = email ? await tx.select({ id: a.id }).from(a).where(and(eq(a.openingId, op!.id), sql`lower(${a.email}) = ${email}`)) : [];
            if (found) {
              await tx.update(a).set(values).where(eq(a.id, found.id));
              return outcome(false, true, [name]);
            }
            await tx.insert(a).values({ tenantId: ctx.p.tenantId, openingId: op!.id, email, ...values, stageHistory: [{ stage: 'applied', at: new Date().toISOString(), by: ctx.p.userId }] });
            return outcome(true, false, [name]);
          }),
      },
    };
  }

  private interviews(): RecordEntity {
    const i = jobInterviews;
    const a = jobApplicants;
    const o = jobOpenings;
    const panelNames = sql<string>`(select string_agg(u.full_name, ', ' order by u.full_name) from users u where u.id::text in (select jsonb_array_elements_text(${i.panelIds})))`;
    const scored = sql<number>`(select count(*)::int from job_interview_scores s where s.interview_id = ${i.id})`;
    const avg = sql<number | null>`(select round(avg(s.total)::numeric, 1)::float8 from job_interview_scores s where s.interview_id = ${i.id})`;
    const local = sql<string>`to_char(${i.scheduledAt} at time zone coalesce((select t.timezone from tenants t where t.id = ${i.tenantId}), 'Asia/Kolkata'), 'YYYY-MM-DD')`;
    const localTime = sql<string>`to_char(${i.scheduledAt} at time zone coalesce((select t.timezone from tenants t where t.id = ${i.tenantId}), 'Asia/Kolkata'), 'HH24:MI')`;
    const panelOf = (n: number) => sql<string | null>`(${i.panelIds} ->> ${sql.raw(String(n - 1))})`;
    const when = async (ctx: KitCtx, date: string, time: string) => {
      const tz = await this.hr.timezone(ctx.tx);
      return zonedToInstant(date, `${time}:00`, tz);
    };
    const setPanel = (n: number) => async (ctx: KitCtx, id: string, v: unknown) => {
      const [x] = await ctx.tx.select({ panel: i.panelIds, status: i.status }).from(i).where(eq(i.id, id));
      if (!x) throw new NotFoundException('Interview not found');
      const panel = [...x.panel];
      while (panel.length < n) panel.push('');
      panel[n - 1] = (v as string | null) ?? '';
      await ctx.tx.update(i).set({ panelIds: panel.filter(Boolean).filter((p, k, all) => all.indexOf(p) === k) }).where(eq(i.id, id));
    };
    const Panel = z.union([z.uuid(), z.literal(''), z.null()]).transform((v) => v || null);
    const setStatus = (to: string) => async (ctx: KitCtx, id: string) => {
      const [x] = await ctx.tx.select({ status: i.status }).from(i).where(eq(i.id, id));
      if (!x) throw new NotFoundException('Interview not found');
      if (x.status === to) return 'No change';
      if (x.status !== 'scheduled') throw new ConflictException(`This interview is already ${x.status}`);
      await ctx.tx.update(i).set({ status: to }).where(eq(i.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'job_interview.updated', subjectType: 'job_interview', subjectId: id, changes: { status: { before: x.status, after: to } } });
    };
    return {
      key: 'job-interviews',
      module: 'hr',
      table: i,
      subjectType: 'job_interview',
      roles: { read: HR_ROLES, write: HR_ROLES },
      label: (r) => `${r.applicantName ?? ''} · round ${r.round ?? 1}`,
      list: {
        select: { id: i.id, applicantId: i.applicantId, applicantName: a.fullName, openingId: a.openingId, openingTitle: o.title, round: i.round, kind: i.kind, scheduledAt: i.scheduledAt, date: local, time: localTime, mode: i.mode, venue: i.venue, panel1: panelOf(1), panel2: panelOf(2), panel3: panelOf(3), panelNames, status: i.status, scored, average: avg, createdAt: i.createdAt },
        joins: (q) => q.innerJoin(a, eq(a.id, i.applicantId)).innerJoin(o, eq(o.id, a.openingId)),
        search: [a.fullName, o.title, i.venue],
        filters: {
          status: choiceFilter('Status', INTERVIEW_STATUS, i.status),
          kind: choiceFilter('Kind', INTERVIEW_KINDS, i.kind),
          opening: { label: 'Opening', options: async (ctx) => (await ctx.tx.select({ id: o.id, title: o.title }).from(o).orderBy(desc(o.createdAt))).map((r) => ({ value: r.id, label: r.title })), where: (v) => uuidEq(a.openingId, v) },
          applicant: { label: 'Applicant', where: (v) => uuidEq(i.applicantId, v) },
          when: { label: 'When', options: opts([['upcoming', 'Coming up'], ['past', 'Past']]), where: (v) => (v === 'upcoming' ? sql`${i.scheduledAt} >= now()` : v === 'past' ? sql`${i.scheduledAt} < now()` : undefined) },
        },
        sorts: { when: i.scheduledAt, applicant: a.fullName, average: avg },
        defaultSort: { id: 'when', dir: 'asc' },
      },
      fields: {
        applicantId: { label: 'Applicant', type: 'select', schema: z.uuid(), options: applicantChoices, required: true, edit: false },
        round: { label: 'Round', type: 'number', schema: z.coerce.number().int().min(1).max(9), column: i.round, required: true },
        kind: { label: 'Kind', type: 'select', schema: sel(INTERVIEW_KINDS), column: i.kind, options: INTERVIEW_KINDS, required: true, bulk: true },
        date: {
          label: 'Date',
          type: 'date',
          schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'),
          required: true,
          apply: async (ctx, id, v) => {
            const [x] = await ctx.tx.select({ t: localTime }).from(i).where(eq(i.id, id));
            await ctx.tx.update(i).set({ scheduledAt: await when(ctx, String(v), x?.t ?? '10:00') }).where(eq(i.id, id));
          },
        },
        time: {
          label: 'Time',
          type: 'text',
          schema: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 10:30'),
          required: true,
          help: 'HH:MM, 24-hour',
          apply: async (ctx, id, v) => {
            const [x] = await ctx.tx.select({ d: local }).from(i).where(eq(i.id, id));
            await ctx.tx.update(i).set({ scheduledAt: await when(ctx, x!.d, String(v)) }).where(eq(i.id, id));
          },
        },
        mode: { label: 'Mode', type: 'select', schema: sel(MODES), column: i.mode, options: MODES, required: true, bulk: true },
        venue: { label: 'Room or meeting link', type: 'text', schema: z.string().trim().max(300).default(''), column: i.venue, bulk: true },
        panel1: { label: 'Panel member 1', type: 'select', schema: Panel, options: panelChoices, apply: setPanel(1) },
        panel2: { label: 'Panel member 2', type: 'select', schema: Panel, options: panelChoices, apply: setPanel(2) },
        panel3: { label: 'Panel member 3', type: 'select', schema: Panel, options: panelChoices, apply: setPanel(3) },
      },
      create: async (ctx, v) => {
        const [x] = await ctx.tx.select({ stage: a.stage }).from(a).where(eq(a.id, String(v.applicantId)));
        if (!x) throw new NotFoundException('Applicant not found');
        if (TERMINAL.includes(x.stage)) throw new ConflictException('This applicant has left the process');
        const panel = [v.panel1, v.panel2, v.panel3].filter((p): p is string => typeof p === 'string' && !!p).filter((p, k, all) => all.indexOf(p) === k);
        if (!panel.length) throw new BadRequestException('Choose at least one panel member');
        const [row] = await ctx.tx
          .insert(i)
          .values({ tenantId: ctx.p.tenantId, applicantId: String(v.applicantId), round: Number(v.round ?? 1), kind: String(v.kind), scheduledAt: await when(ctx, String(v.date), String(v.time)), mode: String(v.mode), venue: String(v.venue ?? ''), panelIds: panel, createdBy: ctx.p.userId })
          .returning({ id: i.id });
        if (x.stage === 'applied' || x.stage === 'screening') {
          const [full] = await ctx.tx.select().from(a).where(eq(a.id, String(v.applicantId)));
          await ctx.tx.update(a).set({ stage: 'interview', stageHistory: [...full.stageHistory, { stage: 'interview', at: new Date().toISOString(), by: ctx.p.userId, note: 'Interview scheduled' }] }).where(eq(a.id, full.id));
        }
        return row.id;
      },
      duplicate: (ctx, row) => ({ round: Number(row.round ?? 1) + 1, status: 'scheduled', created_by: ctx.p.userId, created_at: new Date() }),
      actions: {
        complete: { label: 'Mark completed', apply: setStatus('completed') },
        cancel: { label: 'Cancel', tone: 'danger', apply: setStatus('cancelled') },
      },
      columns: [
        { key: 'applicantName', header: 'Applicant' },
        { key: 'openingTitle', header: 'Opening' },
        { key: 'round', header: 'Round' },
        { key: 'kind', header: 'Kind', value: (r) => labelOf(INTERVIEW_KINDS, r.kind) },
        { key: 'date', header: 'Date' },
        { key: 'time', header: 'Time' },
        { key: 'mode', header: 'Mode', value: (r) => labelOf(MODES, r.mode) },
        { key: 'venue', header: 'Venue' },
        { key: 'panelNames', header: 'Panel' },
        { key: 'status', header: 'Status', value: (r) => labelOf(INTERVIEW_STATUS, r.status) },
        { key: 'average', header: 'Average score' },
      ],
    };
  }
}
