import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { healthProfiles, healthVaccinations, healthVisits, sections, students } from '../db/schema.js';
import { HEALTH_STAFF, SchoolLifeService } from './school-life.service.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-20');
const List = z.array(z.string().trim().min(1).max(100)).max(30).default([]);
const ProfileBody = z.object({
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable().default(null),
  allergies: List,
  conditions: List,
  medications: List,
  emergencyContacts: z.array(z.object({ name: z.string().trim().min(1).max(100), relation: z.string().trim().min(1).max(50), phone: z.string().trim().min(5).max(20) })).max(6).default([]),
  notes: z.string().trim().max(3000).default(''),
});
const VisitBody = z.object({ visitedAt: z.iso.datetime().optional(), complaint: z.string().trim().min(2).max(500), action: z.string().trim().max(1000).default(''), sentHome: z.boolean().default(false) });
const VaccinationBody = z.object({ vaccine: z.string().trim().min(2).max(100), dose: z.string().trim().max(50).default(''), givenOn: Day, nextDueOn: Day.optional(), notes: z.string().trim().max(500).default('') });

/** The whole record for one student. */
async function healthRecord(tx: Tx, studentId: string) {
  const [profile] = await tx.select().from(healthProfiles).where(eq(healthProfiles.studentId, studentId));
  const visits = await tx.select().from(healthVisits).where(eq(healthVisits.studentId, studentId)).orderBy(desc(healthVisits.visitedAt)).limit(100);
  const vaccinations = await tx.select().from(healthVaccinations).where(eq(healthVaccinations.studentId, studentId)).orderBy(desc(healthVaccinations.givenOn));
  return { profile: profile ?? null, visits, vaccinations };
}

/**
 * Student health records. Strictly limited: the principal, administrator and counsellor (there is
 * no nurse role yet); teachers and other staff get nothing. Every read is audited; a guardian can
 * read their own child's record.
 */
@Controller('v1/student-health')
export class HealthRecordsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: SchoolLifeService,
  ) {}

  private async student(tx: Tx, id: string) {
    const [s] = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(eq(students.id, id));
    if (!s) throw new NotFoundException('Student not found');
    return s;
  }

  /** Names only, to choose a student; nothing medical. */
  @Get('classes/:sectionId/students')
  @Auth('user', HEALTH_STAFF)
  roster(@CurrentPrincipal() p: UserPrincipal, @Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, hasProfile: sql<boolean>`exists (select 1 from health_profiles h where h.student_id = students.id)` })
        .from(students)
        .where(eq(students.sectionId, sectionId))
        .orderBy(asc(students.rollNo)),
    );
  }

  @Get('sections')
  @Auth('user', HEALTH_STAFF)
  sections(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: sections.id, displayName: sections.displayName }).from(sections).orderBy(asc(sections.displayName)));
  }

  @Get('students/:id')
  @Auth('user', HEALTH_STAFF)
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.student(tx, id);
      await auditUser(tx, p, 'health.viewed', 'student', id, { as: 'staff' });
      return { student: s, ...(await healthRecord(tx, id)) };
    });
  }

  @Put('students/:id/profile')
  @Auth('user', HEALTH_STAFF)
  saveProfile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ProfileBody)) b: z.infer<typeof ProfileBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.student(tx, id);
      const values = { ...b, updatedBy: p.userId, updatedAt: this.svc.now() };
      const [row] = await tx.insert(healthProfiles).values({ ...values, tenantId: p.tenantId, studentId: id }).onConflictDoUpdate({ target: healthProfiles.studentId, set: values }).returning();
      await auditUser(tx, p, 'health.profile_saved', 'student', id);
      return row;
    });
  }

  @Post('students/:id/visits')
  @Auth('user', HEALTH_STAFF)
  logVisit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VisitBody)) b: z.infer<typeof VisitBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.student(tx, id);
      const [row] = await tx.insert(healthVisits).values({ tenantId: p.tenantId, studentId: id, visitedAt: b.visitedAt ? new Date(b.visitedAt) : this.svc.now(), complaint: b.complaint, action: b.action, sentHome: b.sentHome, recordedBy: p.userId }).returning();
      await auditUser(tx, p, 'health.visit_logged', 'student', id, { visitId: row.id, sentHome: b.sentHome });
      if (b.sentHome) await this.svc.notify(tx, await this.svc.guardiansOf(tx, id), 'welfare', `${s.fullName} was sent home`, 'The school nurse has sent your child home. Please contact the school.', `health:home:${row.id}`, { studentId: id });
      return row;
    });
  }

  /** Recent visits across the school, newest first. */
  @Get('visits')
  @Auth('user', HEALTH_STAFF)
  visits(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string, @Query('sentHome') sentHome?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ visit: healthVisits, student: students.fullName, rollNo: students.rollNo })
        .from(healthVisits)
        .innerJoin(students, eq(students.id, healthVisits.studentId))
        .where(and(from ? gte(healthVisits.visitedAt, new Date(`${Day.parse(from)}T00:00:00Z`)) : undefined, to ? lte(healthVisits.visitedAt, new Date(`${Day.parse(to)}T23:59:59Z`)) : undefined, sentHome === 'true' ? eq(healthVisits.sentHome, true) : undefined))
        .orderBy(desc(healthVisits.visitedAt))
        .limit(200);
      await auditUser(tx, p, 'health.visits_listed', 'health_visit', undefined, { count: rows.length });
      return rows.map((r) => ({ ...r.visit, student: r.student, rollNo: r.rollNo }));
    });
  }

  @Post('students/:id/vaccinations')
  @Auth('user', HEALTH_STAFF)
  addVaccination(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VaccinationBody)) b: z.infer<typeof VaccinationBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.student(tx, id);
      const [row] = await tx.insert(healthVaccinations).values({ tenantId: p.tenantId, studentId: id, vaccine: b.vaccine, dose: b.dose, givenOn: b.givenOn, nextDueOn: b.nextDueOn ?? null, notes: b.notes, recordedBy: p.userId }).returning();
      await auditUser(tx, p, 'health.vaccination_recorded', 'student', id, { vaccine: b.vaccine });
      return row;
    });
  }
}

/** Parent App: a guardian reads their own child's health record. */
@Controller('v1/parent/children/:studentId/health')
export class ParentHealthController {
  constructor(
    private readonly db: DbService,
    private readonly svc: SchoolLifeService,
  ) {}

  @Get()
  @Auth('user', ['guardian'])
  get(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.svc.guardianChild(tx, p, studentId);
      await auditUser(tx, p, 'health.viewed', 'student', studentId, { as: 'guardian' });
      return { student: { id: c.id, fullName: c.fullName }, ...(await healthRecord(tx, studentId)) };
    });
  }
}
