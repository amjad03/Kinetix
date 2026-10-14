import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { programOptions } from '../admin/structure.records.js';
import { audit } from '../common/audit.js';
import { alumniEvents, alumniProfiles, internships, mentoringRequests, placementCompanies, placementDrives, placementOffers, programs, sections, students, subjects, users } from '../db/schema.js';
import { alumniJobPosts, placementFeedback, placementTrainings, studentProgressions } from '../db/schema-placements.js';
import { fail, int, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, DateText, OptionalRef, OptionalText, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { canMoveDrive, FEEDBACK_CRITERIA } from './eligibility.js';
import { MENTOR_ROLES, PLACEMENT_ROLES, PLACEMENT_VIEW_ROLES } from './placements.access.js';

/**
 * Placements, internships, training and alumni as record kit entities (docs/requirements/RECORD_DEPTH_KIT.md):
 * companies, drives, offers, internships, training programmes, progression to higher studies and ventures,
 * employer and alumni feedback, the alumni directory, alumni events, job posts and mentoring requests.
 */

const ALUMNI_ROLES = [...PLACEMENT_ROLES, 'accountant' as const];
const opt = (pairs: [string, string][]): FieldOption[] => pairs.map(([value, label]) => ({ value, label }));
const pick = (list: FieldOption[]) => (v: string) => list.some((o) => o.value === v);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Email = z.union([z.email().max(200), z.literal('')]).nullable().transform((v) => (v ? v.toLowerCase() : null));
const Score = z.coerce.number().int().min(1).max(5);

const COMPANY_STATUS = opt([['active', 'Active'], ['pending', 'Waiting for verification'], ['blacklisted', 'Blacklisted']]);
const DRIVE_STATUS = opt([['draft', 'Draft'], ['open', 'Open'], ['closed', 'Closed'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]);
const DRIVE_KIND = opt([['placement', 'Placement'], ['internship', 'Internship']]);
const CATEGORY = opt([['regular', 'Regular'], ['dream', 'Dream'], ['super_dream', 'Super dream']]);
const OFFER_STATUS = opt([['offered', 'Offered'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['withdrawn', 'Withdrawn'], ['revoked', 'Revoked by the company'], ['expired', 'Expired']]);
const JOINING = opt([['pending', 'Not yet joined'], ['joined', 'Joined'], ['not_joined', 'Did not join']]);
const INTERN_STATUS = opt([['proposed', 'Proposed'], ['approved', 'Approved'], ['ongoing', 'Ongoing'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]);
const TRAINING_KIND = opt([['aptitude', 'Aptitude'], ['technical', 'Technical'], ['soft_skills', 'Soft skills'], ['mock_interview', 'Mock interviews'], ['other', 'Other']]);
const TRAINING_STATUS = opt([['planned', 'Planned'], ['ongoing', 'Ongoing'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]);
const PROGRESSION = opt([['higher_studies', 'Higher studies'], ['entrepreneurship', 'Entrepreneurship'], ['competitive_exam', 'Qualified a competitive exam'], ['off_campus_job', 'Employed (off campus)']]);
const EXAMS = ['NET', 'SLET', 'GATE', 'GMAT', 'CAT', 'GRE', 'JAM', 'IELTS', 'TOEFL', 'Civil services', 'State services', 'Other'];
const FEEDBACK_KIND = opt([['employer', 'Employer'], ['alumni', 'Alumni']]);
const JOB_STATUS = opt([['pending', 'Waiting for review'], ['published', 'Published'], ['closed', 'Closed'], ['rejected', 'Rejected']]);
const JOB_KIND = opt([['job', 'Job'], ['internship', 'Internship']]);
const EVENT_STATUS = opt([['scheduled', 'Scheduled'], ['completed', 'Held'], ['cancelled', 'Cancelled']]);
const MENTORING_STATUS = opt([['pending', 'Waiting'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['completed', 'Completed']]);

async function companyOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: placementCompanies.id, name: placementCompanies.name }).from(placementCompanies).where(eq(placementCompanies.status, 'active')).orderBy(asc(placementCompanies.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function allCompanies(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: placementCompanies.id, name: placementCompanies.name }).from(placementCompanies).orderBy(asc(placementCompanies.name))).map((r) => ({ value: r.id, label: r.name }));
}
export async function studentOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: students.id, rollNo: students.rollNo, name: students.fullName, className: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(sql`${students.status} in ('active', 'graduated', 'alumni', 'completed')`).orderBy(asc(sections.displayName), asc(students.rollNo))).map((r) => ({ value: r.id, label: `${r.rollNo} ${r.name}`, group: r.className }));
}
async function mentorOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.selectDistinct({ id: users.id, name: users.fullName }).from(users).where(and(eq(users.status, 'active'), sql`exists (select 1 from user_roles r where r.user_id = "users"."id" and r.role in ('teacher', 'hod', 'principal'))`)).orderBy(asc(users.fullName))).map((r) => ({ value: r.id, label: r.name }));
}
async function subjectOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, program: programs.name }).from(subjects).innerJoin(programs, eq(programs.id, subjects.programId)).orderBy(asc(programs.name), asc(subjects.code))).map((r) => ({ value: r.id, label: `${r.code} ${r.name}`, group: r.program }));
}
async function alumniOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: alumniProfiles.id, name: alumniProfiles.fullName, year: alumniProfiles.graduationYear }).from(alumniProfiles).orderBy(asc(alumniProfiles.fullName))).map((r) => ({ value: r.id, label: `${r.name} (${r.year})` }));
}
const yearOptions = (): FieldOption[] => {
  const now = new Date().getUTCFullYear();
  return Array.from({ length: 12 }, (_, i) => String(now + 2 - i)).map((y) => ({ value: y, label: y }));
};
const studentByRoll = async (ctx: KitCtx, roll: string) => {
  const [s] = await ctx.tx.select({ id: students.id }).from(students).where(sql`lower(${students.rollNo}) = ${lc(roll)}`).limit(2);
  return s ? s.id : fail('No student with this roll number', roll);
};
const dateCol = (k: string) => (r: Record<string, unknown>) => (r[k] instanceof Date ? (r[k] as Date).toISOString().slice(0, 10) : String(r[k] ?? '').slice(0, 10));

@Injectable()
export class PlacementsRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    for (const e of [this.companies(), this.drives(), this.offers(), this.internships(), this.trainings(), this.progressions(), this.feedback(), this.alumni(), this.events(), this.jobs(), this.mentoring()]) this.registry.register(e);
  }

  // ---- companies ----------------------------------------------------------------------------------

  private companies(): RecordEntity {
    const drives = sql<number>`(select count(*)::int from placement_drives d where d.company_id = "placement_companies"."id")`;
    const placed = sql<number>`(select count(*)::int from placement_offers o join placement_drives d on d.id = o.drive_id where d.company_id = "placement_companies"."id" and o.status = 'accepted')`;
    return {
      key: 'placement-companies',
      module: 'placements',
      table: placementCompanies,
      subjectType: 'company',
      roles: { read: PLACEMENT_VIEW_ROLES, write: PLACEMENT_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: placementCompanies.id, name: placementCompanies.name, sector: placementCompanies.sector, groupName: placementCompanies.groupName, city: placementCompanies.city, website: placementCompanies.website, contactName: placementCompanies.contactName, contactEmail: placementCompanies.contactEmail, contactPhone: placementCompanies.contactPhone, status: placementCompanies.status, selfRegistered: placementCompanies.selfRegistered, hasPortalKey: sql<boolean>`${placementCompanies.portalTokenHash} is not null`, drives, placed, createdAt: placementCompanies.createdAt },
        search: [placementCompanies.name, placementCompanies.sector, placementCompanies.groupName, placementCompanies.city, placementCompanies.contactName],
        filters: {
          status: { label: 'Status', options: COMPANY_STATUS, where: (v) => (pick(COMPANY_STATUS)(v) ? eq(placementCompanies.status, v) : undefined) },
          sector: { label: 'Sector', options: async (ctx) => (await ctx.tx.selectDistinct({ s: placementCompanies.sector }).from(placementCompanies).where(sql`${placementCompanies.sector} <> ''`).orderBy(asc(placementCompanies.sector))).map((r) => ({ value: r.s, label: r.s })), where: (v) => eq(placementCompanies.sector, v) },
        },
        sorts: { name: placementCompanies.name, sector: placementCompanies.sector, drives, placed, created: placementCompanies.createdAt },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: placementCompanies.name, required: true },
        sector: { label: 'Sector', type: 'text', schema: z.string().trim().max(80), column: placementCompanies.sector, bulk: true, help: 'IT services, banking, manufacturing…' },
        groupName: { label: 'Group of companies', type: 'text', schema: OptionalText(120), column: placementCompanies.groupName, bulk: true, help: 'A student gets one offer per group' },
        city: { label: 'City', type: 'text', schema: z.string().trim().max(80), column: placementCompanies.city },
        website: { label: 'Website', type: 'text', schema: z.union([z.url(), z.literal('')]).nullable().transform((v) => v || null), column: placementCompanies.website },
        contactName: { label: 'HR contact', type: 'text', schema: OptionalText(80), column: placementCompanies.contactName },
        contactEmail: { label: 'Contact email', type: 'email', schema: Email, column: placementCompanies.contactEmail },
        contactPhone: { label: 'Contact phone', type: 'phone', schema: OptionalText(30), column: placementCompanies.contactPhone },
        address: { label: 'Address', type: 'textarea', schema: z.string().trim().max(300), column: placementCompanies.address },
        description: { label: 'About the company', type: 'textarea', schema: z.string().trim().max(2000), column: placementCompanies.description },
        status: { label: 'Status', type: 'select', schema: z.enum(['active', 'blacklisted']), column: placementCompanies.status, options: COMPANY_STATUS.filter((o) => o.value !== 'pending'), bulk: true, create: false, help: 'Verify a self-registered company with the Verify action' },
      },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, placementCompanies, placementCompanies.name, String(row.name)), portal_token_hash: null, portal_token_at: null, self_registered: false }),
      actions: {
        verify: {
          label: 'Verify',
          apply: async (ctx, id) => {
            const [c] = await ctx.tx.update(placementCompanies).set({ status: 'active' }).where(and(eq(placementCompanies.id, id), eq(placementCompanies.status, 'pending'))).returning({ id: placementCompanies.id });
            if (!c) throw new ConflictException('This company is not waiting for verification');
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'placement.company_verified', subjectType: 'company', subjectId: id, before: { status: 'pending' }, after: { status: 'active' } });
            return 'Verified; issue a portal key from the company page';
          },
        },
      },
      columns: [
        { key: 'name', header: 'Company' },
        { key: 'sector', header: 'Sector' },
        { key: 'groupName', header: 'Group' },
        { key: 'city', header: 'City' },
        { key: 'contactName', header: 'HR contact' },
        { key: 'contactEmail', header: 'Email' },
        { key: 'contactPhone', header: 'Phone' },
        { key: 'drives', header: 'Drives' },
        { key: 'placed', header: 'Placed' },
        { key: 'status', header: 'Status', value: (r) => COMPANY_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Company', required: true, help: 'Rows are matched on the name', example: 'Infosys' },
          { key: 'sector', header: 'Sector', example: 'IT services' },
          { key: 'group', header: 'Group of companies' },
          { key: 'city', header: 'City', example: 'Bengaluru' },
          { key: 'website', header: 'Website', example: 'https://www.infosys.com' },
          { key: 'contact_name', header: 'HR contact' },
          { key: 'contact_email', header: 'Contact email' },
          { key: 'contact_phone', header: 'Contact phone' },
        ],
        key: ['name'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: placementCompanies.id }).from(placementCompanies).where(sql`lower(${placementCompanies.name}) = ${lc(r.get('name'))}`).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'name');
            const website = r.get('website') || null;
            if (website && !z.url().safeParse(website).success) fail('Give the website as a full address (https://…)', website);
            const email = r.get('contact_email').toLowerCase() || null;
            if (email && !z.email().safeParse(email).success) fail('This email is not valid', email);
            const values = { sector: r.get('sector'), groupName: r.get('group') || null, city: r.get('city'), website, contactName: r.get('contact_name') || null, contactEmail: email, contactPhone: r.get('contact_phone') || null };
            const [found] = await tx.select().from(placementCompanies).where(sql`lower(${placementCompanies.name}) = ${lc(name)}`).limit(1);
            if (!found) {
              await tx.insert(placementCompanies).values({ tenantId: ctx.p.tenantId, name, ...values });
              return outcome(true, false, [name]);
            }
            const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => (found[k] ?? '') !== (values[k] ?? ''));
            if (changed) await tx.update(placementCompanies).set(values).where(eq(placementCompanies.id, found.id));
            return outcome(false, changed, [name]);
          }),
      },
    };
  }

  // ---- drives -------------------------------------------------------------------------------------

  private drives(): RecordEntity {
    const registrations = sql<number>`(select count(*)::int from drive_registrations r where r.drive_id = "placement_drives"."id" and r.status <> 'withdrawn')`;
    const offers = sql<number>`(select count(*)::int from placement_offers o where o.drive_id = "placement_drives"."id" and o.status not in ('withdrawn', 'revoked'))`;
    const move = (to: string) => async (ctx: KitCtx, id: string) => {
      const [d] = await ctx.tx.select().from(placementDrives).where(eq(placementDrives.id, id));
      if (!d || !canMoveDrive(d.status, to)) throw new ConflictException(`A ${d?.status ?? 'missing'} drive cannot become ${to}`);
      await ctx.tx.update(placementDrives).set({ status: to, version: d.version + 1 }).where(eq(placementDrives.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `placement.drive_${to}`, subjectType: 'drive', subjectId: id, before: { status: d.status }, after: { status: to } });
    };
    return {
      key: 'placement-drives',
      module: 'placements',
      table: placementDrives,
      subjectType: 'drive',
      roles: { read: PLACEMENT_VIEW_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.title} (${r.companyName})`,
      list: {
        select: { id: placementDrives.id, title: placementDrives.title, kind: placementDrives.kind, category: placementDrives.category, companyId: placementDrives.companyId, companyName: placementCompanies.name, roleTitle: placementDrives.roleTitle, ctcLpa: placementDrives.ctcLpa, stipendMonthly: placementDrives.stipendMonthly, location: placementDrives.location, venue: placementDrives.venue, description: placementDrives.description, skills: placementDrives.skills, bond: placementDrives.bond, driveDate: placementDrives.driveDate, registrationOpensOn: placementDrives.registrationOpensOn, registrationClosesOn: placementDrives.registrationClosesOn, minCgpa: placementDrives.minCgpa, maxBacklogs: placementDrives.maxBacklogs, status: placementDrives.status, postedByRecruiter: placementDrives.postedByRecruiter, registrations, offers, createdAt: placementDrives.createdAt },
        joins: (q) => q.innerJoin(placementCompanies, eq(placementCompanies.id, placementDrives.companyId)),
        search: [placementDrives.title, placementDrives.roleTitle, placementCompanies.name, placementDrives.location],
        filters: {
          status: { label: 'Status', options: DRIVE_STATUS, where: (v) => (pick(DRIVE_STATUS)(v) ? eq(placementDrives.status, v) : undefined) },
          kind: { label: 'Kind', options: DRIVE_KIND, where: (v) => (pick(DRIVE_KIND)(v) ? eq(placementDrives.kind, v) : undefined) },
          category: { label: 'Category', options: CATEGORY, where: (v) => (pick(CATEGORY)(v) ? eq(placementDrives.category, v) : undefined) },
          company: { label: 'Company', options: allCompanies, where: (v) => uuidEq(placementDrives.companyId, v) },
          programme: { label: 'Programme', options: programOptions, where: (v) => (z.uuid().safeParse(v).success ? sql`(${placementDrives.programIds} = '{}' or ${v}::uuid = any(${placementDrives.programIds}))` : undefined) },
        },
        sorts: { title: placementDrives.title, company: placementCompanies.name, date: placementDrives.driveDate, ctc: placementDrives.ctcLpa, registrations, created: placementDrives.createdAt },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        companyId: { label: 'Company', type: 'select', schema: Ref, column: placementDrives.companyId, options: companyOptions, required: true, edit: false },
        title: { label: 'Drive', type: 'text', schema: Text(160), column: placementDrives.title, required: true },
        kind: { label: 'Kind', type: 'select', schema: z.enum(['placement', 'internship']), column: placementDrives.kind, options: DRIVE_KIND, required: true, edit: false },
        category: { label: 'Category', type: 'select', schema: z.enum(['regular', 'dream', 'super_dream']), column: placementDrives.category, options: CATEGORY, bulk: true, help: 'Under the dream policy a placed student may sit only for a higher category' },
        roleTitle: { label: 'Role', type: 'text', schema: Text(120), column: placementDrives.roleTitle, required: true },
        ctcLpa: { label: 'Package (₹ lakh a year)', type: 'number', schema: z.coerce.number().min(0).max(1000).nullable(), column: placementDrives.ctcLpa },
        stipendMonthly: { label: 'Stipend (₹ a month)', type: 'number', schema: z.coerce.number().int().min(0).max(1_000_000).nullable(), column: placementDrives.stipendMonthly },
        location: { label: 'Job location', type: 'text', schema: z.string().trim().max(120), column: placementDrives.location },
        driveDate: { label: 'Drive date', type: 'date', schema: DateText, column: placementDrives.driveDate },
        venue: { label: 'Venue', type: 'text', schema: z.string().trim().max(160), column: placementDrives.venue },
        registrationOpensOn: { label: 'Registration opens', type: 'date', schema: DateText, column: placementDrives.registrationOpensOn },
        registrationClosesOn: { label: 'Registration closes', type: 'date', schema: DateText, column: placementDrives.registrationClosesOn, bulk: true },
        minCgpa: { label: 'Minimum CGPA', type: 'number', schema: z.coerce.number().min(0).max(10), column: placementDrives.minCgpa, bulk: true },
        maxBacklogs: { label: 'Most backlogs allowed', type: 'number', schema: z.coerce.number().int().min(0).max(50), column: placementDrives.maxBacklogs, bulk: true },
        description: { label: 'Job description', type: 'textarea', schema: z.string().trim().max(4000), column: placementDrives.description },
        skills: { label: 'Skills wanted', type: 'text', schema: z.string().trim().max(500), column: placementDrives.skills },
        bond: { label: 'Service agreement', type: 'text', schema: z.string().trim().max(300), column: placementDrives.bond, help: 'Bond or service agreement terms, if any' },
      },
      create: async (ctx, v) => {
        const [c] = await ctx.tx.select({ status: placementCompanies.status }).from(placementCompanies).where(eq(placementCompanies.id, String(v.companyId)));
        if (!c || c.status !== 'active') throw new ConflictException('Choose an active, verified company');
        const [row] = await ctx.tx
          .insert(placementDrives)
          .values({ tenantId: ctx.p.tenantId, companyId: String(v.companyId), title: String(v.title), kind: String(v.kind), category: String(v.category ?? 'regular'), roleTitle: String(v.roleTitle), ctcLpa: (v.ctcLpa as number | null) ?? null, stipendMonthly: (v.stipendMonthly as number | null) ?? null, location: String(v.location ?? ''), driveDate: (v.driveDate as string | null) ?? null, venue: String(v.venue ?? ''), registrationOpensOn: (v.registrationOpensOn as string | null) ?? null, registrationClosesOn: (v.registrationClosesOn as string | null) ?? null, minCgpa: Number(v.minCgpa ?? 0), maxBacklogs: Number(v.maxBacklogs ?? 0), description: String(v.description ?? ''), skills: String(v.skills ?? ''), bond: String(v.bond ?? ''), createdBy: ctx.p.userId })
          .returning({ id: placementDrives.id });
        return row.id;
      },
      duplicate: (_ctx, row) => ({ title: `${row.title} (copy)`, status: 'draft', version: 0, drive_date: null, posted_by_recruiter: false }),
      remove: {
        guard: async (ctx, id) => {
          const [n] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(placementOffers).where(eq(placementOffers.driveId, id));
          return n.n ? 'This drive has offers; cancel it instead of deleting it' : null;
        },
      },
      actions: {
        open: { label: 'Open registration', apply: move('open') },
        close: { label: 'Close registration', apply: move('closed') },
        complete: { label: 'Mark completed', apply: move('completed') },
        cancel: { label: 'Cancel drive', tone: 'danger', apply: move('cancelled') },
      },
      columns: [
        { key: 'title', header: 'Drive' },
        { key: 'companyName', header: 'Company' },
        { key: 'kind', header: 'Kind', value: (r) => DRIVE_KIND.find((o) => o.value === r.kind)?.label ?? String(r.kind) },
        { key: 'category', header: 'Category', value: (r) => CATEGORY.find((o) => o.value === r.category)?.label ?? String(r.category) },
        { key: 'roleTitle', header: 'Role' },
        { key: 'ctcLpa', header: 'Package (LPA)' },
        { key: 'driveDate', header: 'Drive date' },
        { key: 'registrationClosesOn', header: 'Registration closes' },
        { key: 'minCgpa', header: 'Min CGPA' },
        { key: 'maxBacklogs', header: 'Max backlogs' },
        { key: 'registrations', header: 'Registered' },
        { key: 'offers', header: 'Offers' },
        { key: 'status', header: 'Status', value: (r) => DRIVE_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
    };
  }

  // ---- offers -------------------------------------------------------------------------------------

  private offers(): RecordEntity {
    return {
      key: 'placement-offers',
      module: 'placements',
      table: placementOffers,
      subjectType: 'offer',
      roles: { read: PLACEMENT_VIEW_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.rollNo} ${r.fullName} · ${r.companyName}`,
      list: {
        select: { id: placementOffers.id, studentId: placementOffers.studentId, rollNo: students.rollNo, fullName: students.fullName, className: sections.displayName, programName: programs.name, driveId: placementOffers.driveId, driveTitle: placementDrives.title, category: placementDrives.category, kind: placementDrives.kind, companyName: placementCompanies.name, groupName: placementCompanies.groupName, roleTitle: placementOffers.roleTitle, ctcLpa: placementOffers.ctcLpa, status: placementOffers.status, offeredOn: placementOffers.offeredOn, respondBy: placementOffers.respondBy, respondedVia: placementOffers.respondedVia, joiningStatus: placementOffers.joiningStatus, joinedOn: placementOffers.joinedOn, conditional: placementOffers.conditional, conditionNote: placementOffers.conditionNote, revokedReason: placementOffers.revokedReason, hasLetter: sql<boolean>`${placementOffers.offerLetterKey} is not null`, offerLetterName: placementOffers.offerLetterName },
        joins: (q) => q.innerJoin(students, eq(students.id, placementOffers.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)).innerJoin(placementDrives, eq(placementDrives.id, placementOffers.driveId)).innerJoin(placementCompanies, eq(placementCompanies.id, placementDrives.companyId)),
        search: [students.fullName, students.rollNo, placementCompanies.name, placementOffers.roleTitle],
        filters: {
          status: { label: 'Status', options: OFFER_STATUS, where: (v) => (pick(OFFER_STATUS)(v) ? eq(placementOffers.status, v) : undefined) },
          joining: { label: 'Joining', options: JOINING, where: (v) => (pick(JOINING)(v) ? eq(placementOffers.joiningStatus, v) : undefined) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(sections.programId, v) },
          company: { label: 'Company', options: allCompanies, where: (v) => uuidEq(placementDrives.companyId, v) },
          conditional: { label: 'Conditions', options: opt([['yes', 'Conditional']]), where: (v) => (v === 'yes' ? eq(placementOffers.conditional, true) : undefined) },
        },
        sorts: { student: students.fullName, roll: students.rollNo, company: placementCompanies.name, ctc: placementOffers.ctcLpa, offered: placementOffers.offeredOn },
        defaultSort: { id: 'offered', dir: 'desc' },
      },
      remove: {
        guard: async (ctx, id) => {
          const [o] = await ctx.tx.select({ status: placementOffers.status }).from(placementOffers).where(eq(placementOffers.id, id));
          return o?.status === 'accepted' ? 'An accepted offer stays on record; revoke it if the company withdrew it' : null;
        },
      },
      actions: {
        withdraw: {
          label: 'Withdraw offer',
          tone: 'danger',
          apply: async (ctx, id) => {
            const [o] = await ctx.tx.select().from(placementOffers).where(eq(placementOffers.id, id));
            if (o?.status !== 'offered') throw new ConflictException(`A ${o?.status ?? 'missing'} offer cannot be withdrawn`);
            await ctx.tx.update(placementOffers).set({ status: 'withdrawn' }).where(eq(placementOffers.id, id));
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'placement.offer_withdrawn', subjectType: 'offer', subjectId: id, before: { status: 'offered' }, after: { status: 'withdrawn' } });
          },
        },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'programName', header: 'Programme' },
        { key: 'companyName', header: 'Company' },
        { key: 'roleTitle', header: 'Role' },
        { key: 'ctcLpa', header: 'CTC (LPA)' },
        { key: 'category', header: 'Category', value: (r) => CATEGORY.find((o) => o.value === r.category)?.label ?? String(r.category) },
        { key: 'offeredOn', header: 'Offered on' },
        { key: 'status', header: 'Status', value: (r) => OFFER_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
        { key: 'joiningStatus', header: 'Joining', value: (r) => JOINING.find((o) => o.value === r.joiningStatus)?.label ?? String(r.joiningStatus) },
        { key: 'joinedOn', header: 'Joined on' },
        { key: 'conditional', header: 'Conditional', value: (r) => (r.conditional ? `Yes: ${r.conditionNote ?? ''}` : 'No') },
      ],
    };
  }

  // ---- internships --------------------------------------------------------------------------------

  private internships(): RecordEntity {
    const mentor = alias(users, 'mentor');
    return {
      key: 'internships',
      module: 'placements',
      table: internships,
      subjectType: 'internship',
      roles: { read: MENTOR_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.rollNo} ${r.fullName} · ${r.orgName}`,
      list: {
        select: { id: internships.id, studentId: internships.studentId, rollNo: students.rollNo, fullName: students.fullName, className: sections.displayName, programName: programs.name, companyId: internships.companyId, orgName: internships.orgName, title: internships.title, startsOn: internships.startsOn, endsOn: internships.endsOn, stipendMonthly: internships.stipendMonthly, industryMentor: internships.industryMentor, mentorUserId: internships.mentorUserId, mentorName: mentor.fullName, status: internships.status, evaluationScore: internships.evaluationScore, supervisorRating: internships.supervisorRating, employerFeedback: internships.employerFeedback, credits: internships.credits, creditSubjectId: internships.creditSubjectId, creditSubject: subjects.name, companyConfirmed: internships.companyConfirmed, appliedOn: internships.appliedOn },
        joins: (q) => q.innerJoin(students, eq(students.id, internships.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)).leftJoin(mentor, eq(mentor.id, internships.mentorUserId)).leftJoin(subjects, eq(subjects.id, internships.creditSubjectId)),
        search: [students.fullName, students.rollNo, internships.orgName, internships.title],
        filters: {
          status: { label: 'Status', options: INTERN_STATUS, where: (v) => (pick(INTERN_STATUS)(v) ? eq(internships.status, v) : undefined) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(sections.programId, v) },
          confirmed: { label: 'Company confirmed', options: opt([['yes', 'Confirmed'], ['no', 'Not yet']]), where: (v) => (v === 'yes' ? eq(internships.companyConfirmed, true) : v === 'no' ? eq(internships.companyConfirmed, false) : undefined) },
        },
        sorts: { student: students.fullName, roll: students.rollNo, org: internships.orgName, starts: internships.startsOn, score: internships.evaluationScore },
        defaultSort: { id: 'starts', dir: 'desc' },
        // A mentor sees the internships they mentor; the placement cell and heads of department see all.
        scope: (ctx) => (ctx.p.roles.some((r) => PLACEMENT_VIEW_ROLES.includes(r)) ? undefined : eq(internships.mentorUserId, ctx.p.userId)),
      },
      fields: {
        studentId: { label: 'Student', type: 'select', schema: Ref, column: internships.studentId, options: studentOptions, required: true, edit: false },
        companyId: { label: 'Company (if registered)', type: 'select', schema: OptionalRef, column: internships.companyId, options: allCompanies },
        orgName: { label: 'Organisation', type: 'text', schema: Text(160), column: internships.orgName, required: true },
        title: { label: 'Role', type: 'text', schema: Text(160), column: internships.title, required: true },
        startsOn: { label: 'Starts on', type: 'date', schema: Day, column: internships.startsOn, required: true },
        endsOn: { label: 'Ends on', type: 'date', schema: Day, column: internships.endsOn, required: true },
        appliedOn: { label: 'Applied on', type: 'date', schema: DateText, column: internships.appliedOn },
        stipendMonthly: { label: 'Stipend (₹ a month)', type: 'number', schema: z.coerce.number().int().min(0).max(1_000_000).nullable(), column: internships.stipendMonthly },
        industryMentor: { label: 'Industry supervisor', type: 'text', schema: OptionalText(120), column: internships.industryMentor },
        companyConfirmed: { label: 'Company confirmed', type: 'boolean', schema: z.boolean(), column: internships.companyConfirmed, bulk: true, help: 'The offer or acceptance letter is in' },
        credits: { label: 'Credits', type: 'number', schema: z.coerce.number().min(0).max(40).nullable(), column: internships.credits, bulk: true },
        creditSubjectId: { label: 'Counts for course', type: 'select', schema: OptionalRef, column: internships.creditSubjectId, options: subjectOptions, help: 'The course whose credits it earns' },
        supervisorRating: { label: 'Supervisor rating (1 to 5)', type: 'number', schema: z.coerce.number().int().min(1).max(5).nullable(), column: internships.supervisorRating },
        employerFeedback: { label: 'Supervisor feedback', type: 'textarea', schema: OptionalText(2000), column: internships.employerFeedback },
      },
      create: async (ctx, v) => {
        if (String(v.endsOn) < String(v.startsOn)) throw new BadRequestException({ formErrors: [], fieldErrors: { endsOn: ['The end date is before the start date'] } });
        const [row] = await ctx.tx.insert(internships).values({ tenantId: ctx.p.tenantId, studentId: String(v.studentId), companyId: (v.companyId as string | null) ?? null, orgName: String(v.orgName), title: String(v.title), startsOn: String(v.startsOn), endsOn: String(v.endsOn), appliedOn: (v.appliedOn as string | null) ?? null, stipendMonthly: (v.stipendMonthly as number | null) ?? null, industryMentor: (v.industryMentor as string | null) ?? null, companyConfirmed: Boolean(v.companyConfirmed ?? false), credits: (v.credits as number | null) ?? null, creditSubjectId: (v.creditSubjectId as string | null) ?? null }).returning({ id: internships.id });
        return row.id;
      },
      move: { label: 'Assign faculty mentor', options: mentorOptions, column: internships.mentorUserId },
      remove: {
        guard: async (ctx, id) => {
          const [i] = await ctx.tx.select({ status: internships.status }).from(internships).where(eq(internships.id, id));
          return i?.status === 'completed' ? 'A completed internship stays on the internship register' : null;
        },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'programName', header: 'Programme' },
        { key: 'orgName', header: 'Organisation' },
        { key: 'title', header: 'Role' },
        { key: 'startsOn', header: 'From' },
        { key: 'endsOn', header: 'To' },
        { key: 'stipendMonthly', header: 'Stipend (₹)' },
        { key: 'mentorName', header: 'Faculty mentor' },
        { key: 'industryMentor', header: 'Industry supervisor' },
        { key: 'companyConfirmed', header: 'Confirmed', value: (r) => (r.companyConfirmed ? 'Yes' : 'No') },
        { key: 'credits', header: 'Credits' },
        { key: 'creditSubject', header: 'Course' },
        { key: 'evaluationScore', header: 'Score' },
        { key: 'supervisorRating', header: 'Supervisor rating' },
        { key: 'status', header: 'Status', value: (r) => INTERN_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
      import: {
        columns: [
          { key: 'roll_no', header: 'Roll number', required: true, example: 'BCA21001' },
          { key: 'organisation', header: 'Organisation', required: true, example: 'Bosch India' },
          { key: 'role', header: 'Role', required: true, example: 'Software intern' },
          { key: 'starts_on', header: 'Starts on', required: true, example: '2026-05-15' },
          { key: 'ends_on', header: 'Ends on', required: true, example: '2026-07-15' },
          { key: 'stipend', header: 'Stipend (₹ a month)', example: '10000' },
          { key: 'supervisor', header: 'Industry supervisor' },
          { key: 'credits', header: 'Credits', example: '4' },
        ],
        key: ['roll_no', 'organisation', 'starts_on'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: internships.id }).from(internships).innerJoin(students, eq(students.id, internships.studentId)).where(and(sql`lower(${students.rollNo}) = ${lc(r.get('roll_no'))}`, sql`lower(${internships.orgName}) = ${lc(r.get('organisation'))}`, sql`${internships.startsOn}::text = ${r.get('starts_on')}`)).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const studentId = await studentByRoll({ ...ctx, tx }, required(r, 'roll_no'));
            const startsOn = required(r, 'starts_on');
            const endsOn = required(r, 'ends_on');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn) fail('Use dates like 2026-05-15, the end after the start', `${startsOn} ${endsOn}`);
            const orgName = required(r, 'organisation');
            const values = { title: required(r, 'role'), endsOn, stipendMonthly: r.get('stipend') ? int(r.get('stipend'), 0, 1_000_000) : null, industryMentor: r.get('supervisor') || null, credits: r.get('credits') ? Number(r.get('credits')) : null };
            const [found] = await tx.select().from(internships).where(and(eq(internships.studentId, studentId), sql`lower(${internships.orgName}) = ${lc(orgName)}`, eq(internships.startsOn, startsOn))).limit(1);
            if (!found) {
              await tx.insert(internships).values({ tenantId: ctx.p.tenantId, studentId, orgName, startsOn, ...values });
              return outcome(true, false, [r.get('roll_no'), orgName]);
            }
            const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => (found[k] ?? null) !== (values[k] ?? null));
            if (changed) await tx.update(internships).set(values).where(eq(internships.id, found.id));
            return outcome(false, changed, [r.get('roll_no'), orgName]);
          }),
      },
    };
  }

  // ---- training -----------------------------------------------------------------------------------

  private trainings(): RecordEntity {
    const sessions = sql<number>`(select count(*)::int from placement_training_sessions s where s.training_id = "placement_trainings"."id")`;
    const hoursDone = sql<number>`(select coalesce(sum(s.hours), 0)::float8 from placement_training_sessions s where s.training_id = "placement_trainings"."id")`;
    return {
      key: 'placement-trainings',
      module: 'placements',
      table: placementTrainings,
      subjectType: 'placement_training',
      roles: { read: PLACEMENT_VIEW_ROLES, write: PLACEMENT_ROLES },
      label: (r) => String(r.title),
      list: {
        select: { id: placementTrainings.id, title: placementTrainings.title, kind: placementTrainings.kind, trainer: placementTrainings.trainer, programId: placementTrainings.programId, programName: programs.name, batchYear: placementTrainings.batchYear, startsOn: placementTrainings.startsOn, endsOn: placementTrainings.endsOn, hours: placementTrainings.hours, status: placementTrainings.status, description: placementTrainings.description, sessions, hoursDone },
        joins: (q) => q.leftJoin(programs, eq(programs.id, placementTrainings.programId)),
        search: [placementTrainings.title, placementTrainings.trainer],
        filters: {
          kind: { label: 'Kind', options: TRAINING_KIND, where: (v) => (pick(TRAINING_KIND)(v) ? eq(placementTrainings.kind, v) : undefined) },
          status: { label: 'Status', options: TRAINING_STATUS, where: (v) => (pick(TRAINING_STATUS)(v) ? eq(placementTrainings.status, v) : undefined) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(placementTrainings.programId, v) },
        },
        sorts: { title: placementTrainings.title, starts: placementTrainings.startsOn, kind: placementTrainings.kind },
        defaultSort: { id: 'starts', dir: 'desc' },
      },
      fields: {
        title: { label: 'Programme title', type: 'text', schema: Text(160), column: placementTrainings.title, required: true },
        kind: { label: 'Kind', type: 'select', schema: z.enum(['aptitude', 'technical', 'soft_skills', 'mock_interview', 'other']), column: placementTrainings.kind, options: TRAINING_KIND, required: true, bulk: true },
        trainer: { label: 'Trainer or agency', type: 'text', schema: z.string().trim().max(160), column: placementTrainings.trainer },
        programId: { label: 'For programme', type: 'select', schema: OptionalRef, column: placementTrainings.programId, options: programOptions, help: 'Leave empty for every programme' },
        batchYear: { label: 'Batch (graduating year)', type: 'select', schema: z.union([z.coerce.number().int().min(2000).max(2100), z.literal(''), z.null()]).transform((v) => (v === '' ? null : v)), column: placementTrainings.batchYear, options: yearOptions() },
        startsOn: { label: 'Starts on', type: 'date', schema: Day, column: placementTrainings.startsOn, required: true },
        endsOn: { label: 'Ends on', type: 'date', schema: Day, column: placementTrainings.endsOn, required: true },
        hours: { label: 'Planned hours', type: 'number', schema: z.coerce.number().min(0).max(1000), column: placementTrainings.hours },
        status: { label: 'Status', type: 'select', schema: z.enum(['planned', 'ongoing', 'completed', 'cancelled']), column: placementTrainings.status, options: TRAINING_STATUS, create: false, bulk: true },
        description: { label: 'Syllabus and notes', type: 'textarea', schema: z.string().trim().max(2000), column: placementTrainings.description },
      },
      create: async (ctx, v) => {
        if (String(v.endsOn) < String(v.startsOn)) throw new BadRequestException({ formErrors: [], fieldErrors: { endsOn: ['The end date is before the start date'] } });
        const [row] = await ctx.tx.insert(placementTrainings).values({ tenantId: ctx.p.tenantId, title: String(v.title), kind: String(v.kind), trainer: String(v.trainer ?? ''), programId: (v.programId as string | null) ?? null, batchYear: (v.batchYear as number | null) ?? null, startsOn: String(v.startsOn), endsOn: String(v.endsOn), hours: Number(v.hours ?? 0), description: String(v.description ?? ''), createdBy: ctx.p.userId }).returning({ id: placementTrainings.id });
        return row.id;
      },
      duplicate: (_ctx, row) => ({ title: `${row.title} (copy)`, status: 'planned' }),
      columns: [
        { key: 'title', header: 'Programme' },
        { key: 'kind', header: 'Kind', value: (r) => TRAINING_KIND.find((o) => o.value === r.kind)?.label ?? String(r.kind) },
        { key: 'trainer', header: 'Trainer' },
        { key: 'programName', header: 'For programme' },
        { key: 'batchYear', header: 'Batch' },
        { key: 'startsOn', header: 'From' },
        { key: 'endsOn', header: 'To' },
        { key: 'hours', header: 'Planned hours' },
        { key: 'sessions', header: 'Sessions held' },
        { key: 'hoursDone', header: 'Hours held' },
        { key: 'status', header: 'Status', value: (r) => TRAINING_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
    };
  }

  // ---- progression ------------------------------------------------------------------------------

  private progressions(): RecordEntity {
    return {
      key: 'progressions',
      module: 'placements',
      table: studentProgressions,
      subjectType: 'student_progression',
      roles: { read: [...PLACEMENT_VIEW_ROLES, 'quality_officer'], write: PLACEMENT_ROLES },
      label: (r) => `${r.rollNo} ${r.fullName}`,
      list: {
        select: { id: studentProgressions.id, studentId: studentProgressions.studentId, rollNo: students.rollNo, fullName: students.fullName, programName: programs.name, kind: studentProgressions.kind, year: studentProgressions.year, institution: studentProgressions.institution, program: studentProgressions.program, country: studentProgressions.country, exam: studentProgressions.exam, examRef: studentProgressions.examRef, ventureName: studentProgressions.ventureName, ventureDetail: studentProgressions.ventureDetail, verified: studentProgressions.verified, note: studentProgressions.note },
        joins: (q) => q.innerJoin(students, eq(students.id, studentProgressions.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)),
        search: [students.fullName, students.rollNo, studentProgressions.institution, studentProgressions.ventureName, studentProgressions.exam],
        filters: {
          kind: { label: 'Kind', options: PROGRESSION, where: (v) => (pick(PROGRESSION)(v) ? eq(studentProgressions.kind, v) : undefined) },
          year: { label: 'Year', options: yearOptions(), where: (v) => (/^\d{4}$/.test(v) ? eq(studentProgressions.year, Number(v)) : undefined) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(sections.programId, v) },
          verified: { label: 'Evidence', options: opt([['yes', 'Verified'], ['no', 'Not verified']]), where: (v) => (v === 'yes' ? eq(studentProgressions.verified, true) : v === 'no' ? eq(studentProgressions.verified, false) : undefined) },
        },
        sorts: { student: students.fullName, year: studentProgressions.year, kind: studentProgressions.kind },
        defaultSort: { id: 'year', dir: 'desc' },
      },
      fields: {
        studentId: { label: 'Student', type: 'select', schema: Ref, column: studentProgressions.studentId, options: studentOptions, required: true, edit: false },
        kind: { label: 'Progressed to', type: 'select', schema: z.enum(['higher_studies', 'entrepreneurship', 'competitive_exam', 'off_campus_job']), column: studentProgressions.kind, options: PROGRESSION, required: true },
        year: { label: 'Year', type: 'select', schema: z.coerce.number().int().min(2000).max(2100), column: studentProgressions.year, options: yearOptions(), required: true },
        institution: { label: 'Institution or employer', type: 'text', schema: z.string().trim().max(160), column: studentProgressions.institution },
        program: { label: 'Programme joined', type: 'text', schema: z.string().trim().max(160), column: studentProgressions.program, help: 'MBA, MSc, MTech…' },
        country: { label: 'Country', type: 'text', schema: z.string().trim().max(80), column: studentProgressions.country },
        exam: { label: 'Exam qualified', type: 'select', schema: z.union([z.enum(EXAMS as [string, ...string[]]), z.literal('')]), column: studentProgressions.exam, options: EXAMS.map((e) => ({ value: e, label: e })) },
        examRef: { label: 'Roll number or certificate', type: 'text', schema: z.string().trim().max(80), column: studentProgressions.examRef },
        ventureName: { label: 'Venture', type: 'text', schema: z.string().trim().max(160), column: studentProgressions.ventureName },
        ventureDetail: { label: 'About the venture', type: 'textarea', schema: z.string().trim().max(1000), column: studentProgressions.ventureDetail },
        verified: { label: 'Evidence verified', type: 'boolean', schema: z.boolean(), column: studentProgressions.verified, bulk: true },
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: studentProgressions.note },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'programName', header: 'Graduated in' },
        { key: 'kind', header: 'Progressed to', value: (r) => PROGRESSION.find((o) => o.value === r.kind)?.label ?? String(r.kind) },
        { key: 'year', header: 'Year' },
        { key: 'institution', header: 'Institution or employer' },
        { key: 'program', header: 'Programme joined' },
        { key: 'exam', header: 'Exam' },
        { key: 'examRef', header: 'Roll no or certificate' },
        { key: 'ventureName', header: 'Venture' },
        { key: 'verified', header: 'Verified', value: (r) => (r.verified ? 'Yes' : 'No') },
      ],
      import: {
        columns: [
          { key: 'roll_no', header: 'Roll number', required: true, example: 'BCA21001' },
          { key: 'kind', header: 'Progressed to', required: true, help: PROGRESSION.map((o) => o.value).join(', '), example: 'higher_studies', options: PROGRESSION.map((o) => o.value) },
          { key: 'year', header: 'Year', required: true, example: '2026' },
          { key: 'institution', header: 'Institution or employer', example: 'IIM Bangalore' },
          { key: 'program', header: 'Programme joined', example: 'MBA' },
          { key: 'exam', header: 'Exam qualified', options: EXAMS },
          { key: 'exam_ref', header: 'Roll number or certificate' },
          { key: 'venture', header: 'Venture' },
        ],
        key: ['roll_no', 'kind', 'year'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: studentProgressions.id }).from(studentProgressions).innerJoin(students, eq(students.id, studentProgressions.studentId)).where(and(sql`lower(${students.rollNo}) = ${lc(r.get('roll_no'))}`, eq(studentProgressions.kind, r.get('kind')), sql`${studentProgressions.year}::text = ${r.get('year')}`)).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const studentId = await studentByRoll({ ...ctx, tx }, required(r, 'roll_no'));
            const kind = required(r, 'kind');
            if (!pick(PROGRESSION)(kind)) fail('Unknown progression', kind);
            const year = int(required(r, 'year'), 2000, 2100);
            const exam = r.get('exam');
            if (exam && !EXAMS.includes(exam)) fail('Unknown exam', exam);
            const values = { institution: r.get('institution'), program: r.get('program'), exam, examRef: r.get('exam_ref'), ventureName: r.get('venture') };
            const [found] = await tx.select().from(studentProgressions).where(and(eq(studentProgressions.studentId, studentId), eq(studentProgressions.kind, kind), eq(studentProgressions.year, year))).limit(1);
            if (!found) {
              await tx.insert(studentProgressions).values({ tenantId: ctx.p.tenantId, studentId, kind, year, ...values });
              return outcome(true, false, [r.get('roll_no'), kind]);
            }
            const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => found[k] !== values[k]);
            if (changed) await tx.update(studentProgressions).set(values).where(eq(studentProgressions.id, found.id));
            return outcome(false, changed, [r.get('roll_no'), kind]);
          }),
      },
    };
  }

  // ---- employer and alumni feedback ----------------------------------------------------------------

  private feedback(): RecordEntity {
    const avg = sql<number>`round((${placementFeedback.r1} + ${placementFeedback.r2} + ${placementFeedback.r3} + ${placementFeedback.r4} + ${placementFeedback.r5}) / 5.0, 1)::float8`;
    const rating = (i: number) => ({ label: `${FEEDBACK_CRITERIA.employer[i - 1]} / ${FEEDBACK_CRITERIA.alumni[i - 1]} (1 to 5)`, type: 'number' as const, schema: Score, required: true });
    return {
      key: 'placement-feedback',
      module: 'placements',
      table: placementFeedback,
      subjectType: 'placement_feedback',
      roles: { read: [...PLACEMENT_VIEW_ROLES, 'quality_officer'], write: PLACEMENT_ROLES },
      label: (r) => `${r.respondentName} (${r.respondentOrg || r.kind})`,
      list: {
        select: { id: placementFeedback.id, kind: placementFeedback.kind, companyId: placementFeedback.companyId, companyName: placementCompanies.name, alumniId: placementFeedback.alumniId, respondentName: placementFeedback.respondentName, respondentOrg: placementFeedback.respondentOrg, respondentEmail: placementFeedback.respondentEmail, year: placementFeedback.year, r1: placementFeedback.r1, r2: placementFeedback.r2, r3: placementFeedback.r3, r4: placementFeedback.r4, r5: placementFeedback.r5, overall: placementFeedback.overall, average: avg, comments: placementFeedback.comments, source: placementFeedback.source, createdAt: placementFeedback.createdAt },
        joins: (q) => q.leftJoin(placementCompanies, eq(placementCompanies.id, placementFeedback.companyId)),
        search: [placementFeedback.respondentName, placementFeedback.respondentOrg, placementFeedback.comments],
        filters: {
          kind: { label: 'From', options: FEEDBACK_KIND, where: (v) => (pick(FEEDBACK_KIND)(v) ? eq(placementFeedback.kind, v) : undefined) },
          year: { label: 'Year', options: yearOptions(), where: (v) => (/^\d{4}$/.test(v) ? eq(placementFeedback.year, Number(v)) : undefined) },
        },
        sorts: { year: placementFeedback.year, overall: placementFeedback.overall, created: placementFeedback.createdAt },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        kind: { label: 'From', type: 'select', schema: z.enum(['employer', 'alumni']), column: placementFeedback.kind, options: FEEDBACK_KIND, required: true, edit: false },
        companyId: { label: 'Company', type: 'select', schema: OptionalRef, column: placementFeedback.companyId, options: allCompanies },
        alumniId: { label: 'Alumnus', type: 'select', schema: OptionalRef, column: placementFeedback.alumniId, options: alumniOptions },
        respondentName: { label: 'Given by', type: 'text', schema: Text(120), column: placementFeedback.respondentName, required: true },
        respondentOrg: { label: 'Organisation', type: 'text', schema: z.string().trim().max(160), column: placementFeedback.respondentOrg },
        respondentEmail: { label: 'Email', type: 'email', schema: Email, column: placementFeedback.respondentEmail },
        year: { label: 'Year', type: 'select', schema: z.coerce.number().int().min(2000).max(2100), column: placementFeedback.year, options: yearOptions(), required: true },
        r1: { ...rating(1), column: placementFeedback.r1 },
        r2: { ...rating(2), column: placementFeedback.r2 },
        r3: { ...rating(3), column: placementFeedback.r3 },
        r4: { ...rating(4), column: placementFeedback.r4 },
        r5: { ...rating(5), column: placementFeedback.r5 },
        overall: { label: 'Overall (1 to 5)', type: 'number', schema: Score, column: placementFeedback.overall, required: true },
        comments: { label: 'Comments and suggestions', type: 'textarea', schema: z.string().trim().max(2000), column: placementFeedback.comments },
      },
      columns: [
        { key: 'kind', header: 'From', value: (r) => FEEDBACK_KIND.find((o) => o.value === r.kind)?.label ?? String(r.kind) },
        { key: 'year', header: 'Year' },
        { key: 'respondentName', header: 'Given by' },
        { key: 'respondentOrg', header: 'Organisation' },
        { key: 'r1', header: 'Rating 1' },
        { key: 'r2', header: 'Rating 2' },
        { key: 'r3', header: 'Rating 3' },
        { key: 'r4', header: 'Rating 4' },
        { key: 'r5', header: 'Rating 5' },
        { key: 'overall', header: 'Overall' },
        { key: 'average', header: 'Average' },
        { key: 'comments', header: 'Comments' },
        { key: 'source', header: 'Received through' },
      ],
    };
  }

  // ---- alumni directory ----------------------------------------------------------------------------

  private alumni(): RecordEntity {
    const verifier = alias(users, 'verifier');
    return {
      key: 'alumni',
      module: 'alumni',
      table: alumniProfiles,
      subjectType: 'alumni_profile',
      historyTypes: ['alumni'],
      roles: { read: ALUMNI_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.fullName} (${r.graduationYear})`,
      list: {
        select: { id: alumniProfiles.id, fullName: alumniProfiles.fullName, graduationYear: alumniProfiles.graduationYear, program: alumniProfiles.program, email: alumniProfiles.email, phone: alumniProfiles.phone, employer: alumniProfiles.employer, designation: alumniProfiles.designation, city: alumniProfiles.city, linkedin: alumniProfiles.linkedin, bio: alumniProfiles.bio, directoryVisible: alumniProfiles.directoryVisible, mentorAvailable: alumniProfiles.mentorAvailable, verified: alumniProfiles.verified, verifiedByName: verifier.fullName, hasLogin: sql<boolean>`${alumniProfiles.userId} is not null`, linkedStudent: sql<boolean>`${alumniProfiles.studentId} is not null`, createdAt: alumniProfiles.createdAt },
        joins: (q) => q.leftJoin(verifier, eq(verifier.id, alumniProfiles.verifiedBy)),
        search: [alumniProfiles.fullName, alumniProfiles.program, alumniProfiles.employer, alumniProfiles.city, alumniProfiles.email],
        filters: {
          year: { label: 'Graduated', options: async (ctx) => (await ctx.tx.selectDistinct({ y: alumniProfiles.graduationYear }).from(alumniProfiles).orderBy(sql`1 desc`)).map((r) => ({ value: String(r.y), label: String(r.y) })), where: (v) => (/^\d{4}$/.test(v) ? eq(alumniProfiles.graduationYear, Number(v)) : undefined) },
          verified: { label: 'Verification', options: opt([['yes', 'Verified'], ['no', 'Not verified']]), where: (v) => (v === 'yes' ? eq(alumniProfiles.verified, true) : v === 'no' ? eq(alumniProfiles.verified, false) : undefined) },
          mentor: { label: 'Mentoring', options: opt([['yes', 'Available to mentor']]), where: (v) => (v === 'yes' ? eq(alumniProfiles.mentorAvailable, true) : undefined) },
        },
        sorts: { name: alumniProfiles.fullName, year: alumniProfiles.graduationYear, employer: alumniProfiles.employer, created: alumniProfiles.createdAt },
        defaultSort: { id: 'year', dir: 'desc' },
        tiebreak: [alumniProfiles.fullName],
      },
      fields: {
        fullName: { label: 'Full name', type: 'text', schema: Text(120), column: alumniProfiles.fullName, required: true },
        graduationYear: { label: 'Graduation year', type: 'number', schema: z.coerce.number().int().min(1950).max(2100), column: alumniProfiles.graduationYear, required: true },
        program: { label: 'Programme', type: 'text', schema: z.string().trim().max(120), column: alumniProfiles.program },
        email: { label: 'Email', type: 'email', schema: Email, column: alumniProfiles.email },
        phone: { label: 'Phone', type: 'phone', schema: OptionalText(30), column: alumniProfiles.phone },
        employer: { label: 'Employer', type: 'text', schema: OptionalText(120), column: alumniProfiles.employer },
        designation: { label: 'Designation', type: 'text', schema: OptionalText(120), column: alumniProfiles.designation },
        city: { label: 'City', type: 'text', schema: OptionalText(80), column: alumniProfiles.city },
        linkedin: { label: 'LinkedIn profile', type: 'text', schema: z.union([z.url(), z.literal('')]).nullable().transform((v) => v || null), column: alumniProfiles.linkedin },
        bio: { label: 'About', type: 'textarea', schema: z.string().trim().max(1500), column: alumniProfiles.bio },
        directoryVisible: { label: 'Shown in the directory (consent given)', type: 'boolean', schema: z.boolean(), column: alumniProfiles.directoryVisible, bulk: true },
        mentorAvailable: { label: 'Available to mentor', type: 'boolean', schema: z.boolean(), column: alumniProfiles.mentorAvailable, bulk: true },
      },
      actions: {
        verify: {
          label: 'Mark verified',
          apply: async (ctx, id) => {
            const [a] = await ctx.tx.update(alumniProfiles).set({ verified: true, verifiedBy: ctx.p.userId, verifiedAt: new Date() }).where(and(eq(alumniProfiles.id, id), eq(alumniProfiles.verified, false))).returning({ id: alumniProfiles.id });
            if (!a) throw new ConflictException('Already verified');
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'alumni.verified', subjectType: 'alumni_profile', subjectId: id, before: { verified: false }, after: { verified: true } });
          },
        },
      },
      columns: [
        { key: 'fullName', header: 'Name' },
        { key: 'graduationYear', header: 'Graduated' },
        { key: 'program', header: 'Programme' },
        { key: 'employer', header: 'Employer' },
        { key: 'designation', header: 'Designation' },
        { key: 'city', header: 'City' },
        { key: 'email', header: 'Email' },
        { key: 'phone', header: 'Phone' },
        { key: 'verified', header: 'Verified', value: (r) => (r.verified ? 'Yes' : 'No') },
        { key: 'directoryVisible', header: 'In directory', value: (r) => (r.directoryVisible ? 'Yes' : 'No') },
        { key: 'mentorAvailable', header: 'Mentors', value: (r) => (r.mentorAvailable ? 'Yes' : 'No') },
      ],
      import: {
        columns: [
          { key: 'full_name', header: 'Full name', required: true, example: 'Ananya Rao' },
          { key: 'graduation_year', header: 'Graduation year', required: true, example: '2019' },
          { key: 'program', header: 'Programme', example: 'BCom' },
          { key: 'email', header: 'Email', help: 'Rows are matched on email when given, otherwise on name and year', example: 'ananya.rao@example.in' },
          { key: 'phone', header: 'Phone' },
          { key: 'employer', header: 'Employer' },
          { key: 'designation', header: 'Designation' },
          { key: 'city', header: 'City' },
        ],
        key: ['full_name', 'graduation_year'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: alumniProfiles.id }).from(alumniProfiles).where(r.get('email') ? sql`lower(${alumniProfiles.email}) = ${lc(r.get('email'))}` : and(sql`lower(${alumniProfiles.fullName}) = ${lc(r.get('full_name'))}`, sql`${alumniProfiles.graduationYear}::text = ${r.get('graduation_year')}`)).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const fullName = required(r, 'full_name');
            const graduationYear = int(required(r, 'graduation_year'), 1950, 2100);
            const email = r.get('email').toLowerCase() || null;
            if (email && !z.email().safeParse(email).success) fail('This email is not valid', email);
            const values = { program: r.get('program'), email, phone: r.get('phone') || null, employer: r.get('employer') || null, designation: r.get('designation') || null, city: r.get('city') || null };
            const [found] = await tx.select().from(alumniProfiles).where(email ? sql`lower(${alumniProfiles.email}) = ${email}` : and(sql`lower(${alumniProfiles.fullName}) = ${lc(fullName)}`, eq(alumniProfiles.graduationYear, graduationYear))).limit(1);
            if (!found) {
              await tx.insert(alumniProfiles).values({ tenantId: ctx.p.tenantId, fullName, graduationYear, ...values });
              return outcome(true, false, [fullName, String(graduationYear)]);
            }
            const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => (found[k] ?? null) !== (values[k] ?? null));
            if (changed) await tx.update(alumniProfiles).set(values).where(eq(alumniProfiles.id, found.id));
            return outcome(false, changed, [fullName, String(graduationYear)]);
          }),
      },
    };
  }

  // ---- alumni events ----------------------------------------------------------------------------

  private events(): RecordEntity {
    const rsvps = sql<number>`(select count(*)::int from alumni_event_rsvps r where r.event_id = "alumni_events"."id")`;
    return {
      key: 'alumni-events',
      module: 'alumni',
      table: alumniEvents,
      subjectType: 'alumni_event',
      roles: { read: ALUMNI_ROLES, write: PLACEMENT_ROLES },
      label: (r) => String(r.title),
      list: {
        select: { id: alumniEvents.id, title: alumniEvents.title, startsOn: alumniEvents.startsOn, venue: alumniEvents.venue, description: alumniEvents.description, status: alumniEvents.status, rsvps },
        search: [alumniEvents.title, alumniEvents.venue],
        filters: { status: { label: 'Status', options: EVENT_STATUS, where: (v) => (pick(EVENT_STATUS)(v) ? eq(alumniEvents.status, v) : undefined) } },
        sorts: { title: alumniEvents.title, date: alumniEvents.startsOn, rsvps },
        defaultSort: { id: 'date', dir: 'desc' },
      },
      fields: {
        title: { label: 'Event', type: 'text', schema: Text(160), column: alumniEvents.title, required: true },
        startsOn: { label: 'Date', type: 'date', schema: Day, column: alumniEvents.startsOn, required: true },
        venue: { label: 'Venue', type: 'text', schema: z.string().trim().max(160), column: alumniEvents.venue },
        description: { label: 'Details', type: 'textarea', schema: z.string().trim().max(2000), column: alumniEvents.description },
        status: { label: 'Status', type: 'select', schema: z.enum(['scheduled', 'completed', 'cancelled']), column: alumniEvents.status, options: EVENT_STATUS, create: false, bulk: true },
      },
      create: async (ctx, v) => {
        const [row] = await ctx.tx.insert(alumniEvents).values({ tenantId: ctx.p.tenantId, title: String(v.title), startsOn: String(v.startsOn), venue: String(v.venue ?? ''), description: String(v.description ?? ''), createdBy: ctx.p.userId }).returning({ id: alumniEvents.id });
        return row.id;
      },
      duplicate: (_ctx, row) => ({ title: `${row.title} (copy)`, status: 'scheduled' }),
      columns: [
        { key: 'title', header: 'Event' },
        { key: 'startsOn', header: 'Date' },
        { key: 'venue', header: 'Venue' },
        { key: 'rsvps', header: 'Coming' },
        { key: 'status', header: 'Status', value: (r) => EVENT_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
    };
  }

  // ---- job posts ----------------------------------------------------------------------------------

  private jobs(): RecordEntity {
    const setStatus = (to: string, from: string[]) => async (ctx: KitCtx, id: string) => {
      const [j] = await ctx.tx.select({ status: alumniJobPosts.status }).from(alumniJobPosts).where(eq(alumniJobPosts.id, id));
      if (!j || !from.includes(j.status)) throw new ConflictException(`A ${j?.status ?? 'missing'} post cannot become ${to}`);
      await ctx.tx.update(alumniJobPosts).set({ status: to }).where(eq(alumniJobPosts.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `alumni.job_${to}`, subjectType: 'alumni_job_post', subjectId: id, before: { status: j.status }, after: { status: to } });
    };
    return {
      key: 'alumni-jobs',
      module: 'alumni',
      table: alumniJobPosts,
      subjectType: 'alumni_job_post',
      roles: { read: ALUMNI_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.title} · ${r.company}`,
      list: {
        select: { id: alumniJobPosts.id, title: alumniJobPosts.title, company: alumniJobPosts.company, location: alumniJobPosts.location, kind: alumniJobPosts.kind, description: alumniJobPosts.description, applyContact: alumniJobPosts.applyContact, closesOn: alumniJobPosts.closesOn, status: alumniJobPosts.status, alumniId: alumniJobPosts.alumniId, postedByAlumnus: alumniProfiles.fullName, createdAt: alumniJobPosts.createdAt },
        joins: (q) => q.leftJoin(alumniProfiles, eq(alumniProfiles.id, alumniJobPosts.alumniId)),
        search: [alumniJobPosts.title, alumniJobPosts.company, alumniJobPosts.location],
        filters: {
          status: { label: 'Status', options: JOB_STATUS, where: (v) => (pick(JOB_STATUS)(v) ? eq(alumniJobPosts.status, v) : undefined) },
          kind: { label: 'Kind', options: JOB_KIND, where: (v) => (pick(JOB_KIND)(v) ? eq(alumniJobPosts.kind, v) : undefined) },
        },
        sorts: { title: alumniJobPosts.title, company: alumniJobPosts.company, closes: alumniJobPosts.closesOn, created: alumniJobPosts.createdAt },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      fields: {
        title: { label: 'Role', type: 'text', schema: Text(160), column: alumniJobPosts.title, required: true },
        company: { label: 'Company', type: 'text', schema: Text(160), column: alumniJobPosts.company, required: true },
        kind: { label: 'Kind', type: 'select', schema: z.enum(['job', 'internship']), column: alumniJobPosts.kind, options: JOB_KIND, required: true },
        location: { label: 'Location', type: 'text', schema: z.string().trim().max(120), column: alumniJobPosts.location },
        closesOn: { label: 'Apply by', type: 'date', schema: DateText, column: alumniJobPosts.closesOn },
        applyContact: { label: 'How to apply', type: 'text', schema: z.string().trim().max(300), column: alumniJobPosts.applyContact, help: 'A link or an email address' },
        description: { label: 'Details', type: 'textarea', schema: z.string().trim().max(4000), column: alumniJobPosts.description },
      },
      create: async (ctx, v) => {
        const [row] = await ctx.tx.insert(alumniJobPosts).values({ tenantId: ctx.p.tenantId, title: String(v.title), company: String(v.company), kind: String(v.kind), location: String(v.location ?? ''), closesOn: (v.closesOn as string | null) ?? null, applyContact: String(v.applyContact ?? ''), description: String(v.description ?? ''), postedBy: ctx.p.userId, status: 'published' }).returning({ id: alumniJobPosts.id });
        return row.id;
      },
      actions: {
        publish: { label: 'Publish', apply: setStatus('published', ['pending', 'closed']) },
        close: { label: 'Close', apply: setStatus('closed', ['published', 'pending']) },
        reject: { label: 'Reject', tone: 'danger', apply: setStatus('rejected', ['pending']) },
      },
      columns: [
        { key: 'title', header: 'Role' },
        { key: 'company', header: 'Company' },
        { key: 'kind', header: 'Kind', value: (r) => JOB_KIND.find((o) => o.value === r.kind)?.label ?? String(r.kind) },
        { key: 'location', header: 'Location' },
        { key: 'closesOn', header: 'Apply by' },
        { key: 'postedByAlumnus', header: 'Posted by alumnus' },
        { key: 'status', header: 'Status', value: (r) => JOB_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
        { key: 'createdAt', header: 'Posted', value: dateCol('createdAt') },
      ],
    };
  }

  // ---- mentoring requests ---------------------------------------------------------------------------

  private mentoring(): RecordEntity {
    return {
      key: 'mentoring-requests',
      module: 'alumni',
      table: mentoringRequests,
      subjectType: 'mentoring_request',
      roles: { read: ALUMNI_ROLES, write: PLACEMENT_ROLES },
      label: (r) => `${r.fullName} → ${r.alumniName}`,
      list: {
        select: { id: mentoringRequests.id, studentId: mentoringRequests.studentId, rollNo: students.rollNo, fullName: students.fullName, alumniId: mentoringRequests.alumniId, alumniName: alumniProfiles.fullName, topic: mentoringRequests.topic, message: mentoringRequests.message, status: mentoringRequests.status, createdAt: mentoringRequests.createdAt, respondedAt: mentoringRequests.respondedAt },
        joins: (q) => q.innerJoin(students, eq(students.id, mentoringRequests.studentId)).innerJoin(alumniProfiles, eq(alumniProfiles.id, mentoringRequests.alumniId)),
        search: [students.fullName, students.rollNo, alumniProfiles.fullName, mentoringRequests.topic],
        filters: { status: { label: 'Status', options: MENTORING_STATUS, where: (v) => (pick(MENTORING_STATUS)(v) ? eq(mentoringRequests.status, v) : undefined) } },
        sorts: { created: mentoringRequests.createdAt, student: students.fullName, alumnus: alumniProfiles.fullName },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      columns: [
        { key: 'createdAt', header: 'Asked on', value: dateCol('createdAt') },
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'alumniName', header: 'Alumnus' },
        { key: 'topic', header: 'Topic' },
        { key: 'status', header: 'Status', value: (r) => MENTORING_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
    };
  }
}
