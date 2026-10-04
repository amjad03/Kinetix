import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { validateSlot } from '../admin/timetable-rules.js';
import { normalizePhone } from '../auth/phone.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ERROR_CODES, errorCode } from '../common/error-codes.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicYears, campuses, departmentStaff, departments, guardians, programs, rooms, sections, students, subjects, timetableSlots, userRoles, users } from '../db/schema.js';
import { readTable } from './csv.js';
import type { ImportKind } from './templates.js';

export type RowStatus = 'created' | 'updated' | 'skipped' | 'error';

export interface RowResult {
  /** The line in the file (the header is line 1 when there are no comment lines). */
  row: number;
  status: RowStatus;
  /** What was done (names from the file), or the error in English. */
  message: string;
  /** For errors: a stable code (common/error-codes.ts) the apps word themselves. */
  code?: string;
  /** For errors: the value or the clash that was wrong. */
  detail?: string;
}

export interface ImportResult {
  kind: ImportKind;
  dryRun: boolean;
  /** True when the rows were saved: never on a dry run, never when any row has an error. */
  committed: boolean;
  totals: { rows: number; created: number; updated: number; skipped: number; error: number };
  rows: RowResult[];
}

export interface ImportOptions {
  dryRun: boolean;
  /** Timetable: each class in the file gets exactly the file's periods (its other periods are archived). */
  replace: boolean;
}

export const MAX_ROWS = 5000;

const REQUIRED: Record<ImportKind, string[]> = {
  programs: ['program', 'level', 'terms'],
  staff: ['full_name', 'roles'],
  students: ['roll_no', 'full_name', 'section'],
  timetable: ['section', 'subject_code', 'teacher', 'day', 'start', 'end'],
};

/** Roles the staff file may give. Students and guardians come from the students file. */
const STAFF_ROLES: RoleName[] = ['teacher', 'hod', 'principal', 'tenant_admin', 'accountant', 'librarian'];
const ROLE_ALIASES: Record<string, RoleName> = { admin: 'tenant_admin', administrator: 'tenant_admin', head_of_department: 'hod', head: 'hod', accounts: 'accountant', library: 'librarian' };
const LEVELS: Record<string, (typeof programs.level.enumValues)[number]> = { ug: 'ug', pg: 'pg', school: 'k12', k12: 'k12', diploma: 'diploma', phd: 'phd' };
const DAYS: Record<string, number> = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7 };
const LANGUAGES: Record<string, 'en' | 'hi' | 'kn'> = { en: 'en', english: 'en', hi: 'hi', hindi: 'hi', 'हिन्दी': 'hi', 'हिंदी': 'hi', kn: 'kn', kannada: 'kn', 'ಕನ್ನಡ': 'kn' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A problem with one row: its message is a key of ERROR_CODES, the detail names the value. */
class RowError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

const fail = (message: string, detail?: string): never => {
  throw new RowError(message, detail);
};

/** Thrown to roll back the transaction (dry run, or a file with errors) after the results are built. */
const ROLLBACK = Symbol('rollback');

interface Ctx {
  tenantId: string;
  campusId: string;
  yearId: string;
  replace: boolean;
  /** Within one file: program name → its level and terms, roll numbers and periods seen so far. */
  programsSeen: Map<string, { level: string; terms: number }>;
  seen: Set<string>;
  /** Replace: the periods archived before the rows ran; one the file repeats unchanged is brought back. */
  archived: (typeof timetableSlots.$inferSelect)[];
}

interface Outcome {
  status: Exclude<RowStatus, 'error'>;
  message: string;
}

type Row = { line: number; get: (key: string) => string };

const lc = (s: string) => s.trim().toLowerCase();

/**
 * Bulk import from CSV (ERP → Import): programs and classes, staff, students with their families,
 * and the timetable. The whole file runs in one transaction under row-level security; each row in a
 * savepoint, so a bad row is reported and the next one still checked. A dry run, or any row with an
 * error, rolls everything back: a file is imported completely or not at all.
 */
@Injectable()
export class ImportService {
  constructor(private readonly db: DbService) {}

  async run(p: UserPrincipal, kind: ImportKind, text: string, opts: ImportOptions): Promise<ImportResult> {
    const table = readTable(text);
    if (!table.headers.length || !table.rows.length) throw new BadRequestException('The file has no rows to import');
    if (table.rows.length > MAX_ROWS) throw new BadRequestException('The file has too many rows. Split it into files of at most 5,000 rows.');
    const missing = REQUIRED[kind].filter((c) => !table.headers.includes(c));
    if (missing.length) throw new BadRequestException({ statusCode: 400, message: 'Some required columns are missing', error: 'Bad Request', code: 'IMPORT_MISSING_COLUMNS', missing });

    let result: ImportResult | undefined;
    try {
      await this.db.withTenant(p.tenantId, async (tx) => {
        const ctx = await this.context(tx, p.tenantId, opts.replace && kind === 'timetable');
        if (ctx.replace) await this.archiveForReplace(tx, ctx, table.rows);
        const rows: RowResult[] = [];
        for (const r of table.rows) {
          try {
            const out = await tx.transaction((sp) => this.handlers[kind](sp, ctx, r));
            rows.push({ row: r.line, ...out });
          } catch (e) {
            rows.push(errorRow(r.line, e));
          }
        }
        const totals = { rows: rows.length, created: 0, updated: 0, skipped: 0, error: 0 };
        for (const r of rows) totals[r.status]++;
        const committed = !opts.dryRun && totals.error === 0;
        result = { kind, dryRun: opts.dryRun, committed, totals, rows };
        if (!committed) throw ROLLBACK;
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `import.${kind}`, subjectType: 'import', data: { totals, replace: ctx.replace } });
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
    return result!;
  }

  private readonly handlers: Record<ImportKind, (tx: Tx, ctx: Ctx, r: Row) => Promise<Outcome>> = {
    programs: (tx, ctx, r) => this.program(tx, ctx, r),
    staff: (tx, ctx, r) => this.staff(tx, ctx, r),
    students: (tx, ctx, r) => this.student(tx, ctx, r),
    timetable: (tx, ctx, r) => this.period(tx, ctx, r),
  };

  private async context(tx: Tx, tenantId: string, replace: boolean): Promise<Ctx> {
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
    if (!year) throw new BadRequestException('There is no current academic year');
    const [campus] = await tx.select({ id: campuses.id }).from(campuses).orderBy(asc(campuses.createdAt)).limit(1);
    if (!campus) throw new BadRequestException('The institution has no campus');
    return { tenantId, campusId: campus.id, yearId: year.id, replace, programsSeen: new Map(), seen: new Set(), archived: [] };
  }

  // ---- programs, classes and subjects ------------------------------------------------------

  private async program(tx: Tx, ctx: Ctx, r: Row): Promise<Outcome> {
    const name = required(r, 'program');
    const level = LEVELS[lc(r.get('level'))] ?? fail('Unknown program level (use ug, pg or school)', r.get('level'));
    const terms = int(r.get('terms'), 1, 20);
    const seen = ctx.programsSeen.get(lc(name));
    if (seen && (seen.level !== level || seen.terms !== terms)) fail('A program with this name has a different level or term count in this file', name);
    ctx.programsSeen.set(lc(name), { level, terms });

    let created = false;
    let changed = false;
    const done: string[] = [name];
    let [prog] = await tx.select().from(programs).where(sql`lower(${programs.name}) = ${lc(name)}`).limit(1);
    if (!prog) {
      [prog] = await tx.insert(programs).values({ tenantId: ctx.tenantId, campusId: ctx.campusId, name, level, termCount: terms }).returning();
      created = true;
    } else if (prog.level !== level || prog.termCount !== terms) {
      [prog] = await tx.update(programs).set({ level, termCount: terms }).where(eq(programs.id, prog.id)).returning();
      changed = true;
    }

    const sectionName = r.get('section');
    const code = r.get('subject_code');
    const termText = r.get('term');
    if (!sectionName && !code && !termText) return outcome(created, changed, done);
    if (!termText) fail('This value is required', 'term');
    const term = int(termText, 1, prog.termCount, 'The term is outside the program');

    if (sectionName) {
      const explicit = r.get('display_name');
      const displayName = explicit || (level === 'k12' ? `Grade ${term} ${sectionName}` : `${prog.name} Sem ${term} ${sectionName}`);
      const [sec] = await tx
        .select()
        .from(sections)
        .where(and(eq(sections.programId, prog.id), eq(sections.academicYearId, ctx.yearId), eq(sections.term, term), sql`lower(${sections.name}) = ${lc(sectionName)}`))
        .limit(1);
      const [same] = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(and(eq(sections.academicYearId, ctx.yearId), sql`lower(${sections.displayName}) = ${lc(displayName)}`))
        .limit(1);
      if (same && same.id !== sec?.id) fail('Another class already has this name', displayName);
      if (!sec) {
        await tx.insert(sections).values({ tenantId: ctx.tenantId, programId: prog.id, academicYearId: ctx.yearId, term, name: sectionName, displayName });
        created = true;
      } else if (explicit && sec.displayName !== explicit) {
        await tx.update(sections).set({ displayName: explicit }).where(eq(sections.id, sec.id));
        changed = true;
      }
      done.push(sec && !explicit ? sec.displayName : displayName);
    }

    if (code) {
      const subjectName = r.get('subject_name');
      const deptName = r.get('department');
      let departmentId: string | undefined;
      if (deptName) {
        const d = await this.department(tx, ctx, deptName);
        departmentId = d.id;
        created ||= d.created;
      }
      const [sub] = await tx.select().from(subjects).where(and(eq(subjects.programId, prog.id), sql`lower(${subjects.code}) = ${lc(code)}`)).limit(1);
      if (!sub) {
        if (!subjectName) fail('This value is required', 'subject_name');
        await tx.insert(subjects).values({ tenantId: ctx.tenantId, programId: prog.id, term, code, name: subjectName, departmentId: departmentId ?? null });
        created = true;
      } else {
        const set: Partial<typeof subjects.$inferInsert> = {};
        if (subjectName && sub.name !== subjectName) set.name = subjectName;
        if (sub.term !== term) set.term = term;
        if (departmentId && sub.departmentId !== departmentId) set.departmentId = departmentId;
        if (Object.keys(set).length) {
          await tx.update(subjects).set(set).where(eq(subjects.id, sub.id));
          changed = true;
        }
      }
      done.push(`${code} ${subjectName || sub?.name || ''}`.trim());
    }
    return outcome(created, changed, done);
  }

  private async department(tx: Tx, ctx: Ctx, name: string): Promise<{ id: string; created: boolean }> {
    const [d] = await tx.select({ id: departments.id }).from(departments).where(sql`lower(${departments.name}) = ${lc(name)}`).limit(1);
    if (d) return { id: d.id, created: false };
    const [n] = await tx.insert(departments).values({ tenantId: ctx.tenantId, name }).returning({ id: departments.id });
    return { id: n.id, created: true };
  }

  // ---- staff -------------------------------------------------------------------------------

  private async staff(tx: Tx, ctx: Ctx, r: Row): Promise<Outcome> {
    const fullName = required(r, 'full_name');
    const email = emailOf(r.get('email'));
    const phone = phoneOf(r.get('phone'));
    if (!email && !phone) fail('Give an email or a phone number');
    const roles = parseRoles(required(r, 'roles'));
    const lang = r.get('preferred_language') ? language(r.get('preferred_language')) : undefined;
    const key = `staff:${email ?? phone}`;
    if (ctx.seen.has(key)) fail('This row repeats an earlier row', email ?? phone ?? undefined);
    ctx.seen.add(key);

    let created = false;
    let changed = false;
    const found = await this.userByContact(tx, email, phone);
    let user = found;
    if (user) {
      const have = await this.rolesOf(tx, user.id);
      if (have.includes('student')) fail('This email or phone number already belongs to someone else', email ?? phone ?? undefined);
      const set: Partial<typeof users.$inferInsert> = {};
      if (user.fullName !== fullName) set.fullName = fullName;
      if (email && user.email !== email) set.email = email;
      if (phone && user.phone !== phone) set.phone = phone;
      if (lang && user.preferredLanguage !== lang) set.preferredLanguage = lang;
      if (Object.keys(set).length) {
        await tx.update(users).set({ ...set, updatedAt: new Date() }).where(eq(users.id, user.id));
        changed = true;
      }
    } else {
      [user] = await tx.insert(users).values({ tenantId: ctx.tenantId, fullName, email, phone, preferredLanguage: lang ?? 'en' }).returning();
      created = true;
    }
    for (const role of roles) if (await this.grant(tx, ctx, user.id, role)) changed = true;
    for (const name of splitList(r.get('departments'))) {
      const d = await this.department(tx, ctx, name);
      created ||= d.created;
      const added = await tx.insert(departmentStaff).values({ tenantId: ctx.tenantId, departmentId: d.id, userId: user.id }).onConflictDoNothing().returning();
      if (added.length) changed = true;
    }
    return outcome(created, changed, [fullName, roles.join(', ')]);
  }

  /** The user with this email or phone; refuses when they name two different people. */
  private async userByContact(tx: Tx, email: string | null, phone: string | null) {
    const [byEmail] = email ? await tx.select().from(users).where(eq(users.email, email)) : [];
    const [byPhone] = phone ? await tx.select().from(users).where(eq(users.phone, phone)) : [];
    if (byEmail && byPhone && byEmail.id !== byPhone.id) fail('This email and this phone number belong to two different people', `${email}, ${phone}`);
    return byEmail ?? byPhone;
  }

  private async rolesOf(tx: Tx, userId: string): Promise<RoleName[]> {
    return (await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((x) => x.role);
  }

  /** Gives a role for every campus (campus null), unless the user has it already. True when added. */
  private async grant(tx: Tx, ctx: Ctx, userId: string, role: RoleName): Promise<boolean> {
    const [has] = await tx.select({ id: userRoles.id }).from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, role))).limit(1);
    if (has) return false;
    await tx.insert(userRoles).values({ tenantId: ctx.tenantId, userId, role, campusId: null });
    return true;
  }

  // ---- students and guardians --------------------------------------------------------------

  private async student(tx: Tx, ctx: Ctx, r: Row): Promise<Outcome> {
    const rollNo = required(r, 'roll_no');
    const fullName = required(r, 'full_name');
    const section = await this.section(tx, ctx, required(r, 'section'));
    if (ctx.seen.has(`roll:${lc(rollNo)}`)) fail('This roll number appears twice in the file', rollNo);
    ctx.seen.add(`roll:${lc(rollNo)}`);
    const email = emailOf(r.get('student_email'));
    const phone = phoneOf(r.get('student_phone'));
    const lang = r.get('preferred_language') ? language(r.get('preferred_language')) : 'en';
    const guardianInputs = [1, 2].map((n) => ({
      n,
      name: r.get(`guardian${n}_name`),
      phone: r.get(`guardian${n}_phone`),
      relation: r.get(`guardian${n}_relation`) || 'parent',
      lang: r.get(`guardian${n}_language`),
    }));

    let created = false;
    let changed = false;
    // Roll numbers are unique in the institution: the student may move to another class.
    const matches = await tx
      .select({ student: students, yearId: sections.academicYearId })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(eq(students.rollNo, rollNo));
    let st = (matches.find((m) => m.yearId === ctx.yearId) ?? matches[0])?.student;
    if (!st) {
      [st] = await tx.insert(students).values({ tenantId: ctx.tenantId, sectionId: section.id, rollNo, fullName }).returning();
      created = true;
    } else if (st.fullName !== fullName || st.sectionId !== section.id) {
      [st] = await tx.update(students).set({ fullName, sectionId: section.id, updatedAt: new Date() }).where(eq(students.id, st.id)).returning();
      changed = true;
    }

    // The student's own login.
    if (email || phone) {
      const other = await this.userByContact(tx, email, phone);
      if (st.userId) {
        if (other && other.id !== st.userId) fail('This email or phone number already belongs to someone else', email ?? phone ?? '');
        const [u] = await tx.select().from(users).where(eq(users.id, st.userId));
        const set: Partial<typeof users.$inferInsert> = {};
        if (email && u.email !== email) set.email = email;
        if (phone && u.phone !== phone) set.phone = phone;
        if (u.fullName !== fullName) set.fullName = fullName;
        if (Object.keys(set).length) {
          await tx.update(users).set({ ...set, updatedAt: new Date() }).where(eq(users.id, u.id));
          changed = true;
        }
      } else if (other) {
        const [linked] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, other.id)).limit(1);
        if (!(await this.rolesOf(tx, other.id)).includes('student') || linked) fail('This email or phone number already belongs to someone else', email ?? phone ?? '');
        await tx.update(students).set({ userId: other.id }).where(eq(students.id, st.id));
        changed = true;
      } else {
        const [u] = await tx.insert(users).values({ tenantId: ctx.tenantId, fullName, email, phone, preferredLanguage: lang }).returning();
        await this.grant(tx, ctx, u.id, 'student');
        await tx.update(students).set({ userId: u.id }).where(eq(students.id, st.id));
        changed = true;
      }
    }

    // Parents and guardians, matched by phone.
    const linkedNames: string[] = [];
    for (const g of guardianInputs) {
      if (!g.name && !g.phone) continue;
      if (!g.name || !g.phone) fail('A guardian needs a name and a phone number', `guardian${g.n}`);
      const gPhone = phoneOf(g.phone)!;
      const gLang = g.lang ? language(g.lang) : 'en';
      let [gu] = await tx.select().from(users).where(eq(users.phone, gPhone));
      if (gu) {
        if ((await this.rolesOf(tx, gu.id)).includes('student')) fail('This phone number belongs to a student, not a guardian', gPhone);
      } else {
        [gu] = await tx.insert(users).values({ tenantId: ctx.tenantId, fullName: g.name, phone: gPhone, preferredLanguage: gLang }).returning();
      }
      if (await this.grant(tx, ctx, gu.id, 'guardian')) changed = true;
      const [link] = await tx.select().from(guardians).where(and(eq(guardians.userId, gu.id), eq(guardians.studentId, st.id)));
      if (!link) {
        await tx.insert(guardians).values({ tenantId: ctx.tenantId, userId: gu.id, studentId: st.id, relation: g.relation });
        changed = true;
      } else if (link.relation !== g.relation) {
        await tx.update(guardians).set({ relation: g.relation }).where(eq(guardians.id, link.id));
        changed = true;
      }
      linkedNames.push(gu.fullName);
    }
    return outcome(created, changed, [`${rollNo} ${fullName}`, section.displayName, ...linkedNames]);
  }

  /** A class of the current academic year, by the name shown ("BCom Sem 3 A"). */
  private async section(tx: Tx, ctx: Ctx, name: string) {
    const [sec] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.academicYearId, ctx.yearId), sql`lower(${sections.displayName}) = ${lc(name)}`))
      .limit(1);
    return sec ?? fail('No class with this name', name);
  }

  // ---- timetable ---------------------------------------------------------------------------

  /** Replace: archive the current periods of every class named in the file, before the rows are checked. */
  private async archiveForReplace(tx: Tx, ctx: Ctx, rows: Row[]) {
    const names = [...new Set(rows.map((r) => lc(r.get('section'))).filter(Boolean))];
    if (!names.length) return;
    const secs = await tx
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.academicYearId, ctx.yearId), inArray(sql<string>`lower(${sections.displayName})`, names)));
    if (!secs.length) return;
    ctx.archived = await tx
      .update(timetableSlots)
      .set({ archivedAt: new Date() })
      .where(and(isNull(timetableSlots.archivedAt), inArray(timetableSlots.sectionId, secs.map((s) => s.id))))
      .returning();
  }

  private async period(tx: Tx, ctx: Ctx, r: Row): Promise<Outcome> {
    const section = await this.section(tx, ctx, required(r, 'section'));
    const code = required(r, 'subject_code');
    const [subject] = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.programId, section.programId), eq(subjects.term, section.term), sql`lower(${subjects.code}) = ${lc(code)}`))
      .limit(1);
    if (!subject) fail('Subject not found in this class', code);
    const who = required(r, 'teacher');
    const [teacher] = who.includes('@')
      ? await tx.select().from(users).where(eq(users.email, who.toLowerCase()))
      : await tx.select().from(users).where(eq(users.phone, normalizePhone(who)));
    if (!teacher) fail('No member of staff with this email or phone', who);
    const dayText = lc(required(r, 'day'));
    const dayOfWeek = DAYS[dayText] ?? (/^[1-7]$/.test(dayText) ? Number(dayText) : fail('Unknown day (use Mon to Sun, or 1 to 7)', r.get('day')));
    const startsAt = timeOf(required(r, 'start'));
    const endsAt = timeOf(required(r, 'end'));
    if (startsAt >= endsAt) fail('Enter times like 09:30, with the end after the start', `${r.get('start')}–${r.get('end')}`);
    const roomName = r.get('room');
    let roomId: string | null = null;
    let created = false;
    if (roomName) {
      const [room] = await tx.select({ id: rooms.id }).from(rooms).where(sql`lower(${rooms.name}) = ${lc(roomName)}`).limit(1);
      if (room) roomId = room.id;
      else {
        const [prog] = await tx.select({ campusId: programs.campusId }).from(programs).where(eq(programs.id, section.programId));
        [{ id: roomId }] = await tx.insert(rooms).values({ tenantId: ctx.tenantId, campusId: prog.campusId, name: roomName }).returning({ id: rooms.id });
        created = true;
      }
    }
    const input = { sectionId: section.id, subjectId: subject.id, teacherId: teacher.id, roomId, dayOfWeek, startsAt, endsAt };
    const label = [section.displayName, subject.code, teacher.fullName, `${dayOfWeek} ${startsAt}–${endsAt}`, roomName].filter(Boolean);
    const key = `slot:${section.id}:${dayOfWeek}:${startsAt}`;
    if (ctx.seen.has(key)) fail('This row repeats an earlier row', `${section.displayName} ${r.get('day')} ${startsAt}`);
    ctx.seen.add(key);

    const same = (s: typeof timetableSlots.$inferSelect) => s.subjectId === subject.id && s.teacherId === teacher.id && (s.roomId ?? null) === roomId && s.endsAt.slice(0, 5) === endsAt;
    const [current] = await tx
      .select()
      .from(timetableSlots)
      .where(and(isNull(timetableSlots.archivedAt), eq(timetableSlots.sectionId, section.id), eq(timetableSlots.dayOfWeek, dayOfWeek), eq(timetableSlots.startsAt, startsAt)))
      .limit(1);
    if (current && same(current)) return { status: 'skipped', message: label.join(' · ') };

    const values = await validateSlot(tx, input, current?.id ?? null);
    // Replace: the same period as before, brought back so attendance keeps pointing at it.
    const kept = ctx.archived.findIndex((k) => k.sectionId === section.id && k.dayOfWeek === dayOfWeek && k.startsAt.slice(0, 5) === startsAt && same(k));
    if (kept >= 0) {
      const [k] = ctx.archived.splice(kept, 1);
      await tx.update(timetableSlots).set({ archivedAt: null }).where(eq(timetableSlots.id, k.id));
      return { status: created ? 'updated' : 'skipped', message: label.join(' · ') };
    }
    if (current) await tx.update(timetableSlots).set({ archivedAt: new Date() }).where(eq(timetableSlots.id, current.id));
    await tx.insert(timetableSlots).values({ tenantId: ctx.tenantId, ...values });
    return { status: current ? 'updated' : 'created', message: label.join(' · ') };
  }
}

// ---- helpers ---------------------------------------------------------------------------------

function outcome(created: boolean, changed: boolean, parts: string[]): Outcome {
  return { status: created ? 'created' : changed ? 'updated' : 'skipped', message: parts.filter(Boolean).join(' · ') };
}

function errorRow(line: number, e: unknown): RowResult {
  if (e instanceof RowError) return { row: line, status: 'error', message: e.message, code: ERROR_CODES[e.message] ?? 'IMPORT_INVALID_VALUE', ...(e.detail !== undefined && { detail: e.detail }) };
  if (e instanceof HttpException) {
    const body = e.getResponse();
    const message = typeof body === 'string' ? body : String((body as { message?: unknown }).message ?? e.message);
    const code = typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string' ? (body as { code: string }).code : errorCode(e.getStatus(), message);
    return { row: line, status: 'error', message, code };
  }
  const pg = e as { code?: string; detail?: string; cause?: { code?: string; detail?: string } };
  return { row: line, status: 'error', message: 'This row could not be saved', code: 'IMPORT_ROW_FAILED', detail: pg.cause?.detail ?? pg.detail ?? (e instanceof Error ? e.message : undefined) };
}

function required(r: Row, key: string): string {
  return r.get(key) || fail('This value is required', key);
}

function int(text: string, min: number, max: number, outside = 'This value is not valid'): number {
  if (!/^\d+$/.test(text)) fail('This value is not valid', text || '(empty)');
  const n = Number(text);
  if (n < min || n > max) fail(outside, text);
  return n;
}

function emailOf(text: string): string | null {
  if (!text) return null;
  const e = text.toLowerCase();
  return EMAIL.test(e) ? e : fail('Enter a valid email address', text);
}

function phoneOf(text: string): string | null {
  if (!text) return null;
  const p = normalizePhone(text);
  return /^\+\d{8,15}$/.test(p) ? p : fail('Enter a valid mobile number', text);
}

function language(text: string): 'en' | 'hi' | 'kn' {
  return LANGUAGES[lc(text)] ?? fail('Unknown language (use en, hi or kn)', text);
}

function splitList(text: string): string[] {
  return [...new Set(text.split(/[;|]/).map((x) => x.trim()).filter(Boolean))];
}

function parseRoles(text: string): RoleName[] {
  const out: RoleName[] = [];
  for (const raw of text.split(/[;|,]/).map((x) => x.trim()).filter(Boolean)) {
    const k = raw.toLowerCase().replace(/[\s-]+/g, '_');
    const role = (STAFF_ROLES as string[]).includes(k) ? (k as RoleName) : ROLE_ALIASES[k];
    if (!role) fail('Unknown role', raw);
    if (!out.includes(role)) out.push(role);
  }
  return out.length ? out : fail('This value is required', 'roles');
}

/** "9:00", "09:00", "9.00" → "09:00". */
function timeOf(text: string): string {
  const m = /^(\d{1,2})[:.](\d{2})(?::00)?$/.exec(text.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail('Enter times like 09:30, with the end after the start', text);
  return `${m![1].padStart(2, '0')}:${m![2]}`;
}
