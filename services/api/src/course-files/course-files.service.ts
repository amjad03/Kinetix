import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Clock, localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import {
  assessments,
  attainmentSnapshots,
  attendanceRecords,
  chapters,
  coSets,
  lessonPlans,
  marks,
  recordings,
  sections,
  subjects,
  tenants,
  timetableSlots,
  topicCoverage,
  topics,
  users,
  whiteboards,
} from '../db/schema.js';
import type { CourseFileData } from './course-file-pdf.js';

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ATTENDANCE_THRESHOLD = 75;
const PASS_FRACTION = 0.35;
const round = (n: number) => Math.round(n);

/** Gathers what the system already holds for one class and subject (read-only). */
@Injectable()
export class CourseFilesService {
  constructor(private readonly clock: Clock) {}

  now() {
    return this.clock.now();
  }

  async collect(tx: Tx, o: { sectionId: string; subjectId: string; version: number; generatedBy: string }): Promise<{ data: CourseFileData; summary: Record<string, number> }> {
    const [tenant] = await tx.select({ name: tenants.name, tz: tenants.timezone }).from(tenants);
    const tz = tenant?.tz ?? 'Asia/Kolkata';
    const date = (d: Date) => localParts(d, tz).date;
    const [section] = await tx.select({ name: sections.displayName }).from(sections).where(eq(sections.id, o.sectionId));
    const [subject] = await tx.select().from(subjects).where(eq(subjects.id, o.subjectId));
    const [by] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, o.generatedBy));

    // Syllabus with the date each topic was covered in this class.
    const syllabus: CourseFileData['syllabus'] = [];
    if (subject.courseId) {
      const chs = await tx.select().from(chapters).where(eq(chapters.courseId, subject.courseId)).orderBy(asc(chapters.position));
      const tps = chs.length ? await tx.select({ id: topics.id, chapterId: topics.chapterId, title: topics.title, position: topics.position }).from(topics).where(inArray(topics.chapterId, chs.map((c) => c.id))).orderBy(asc(topics.position)) : [];
      const cov = new Map((await tx.select({ topicId: topicCoverage.topicId, on: topicCoverage.coveredOn }).from(topicCoverage).where(eq(topicCoverage.sectionId, o.sectionId))).map((r) => [r.topicId, r.on]));
      for (const c of chs) syllabus.push({ chapter: c.title, topics: tps.filter((t) => t.chapterId === c.id).map((t) => ({ title: t.title, coveredOn: cov.get(t.id) ?? null })) });
    }

    const plans = await tx
      .select({ total: sql<number>`count(*)::int`, reviewed: sql<number>`count(${lessonPlans.reviewedAt})::int`, first: sql<string | null>`min(${lessonPlans.date})`, last: sql<string | null>`max(${lessonPlans.date})` })
      .from(lessonPlans)
      .where(and(eq(lessonPlans.sectionId, o.sectionId), eq(lessonPlans.subjectId, o.subjectId)));

    const slots = await tx
      .select({ id: timetableSlots.id, day: timetableSlots.dayOfWeek, starts: timetableSlots.startsAt, ends: timetableSlots.endsAt, archivedAt: timetableSlots.archivedAt, teacher: users.fullName })
      .from(timetableSlots)
      .innerJoin(users, eq(users.id, timetableSlots.teacherId))
      .where(and(eq(timetableSlots.sectionId, o.sectionId), eq(timetableSlots.subjectId, o.subjectId)))
      .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.startsAt));
    const timetable = slots.filter((s) => !s.archivedAt).map((s) => ({ day: DAYS[s.day] ?? String(s.day), time: `${s.starts.slice(0, 5)}-${s.ends.slice(0, 5)}`, teacher: s.teacher }));

    // Attendance taken period by period for this subject.
    const att = slots.length
      ? await tx
          .select({
            studentId: attendanceRecords.studentId,
            attended: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present', 'late'))::int`,
            absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
            periods: sql<number>`count(distinct (${attendanceRecords.date}, ${attendanceRecords.timetableSlotId}))::int`,
          })
          .from(attendanceRecords)
          .where(inArray(attendanceRecords.timetableSlotId, slots.map((s) => s.id)))
          .groupBy(attendanceRecords.studentId)
      : [];
    const totalAtt = att.reduce((s, r) => s + r.attended, 0);
    const totalAbs = att.reduce((s, r) => s + r.absent, 0);
    const [periods] = slots.length ? await tx.select({ n: sql<number>`count(distinct (${attendanceRecords.date}, ${attendanceRecords.timetableSlotId}))::int` }).from(attendanceRecords).where(inArray(attendanceRecords.timetableSlotId, slots.map((s) => s.id))) : [{ n: 0 }];
    const attendance = {
      sessions: periods.n,
      averagePct: totalAtt + totalAbs > 0 ? round((totalAtt / (totalAtt + totalAbs)) * 100) : null,
      belowThreshold: att.filter((r) => r.attended + r.absent >= 5 && (r.attended / (r.attended + r.absent)) * 100 < ATTENDANCE_THRESHOLD).length,
      threshold: ATTENDANCE_THRESHOLD,
    };

    // Marks of published assessments only.
    const asm = await tx.select().from(assessments).where(and(eq(assessments.sectionId, o.sectionId), eq(assessments.subjectId, o.subjectId), sql`${assessments.publishedAt} is not null`)).orderBy(asc(assessments.heldOn));
    const mk = asm.length ? await tx.select().from(marks).where(inArray(marks.assessmentId, asm.map((a) => a.id))) : [];
    const assessmentRows = asm.map((a) => {
      const rows = mk.filter((m) => m.assessmentId === a.id && !m.absent).map((m) => m.moderatedMarks ?? m.marks).filter((x): x is number => x !== null);
      return {
        title: a.title,
        kind: a.kind,
        heldOn: a.heldOn,
        maxMarks: a.maxMarks,
        entered: rows.length,
        averagePct: rows.length ? round((rows.reduce((s, x) => s + x, 0) / rows.length / a.maxMarks) * 100) : null,
        passPct: rows.length ? round((rows.filter((x) => x >= a.maxMarks * PASS_FRACTION).length / rows.length) * 100) : null,
      };
    });

    // CO attainment: the latest saved calculation for each outcome of the subject, when the OBE module has any.
    const [active] = await tx.select({ id: coSets.id }).from(coSets).where(and(eq(coSets.subjectId, o.subjectId), eq(coSets.status, 'active')));
    const snaps = active ? await tx.select().from(attainmentSnapshots).where(and(eq(attainmentSnapshots.scope, 'co'), eq(attainmentSnapshots.subjectId, o.subjectId))).orderBy(desc(attainmentSnapshots.computedAt)) : [];
    const latest = new Map<string, (typeof snaps)[number]>();
    for (const s of snaps) if (!latest.has(s.code)) latest.set(s.code, s);
    const attainment = [...latest.values()].sort((a, b) => a.code.localeCompare(b.code)).map((s) => ({ code: s.code, direct: s.direct, indirect: s.indirect, combined: s.combined, target: s.target, met: s.met }));

    const wbs = await tx.select({ title: whiteboards.title, updatedAt: whiteboards.updatedAt, sharedAt: whiteboards.sharedAt }).from(whiteboards).where(and(eq(whiteboards.sectionId, o.sectionId), eq(whiteboards.subjectId, o.subjectId))).orderBy(desc(whiteboards.updatedAt)).limit(100);
    const recs = await tx.select({ title: recordings.title, startedAt: recordings.startedAt, durationMs: recordings.durationMs }).from(recordings).where(and(eq(recordings.sectionId, o.sectionId), eq(recordings.subjectId, o.subjectId))).orderBy(desc(recordings.startedAt)).limit(100);

    const data: CourseFileData = {
      institution: tenant?.name ?? '',
      section: section.name,
      subject: subject.name,
      subjectCode: subject.code,
      version: o.version,
      generatedOn: date(this.now()),
      generatedBy: by?.name ?? '',
      syllabus,
      lessonPlans: plans[0],
      timetable,
      attendance,
      assessments: assessmentRows,
      attainment,
      whiteboards: wbs.map((w) => ({ title: w.title, updatedOn: date(w.updatedAt), shared: !!w.sharedAt })),
      recordings: recs.map((r) => ({ title: r.title, recordedOn: date(r.startedAt), minutes: Math.round(r.durationMs / 60_000) })),
    };
    const topicList = syllabus.flatMap((c) => c.topics);
    const summary = {
      topics: topicList.length,
      topicsCovered: topicList.filter((t) => t.coveredOn).length,
      lessonPlans: plans[0].total,
      periods: timetable.length,
      attendanceSessions: attendance.sessions,
      assessments: assessmentRows.length,
      outcomes: attainment.length,
      whiteboards: data.whiteboards.length,
      recordings: data.recordings.length,
    };
    return { data, summary };
  }
}
