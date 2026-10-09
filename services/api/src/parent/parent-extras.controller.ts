import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { campusEvents, clubActivities, clubActivityAttendance, clubMembers, clubs, diaryEntries, disciplineActions, disciplineIncidents, eventRegistrations, students, subjects, users } from '../db/schema.js';
import { coCurricularGrades, houseMembers, housePoints, houses, reportCards } from '../db/schema-curriculum.js';
import { clubAchievements, clubOfficeBearers, disciplineParentContacts, parentVisibility } from '../db/schema-pathways.js';
import { SchoolLifeService } from '../school-life/school-life.service.js';
import { VISIBILITY_LABELS, VISIBILITY_SECTIONS, ParentVisibilityService, type VisibilitySection } from './parent-visibility.js';

const Section = z.enum(VISIBILITY_SECTIONS);

/** What a child has taken part in: clubs and posts held, events attended, house and points, co-curricular grades, achievements. */
export async function activitiesFor(tx: Tx, studentId: string) {
  const memberships = await tx
    .select({ clubId: clubs.id, club: clubs.name, category: clubs.category, role: clubMembers.role })
    .from(clubMembers)
    .innerJoin(clubs, eq(clubs.id, clubMembers.clubId))
    .where(and(eq(clubMembers.studentId, studentId), eq(clubMembers.status, 'active')))
    .orderBy(asc(clubs.name));
  const points = await tx
    .select({ clubId: clubActivities.clubId, points: sql<number>`coalesce(sum(${clubActivityAttendance.points}), 0)::int`, activities: sql<number>`count(*)::int` })
    .from(clubActivityAttendance)
    .innerJoin(clubActivities, eq(clubActivities.id, clubActivityAttendance.activityId))
    .where(eq(clubActivityAttendance.studentId, studentId))
    .groupBy(clubActivities.clubId);
  const posts = await tx.select({ clubId: clubOfficeBearers.clubId, post: clubOfficeBearers.post }).from(clubOfficeBearers).where(and(eq(clubOfficeBearers.studentId, studentId), eq(clubOfficeBearers.active, true)));
  const events = await tx
    .select({ title: campusEvents.title, eventType: campusEvents.eventType, on: campusEvents.startsAt })
    .from(eventRegistrations)
    .innerJoin(campusEvents, eq(campusEvents.id, eventRegistrations.eventId))
    .where(and(eq(eventRegistrations.studentId, studentId), sql`${eventRegistrations.checkedInAt} is not null`))
    .orderBy(desc(campusEvents.startsAt))
    .limit(20);
  const [house] = await tx.select({ id: houses.id, name: houses.name, colour: houses.colour, isCaptain: houseMembers.isCaptain }).from(houseMembers).innerJoin(houses, eq(houses.id, houseMembers.houseId)).where(eq(houseMembers.studentId, studentId));
  const recognitions = await tx.select({ points: housePoints.points, category: housePoints.category, reason: housePoints.reason, awardedOn: housePoints.awardedOn }).from(housePoints).where(eq(housePoints.studentId, studentId)).orderBy(desc(housePoints.awardedOn)).limit(15);
  const [card] = await tx.select({ id: reportCards.id, termLabel: reportCards.termLabel }).from(reportCards).where(eq(reportCards.studentId, studentId)).orderBy(desc(reportCards.updatedAt)).limit(1);
  const grades = card ? await tx.select({ activity: coCurricularGrades.activity, grade: coCurricularGrades.grade, remark: coCurricularGrades.remark }).from(coCurricularGrades).where(eq(coCurricularGrades.reportCardId, card.id)) : [];
  const achievements = await tx
    .select({ club: clubs.name, title: clubAchievements.title, level: clubAchievements.level, position: clubAchievements.position, achievedOn: clubAchievements.achievedOn })
    .from(clubAchievements)
    .innerJoin(clubs, eq(clubs.id, clubAchievements.clubId))
    .where(sql`${clubAchievements.participants} @> ${JSON.stringify([{ studentId }])}::jsonb`)
    .orderBy(desc(clubAchievements.achievedOn));
  return {
    clubs: memberships.map((m) => ({ club: m.club, category: m.category, role: m.role, posts: posts.filter((x) => x.clubId === m.clubId).map((x) => x.post), points: points.find((x) => x.clubId === m.clubId)?.points ?? 0, activities: points.find((x) => x.clubId === m.clubId)?.activities ?? 0 })),
    events: events.map((e) => ({ title: e.title, eventType: e.eventType, on: e.on.toISOString().slice(0, 10) })),
    house: house ? { ...house, totalPoints: recognitions.reduce((s, r) => s + r.points, 0) } : null,
    recognitions,
    coCurricular: { term: card?.termLabel ?? null, grades },
    achievements,
  };
}

/** Parent visibility switches, and the school-life views for parents and students (activities, behaviour, class diary). */
@Controller()
export class ParentExtrasController {
  constructor(
    private readonly db: DbService,
    private readonly vis: ParentVisibilityService,
    private readonly school: SchoolLifeService,
  ) {}

  /** Which sections the school shows parents; the apps hide the rest. */
  @Get('v1/parent/visibility')
  @Auth('user')
  visibility(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.vis.settings(tx));
  }

  @Get('v1/parent-visibility')
  @Auth('user', ['tenant_admin', 'principal'])
  adminList(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.vis.settings(tx);
      return VISIBILITY_SECTIONS.map((k) => ({ section: k, label: VISIBILITY_LABELS[k], visible: s[k] }));
    });
  }

  @Put('v1/parent-visibility/:section')
  @HttpCode(200)
  @Auth('user', ['tenant_admin', 'principal'])
  set(@CurrentPrincipal() p: UserPrincipal, @Param('section') section: string, @Body(new ZodBody(z.object({ visible: z.boolean() }))) b: { visible: boolean }) {
    const parsed = Section.safeParse(section);
    if (!parsed.success) throw new BadRequestException('Unknown section');
    const key = parsed.data;
    return this.db.withTenant(p.tenantId, async (tx) => {
      await tx
        .insert(parentVisibility)
        .values({ tenantId: p.tenantId, section: key, visible: b.visible, updatedBy: p.userId })
        .onConflictDoUpdate({ target: [parentVisibility.tenantId, parentVisibility.section], set: { visible: b.visible, updatedBy: p.userId, updatedAt: sql`now()` } });
      await auditUser(tx, p, 'parent_visibility.changed', 'parent_visibility', undefined, { section: key, visible: b.visible });
      return { section: key, visible: b.visible };
    });
  }

  private async guard(tx: Tx, p: UserPrincipal, studentId: string, section: VisibilitySection) {
    const child = await this.school.guardianChild(tx, p, studentId);
    await this.vis.assert(tx, p, section);
    return child;
  }

  @Get('v1/parent/children/:studentId/activities')
  @Auth('user', ['guardian'])
  childActivities(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.guard(tx, p, studentId, 'activities');
      return activitiesFor(tx, studentId);
    });
  }

  /** Incidents and the actions taken (never who reported them), what the school sent the parents, and house recognitions. */
  @Get('v1/parent/children/:studentId/behaviour')
  @Auth('user', ['guardian'])
  childBehaviour(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.guard(tx, p, studentId, 'behaviour');
      const incidents = await tx.select({ id: disciplineIncidents.id, incidentOn: disciplineIncidents.incidentOn, kind: disciplineIncidents.kind, severity: disciplineIncidents.severity, description: disciplineIncidents.description, status: disciplineIncidents.status }).from(disciplineIncidents).where(eq(disciplineIncidents.studentId, studentId)).orderBy(desc(disciplineIncidents.incidentOn));
      const ids = incidents.map((i) => i.id);
      const actions = ids.length ? await tx.select({ incidentId: disciplineActions.incidentId, action: disciplineActions.action, detail: disciplineActions.detail, startsOn: disciplineActions.startsOn, endsOn: disciplineActions.endsOn, status: disciplineActions.status }).from(disciplineActions).where(inArray(disciplineActions.incidentId, ids)) : [];
      const notices = ids.length
        ? await tx.select({ id: disciplineParentContacts.id, incidentId: disciplineParentContacts.incidentId, method: disciplineParentContacts.method, summary: disciplineParentContacts.summary, meetingOn: disciplineParentContacts.meetingOn, acknowledgedAt: disciplineParentContacts.acknowledgedAt }).from(disciplineParentContacts).where(and(inArray(disciplineParentContacts.incidentId, ids), eq(disciplineParentContacts.guardianUserId, p.userId)))
        : [];
      const [card] = await tx.select({ behaviourGrade: reportCards.behaviourGrade, termLabel: reportCards.termLabel }).from(reportCards).where(eq(reportCards.studentId, studentId)).orderBy(desc(reportCards.updatedAt)).limit(1);
      const recognitions = await tx.select({ points: housePoints.points, category: housePoints.category, reason: housePoints.reason, awardedOn: housePoints.awardedOn }).from(housePoints).where(and(eq(housePoints.studentId, studentId), gte(housePoints.points, 1))).orderBy(desc(housePoints.awardedOn)).limit(15);
      return { behaviourGrade: card?.behaviourGrade ?? null, term: card?.termLabel ?? null, incidents: incidents.map((i) => ({ ...i, actions: actions.filter((a) => a.incidentId === i.id), notices: notices.filter((n) => n.incidentId === i.id) })), recognitions };
    });
  }

  // ---- the student's own school-life views --------------------------------------------------------

  private async me(tx: Tx, p: UserPrincipal) {
    const [s] = await tx.select({ id: students.id, sectionId: students.sectionId, fullName: students.fullName }).from(students).where(eq(students.userId, p.userId));
    if (!s) throw new NotFoundException('Student not found');
    return s;
  }

  @Get('v1/student/activities')
  @Auth('user', ['student'])
  myActivities(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => activitiesFor(tx, (await this.me(tx, p)).id));
  }

  /** The class diary for the student's own section: classwork, homework notes and notices. */
  @Get('v1/student/diary')
  @Auth('user', ['student'])
  myDiary(@CurrentPrincipal() p: UserPrincipal, @Query('days') days?: string, @Query('date') date?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.me(tx, p);
      const limit = Math.min(Math.max(Number(days) || 14, 1), 90);
      const since = date ? Day.parse(date) : undefined;
      const rows = await tx
        .select({ entry: diaryEntries, author: users.fullName, subject: subjects.name })
        .from(diaryEntries)
        .innerJoin(users, eq(users.id, diaryEntries.authorId))
        .leftJoin(subjects, eq(subjects.id, diaryEntries.subjectId))
        .where(and(eq(diaryEntries.sectionId, s.sectionId), since ? eq(diaryEntries.entryDate, since) : undefined))
        .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.createdAt))
        .limit(since ? 100 : limit * 10);
      return rows.map((r) => ({ id: r.entry.id, entryDate: r.entry.entryDate, classwork: r.entry.classwork, homeworkNote: r.entry.homeworkNote, notice: r.entry.notice, author: r.author, subject: r.subject }));
    });
  }
}

