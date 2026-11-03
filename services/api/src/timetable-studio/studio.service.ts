import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { SETTINGS_DEFAULTS, SETTINGS_SCHEMAS } from '../academics/academics-rules.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { TIMETABLE_CAPACITY_CODE, TIMETABLE_CLASH_CODES } from '../common/error-codes.js';
import { Clock, localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { electiveBaskets, electiveBasketSubjects, facultyAllocations, periodStructures, studentBatches } from '../db/schema-academic-ops.js';
import { facultyUnavailability, timetableVersions, timetableVersionSlots, type VersionReport, type VersionSettings } from '../db/schema-academics-pass.js';
import { subjectFrequency } from '../db/schema-g1.js';
import { academicSettings, academicTerms, academicYears, courseOfferings, courseRegistrations, guardians, rooms, sections, students, subjects, tenants, timetableSlots, userRoles, users } from '../db/schema.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { bellToPeriods, solve, type Busy, type Fixed, type Lesson, type SolverInput, type SolverPeriod, type SolverRoom, type SolverSection, type SolverTeacher } from './solver.js';

export type VersionSlot = typeof timetableVersionSlots.$inferSelect;

/** A problem with a period of a version: another period at the same time for the class, teacher or room, or a rule it breaks. */
export interface SlotProblem {
  slotId: string | null;
  code: string;
  kind: 'class' | 'teacher' | 'room' | 'unavailable' | 'capacity' | 'room_kind';
  message: string;
  /** The live period (outside the version) or the version's other period it collides with. */
  withSlotId?: string | null;
}

export interface SlotDraft {
  sectionId: string;
  subjectId: string;
  teacherId: string;
  roomId?: string | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  batch?: string | null;
  combinedSectionIds?: string[] | null;
  kind?: string;
}

const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) => a.startsAt.slice(0, 5) < b.endsAt.slice(0, 5) && b.startsAt.slice(0, 5) < a.endsAt.slice(0, 5);
const hhmm = (t: string) => t.slice(0, 5);
const DEFAULT_START = '09:00';
const WHOLE_DAY = { startsAt: '00:00', endsAt: '23:59' };

export const UNAVAILABLE_CODE = 'TIMETABLE_TEACHER_UNAVAILABLE';

/** The timetable studio: versions of the timetable, the generator's input from the academic structure, checks and publishing. */
@Injectable()
export class StudioService {
  constructor(
    private readonly clock: Clock,
    private readonly events: EventBus,
    private readonly notifications: NotificationsService,
  ) {}

  async today(tx: Tx) {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  async settings(tx: Tx) {
    const [row] = await tx.select({ value: academicSettings.value }).from(academicSettings).where(eq(academicSettings.kind, 'timetable'));
    const parsed = SETTINGS_SCHEMAS.timetable.safeParse({ ...SETTINGS_DEFAULTS.timetable, ...(row?.value ?? {}) });
    return parsed.success ? parsed.data : SETTINGS_DEFAULTS.timetable;
  }

  async version(tx: Tx, id: string) {
    const [v] = await tx.select().from(timetableVersions).where(eq(timetableVersions.id, id));
    if (!v) throw new NotFoundException('Timetable version not found');
    return v;
  }

  async draft(tx: Tx, id: string) {
    const v = await this.version(tx, id);
    if (v.status !== 'draft') throw new ConflictException('Only a draft can be changed; make a copy of this version to change it');
    return v;
  }

  async nextNo(tx: Tx) {
    const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${timetableVersions.versionNo}), 0)::int` }).from(timetableVersions);
    return n + 1;
  }

  /** The classes of a version: visible under row-level security, one academic year. */
  async scope(tx: Tx, sectionIds: string[]) {
    const ids = [...new Set(sectionIds)];
    const rows = await tx.select().from(sections).where(inArray(sections.id, ids));
    if (rows.length !== ids.length) throw new NotFoundException('Class not found');
    if (new Set(rows.map((r) => r.academicYearId)).size > 1) throw new BadRequestException('The classes of one version must be of the same academic year');
    return rows;
  }

  /** The bell schedule for the version: given periods, else the programme's period structure, else the settings. */
  async periodsFor(tx: Tx, programId: string, s: VersionSettings): Promise<{ days: number[]; periods: SolverPeriod[]; breakAfter: boolean[] }> {
    if (s.periods?.length) {
      const sorted = [...s.periods].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return { days: s.days ?? [1, 2, 3, 4, 5, 6], ...bellToPeriods(sorted.map((p) => ({ ...p, kind: 'class' as const }))) };
    }
    const structures = await tx.select().from(periodStructures).where(s.structureId ? eq(periodStructures.id, s.structureId) : or(eq(periodStructures.programId, programId), isNull(periodStructures.programId))).orderBy(asc(periodStructures.sortOrder));
    const st = structures.find((x) => x.id === s.structureId) ?? structures.find((x) => x.programId === programId) ?? structures.find((x) => x.isDefault) ?? structures[0];
    if (st?.periods.length) return { days: s.days ?? st.days, ...bellToPeriods(st.periods) };
    const tt = await this.settings(tx);
    const periods: SolverPeriod[] = [];
    let at = minutesOf(DEFAULT_START);
    for (let i = 0; i < tt.periodsPerDay; i++) {
      periods.push({ startsAt: timeOf(at), endsAt: timeOf(at + tt.periodMinutes) });
      at += tt.periodMinutes;
    }
    return { days: s.days ?? [1, 2, 3, 4, 5, 6], periods, breakAfter: periods.map(() => false) };
  }

  /**
   * The generator's input for these classes, from the academic structure: each subject's lecture, tutorial and
   * practical hours (L-T-P), who is allocated to teach it (faculty allocation, else whoever teaches it now), lab
   * batches, elective baskets (run in parallel for every class of the term), combined classes, rooms, teachers' load
   * limits and unavailability, and what other classes already hold.
   */
  async buildInput(tx: Tx, scopeRows: (typeof sections.$inferSelect)[], s: VersionSettings, fixed: Fixed[]): Promise<{ input: SolverInput; noTeacher: string[] }> {
    const tt = await this.settings(tx);
    const labLen = s.labBlockPeriods ?? tt.labBlockPeriods;
    const bell = await this.periodsFor(tx, scopeRows[0].programId, s);
    const ids = scopeRows.map((r) => r.id);
    const today = await this.today(tx);

    const counts = new Map((await tx.select({ id: students.sectionId, n: sql<number>`count(*)::int` }).from(students).where(and(inArray(students.sectionId, ids), eq(students.status, 'active'))).groupBy(students.sectionId)).map((r) => [r.id, r.n]));
    const batchRows = await tx.select({ sectionId: studentBatches.sectionId, batch: studentBatches.batch, n: sql<number>`count(*)::int` }).from(studentBatches).where(inArray(studentBatches.sectionId, ids)).groupBy(studentBatches.sectionId, studentBatches.batch);
    const solverSections: SolverSection[] = scopeRows.map((r) => ({ id: r.id, name: r.displayName, size: counts.get(r.id) ?? 0, batches: batchRows.filter((b) => b.sectionId === r.id).map((b) => ({ name: b.batch, size: b.n })).sort((a, b) => a.name.localeCompare(b.name)) }));

    const pairs = [...new Map(scopeRows.map((r) => [`${r.programId}|${r.term}`, r])).values()];
    const subs = await tx
      .select()
      .from(subjects)
      .where(or(...pairs.map((r) => and(eq(subjects.programId, r.programId), eq(subjects.term, r.term)))))
      .orderBy(asc(subjects.code));
    const rules = new Map((await tx.select().from(subjectFrequency).where(inArray(subjectFrequency.subjectId, subs.length ? subs.map((x) => x.id) : ['00000000-0000-0000-0000-000000000000']))).map((r) => [r.subjectId, r]));
    const allocs = await tx
      .select()
      .from(facultyAllocations)
      .where(and(inArray(facultyAllocations.sectionId, ids), sql`(${facultyAllocations.toDate} is null or ${facultyAllocations.toDate} >= ${today}::date)`, sql`(${facultyAllocations.fromDate} is null or ${facultyAllocations.fromDate} <= ${today}::date)`));
    const live = await tx.select().from(timetableSlots).where(isNull(timetableSlots.archivedAt));
    const liveTeacher = new Map<string, string>();
    for (const l of live) if (!liveTeacher.has(`${l.sectionId}|${l.subjectId}`)) liveTeacher.set(`${l.sectionId}|${l.subjectId}`, l.teacherId);
    const anyTeacher = new Map<string, string>();
    for (const l of live) if (!anyTeacher.has(l.subjectId)) anyTeacher.set(l.subjectId, l.teacherId);
    for (const a of allocs) if (!anyTeacher.has(a.subjectId)) anyTeacher.set(a.subjectId, a.teacherId);

    // Elective baskets of these terms: their subjects run in parallel for every class of the term in this version.
    const baskets = await tx
      .select({ basket: electiveBaskets, subjectId: electiveBasketSubjects.subjectId })
      .from(electiveBaskets)
      .innerJoin(electiveBasketSubjects, eq(electiveBasketSubjects.basketId, electiveBaskets.id))
      .where(or(...pairs.map((r) => and(eq(electiveBaskets.programId, r.programId), eq(electiveBaskets.term, r.term)))));
    const inBasket = new Map(baskets.map((b) => [b.subjectId, b.basket]));
    const registered = new Map(
      (
        await tx
          .select({ subjectId: courseOfferings.subjectId, n: sql<number>`count(*)::int` })
          .from(courseRegistrations)
          .innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId))
          .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.termId))
          .where(and(eq(courseRegistrations.status, 'registered'), eq(academicTerms.academicYearId, scopeRows[0].academicYearId)))
          .groupBy(courseOfferings.subjectId)
      ).map((r) => [r.subjectId, r.n]),
    );

    const lessons: Lesson[] = [];
    const noTeacher: string[] = [];
    const lockedCount = new Map<string, number>();
    for (const f of fixed) for (const sec of [f.sectionId, ...(f.combinedSectionIds ?? [])]) lockedCount.set(`${sec}|${f.subjectId}|${f.batch ?? ''}`, (lockedCount.get(`${sec}|${f.subjectId}|${f.batch ?? ''}`) ?? 0) + 1);
    const need = (sectionId: string, subjectId: string, batch: string | null, want: number) => Math.max(0, want - (lockedCount.get(`${sectionId}|${subjectId}|${batch ?? ''}`) ?? 0));
    const combined = new Map<string, string[]>();
    for (const c of s.combine ?? []) for (const sec of c.sectionIds) combined.set(`${sec}|${c.subjectId}`, c.sectionIds.filter((x) => ids.includes(x)));
    const doneCombined = new Set<string>();

    // Electives: one lesson per basket per term, for every class of the term in scope.
    const basketDone = new Set<string>();
    for (const r of pairs) {
      for (const b of [...new Map(baskets.filter((x) => x.basket.programId === r.programId && x.basket.term === r.term).map((x) => [x.basket.id, x.basket])).values()]) {
        if (basketDone.has(b.id)) continue;
        basketDone.add(b.id);
        const secs = scopeRows.filter((x) => x.programId === b.programId && x.term === b.term).map((x) => x.id);
        const options = subs.filter((x) => inBasket.get(x.id)?.id === b.id);
        const total = secs.reduce((n, id) => n + (counts.get(id) ?? 0), 0);
        const opts = [];
        for (const o of options) {
          const teacherId = allocs.find((a) => a.subjectId === o.id && a.role !== 'lab')?.teacherId ?? anyTeacher.get(o.id);
          if (!teacherId) {
            noTeacher.push(o.name);
            continue;
          }
          opts.push({ subjectId: o.id, subjectName: o.name, teacherId, size: registered.get(o.id) ?? Math.ceil(total / Math.max(1, options.length)) });
        }
        const perWeek = Math.max(0, ...options.map((o) => o.lectureHours || rules.get(o.id)?.minPerWeek || 0)) || 3;
        const left = Math.max(0, perWeek - Math.max(0, ...options.map((o) => lockedCount.get(`${secs[0]}|${o.id}|`) ?? 0)));
        if (opts.length && left) lessons.push({ kind: 'elective', key: `elective:${b.id}`, label: b.name, basketId: b.id, sectionIds: secs, perWeek: left, options: opts });
      }
    }

    for (const sec of scopeRows) {
      const mine = subs.filter((x) => x.programId === sec.programId && x.term === sec.term && !inBasket.has(x.id));
      for (const subj of mine) {
        const rule = rules.get(subj.id);
        const alloc = allocs.filter((a) => a.sectionId === sec.id && a.subjectId === subj.id);
        const theoryTeacher = alloc.find((a) => a.role === 'primary')?.teacherId ?? alloc.find((a) => a.role !== 'lab')?.teacherId ?? liveTeacher.get(`${sec.id}|${subj.id}`) ?? anyTeacher.get(subj.id);
        const isLabCourse = subj.courseType === 'lab';
        // A core course without contact hours gets its frequency rule (or three a week); an elective, skill or audit course
        // outside a basket with no hours is not timetabled (it is taught elsewhere or online).
        const timetabledByDefault = ['core', 'project', 'ability'].includes(subj.courseType) || !!rule;
        const lecture = isLabCourse ? 0 : subj.lectureHours || (subj.practicalHours || subj.tutorialHours || !timetabledByDefault ? 0 : rule?.minPerWeek || 3);
        const practical = isLabCourse ? subj.practicalHours || subj.lectureHours || labLen : subj.practicalHours;
        const maxPerDay = rule?.maxPerDay ?? (lecture > bell.days.length ? 2 : 1);
        if ((lecture || subj.tutorialHours) && !theoryTeacher) noTeacher.push(`${subj.name} (${sec.displayName})`);
        if (lecture && theoryTeacher) {
          const group = combined.get(`${sec.id}|${subj.id}`);
          if (group && group.length > 1) {
            const key = `${subj.id}|${group.slice().sort().join(',')}`;
            if (!doneCombined.has(key)) {
              doneCombined.add(key);
              const n = need(group[0], subj.id, null, lecture);
              if (n) lessons.push({ kind: 'theory', key: `combined:${key}`, label: `${subj.name} (${group.map((g) => scopeRows.find((x) => x.id === g)?.displayName ?? '').join(' + ')})`, sectionIds: group, subjectId: subj.id, teacherId: theoryTeacher, perWeek: n, maxPerDay });
            }
          } else {
            const n = need(sec.id, subj.id, null, lecture);
            if (n) lessons.push({ kind: 'theory', key: `theory:${sec.id}:${subj.id}`, label: `${subj.name} (${sec.displayName})`, sectionIds: [sec.id], subjectId: subj.id, teacherId: theoryTeacher, perWeek: n, maxPerDay });
          }
        }
        if (subj.tutorialHours && theoryTeacher) {
          const tutor = alloc.find((a) => a.role === 'tutorial')?.teacherId ?? theoryTeacher;
          lessons.push({ kind: 'tutorial', key: `tutorial:${sec.id}:${subj.id}`, label: `${subj.name} tutorial (${sec.displayName})`, sectionIds: [sec.id], subjectId: subj.id, teacherId: tutor, perWeek: subj.tutorialHours, maxPerDay: 1 });
        }
        if (practical) {
          const blocks = Math.max(1, Math.ceil(practical / labLen));
          const batches = solverSections.find((x) => x.id === sec.id)!.batches;
          const labTeacher = (batch: string | null) => alloc.find((a) => a.role === 'lab' && (a.batch ?? null) === batch)?.teacherId ?? alloc.find((a) => a.role === 'lab' && !a.batch)?.teacherId ?? theoryTeacher;
          const targets = batches.length ? batches.map((b) => b.name) : [null];
          for (const batch of targets) {
            const teacherId = labTeacher(batch);
            if (!teacherId) {
              noTeacher.push(`${subj.name} lab (${sec.displayName}${batch ? ` ${batch}` : ''})`);
              continue;
            }
            const done = Math.floor((lockedCount.get(`${sec.id}|${subj.id}|${batch ?? ''}`) ?? 0) / labLen);
            if (blocks - done > 0) lessons.push({ kind: 'lab', key: `lab:${sec.id}:${subj.id}:${batch ?? ''}`, label: `${subj.name} lab (${sec.displayName}${batch ? ` ${batch}` : ''})`, sectionIds: [sec.id], subjectId: subj.id, teacherId, perWeek: blocks - done, length: labLen, batch });
          }
        }
      }
    }

    const roomRows = await tx.select({ id: rooms.id, name: rooms.name, kind: rooms.kind, capacity: rooms.capacity, campusId: rooms.campusId, active: rooms.active }).from(rooms);
    const solverRooms: SolverRoom[] = roomRows.filter((r) => r.active).map(({ id, name, kind, capacity }) => ({ id, name, kind, capacity }));

    const teacherIds = [...new Set(lessons.flatMap((l) => (l.kind === 'elective' ? l.options.map((o) => o.teacherId) : [l.teacherId])))];
    const names = teacherIds.length ? new Map((await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, teacherIds))).map((u) => [u.id, u.name])) : new Map<string, string>();
    const teachers: SolverTeacher[] = teacherIds.map((id) => ({ id, name: names.get(id) ?? '', maxPerWeek: tt.maxPeriodsPerTeacherPerWeek, maxPerDay: s.maxPerDay ?? tt.maxPeriodsPerTeacherPerDay, maxConsecutive: s.maxConsecutive ?? tt.maxConsecutivePerTeacher }));

    // What other classes hold: their live periods keep their teachers and rooms.
    const teacherBusy = new Map<string, Busy[]>();
    const roomBusy = new Map<string, Busy[]>();
    for (const l of live) {
      if (ids.includes(l.sectionId) || (l.combinedSectionIds ?? []).some((x) => ids.includes(x))) continue;
      const b = { dayOfWeek: l.dayOfWeek, startsAt: hhmm(l.startsAt), endsAt: hhmm(l.endsAt) };
      teacherBusy.set(l.teacherId, [...(teacherBusy.get(l.teacherId) ?? []), b]);
      if (l.roomId) roomBusy.set(l.roomId, [...(roomBusy.get(l.roomId) ?? []), b]);
    }
    const unavailable = await this.unavailability(tx, teacherIds, today);
    return { input: { days: bell.days, periods: bell.periods, breakAfter: bell.breakAfter, sections: solverSections, rooms: solverRooms, teachers, lessons, teacherBusy, roomBusy, unavailable, fixed }, noTeacher: [...new Set(noTeacher)] };
  }

  /** Teachers' weekly unavailability in force on a date (the whole day when no times are given). */
  async unavailability(tx: Tx, teacherIds: string[], on: string): Promise<Map<string, Busy[]>> {
    const out = new Map<string, Busy[]>();
    if (!teacherIds.length) return out;
    const rows = await tx
      .select()
      .from(facultyUnavailability)
      .where(and(inArray(facultyUnavailability.teacherId, teacherIds), sql`(${facultyUnavailability.toDate} is null or ${facultyUnavailability.toDate} >= ${on}::date)`, sql`(${facultyUnavailability.fromDate} is null or ${facultyUnavailability.fromDate} <= (${on}::date + 180))`));
    for (const r of rows) out.set(r.teacherId, [...(out.get(r.teacherId) ?? []), { dayOfWeek: r.dayOfWeek, startsAt: r.startsAt ? hhmm(r.startsAt) : WHOLE_DAY.startsAt, endsAt: r.endsAt ? hhmm(r.endsAt) : WHOLE_DAY.endsAt }]);
    return out;
  }

  /** Runs the generator for a draft: periods that are locked stay; the rest are replaced by the generator's. */
  async generate(tx: Tx, p: UserPrincipal, versionId: string, override: VersionSettings = {}) {
    const v = await this.draft(tx, versionId);
    const settings: VersionSettings = { ...v.settings, ...override };
    const scopeRows = await this.scope(tx, v.sectionIds);
    const kept = await tx.select().from(timetableVersionSlots).where(and(eq(timetableVersionSlots.versionId, v.id), eq(timetableVersionSlots.locked, true)));
    const fixed: Fixed[] = kept.map((k) => ({ sectionId: k.sectionId, combinedSectionIds: k.combinedSectionIds, batch: k.batch, teacherId: k.teacherId, roomId: k.roomId, subjectId: k.subjectId, dayOfWeek: k.dayOfWeek, startsAt: hhmm(k.startsAt), endsAt: hhmm(k.endsAt) }));
    const { input, noTeacher } = await this.buildInput(tx, scopeRows, settings, fixed);
    const out = solve(input);
    await tx.delete(timetableVersionSlots).where(and(eq(timetableVersionSlots.versionId, v.id), eq(timetableVersionSlots.locked, false)));
    const blockIds = new Map<string, string>();
    const values = out.placements.map((pl) => {
      if (pl.blockId && !blockIds.has(pl.blockId)) blockIds.set(pl.blockId, crypto.randomUUID());
      return {
        tenantId: p.tenantId,
        versionId: v.id,
        sectionId: pl.sectionId,
        subjectId: pl.subjectId,
        teacherId: pl.teacherId,
        roomId: pl.roomId,
        dayOfWeek: pl.dayOfWeek,
        startsAt: pl.startsAt,
        endsAt: pl.endsAt,
        batch: pl.batch,
        combinedSectionIds: pl.combinedSectionIds,
        kind: pl.kind,
        basketId: pl.basketId,
        blockId: pl.blockId ? blockIds.get(pl.blockId)! : null,
      };
    });
    for (let i = 0; i < values.length; i += 500) await tx.insert(timetableVersionSlots).values(values.slice(i, i + 500));
    const names = new Map(scopeRows.map((r) => [r.id, r.displayName]));
    const report: VersionReport = {
      placed: out.placements.length + kept.length,
      unplaced: [...out.unplaced.map((u) => ({ label: u.label, sectionId: u.sectionId, missing: u.missing, reason: u.reason })), ...noTeacher.map((n) => ({ label: n, sectionId: null, missing: 0, reason: 'no_teacher' }))],
      teachers: out.teachers,
      generatedAt: this.clock.now().toISOString(),
    };
    await tx.update(timetableVersions).set({ settings: { ...settings, days: input.days, periods: input.periods }, report, updatedAt: new Date() }).where(eq(timetableVersions.id, v.id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.version_generated', subjectType: 'timetable_version', subjectId: v.id, data: { placed: report.placed, unplaced: out.unplaced.reduce((n, u) => n + u.missing, 0), classes: [...names.values()] } });
    return report;
  }

  /** Copies the live periods of the classes into a draft. */
  async copyLive(tx: Tx, p: UserPrincipal, versionId: string, sectionIds: string[]) {
    const live = await tx.select().from(timetableSlots).where(and(isNull(timetableSlots.archivedAt), inArray(timetableSlots.sectionId, sectionIds)));
    const values = live.map((l) => ({ tenantId: p.tenantId, versionId, sectionId: l.sectionId, subjectId: l.subjectId, teacherId: l.teacherId, roomId: l.roomId, dayOfWeek: l.dayOfWeek, startsAt: l.startsAt, endsAt: l.endsAt, batch: l.batch, combinedSectionIds: l.combinedSectionIds, kind: l.batch ? 'lab' : 'theory' }));
    for (let i = 0; i < values.length; i += 500) await tx.insert(timetableVersionSlots).values(values.slice(i, i + 500));
    return values.length;
  }

  /**
   * Every problem of one proposed period in a version: the class (or a combined class, or the same batch), the teacher
   * or the room already has a period then in the version or, outside the version's classes, in the live timetable; the
   * teacher is unavailable; the room does not seat the class or is not a lab for a lab.
   */
  async problems(tx: Tx, v: typeof timetableVersions.$inferSelect, d: SlotDraft, ignore: string[] = []): Promise<SlotProblem[]> {
    const out: SlotProblem[] = [];
    const mine = [d.sectionId, ...(d.combinedSectionIds ?? [])];
    const others = (await tx.select().from(timetableVersionSlots).where(and(eq(timetableVersionSlots.versionId, v.id), eq(timetableVersionSlots.dayOfWeek, d.dayOfWeek)))).filter((x) => !ignore.includes(x.id) && overlaps(x, d));
    const live = (await tx.select().from(timetableSlots).where(and(isNull(timetableSlots.archivedAt), eq(timetableSlots.dayOfWeek, d.dayOfWeek)))).filter((x) => overlaps(x, d) && !v.sectionIds.includes(x.sectionId) && !(x.combinedSectionIds ?? []).some((c) => v.sectionIds.includes(c)));
    const names = new Map((await tx.select({ id: sections.id, name: sections.displayName }).from(sections).where(inArray(sections.id, [...new Set([...others, ...live].map((x) => x.sectionId))].concat(mine)))).map((r) => [r.id, r.name]));
    const at = (x: { startsAt: string; endsAt: string }) => `${hhmm(x.startsAt)}–${hhmm(x.endsAt)}`;
    for (const x of [...others, ...live]) {
      const theirs = [x.sectionId, ...(x.combinedSectionIds ?? [])];
      const sameClass = theirs.some((s) => mine.includes(s));
      // Two batches of one class may meet at once; a whole-class period and anything else of the class may not.
      const classClash = sameClass && !(d.batch && x.batch && d.batch !== x.batch);
      // Options of one elective basket run side by side: same classes, different teachers and rooms.
      const parallelElective = sameClass && d.kind === 'elective' && 'basketId' in x && x.kind === 'elective';
      const isVersion = 'versionId' in x;
      if (classClash && !parallelElective) out.push({ slotId: null, code: TIMETABLE_CLASH_CODES.class, kind: 'class', message: `${names.get(x.sectionId) ?? 'The class'} already has a period at ${at(x)}`, withSlotId: x.id });
      else if (x.teacherId === d.teacherId) out.push({ slotId: null, code: TIMETABLE_CLASH_CODES.teacher, kind: 'teacher', message: `The teacher is already teaching ${names.get(x.sectionId) ?? 'another class'} at ${at(x)}${isVersion ? '' : ' (live timetable)'}`, withSlotId: x.id });
      else if (d.roomId && x.roomId === d.roomId) out.push({ slotId: null, code: TIMETABLE_CLASH_CODES.room, kind: 'room', message: `The room is booked for ${names.get(x.sectionId) ?? 'another class'} at ${at(x)}${isVersion ? '' : ' (live timetable)'}`, withSlotId: x.id });
    }
    const today = await this.today(tx);
    const blocks = (await this.unavailability(tx, [d.teacherId], today)).get(d.teacherId) ?? [];
    if (blocks.some((b) => b.dayOfWeek === d.dayOfWeek && overlaps(b, d))) out.push({ slotId: null, code: UNAVAILABLE_CODE, kind: 'unavailable', message: 'The teacher is not available at this time' });
    if (d.roomId) {
      const [room] = await tx.select().from(rooms).where(eq(rooms.id, d.roomId));
      if (!room) throw new NotFoundException('Room not found');
      if (room.capacity != null) {
        const size = d.batch
          ? (await tx.select({ n: sql<number>`count(*)::int` }).from(studentBatches).where(and(eq(studentBatches.sectionId, d.sectionId), eq(studentBatches.batch, d.batch))))[0].n
          : (await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(and(inArray(students.sectionId, mine), eq(students.status, 'active'))))[0].n;
        if (size > room.capacity) out.push({ slotId: null, code: TIMETABLE_CAPACITY_CODE, kind: 'capacity', message: `${room.name} seats ${room.capacity} but the class has ${size} students` });
      }
      if (d.kind === 'lab' && room.kind !== 'lab') out.push({ slotId: null, code: 'TIMETABLE_ROOM_KIND', kind: 'room_kind', message: `${room.name} is not a lab` });
    }
    return out;
  }

  /** Problems of every period of a version (for the editor's warnings and before publishing). */
  async allProblems(tx: Tx, v: typeof timetableVersions.$inferSelect) {
    const slots = await tx.select().from(timetableVersionSlots).where(eq(timetableVersionSlots.versionId, v.id)).orderBy(asc(timetableVersionSlots.dayOfWeek), asc(timetableVersionSlots.startsAt));
    const out: SlotProblem[] = [];
    const seen = new Set<string>();
    for (const s of slots) {
      for (const pr of await this.problems(tx, v, { ...s, startsAt: hhmm(s.startsAt), endsAt: hhmm(s.endsAt) }, [s.id])) {
        // A clash between two of the version's periods is reported once.
        const key = [s.id, pr.withSlotId ?? pr.code].sort().join('|') + pr.kind;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...pr, slotId: s.id });
      }
    }
    return out;
  }

  /** What publishing would change: per class, periods added, removed and kept. */
  async diff(tx: Tx, v: typeof timetableVersions.$inferSelect) {
    const draft = await tx.select().from(timetableVersionSlots).where(eq(timetableVersionSlots.versionId, v.id));
    const live = await tx.select().from(timetableSlots).where(and(isNull(timetableSlots.archivedAt), inArray(timetableSlots.sectionId, v.sectionIds.length ? v.sectionIds : ['00000000-0000-0000-0000-000000000000'])));
    const sig = (x: { sectionId: string; subjectId: string; teacherId: string; roomId: string | null; dayOfWeek: number; startsAt: string; endsAt: string; batch: string | null }) => [x.sectionId, x.subjectId, x.teacherId, x.roomId ?? '', x.dayOfWeek, hhmm(x.startsAt), hhmm(x.endsAt), x.batch ?? ''].join('|');
    const liveSigs = new Map<string, number>();
    for (const l of live) liveSigs.set(sig(l), (liveSigs.get(sig(l)) ?? 0) + 1);
    const names = new Map((await tx.select({ id: sections.id, name: sections.displayName }).from(sections).where(inArray(sections.id, v.sectionIds.length ? v.sectionIds : ['00000000-0000-0000-0000-000000000000']))).map((r) => [r.id, r.name]));
    const rows = v.sectionIds.map((id) => ({ sectionId: id, section: names.get(id) ?? '', added: 0, removed: 0, kept: 0 }));
    const by = new Map(rows.map((r) => [r.sectionId, r]));
    for (const d of draft) {
      const k = sig(d);
      const r = by.get(d.sectionId);
      if (!r) continue;
      if ((liveSigs.get(k) ?? 0) > 0) {
        liveSigs.set(k, liveSigs.get(k)! - 1);
        r.kept++;
      } else r.added++;
    }
    // Live periods the version did not keep are the ones publishing removes.
    for (const l of live) {
      const k = sig(l);
      const r = by.get(l.sectionId);
      if (!r || (liveSigs.get(k) ?? 0) === 0) continue;
      liveSigs.set(k, liveSigs.get(k)! - 1);
      r.removed++;
    }
    return rows;
  }

  /**
   * Publishes a draft: the classes' live periods are archived (attendance and recordings keep pointing at them) and the
   * version's periods become the live timetable; the version it replaces is marked superseded. Elective periods are
   * set on the term's course offerings so registration checks clashes against them. Teachers and families are told.
   */
  async publish(tx: Tx, p: UserPrincipal, id: string, o: { effectiveFrom?: string | null; notify: boolean; note?: string }) {
    const v = await this.draft(tx, id);
    const slots = await tx.select().from(timetableVersionSlots).where(eq(timetableVersionSlots.versionId, v.id));
    if (!slots.length) throw new BadRequestException('This version has no periods to publish');
    const problems = await this.allProblems(tx, v);
    const blocking = problems.filter((x) => x.kind !== 'capacity');
    if (blocking.length) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'TIMETABLE_VERSION_CONFLICTS', message: `${blocking.length} clash${blocking.length === 1 ? '' : 'es'} must be fixed before publishing`, problems: blocking.slice(0, 50) });
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.id, v.academicYearId));
    if (!year) throw new BadRequestException('The academic year of this version no longer exists');
    const now = new Date();
    const live = await tx.select({ id: timetableSlots.id, teacherId: timetableSlots.teacherId }).from(timetableSlots).where(and(isNull(timetableSlots.archivedAt), inArray(timetableSlots.sectionId, v.sectionIds)));
    if (live.length) await tx.update(timetableSlots).set({ archivedAt: now }).where(inArray(timetableSlots.id, live.map((l) => l.id)));
    const inserted = await tx
      .insert(timetableSlots)
      .values(slots.map((s) => ({ tenantId: p.tenantId, academicYearId: v.academicYearId, sectionId: s.sectionId, subjectId: s.subjectId, teacherId: s.teacherId, roomId: s.roomId, dayOfWeek: s.dayOfWeek, startsAt: s.startsAt, endsAt: s.endsAt, batch: s.batch, combinedSectionIds: s.combinedSectionIds, versionId: v.id })))
      .returning({ id: timetableSlots.id, subjectId: timetableSlots.subjectId });
    // Elective periods on the course offerings of the year's terms (registration checks clashes against them).
    const electiveSubjects = [...new Set(slots.filter((s) => s.kind === 'elective').map((s) => s.subjectId))];
    for (const subjectId of electiveSubjects) {
      const ids = inserted.filter((x) => x.subjectId === subjectId).map((x) => x.id);
      await tx.update(courseOfferings).set({ slotIds: ids }).where(and(eq(courseOfferings.subjectId, subjectId), inArray(courseOfferings.termId, tx.select({ id: academicTerms.id }).from(academicTerms).where(eq(academicTerms.academicYearId, v.academicYearId)))));
    }
    // The version this replaces (any published version for these classes) is superseded.
    const older = await tx
      .update(timetableVersions)
      .set({ status: 'superseded', updatedAt: now })
      .where(and(eq(timetableVersions.status, 'published'), ne(timetableVersions.id, v.id), sql`${timetableVersions.sectionIds} && ${uuidArray(v.sectionIds)}`))
      .returning({ id: timetableVersions.id, versionNo: timetableVersions.versionNo });
    await tx.update(timetableVersions).set({ status: 'published', publishedAt: now, publishedBy: p.userId, effectiveFrom: o.effectiveFrom ?? (await this.today(tx)), updatedAt: now, notes: o.note ? (v.notes ? `${v.notes}\n${o.note}` : o.note) : v.notes }).where(eq(timetableVersions.id, v.id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'timetable.version_published', subjectType: 'timetable_version', subjectId: v.id, data: { versionNo: v.versionNo, periods: slots.length, archived: live.length, superseded: older.map((x) => x.versionNo) }, changes: { status: { before: 'draft', after: 'published' } } });
    await this.events.emit(tx, p.tenantId, { type: DomainEvents.TimetablePublished, aggregateType: 'timetable_version', aggregateId: v.id, actorId: p.userId, payload: { versionNo: v.versionNo, sectionIds: v.sectionIds, periods: slots.length, effectiveFrom: o.effectiveFrom ?? null } });
    let told = 0;
    if (o.notify) {
      const teachers = [...new Set([...slots.map((s) => s.teacherId), ...live.map((l) => l.teacherId)])];
      const family = await tx
        .selectDistinct({ id: users.id })
        .from(students)
        .innerJoin(guardians, eq(guardians.studentId, students.id))
        .innerJoin(users, eq(users.id, guardians.userId))
        .where(and(inArray(students.sectionId, v.sectionIds), eq(students.status, 'active')));
      const own = await tx.select({ id: students.userId }).from(students).where(and(inArray(students.sectionId, v.sectionIds), eq(students.status, 'active'), sql`${students.userId} is not null`));
      const recipients = [...new Set([...teachers, ...family.map((f) => f.id), ...own.map((x) => x.id!)])];
      await this.notifications.notifyUsers(tx, recipients, { kind: 'announcement', text: timetableText(v.name, o.effectiveFrom ?? null), data: { timetableVersionId: v.id }, dedupeKey: `timetable:${v.id}` });
      told = recipients.length;
    }
    return { published: slots.length, archived: live.length, superseded: older.map((x) => x.versionNo), told };
  }

  /** Teachers' weekly periods in a version against the load limit and norm. */
  async workload(tx: Tx, v: typeof timetableVersions.$inferSelect) {
    const slots = await tx.select().from(timetableVersionSlots).where(eq(timetableVersionSlots.versionId, v.id));
    const tt = await this.settings(tx);
    const ids = [...new Set(slots.map((s) => s.teacherId))];
    if (!ids.length) return [];
    const names = new Map((await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.name]));
    const outside = await tx
      .select({ teacherId: timetableSlots.teacherId, n: sql<number>`count(*)::int` })
      .from(timetableSlots)
      .where(and(isNull(timetableSlots.archivedAt), inArray(timetableSlots.teacherId, ids), sql`not (${timetableSlots.sectionId} = any(${uuidArray(v.sectionIds)}))`))
      .groupBy(timetableSlots.teacherId);
    const elsewhere = new Map(outside.map((o) => [o.teacherId, o.n]));
    return ids
      .map((id) => {
        const mine = slots.filter((s) => s.teacherId === id);
        const cells = new Set(mine.map((s) => `${s.dayOfWeek}|${hhmm(s.startsAt)}`));
        const byDay = [1, 2, 3, 4, 5, 6, 7].map((d) => new Set(mine.filter((s) => s.dayOfWeek === d).map((s) => hhmm(s.startsAt))).size);
        const total = cells.size + (elsewhere.get(id) ?? 0);
        return { teacherId: id, teacher: names.get(id) ?? '', periods: cells.size, elsewhere: elsewhere.get(id) ?? 0, total, limit: tt.maxPeriodsPerTeacherPerWeek, maxDay: Math.max(...byDay), dayLimit: tt.maxPeriodsPerTeacherPerDay, labPeriods: mine.filter((s) => s.kind === 'lab').length, status: total > tt.maxPeriodsPerTeacherPerWeek || Math.max(...byDay) > tt.maxPeriodsPerTeacherPerDay ? 'over' : 'ok' };
      })
      .sort((a, b) => b.total - a.total || a.teacher.localeCompare(b.teacher));
  }

  /** Teaching staff (for pickers), with the role names. */
  async staff(tx: Tx) {
    return tx.selectDistinct({ id: users.id, fullName: users.fullName }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(and(inArray(userRoles.role, ['teacher', 'hod', 'principal']), eq(users.status, 'active'))).orderBy(asc(users.fullName));
  }
}

/** "Timetable updated" in the recipient's language. */
function timetableText(name: string, from: string | null) {
  const when = (l: 'en' | 'hi' | 'kn') => (from ? { en: ` from ${from}`, hi: ` ${from} से`, kn: ` ${from} ರಿಂದ` }[l] : '');
  return {
    en: { title: 'The timetable has changed', body: `${name} is the new timetable${when('en')}. Open the timetable to see your periods.` },
    hi: { title: 'समय-सारणी बदल गई है', body: `${name} नई समय-सारणी है${when('hi')}। अपने कालांश देखने के लिए समय-सारणी खोलें।` },
    kn: { title: 'ವೇಳಾಪಟ್ಟಿ ಬದಲಾಗಿದೆ', body: `${name} ಹೊಸ ವೇಳಾಪಟ್ಟಿ${when('kn')}. ನಿಮ್ಮ ಅವಧಿಗಳನ್ನು ನೋಡಲು ವೇಳಾಪಟ್ಟಿ ತೆರೆಯಿರಿ.` },
  };
}

/** A uuid[] literal for SQL from ids (each bound as a parameter). */
const uuidArray = (ids: string[]) => (ids.length ? sql`array[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]` : sql`'{}'::uuid[]`);
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const timeOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
