import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { nextNumber } from '../common/ops.js';
import type { Tx } from '../db/db.service.js';
import { studentAcademicIds } from '../db/schema-integrations.js';
import { studentChangeRequests, studentClearanceItems, studentClearances, studentCustomFields, studentProfiles } from '../db/schema-sis.js';
import { guardians, notifications, sections, students, users } from '../db/schema.js';
import { LifecycleService } from './lifecycle.service.js';
import {
  aadhaarHash,
  aadhaarValid,
  ageBand,
  CATEGORIES,
  GENDERS,
  ageOn,
  allowedBy,
  cleanValue,
  maskAadhaar,
  planRebalance,
  planRollNumbers,
  PROFILE_FIELDS,
  type FieldValue,
  type RebalanceMode,
  type RollOrder,
} from './student-info.logic.js';

/** Who may change a student's profile details and custom fields (unless a custom field names its own editors). */
export const DETAIL_EDIT_ROLES: RoleName[] = ['tenant_admin', 'principal', 'admissions_officer'];
/** Who may decide profile change requests. */
export const CHANGE_DECIDE_ROLES: RoleName[] = ['tenant_admin', 'principal', 'admissions_officer'];
/** Statuses that count as on the roll for registers and statements. */
export const ON_ROLL = ['enrolled', 'active', 'on_leave', 'detained', 'promoted', 'suspended', 'long_absent'];

/** No-dues departments, who signs off for each, and whether the system can check it by itself. */
export const CLEARANCE_DEPARTMENTS: Record<string, { label: string; roles: RoleName[]; auto: boolean }> = {
  fees: { label: 'Fees and accounts', roles: ['accountant'], auto: true },
  library: { label: 'Library', roles: ['librarian'], auto: true },
  hostel: { label: 'Hostel', roles: ['hostel_warden'], auto: true },
  transport: { label: 'Transport', roles: ['transport_manager'], auto: true },
  lab: { label: 'Laboratories', roles: ['hod'], auto: false },
  sports: { label: 'Sports and stores', roles: ['hod'], auto: false },
};
export const CLEARANCE_LEADS: RoleName[] = ['tenant_admin', 'principal'];
export const CLEARANCE_PURPOSES = ['tc', 'course_completion', 'migration', 'other'] as const;

type ProfileRow = typeof studentProfiles.$inferSelect;
type CustomField = typeof studentCustomFields.$inferSelect;

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];
const str = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));

/**
 * Student information beyond the roll: the profile (identifiers, personal and category details, address, custom
 * fields with field-level permissions), siblings, change requests from students and parents, no-dues clearances,
 * roll-number regeneration, section reshuffles, promotion eligibility and the statutory registers.
 */
@Injectable()
export class StudentInfoService {
  constructor(private readonly lifecycle: LifecycleService) {}

  // ---- profile -------------------------------------------------------------------------------------

  async student(tx: Tx, id: string) {
    const [s] = await tx.select().from(students).where(eq(students.id, id));
    if (!s) throw new NotFoundException('Student not found');
    return s;
  }

  /** The profile row, created empty the first time it is needed. */
  async profileRow(tx: Tx, tenantId: string, studentId: string): Promise<ProfileRow> {
    const [p] = await tx.select().from(studentProfiles).where(eq(studentProfiles.studentId, studentId));
    if (p) return p;
    const [created] = await tx.insert(studentProfiles).values({ tenantId, studentId }).onConflictDoNothing().returning();
    return created ?? (await tx.select().from(studentProfiles).where(eq(studentProfiles.studentId, studentId)))[0];
  }

  async customFields(tx: Tx, activeOnly = true): Promise<CustomField[]> {
    return tx
      .select()
      .from(studentCustomFields)
      .where(activeOnly ? eq(studentCustomFields.active, true) : undefined)
      .orderBy(asc(studentCustomFields.sortOrder), asc(studentCustomFields.label));
  }

  /** The current value of a fixed or custom field (`custom.<key>`), for showing and for change requests. */
  private async currentValues(tx: Tx, p: UserPrincipal, studentId: string) {
    const s = await this.student(tx, studentId);
    const prof = await this.profileRow(tx, p.tenantId, studentId);
    const [ids] = await tx.select().from(studentAcademicIds).where(eq(studentAcademicIds.studentId, studentId)).orderBy(desc(studentAcademicIds.capturedAt)).limit(1);
    const fixed: Record<string, FieldValue> = {
      fullName: s.fullName,
      admissionNo: prof.admissionNo,
      registerNo: prof.registerNo,
      penNo: prof.penNo,
      apaarId: ids?.apaarId ?? null,
      abcId: ids?.abcId ?? null,
      dateOfBirth: prof.dateOfBirth,
      gender: prof.gender,
      category: prof.category,
      religion: prof.religion,
      motherTongue: prof.motherTongue,
      nationality: prof.nationality,
      isMinority: prof.isMinority,
      disability: prof.disability,
      admissionType: prof.admissionType,
      addressLine: prof.addressLine,
      city: prof.city,
      district: prof.district,
      state: prof.state,
      pincode: prof.pincode,
    };
    return { s, prof, fixed };
  }

  /** The profile for the profile page: fixed fields, the masked Aadhaar, the custom fields this person may see, siblings. */
  async details(tx: Tx, p: UserPrincipal, studentId: string) {
    const { s, prof, fixed } = await this.currentValues(tx, p, studentId);
    const canEdit = p.roles.some((r) => DETAIL_EDIT_ROLES.includes(r));
    const custom = (await this.customFields(tx))
      .filter((f) => allowedBy(f.viewRoles, p.roles) || allowedBy(f.editRoles.length ? f.editRoles : DETAIL_EDIT_ROLES, p.roles))
      .map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options, required: f.required, help: f.help, value: prof.custom?.[f.key] ?? null, canEdit: allowedBy(f.editRoles.length ? f.editRoles : DETAIL_EDIT_ROLES, p.roles) }));
    return {
      studentId: s.id,
      fields: Object.entries(PROFILE_FIELDS).map(([key, f]) => ({ key, label: f.label, kind: f.kind, options: f.options ?? null, requestable: f.requestable, value: fixed[key] ?? null })),
      aadhaar: maskAadhaar(prof.aadhaarLast4),
      custom,
      canEdit,
      siblings: await this.siblings(tx, studentId),
      updatedAt: prof.updatedAt,
    };
  }

  /**
   * Changes profile values. Staff with the edit roles change fixed fields; custom fields need their own edit roles.
   * Aadhaar is checked (Verhoeff) and kept only as its last four digits and a fingerprint; a number another student
   * already has is refused. Everything goes into the student's history field by field.
   */
  async updateDetails(tx: Tx, p: UserPrincipal, studentId: string, body: { values?: Record<string, unknown>; custom?: Record<string, unknown>; aadhaar?: string | null }, opts: { skipRoleCheck?: boolean; via?: string; result?: { changed: boolean } } = {}) {
    const { s, prof, fixed } = await this.currentValues(tx, p, studentId);
    if (!opts.skipRoleCheck && (body.values || body.aadhaar !== undefined) && !p.roles.some((r) => DETAIL_EDIT_ROLES.includes(r))) throw new ForbiddenException("Your account doesn't have access to this.");
    const errors: Record<string, string> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const profSet: Partial<ProfileRow> = {};
    let ids: { apaarId?: string | null; abcId?: string | null } | null = null;
    let fullName: string | null = null;

    for (const [key, raw] of Object.entries(body.values ?? {})) {
      const spec = PROFILE_FIELDS[key];
      if (!spec) {
        errors[key] = 'Not a profile field';
        continue;
      }
      let v: FieldValue;
      try {
        v = cleanValue({ ...spec, required: key === 'fullName' || key === 'nationality' || key === 'admissionType' }, raw);
      } catch (e) {
        errors[key] = (e as Error).message;
        continue;
      }
      if (v === fixed[key] || (v === null && fixed[key] === null)) continue;
      before[key] = fixed[key];
      after[key] = v;
      if (key === 'fullName') fullName = String(v);
      else if (key === 'apaarId' || key === 'abcId') ids = { ...(ids ?? {}), [key]: v as string | null };
      else (profSet as Record<string, unknown>)[key] = key === 'isMinority' ? !!v : v;
    }
    if (body.aadhaar !== undefined) {
      if (body.aadhaar === null || body.aadhaar === '') {
        if (prof.aadhaarLast4) {
          profSet.aadhaarLast4 = null;
          profSet.aadhaarHash = null;
          before.aadhaar = maskAadhaar(prof.aadhaarLast4);
          after.aadhaar = null;
        }
      } else if (!aadhaarValid(body.aadhaar)) errors.aadhaar = 'This is not a valid Aadhaar number';
      else {
        const hash = aadhaarHash(p.tenantId, body.aadhaar);
        if (hash !== prof.aadhaarHash) {
          const [other] = await tx.select({ studentId: studentProfiles.studentId }).from(studentProfiles).where(and(eq(studentProfiles.aadhaarHash, hash), ne(studentProfiles.studentId, studentId))).limit(1);
          if (other) errors.aadhaar = 'Another student already has this Aadhaar number';
          else {
            const last4 = body.aadhaar.replace(/\D/g, '').slice(-4);
            profSet.aadhaarLast4 = last4;
            profSet.aadhaarHash = hash;
            before.aadhaar = maskAadhaar(prof.aadhaarLast4);
            after.aadhaar = maskAadhaar(last4);
          }
        }
      }
    }
    let customNext: Record<string, string | number | boolean | null> | null = null;
    if (body.custom && Object.keys(body.custom).length) {
      const defs = new Map((await this.customFields(tx, false)).map((f) => [f.key, f]));
      customNext = { ...(prof.custom ?? {}) };
      for (const [key, raw] of Object.entries(body.custom)) {
        const f = defs.get(key);
        if (!f || !f.active) {
          errors[`custom.${key}`] = 'Not a field of this institution';
          continue;
        }
        if (!opts.skipRoleCheck && !allowedBy(f.editRoles.length ? f.editRoles : DETAIL_EDIT_ROLES, p.roles)) {
          errors[`custom.${key}`] = 'You may not change this field';
          continue;
        }
        try {
          const v = cleanValue({ kind: f.type, options: f.options, required: f.required, max: 500 }, raw);
          if ((customNext[key] ?? null) === v) continue;
          before[`custom.${key}`] = customNext[key] ?? null;
          after[`custom.${key}`] = v;
          customNext[key] = v;
        } catch (e) {
          errors[`custom.${key}`] = (e as Error).message;
        }
      }
    }
    if (Object.keys(errors).length) throw new BadRequestException({ message: Object.values(errors)[0], fieldErrors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])) });
    if (!Object.keys(after).length) return this.details(tx, p, studentId);
    if (opts.result) opts.result.changed = true;

    try {
      if (Object.keys(profSet).length || customNext) await tx.update(studentProfiles).set({ ...profSet, ...(customNext ? { custom: customNext } : {}), updatedAt: new Date() }).where(eq(studentProfiles.id, prof.id));
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
      if (code === '23505') throw new ConflictException(String(e).includes('register') ? 'Another student already has this register number' : 'Another student already has this admission number');
      throw e;
    }
    if (fullName) await tx.update(students).set({ fullName, updatedAt: new Date() }).where(eq(students.id, studentId));
    if (ids) {
      const [cur] = await tx.select().from(studentAcademicIds).where(eq(studentAcademicIds.studentId, studentId)).orderBy(desc(studentAcademicIds.capturedAt)).limit(1);
      if (cur) await tx.update(studentAcademicIds).set({ ...ids, capturedBy: p.userId, capturedAt: new Date() }).where(eq(studentAcademicIds.id, cur.id));
      else await tx.insert(studentAcademicIds).values({ tenantId: p.tenantId, studentId, apaarId: ids.apaarId ?? null, abcId: ids.abcId ?? null, source: 'profile', capturedBy: p.userId });
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'student.details_updated', subjectType: 'student', subjectId: studentId, before, after, data: { label: `${s.rollNo} ${fullName ?? s.fullName}`, ...(opts.via && { via: opts.via }) } });
    return this.details(tx, p, studentId);
  }

  /**
   * A student enrolled from an application starts with its date of birth, gender, category, admission type and
   * nationality, and the next admission number of the admissions series.
   */
  async seedFromApplication(tx: Tx, actor: { tenantId: string; userId: string }, studentId: string, a: { dateOfBirth: string | null; gender: string | null; category: string | null; admissionType: string; nationality: string }) {
    const prof = await this.profileRow(tx, actor.tenantId, studentId);
    const g = (a.gender ?? '').toLowerCase();
    const c = (a.category ?? '').toLowerCase();
    await tx
      .update(studentProfiles)
      .set({
        dateOfBirth: prof.dateOfBirth ?? a.dateOfBirth,
        gender: prof.gender ?? ((GENDERS as readonly string[]).includes(g) ? g : null),
        category: prof.category ?? ((CATEGORIES as readonly string[]).includes(c) ? c : null),
        admissionType: a.admissionType,
        nationality: a.nationality === 'nri' ? 'Indian (NRI)' : a.nationality === 'foreign' ? prof.nationality === 'Indian' ? 'Foreign national' : prof.nationality : 'Indian',
        updatedAt: new Date(),
      })
      .where(eq(studentProfiles.id, prof.id));
    if (!prof.admissionNo) await this.assignAdmissionNo(tx, actor, studentId);
  }

  /** Gives students on the roll without an admission number the next number of the admissions series (ADM). */
  async assignAdmissionNo(tx: Tx, p: { tenantId: string; userId: string }, studentId: string): Promise<string> {
    const prof = await this.profileRow(tx, p.tenantId, studentId);
    if (prof.admissionNo) throw new BadRequestException(`Already has admission number ${prof.admissionNo}`);
    for (let i = 0; i < 50; i++) {
      const no = await nextNumber(tx, p.tenantId, 'ADM');
      const [taken] = await tx.select({ id: studentProfiles.id }).from(studentProfiles).where(eq(studentProfiles.admissionNo, no)).limit(1);
      if (taken) continue;
      await tx.update(studentProfiles).set({ admissionNo: no, updatedAt: new Date() }).where(eq(studentProfiles.id, prof.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'student.admission_no_assigned', subjectType: 'student', subjectId: studentId, changes: { admissionNo: { before: null, after: no } } });
      return no;
    }
    throw new ConflictException('Could not find a free admission number: check the series in Settings');
  }

  /** Brothers and sisters: students who share a guardian with this one, eldest first (for sibling concessions). */
  async siblings(tx: Tx, studentId: string) {
    return rows<{ id: string; fullName: string; rollNo: string; className: string; status: string; dateOfBirth: string | null; position: number }>(
      await tx.execute(sql`
        with family as (
          select distinct s.id, s.full_name, s.roll_no, s.status, sec.display_name, sp.date_of_birth, s.enrolled_on
          from guardians g1
          join guardians g2 on g2.user_id = g1.user_id
          join students s on s.id = g2.student_id
          join sections sec on sec.id = s.section_id
          left join student_profiles sp on sp.student_id = s.id
          where g1.student_id = ${studentId}::uuid
        )
        select id, full_name as "fullName", roll_no as "rollNo", display_name as "className", status, date_of_birth::text as "dateOfBirth",
          row_number() over (order by date_of_birth nulls last, enrolled_on nulls last, full_name)::int as position
        from family`),
    ).filter((r) => r.id !== studentId);
  }

  // ---- change requests ------------------------------------------------------------------------------------

  /** As whom the person may ask for a change to this student's profile: staff, the student, or a guardian. */
  private async requesterRole(tx: Tx, p: UserPrincipal, studentId: string): Promise<'staff' | 'student' | 'guardian'> {
    const s = await this.student(tx, studentId);
    if (p.roles.some((r) => DETAIL_EDIT_ROLES.includes(r) || r === 'hod' || r === 'teacher' || r === 'counsellor')) return 'staff';
    if (s.userId && s.userId === p.userId) return 'student';
    const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, studentId), eq(guardians.userId, p.userId)));
    if (g) return 'guardian';
    throw new NotFoundException('Student not found');
  }

  async requestChange(tx: Tx, p: UserPrincipal, studentId: string, input: { field: string; newValue: string; reason: string }) {
    const as = await this.requesterRole(tx, p, studentId);
    const { fixed, prof } = await this.currentValues(tx, p, studentId);
    let label: string;
    let current: FieldValue;
    let cleaned: FieldValue;
    if (input.field.startsWith('custom.')) {
      const key = input.field.slice(7);
      const [f] = await tx.select().from(studentCustomFields).where(and(eq(studentCustomFields.key, key), eq(studentCustomFields.active, true)));
      if (!f) throw new BadRequestException('Not a field of this institution');
      if (!f.requestable && as !== 'staff') throw new BadRequestException('This detail cannot be changed on request: contact the office');
      label = f.label;
      current = prof.custom?.[key] ?? null;
      cleaned = this.clean(() => cleanValue({ kind: f.type, options: f.options, required: true, max: 500 }, input.newValue));
    } else {
      const spec = PROFILE_FIELDS[input.field];
      if (!spec) throw new BadRequestException('Not a profile field');
      if (!spec.requestable && as !== 'staff') throw new BadRequestException('This detail cannot be changed on request: contact the office');
      label = spec.label;
      current = fixed[input.field] ?? null;
      cleaned = this.clean(() => cleanValue({ ...spec, required: true }, input.newValue));
    }
    if (str(cleaned) === str(current)) throw new BadRequestException('That is already the value on record');
    const [open] = await tx.select({ id: studentChangeRequests.id }).from(studentChangeRequests).where(and(eq(studentChangeRequests.studentId, studentId), eq(studentChangeRequests.field, input.field), eq(studentChangeRequests.status, 'pending')));
    if (open) throw new ConflictException('A request to change this detail is already waiting for a decision');
    const [row] = await tx
      .insert(studentChangeRequests)
      .values({ tenantId: p.tenantId, studentId, field: input.field, fieldLabel: label, currentValue: str(current), newValue: str(cleaned)!, reason: input.reason.trim(), requestedAs: as, requestedBy: p.userId })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'student_change_request.created', subjectType: 'student_change_request', subjectId: row.id, after: { field: input.field, newValue: row.newValue }, data: { studentId, requestedAs: as } });
    return row;
  }

  private clean(fn: () => FieldValue): FieldValue {
    try {
      return fn();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /** Approves (the value is written to the profile, through the same checks) or rejects (a note is required) a request. */
  async decideChange(tx: Tx, p: UserPrincipal, id: string, decision: 'approve' | 'reject', note?: string | null): Promise<string> {
    const [r] = await tx.select().from(studentChangeRequests).where(eq(studentChangeRequests.id, id)).for('update');
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'pending') throw new BadRequestException(`This request is already ${r.status}`);
    if (r.requestedBy === p.userId && !p.roles.includes('tenant_admin')) throw new ForbiddenException('Someone else must decide your own request');
    if (decision === 'reject' && !(note && note.trim().length >= 3)) throw new BadRequestException('Say why the request is rejected');
    if (decision === 'approve') {
      const body = r.field === 'aadhaar' ? { aadhaar: r.newValue } : r.field.startsWith('custom.') ? { custom: { [r.field.slice(7)]: r.newValue } } : { values: { [r.field]: r.newValue } };
      await this.updateDetails(tx, p, r.studentId, body, { skipRoleCheck: true, via: `change request ${r.id}` });
    }
    const status = decision === 'approve' ? 'approved' : 'rejected';
    await tx.update(studentChangeRequests).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: note?.trim() || null }).where(eq(studentChangeRequests.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `student_change_request.change_${status}`, subjectType: 'student_change_request', subjectId: id, changes: { status: { before: 'pending', after: status } }, data: { note: note ?? null } });
    if (r.requestedBy && r.requestedBy !== p.userId) {
      await tx.insert(notifications).values({
        tenantId: p.tenantId,
        userId: r.requestedBy,
        kind: 'announcement',
        title: decision === 'approve' ? `Your change to ${r.fieldLabel} was approved` : `Your change to ${r.fieldLabel} was not approved`,
        body: decision === 'approve' ? `${r.fieldLabel} is now ${r.newValue}.` : (note ?? '').slice(0, 500),
        data: { changeRequestId: id, studentId: r.studentId },
        dedupeKey: `change-request:${id}`,
      }).onConflictDoNothing();
    }
    return decision === 'approve' ? `${r.fieldLabel}: ${r.newValue}` : 'Rejected';
  }

  /** The requester withdraws a request still waiting. */
  async cancelChange(tx: Tx, p: UserPrincipal, id: string) {
    const [r] = await tx.select().from(studentChangeRequests).where(eq(studentChangeRequests.id, id)).for('update');
    if (!r || r.requestedBy !== p.userId) throw new NotFoundException('Request not found');
    if (r.status !== 'pending') throw new BadRequestException(`This request is already ${r.status}`);
    await tx.update(studentChangeRequests).set({ status: 'cancelled', decidedAt: new Date() }).where(eq(studentChangeRequests.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'student_change_request.change_withdrawn', subjectType: 'student_change_request', subjectId: id, changes: { status: { before: 'pending', after: 'cancelled' } } });
    return { id, status: 'cancelled' };
  }

  /** Requests about one student (staff, the student, or a guardian), or the ones this person made. */
  async changeRequests(tx: Tx, p: UserPrincipal, studentId?: string) {
    if (studentId) await this.requesterRole(tx, p, studentId);
    return tx
      .select({ r: studentChangeRequests, studentName: students.fullName, deciderName: users.fullName })
      .from(studentChangeRequests)
      .innerJoin(students, eq(students.id, studentChangeRequests.studentId))
      .leftJoin(users, eq(users.id, studentChangeRequests.decidedBy))
      .where(studentId ? eq(studentChangeRequests.studentId, studentId) : eq(studentChangeRequests.requestedBy, p.userId))
      .orderBy(desc(studentChangeRequests.createdAt))
      .limit(200)
      .then((list) => list.map(({ r, studentName, deciderName }) => ({ ...r, studentName, deciderName })));
  }

  // ---- no-dues clearances ---------------------------------------------------------------------------------

  /** What each automatically checked department finds owing for this student now. */
  async findDues(tx: Tx, studentId: string): Promise<Record<string, { duesPaise: number; finding: string; blocked: boolean }>> {
    const [fees] = rows<{ due: number; n: number }>(await tx.execute(sql`select coalesce(sum(amount_paise - paid_paise), 0)::float as due, count(*)::int as n from fee_invoices where student_id = ${studentId}::uuid and status = 'due'`));
    const [lib] = rows<{ open: number; fines: number }>(
      await tx.execute(sql`select count(*) filter (where returned_at is null)::int as open, coalesce(sum(fine_paise) filter (where fine_paise > 0 and fine_paid_at is null), 0)::float as fines from library_loans where student_id = ${studentId}::uuid`),
    );
    const [hostel] = rows<{ n: number }>(await tx.execute(sql`select count(*)::int as n from hostel_allotments where student_id = ${studentId}::uuid and vacated_on is null`));
    const [bus] = rows<{ n: number }>(await tx.execute(sql`select count(*)::int as n from transport_assignments where student_id = ${studentId}::uuid and ended_on is null`));
    const rupees = (p: number) => `Rs ${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    return {
      fees: fees.due > 0 ? { duesPaise: fees.due, finding: `${rupees(fees.due)} due on ${fees.n} invoice${fees.n === 1 ? '' : 's'}`, blocked: true } : { duesPaise: 0, finding: 'Nothing owing', blocked: false },
      library:
        lib.open > 0 || lib.fines > 0
          ? { duesPaise: lib.fines, finding: [lib.open ? `${lib.open} book${lib.open === 1 ? '' : 's'} not returned` : '', lib.fines ? `${rupees(lib.fines)} in fines` : ''].filter(Boolean).join(', '), blocked: true }
          : { duesPaise: 0, finding: 'No books out, no fines', blocked: false },
      hostel: hostel.n > 0 ? { duesPaise: 0, finding: 'Still has a hostel bed: vacate it first', blocked: true } : { duesPaise: 0, finding: 'No hostel bed', blocked: false },
      transport: bus.n > 0 ? { duesPaise: 0, finding: 'Still has a bus seat: end the assignment first', blocked: true } : { duesPaise: 0, finding: 'No bus seat', blocked: false },
    };
  }

  /** Starts a no-dues clearance: a line per department; the system clears what it can check and finds nothing owing. */
  async raiseClearance(tx: Tx, p: UserPrincipal, studentId: string, input: { purpose: string; note?: string | null; departments?: string[] }) {
    const s = await this.student(tx, studentId);
    const [open] = await tx.select({ id: studentClearances.id }).from(studentClearances).where(and(eq(studentClearances.studentId, studentId), eq(studentClearances.purpose, input.purpose), eq(studentClearances.status, 'open')));
    if (open) throw new ConflictException('A clearance for this is already open for the student');
    const depts = input.departments?.length ? input.departments : Object.keys(CLEARANCE_DEPARTMENTS);
    for (const d of depts) if (!CLEARANCE_DEPARTMENTS[d]) throw new BadRequestException(`Unknown department ${d}`);
    const [c] = await tx.insert(studentClearances).values({ tenantId: p.tenantId, studentId, purpose: input.purpose, note: input.note?.trim() || null, requestedBy: p.userId }).returning();
    const found = await this.findDues(tx, studentId);
    for (const d of depts) {
      const f = found[d];
      await tx.insert(studentClearanceItems).values({
        tenantId: p.tenantId,
        clearanceId: c.id,
        department: d,
        status: f ? (f.blocked ? 'blocked' : 'cleared') : 'pending',
        duesPaise: f?.duesPaise ?? 0,
        finding: f?.finding ?? null,
        decidedAt: f && !f.blocked ? new Date() : null,
      });
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'student_clearance.created', subjectType: 'student_clearance', subjectId: c.id, after: { purpose: input.purpose }, data: { studentId, label: `${s.rollNo} ${s.fullName}` } });
    await this.settle(tx, c.id);
    return this.clearance(tx, c.id);
  }

  /** Checks the automatic lines again (after the student paid, returned books or vacated the bed). */
  async recheckClearance(tx: Tx, p: UserPrincipal, id: string) {
    const c = await this.clearanceRow(tx, id);
    if (c.status !== 'open') throw new BadRequestException(`This clearance is already ${c.status}`);
    const found = await this.findDues(tx, c.studentId);
    const items = await tx.select().from(studentClearanceItems).where(eq(studentClearanceItems.clearanceId, id));
    for (const it of items) {
      const f = found[it.department];
      if (!f || it.status === 'cleared') continue;
      await tx.update(studentClearanceItems).set({ status: f.blocked ? 'blocked' : 'cleared', duesPaise: f.duesPaise, finding: f.finding, decidedAt: f.blocked ? null : new Date(), decidedBy: null }).where(eq(studentClearanceItems.id, it.id));
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'student_clearance.dues_rechecked', subjectType: 'student_clearance', subjectId: id });
    await this.settle(tx, id);
    return this.clearance(tx, id);
  }

  /** A department signs off (cleared) or holds (blocked, with a note) its line. */
  async decideClearanceItem(tx: Tx, p: UserPrincipal, itemId: string, status: 'cleared' | 'blocked', note?: string | null) {
    const [it] = await tx.select().from(studentClearanceItems).where(eq(studentClearanceItems.id, itemId)).for('update');
    if (!it) throw new NotFoundException('Clearance line not found');
    const c = await this.clearanceRow(tx, it.clearanceId);
    if (c.status !== 'open') throw new BadRequestException(`This clearance is already ${c.status}`);
    const dept = CLEARANCE_DEPARTMENTS[it.department];
    if (!p.roles.some((r) => CLEARANCE_LEADS.includes(r) || dept?.roles.includes(r))) throw new ForbiddenException(`Only ${dept?.label ?? it.department} may sign off this line`);
    if (status === 'blocked' && !(note && note.trim().length >= 3)) throw new BadRequestException('Say what is still owing');
    await tx.update(studentClearanceItems).set({ status, note: note?.trim() || null, decidedBy: p.userId, decidedAt: new Date() }).where(eq(studentClearanceItems.id, itemId));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `student_clearance.${status === 'cleared' ? 'line_cleared' : 'line_blocked'}`, subjectType: 'student_clearance', subjectId: c.id, changes: { [it.department]: { before: it.status, after: status } }, data: { note: note ?? null } });
    await this.settle(tx, c.id);
    return this.clearance(tx, c.id);
  }

  async cancelClearance(tx: Tx, p: UserPrincipal, id: string): Promise<string> {
    const c = await this.clearanceRow(tx, id);
    if (c.status !== 'open') throw new BadRequestException(`This clearance is already ${c.status}`);
    await tx.update(studentClearances).set({ status: 'cancelled', completedAt: new Date() }).where(eq(studentClearances.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'student_clearance.clearance_cancelled', subjectType: 'student_clearance', subjectId: id, changes: { status: { before: 'open', after: 'cancelled' } } });
    return 'Cancelled';
  }

  /** A clearance whose every line is cleared is complete. */
  private async settle(tx: Tx, id: string) {
    const items = await tx.select({ status: studentClearanceItems.status }).from(studentClearanceItems).where(eq(studentClearanceItems.clearanceId, id));
    if (items.length && items.every((i) => i.status === 'cleared')) await tx.update(studentClearances).set({ status: 'cleared', completedAt: new Date() }).where(and(eq(studentClearances.id, id), eq(studentClearances.status, 'open')));
  }

  private async clearanceRow(tx: Tx, id: string) {
    const [c] = await tx.select().from(studentClearances).where(eq(studentClearances.id, id));
    if (!c) throw new NotFoundException('Clearance not found');
    return c;
  }

  async clearance(tx: Tx, id: string) {
    const c = await this.clearanceRow(tx, id);
    const [s] = await tx.select({ fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, c.studentId));
    const items = await tx
      .select({ i: studentClearanceItems, deciderName: users.fullName })
      .from(studentClearanceItems)
      .leftJoin(users, eq(users.id, studentClearanceItems.decidedBy))
      .where(eq(studentClearanceItems.clearanceId, id))
      .orderBy(asc(studentClearanceItems.department));
    return { ...c, student: s, items: items.map(({ i, deciderName }) => ({ ...i, label: CLEARANCE_DEPARTMENTS[i.department]?.label ?? i.department, deciderName })) };
  }

  async studentClearances(tx: Tx, studentId: string) {
    const list = await tx.select({ id: studentClearances.id }).from(studentClearances).where(eq(studentClearances.studentId, studentId)).orderBy(desc(studentClearances.createdAt));
    return Promise.all(list.map((c) => this.clearance(tx, c.id)));
  }

  // ---- roll numbers and sections ----------------------------------------------------------------------------

  private async rollStudents(tx: Tx, sectionIds: string[]) {
    return tx
      .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, gender: studentProfiles.gender, enrolledOn: students.enrolledOn, admissionNo: studentProfiles.admissionNo, status: students.status })
      .from(students)
      .leftJoin(studentProfiles, eq(studentProfiles.studentId, students.id))
      .where(and(inArray(students.sectionId, sectionIds), inArray(students.status, ON_ROLL)));
  }

  /** New roll numbers for a class by the chosen rule; `dryRun` shows the plan, otherwise every student is renumbered. */
  async renumber(tx: Tx, p: UserPrincipal, input: { sectionId: string; order: RollOrder; prefix: string; start: number; width: number; girlsFirst?: boolean; dryRun: boolean }) {
    const [sec] = await tx.select().from(sections).where(eq(sections.id, input.sectionId));
    if (!sec) throw new NotFoundException('Class not found');
    const list = await this.rollStudents(tx, [sec.id]);
    if (!list.length) throw new BadRequestException('This class has no students on the roll');
    const plan = planRollNumbers(list, input);
    const changes = plan.filter((x) => x.from !== x.to);
    if (input.dryRun) return { dryRun: true, className: sec.displayName, plan, changed: changes.length };
    // Students who left keep their old roll numbers; a new number may not clash with one of theirs.
    const left = await tx.select({ rollNo: students.rollNo }).from(students).where(and(eq(students.sectionId, sec.id), sql`${students.status} not in (${sql.join(ON_ROLL.map((s) => sql`${s}`), sql`, `)})`));
    const clash = left.find((l) => plan.some((x) => x.to === l.rollNo));
    if (clash) throw new ConflictException(`Roll number ${clash.rollNo} belongs to a student who has left this class: use another prefix or start`);
    for (const x of changes) await tx.update(students).set({ rollNo: `~${x.id}` }).where(eq(students.id, x.id));
    for (const x of changes) {
      await tx.update(students).set({ rollNo: x.to, updatedAt: new Date() }).where(eq(students.id, x.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'student.roll_renumbered', subjectType: 'student', subjectId: x.id, changes: { rollNo: { before: x.from, after: x.to } }, data: { label: `${x.to} ${x.fullName}`, order: input.order } });
    }
    return { dryRun: false, className: sec.displayName, plan, changed: changes.length };
  }

  /** Shares students out between sections of the same programme and term (alphabetic blocks or a balanced mix). */
  async rebalance(tx: Tx, p: UserPrincipal, input: { sectionIds: string[]; mode: RebalanceMode; reason: string; dryRun: boolean }) {
    const secs = await tx.select().from(sections).where(inArray(sections.id, input.sectionIds));
    if (secs.length !== new Set(input.sectionIds).size || secs.length < 2) throw new BadRequestException('Choose at least two classes');
    if (new Set(secs.map((s) => `${s.programId}:${s.academicYearId}:${s.term}`)).size > 1) throw new BadRequestException('Choose classes of the same programme, year and term');
    const ordered = input.sectionIds.map((id) => secs.find((s) => s.id === id)!);
    const list = await this.rollStudents(tx, input.sectionIds);
    const plan = planRebalance(list, input.sectionIds, input.mode);
    const name = new Map(secs.map((s) => [s.id, s.displayName]));
    const sizes = ordered.map((s) => ({ sectionId: s.id, className: s.displayName, before: list.filter((x) => x.sectionId === s.id).length, after: list.filter((x) => (plan.find((m) => m.id === x.id)?.to ?? x.sectionId) === s.id).length }));
    const view = plan.map((m) => ({ ...m, fromName: name.get(m.from)!, toName: name.get(m.to)! }));
    if (input.dryRun) return { dryRun: true, moves: view, sizes };
    for (const m of plan) await this.lifecycle.changeSection(tx, p, m.id, m.to, input.reason);
    return { dryRun: false, moves: view, sizes };
  }

  // ---- promotion eligibility ---------------------------------------------------------------------------------

  /**
   * Who in a class may be promoted: attendance this academic year at or above the minimum and fees owing at or below
   * the limit. Students who miss are listed with the reasons, for the held-back list of the bulk promotion.
   */
  async promotionEligibility(tx: Tx, input: { sectionId: string; minAttendancePct: number; maxDuesPaise: number }) {
    const [sec] = await tx.select().from(sections).where(eq(sections.id, input.sectionId));
    if (!sec) throw new NotFoundException('Class not found');
    const list = rows<{ id: string; fullName: string; rollNo: string; present: number; total: number; due: number }>(
      await tx.execute(sql`
        select s.id, s.full_name as "fullName", s.roll_no as "rollNo",
          coalesce(a.present, 0)::int as present, coalesce(a.total, 0)::int as total, coalesce(f.due, 0)::float as due
        from students s
        left join (select student_id, count(*) filter (where status in ('present', 'late')) as present, count(*) as total
                   from attendance_records where section_id = ${sec.id}::uuid group by student_id) a on a.student_id = s.id
        left join (select student_id, sum(amount_paise - paid_paise) as due from fee_invoices where status = 'due' group by student_id) f on f.student_id = s.id
        where s.section_id = ${sec.id}::uuid and s.status = 'active'
        order by s.roll_no`),
    );
    const out = list.map((r) => {
      const pct = r.total ? Math.round((r.present / r.total) * 1000) / 10 : null;
      const reasons: string[] = [];
      if (pct !== null && pct < input.minAttendancePct) reasons.push(`Attendance ${pct}% is below ${input.minAttendancePct}%`);
      if (r.due > input.maxDuesPaise) reasons.push(`Rs ${(r.due / 100).toLocaleString('en-IN')} in fees owing`);
      return { studentId: r.id, fullName: r.fullName, rollNo: r.rollNo, attendancePct: pct, duesPaise: r.due, eligible: reasons.length === 0, reasons };
    });
    return { className: sec.displayName, students: out, eligible: out.filter((x) => x.eligible).length, heldBack: out.filter((x) => !x.eligible).length };
  }

  // ---- registers and statements ----------------------------------------------------------------------------------

  /** The statutory registers and statements: strength, religion and minority, age-wise, missing details, dropouts, TC register. */
  async report(tx: Tx, kind: string, q: { from?: string; to?: string; on?: string; programId?: string }) {
    const today = await this.lifecycle.today(tx);
    const onRoll = sql.join(ON_ROLL.map((s) => sql`${s}`), sql`, `);
    const prog = q.programId ? sql` and sec.program_id = ${q.programId}::uuid` : sql``;
    switch (kind) {
      case 'strength':
        return rows(
          await tx.execute(sql`
            select sec.display_name as "className", pr.name as "programme", sec.term,
              count(*)::int as total,
              count(*) filter (where sp.gender = 'male')::int as male,
              count(*) filter (where sp.gender = 'female')::int as female,
              count(*) filter (where sp.gender = 'other')::int as other,
              count(*) filter (where sp.gender is null)::int as "genderNotGiven",
              count(*) filter (where sp.category = 'general')::int as general,
              count(*) filter (where sp.category = 'obc')::int as obc,
              count(*) filter (where sp.category = 'sc')::int as sc,
              count(*) filter (where sp.category = 'st')::int as st,
              count(*) filter (where sp.category = 'ews')::int as ews,
              count(*) filter (where sp.disability is not null)::int as pwd
            from students s join sections sec on sec.id = s.section_id join programs pr on pr.id = sec.program_id
            left join student_profiles sp on sp.student_id = s.id
            where s.status in (${onRoll})${prog}
            group by sec.id, sec.display_name, pr.name, sec.term, sec.sort_order order by pr.name, sec.term, sec.sort_order, sec.display_name`),
        );
      case 'religion':
        return rows(
          await tx.execute(sql`
            select coalesce(nullif(sp.religion, ''), 'Not given') as religion,
              count(*)::int as total,
              count(*) filter (where sp.gender = 'male')::int as male,
              count(*) filter (where sp.gender = 'female')::int as female,
              count(*) filter (where sp.is_minority)::int as minority,
              count(*) filter (where sp.disability is not null)::int as pwd
            from students s join sections sec on sec.id = s.section_id left join student_profiles sp on sp.student_id = s.id
            where s.status in (${onRoll})${prog}
            group by 1 order by total desc, 1`),
        );
      case 'age': {
        const on = q.on ?? today;
        const list = rows<{ dob: string | null; gender: string | null }>(
          await tx.execute(sql`select sp.date_of_birth::text as dob, sp.gender from students s join sections sec on sec.id = s.section_id left join student_profiles sp on sp.student_id = s.id where s.status in (${onRoll})${prog}`),
        );
        const bands = new Map<string, { band: string; total: number; male: number; female: number; other: number }>();
        const order = ['Under 6', '6-10', '11-14', '15-17', '18-22', '23-25', '26 and over', 'Date of birth not given'];
        for (const r of list) {
          const band = r.dob ? ageBand(ageOn(r.dob, on)) : 'Date of birth not given';
          const b = bands.get(band) ?? { band, total: 0, male: 0, female: 0, other: 0 };
          b.total++;
          if (r.gender === 'male' || r.gender === 'female' || r.gender === 'other') b[r.gender]++;
          bands.set(band, b);
        }
        return [...bands.values()].sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band));
      }
      case 'missing': {
        const list = rows<{ id: string; fullName: string; rollNo: string; className: string; dob: string | null; gender: string | null; category: string | null; aadhaar: string | null; apaar: string | null; admissionNo: string | null; address: string | null; guardians: number }>(
          await tx.execute(sql`
            select s.id, s.full_name as "fullName", s.roll_no as "rollNo", sec.display_name as "className",
              sp.date_of_birth::text as dob, sp.gender, sp.category, sp.aadhaar_last4 as aadhaar, sp.admission_no as "admissionNo", sp.address_line as address,
              (select ai.apaar_id from student_academic_ids ai where ai.student_id = s.id order by ai.captured_at desc limit 1) as apaar,
              (select count(*)::int from guardians g where g.student_id = s.id) as guardians
            from students s join sections sec on sec.id = s.section_id left join student_profiles sp on sp.student_id = s.id
            where s.status in (${onRoll})${prog}
            order by sec.display_name, s.roll_no`),
        );
        return list
          .map((r) => {
            const missing = [!r.admissionNo && 'Admission number', !r.dob && 'Date of birth', !r.gender && 'Gender', !r.category && 'Category', !r.aadhaar && 'Aadhaar', !r.apaar && 'APAAR ID', !r.address && 'Address', !r.guardians && 'Guardian'].filter((x): x is string => !!x);
            return { studentId: r.id, fullName: r.fullName, rollNo: r.rollNo, className: r.className, missing: missing.join(', '), count: missing.length };
          })
          .filter((r) => r.count > 0);
      }
      case 'dropouts':
        return rows(
          await tx.execute(sql`
            select s.id as "studentId", s.full_name as "fullName", s.roll_no as "rollNo", sec.display_name as "className", e.to_status as status,
              e.effective_on::text as "effectiveOn", e.reason, u.full_name as "recordedBy"
            from student_lifecycle_events e join students s on s.id = e.student_id
            join sections sec on sec.id = coalesce(e.from_section_id, s.section_id)
            left join users u on u.id = e.actor_id
            where e.kind = 'status' and e.to_status in ('dropped', 'transferred', 'expelled', 'long_absent')
              and e.effective_on between ${q.from ?? '1900-01-01'}::date and ${q.to ?? today}::date${prog}
            order by e.effective_on desc, s.full_name`),
        );
      case 'tc-register':
        return rows(
          await tx.execute(sql`
            select s.id as "studentId", s.full_name as "fullName", s.roll_no as "rollNo", sec.display_name as "className", sp.admission_no as "admissionNo",
              e.effective_on::text as "leftOn", e.reason, c.serial_no as "tcNo", c.issued_at::date::text as "issuedOn",
              (select cl.status from student_clearances cl where cl.student_id = s.id and cl.purpose = 'tc' order by cl.created_at desc limit 1) as "noDues"
            from student_lifecycle_events e join students s on s.id = e.student_id
            join sections sec on sec.id = coalesce(e.from_section_id, s.section_id)
            left join student_profiles sp on sp.student_id = s.id
            left join certificates c on c.id = e.certificate_id
            where e.kind = 'status' and e.to_status = 'transferred'
              and e.effective_on between ${q.from ?? '1900-01-01'}::date and ${q.to ?? today}::date${prog}
            order by e.effective_on desc`),
        );
      default:
        throw new NotFoundException('Unknown report');
    }
  }
}
