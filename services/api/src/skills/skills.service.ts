import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import {
  assessmentCoMap, assessments, campusEvents, certificates, clubActivities, clubActivityAttendance, clubs, courseOutcomes, eventRegistrations, guardians, internships, marks, outcomePassports, placementOffers, projectMembers,
  researchProjects, sections, skillEvidence, skillMaps, skills, students, subjects,
} from '../db/schema.js';
import { internshipLevel, levelFromCount, levelFromPercent, levelFromPoints, percent, skillLevel, type MapKind } from './skills.logic.js';

export interface EvidenceItem {
  /** Where it came from: a mapped source kind, or `manual` for staff entries. */
  source: MapKind | 'manual';
  title: string;
  detail: string;
  level: number;
}
export interface PassportSkill { skillId: string; code: string; name: string; category: string; level: number | null; evidence: EvidenceItem[] }
export interface Passport {
  student: { id: string; fullName: string; rollNo: string; className: string };
  skills: PassportSkill[];
  certificates: { serialNo: string | null; title: string; issuedOn: string }[];
  activities: { clubs: { club: string; points: number; activities: number }[]; events: { title: string; eventType: string; on: string }[] };
  verification: { verified: boolean; verifiedAt: string | null };
}

/** Skill evidence computed from existing data, the passport built from it, and small lookups. */
@Injectable()
export class SkillsService {
  constructor(private readonly clock: Clock) {}

  now() {
    return this.clock.now();
  }

  /** Their own student record plus their children's. */
  async familyStudents(tx: Tx, p: UserPrincipal): Promise<string[]> {
    const own = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
    const kids = await tx.select({ id: guardians.studentId }).from(guardians).where(eq(guardians.userId, p.userId));
    return [...own, ...kids].map((r) => r.id);
  }

  async actingStudent(tx: Tx, p: UserPrincipal, studentId?: string): Promise<string> {
    const mine = await this.familyStudents(tx, p);
    const id = studentId ?? (mine.length === 1 ? mine[0] : undefined);
    if (!id || !mine.includes(id)) throw new NotFoundException('Student not found');
    return id;
  }

  /** The verified-passport row for a student, created on first need with a fresh random token. */
  async passportRow(tx: Tx, tenantId: string, studentId: string, newToken: () => string) {
    const [row] = await tx.select().from(outcomePassports).where(eq(outcomePassports.studentId, studentId));
    if (row) return row;
    const [made] = await tx.insert(outcomePassports).values({ tenantId, studentId, verifyToken: newToken() }).onConflictDoNothing().returning();
    return made ?? (await tx.select().from(outcomePassports).where(eq(outcomePassports.studentId, studentId)))[0];
  }

  /** Marks the student scored on published assessments of the given subjects (or all marks mapped to course outcomes), as earned and possible. */
  private async subjectScores(tx: Tx, studentId: string, subjectIds: string[]) {
    if (!subjectIds.length) return new Map<string, { got: number; of: number }>();
    const rows = await tx
      .select({ subjectId: assessments.subjectId, max: assessments.maxMarks, m: marks.marks, mod: marks.moderatedMarks })
      .from(marks)
      .innerJoin(assessments, eq(assessments.id, marks.assessmentId))
      .where(and(eq(marks.studentId, studentId), eq(marks.absent, false), isNotNull(assessments.publishedAt), inArray(assessments.subjectId, subjectIds)));
    const out = new Map<string, { got: number; of: number }>();
    for (const r of rows) {
      const got = r.mod ?? r.m;
      if (got === null) continue;
      const cur = out.get(r.subjectId) ?? { got: 0, of: 0 };
      cur.got += got;
      cur.of += r.max;
      out.set(r.subjectId, cur);
    }
    return out;
  }

  private async coScores(tx: Tx, studentId: string, coIds: string[]) {
    if (!coIds.length) return new Map<string, { got: number; of: number }>();
    const rows = await tx
      .select({ coId: assessmentCoMap.coId, share: assessmentCoMap.share, max: assessments.maxMarks, m: marks.marks, mod: marks.moderatedMarks })
      .from(assessmentCoMap)
      .innerJoin(assessments, eq(assessments.id, assessmentCoMap.assessmentId))
      .innerJoin(marks, and(eq(marks.assessmentId, assessments.id), eq(marks.studentId, studentId)))
      .where(and(eq(marks.absent, false), isNotNull(assessments.publishedAt), inArray(assessmentCoMap.coId, coIds)));
    const out = new Map<string, { got: number; of: number }>();
    for (const r of rows) {
      const got = r.mod ?? r.m;
      if (got === null) continue;
      const cur = out.get(r.coId) ?? { got: 0, of: 0 };
      cur.got += got * r.share;
      cur.of += r.max * r.share;
      out.set(r.coId, cur);
    }
    return out;
  }

  /** Every active skill with the student's evidence (computed from mapped sources, plus manual entries) and resulting level. */
  async skillsFor(tx: Tx, studentId: string): Promise<PassportSkill[]> {
    const defs = await tx.select().from(skills).where(eq(skills.active, true)).orderBy(asc(skills.name));
    if (!defs.length) return [];
    const maps = await tx.select().from(skillMaps);
    const manual = await tx.select().from(skillEvidence).where(eq(skillEvidence.studentId, studentId)).orderBy(asc(skillEvidence.createdAt));

    const refs = (kind: MapKind) => [...new Set(maps.filter((m) => m.kind === kind && m.ref).map((m) => m.ref))];
    const subjectIds = refs('subject');
    const coIds = refs('course_outcome');
    const clubIds = refs('club');
    const wants = (kind: MapKind) => maps.some((m) => m.kind === kind);

    const subjScore = await this.subjectScores(tx, studentId, subjectIds);
    const subjNames = subjectIds.length ? new Map((await tx.select({ id: subjects.id, name: subjects.name }).from(subjects).where(inArray(subjects.id, subjectIds))).map((r) => [r.id, r.name])) : new Map<string, string>();
    const coScore = await this.coScores(tx, studentId, coIds);
    const coNames = coIds.length ? new Map((await tx.select({ id: courseOutcomes.id, code: courseOutcomes.code, statement: courseOutcomes.statement }).from(courseOutcomes).where(inArray(courseOutcomes.id, coIds))).map((r) => [r.id, `${r.code}: ${r.statement}`])) : new Map<string, string>();

    const clubPoints = clubIds.length
      ? new Map(
          (await tx
            .select({ clubId: clubActivities.clubId, name: clubs.name, points: sql<number>`sum(${clubActivityAttendance.points})::int`, n: sql<number>`count(*)::int` })
            .from(clubActivityAttendance)
            .innerJoin(clubActivities, eq(clubActivities.id, clubActivityAttendance.activityId))
            .innerJoin(clubs, eq(clubs.id, clubActivities.clubId))
            .where(and(eq(clubActivityAttendance.studentId, studentId), inArray(clubActivities.clubId, clubIds)))
            .groupBy(clubActivities.clubId, clubs.name)).map((r) => [r.clubId, r]),
        )
      : new Map<string, { name: string; points: number; n: number }>();

    const attended = wants('event_type') ? await this.attendedEvents(tx, studentId) : [];
    const offers = wants('placement') ? await tx.select().from(placementOffers).where(and(eq(placementOffers.studentId, studentId), eq(placementOffers.status, 'accepted'))) : [];
    const interns = wants('internship') ? await tx.select().from(internships).where(and(eq(internships.studentId, studentId), eq(internships.status, 'completed'))) : [];
    const projects = wants('research')
      ? await tx.select({ title: researchProjects.title, status: researchProjects.status }).from(projectMembers).innerJoin(researchProjects, eq(researchProjects.id, projectMembers.projectId)).where(eq(projectMembers.studentId, studentId))
      : [];
    const certs = wants('certificate') ? await tx.select().from(certificates).where(and(eq(certificates.studentId, studentId), eq(certificates.status, 'issued'))) : [];

    return defs.map((d) => {
      const evidence: EvidenceItem[] = [];
      for (const m of maps.filter((x) => x.skillId === d.id)) {
        switch (m.kind as MapKind) {
          case 'subject': {
            const s = subjScore.get(m.ref);
            if (s && s.of > 0) evidence.push({ source: 'subject', title: subjNames.get(m.ref) ?? 'Subject', detail: `${percent(s.got, s.of)}% of marks`, level: levelFromPercent(percent(s.got, s.of)) });
            break;
          }
          case 'course_outcome': {
            const s = coScore.get(m.ref);
            if (s && s.of > 0) evidence.push({ source: 'course_outcome', title: coNames.get(m.ref) ?? 'Course outcome', detail: `${percent(s.got, s.of)}% attainment`, level: levelFromPercent(percent(s.got, s.of)) });
            break;
          }
          case 'club': {
            const c = clubPoints.get(m.ref);
            if (c) evidence.push({ source: 'club', title: c.name, detail: `${c.points} points in ${c.n} activit${c.n === 1 ? 'y' : 'ies'}`, level: levelFromPoints(c.points) });
            break;
          }
          case 'event_type': {
            const hit = attended.filter((e) => e.eventType === m.ref);
            if (hit.length) evidence.push({ source: 'event_type', title: m.ref, detail: `${hit.length} event${hit.length === 1 ? '' : 's'} attended`, level: levelFromCount(hit.length) });
            break;
          }
          case 'placement':
            for (const o of offers) evidence.push({ source: 'placement', title: o.roleTitle, detail: `Placement offer accepted on ${o.respondedAt ? o.respondedAt.toISOString().slice(0, 10) : o.offeredOn}`, level: 4 });
            break;
          case 'internship':
            for (const i of interns) evidence.push({ source: 'internship', title: `${i.title}, ${i.orgName}`, detail: `Completed ${i.endsOn}${i.evaluationScore !== null ? `, evaluation ${i.evaluationScore}` : ''}`, level: internshipLevel(i.evaluationScore) });
            break;
          case 'research':
            for (const r of projects) evidence.push({ source: 'research', title: r.title, detail: r.status === 'completed' ? 'Completed project' : 'Project member', level: r.status === 'completed' ? 4 : 3 });
            break;
          case 'certificate':
            for (const c of certs.filter((x) => !m.ref || x.templateId === m.ref)) evidence.push({ source: 'certificate', title: c.renderedTitle ?? 'Certificate', detail: `Certificate ${c.serialNo ?? ''}`.trim(), level: 2 });
            break;
        }
      }
      for (const e of manual.filter((x) => x.skillId === d.id)) evidence.push({ source: 'manual', title: e.title, detail: e.note, level: e.level });
      return { skillId: d.id, code: d.code, name: d.name, category: d.category, level: skillLevel(evidence.map((e) => e.level)), evidence };
    });
  }

  private async attendedEvents(tx: Tx, studentId: string) {
    return tx
      .select({ title: campusEvents.title, eventType: campusEvents.eventType, startsAt: campusEvents.startsAt })
      .from(eventRegistrations)
      .innerJoin(campusEvents, eq(campusEvents.id, eventRegistrations.eventId))
      .where(and(eq(eventRegistrations.studentId, studentId), isNotNull(eventRegistrations.checkedInAt)))
      .orderBy(asc(campusEvents.startsAt));
  }

  /** The student's Outcome Passport: skills with level and evidence, issued certificates, club and event activity. */
  async passport(tx: Tx, studentId: string): Promise<Passport> {
    const [s] = await tx
      .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    const certs = await tx.select().from(certificates).where(and(eq(certificates.studentId, studentId), eq(certificates.status, 'issued'))).orderBy(asc(certificates.issuedAt));
    const clubRows = await tx
      .select({ club: clubs.name, points: sql<number>`sum(${clubActivityAttendance.points})::int`, activities: sql<number>`count(*)::int` })
      .from(clubActivityAttendance)
      .innerJoin(clubActivities, eq(clubActivities.id, clubActivityAttendance.activityId))
      .innerJoin(clubs, eq(clubs.id, clubActivities.clubId))
      .where(eq(clubActivityAttendance.studentId, studentId))
      .groupBy(clubs.name)
      .orderBy(asc(clubs.name));
    const events = await this.attendedEvents(tx, studentId);
    const [pp] = await tx.select().from(outcomePassports).where(eq(outcomePassports.studentId, studentId));
    return {
      student: s,
      skills: await this.skillsFor(tx, studentId),
      certificates: certs.map((c) => ({ serialNo: c.serialNo, title: c.renderedTitle ?? 'Certificate', issuedOn: (c.issuedAt ?? c.createdAt).toISOString().slice(0, 10) })),
      activities: { clubs: clubRows, events: events.map((e) => ({ title: e.title, eventType: e.eventType, on: e.startsAt.toISOString().slice(0, 10) })) },
      verification: { verified: !!pp?.verifiedAt && !pp.revokedAt, verifiedAt: pp?.verifiedAt && !pp.revokedAt ? pp.verifiedAt.toISOString() : null },
    };
  }
}
