import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { resolveAffiliation } from '../../affiliation/resolve.js';
import { Mailer } from '../../analytics/mailer.js';
import type { UserPrincipal } from '../../auth/principal.js';
import { readSettings } from '../../campus-ops/settings.js';
import { audit } from '../../common/audit.js';
import { TextSender } from '../../comms/channels.js';
import { fillTemplate, toE164 } from '../../comms/comms.logic.js';
import type { Tx } from '../../db/db.service.js';
import { admissionChecklistItems, admissionCredentialIssues, admissionProgrammeSettings } from '../../db/schema-admissions-pass.js';
import { feeStudentProfiles } from '../../db/schema-fee-depth.js';
import { feeStructures } from '../../db/schema-g1.js';
import { messageTemplates } from '../../db/schema-pathways.js';
import { studentProfiles } from '../../db/schema-sis.js';
import { academicYears, admissionCycles, applications, guardians, programs, sections, students, tenants, users } from '../../db/schema.js';
import { FeeSetupService } from '../../fee-depth/setup.service.js';
import { AdmissionsService, categoryOf } from '../admissions.service.js';
import { DeskService } from '../desk/desk.service.js';
import { addDays, auditActor, type Actor } from '../enquiries.service.js';
import { checklistFor, checklistState, CHECKLIST_STATUSES, type ChecklistStatus } from './checklist.js';
import { nextRegisterNo, PROFILE_TEMPLATES, registerPrefix, templateProblems } from './register-number.js';

type StaffActor = Actor & { userId: string };

/** "+91 98xxxxxx21" / "pr•••@gmail.com": enough for the office to know where it went, nothing more. */
export function maskDestination(v: string): string {
  if (v.includes('@')) {
    const [u, d] = v.split('@');
    return `${u.slice(0, 2)}•••@${d}`;
  }
  return v.length > 6 ? `${v.slice(0, 5)}${'x'.repeat(Math.max(0, v.length - 7))}${v.slice(-2)}` : '••••';
}

/** The welcome text when the institution has not written its own (template key `admission.welcome`). */
const WELCOME = 'Welcome to {{institution}}. {{name}} is admitted to {{programme}} (roll {{roll}}). Sign in to the {{app}} app with {{login}} and the one-time code sent to it.';

/**
 * From an accepted application to a student on the roll: the admission document checklist, provisional admission on
 * an undertaking and its confirmation, then enrolment with the register number (VTU USN built here; UUCMS numbers
 * awaited), the matching fee structures raised, and the student's and parent's sign-in details sent.
 */
@Injectable()
export class EnrolmentService {
  private readonly log = new Logger(EnrolmentService.name);

  constructor(
    private readonly admissions: AdmissionsService,
    private readonly desk: DeskService,
    private readonly feeSetup: FeeSetupService,
    private readonly sms: TextSender,
    private readonly mailer: Mailer,
  ) {}

  // ---- checklist -----------------------------------------------------------------------------------------------

  /** Creates the application's checklist from its facts (items already there are kept as they are). */
  async ensureChecklist(tx: Tx, actor: Actor, applicationId: string) {
    const a = await this.admissions.application(tx, applicationId);
    const s = await readSettings(tx, actor.tenantId, 'admissions');
    const home = String(s.rules.homeBoards ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const items = checklistFor({ admissionType: a.admissionType, nationality: a.nationality, seatType: a.seatType ?? (a.quota === 'merit' ? 'merit' : a.quota), category: categoryOf(a), claims: a.claims ?? {}, board: typeof a.answers?.board === 'string' ? a.answers.board : null, homeBoards: home, externalAllotment: !!a.externalAllotmentRef });
    const added = await tx
      .insert(admissionChecklistItems)
      .values(items.map((i) => ({ tenantId: actor.tenantId, applicationId, itemKey: i.key, label: i.label, required: i.required, original: i.original, why: i.why })))
      .onConflictDoNothing()
      .returning({ id: admissionChecklistItems.id });
    if (added.length) await audit(tx, { ...auditActor(actor), action: 'admissions.checklist_created.v1', subjectType: 'application', subjectId: applicationId, data: { items: added.length } });
    return this.checklist(tx, applicationId);
  }

  async checklist(tx: Tx, applicationId: string) {
    const a = await this.admissions.application(tx, applicationId);
    const rows = await tx.select().from(admissionChecklistItems).where(eq(admissionChecklistItems.applicationId, applicationId)).orderBy(asc(admissionChecklistItems.createdAt), asc(admissionChecklistItems.itemKey));
    const today = await this.admissions.today(tx);
    const state = checklistState(rows.map((r) => ({ itemKey: r.itemKey, required: r.required, status: r.status as ChecklistStatus, dueOn: r.dueOn })), today);
    return { applicationId, applicationNo: a.applicationNo, provisional: a.provisional, provisionalUntil: a.provisionalUntil, confirmedAt: a.admissionConfirmedAt, items: rows, ...state };
  }

  /** Records an item handed in, verified, deferred to a date or waived. A received original goes on the custody register. */
  async updateItem(tx: Tx, actor: StaffActor, itemId: string, input: { status: ChecklistStatus; dueOn?: string | null; referenceNo?: string | null; note?: string | null }) {
    const [it] = await tx.select().from(admissionChecklistItems).where(eq(admissionChecklistItems.id, itemId)).for('update');
    if (!it) throw new NotFoundException('Checklist item not found');
    if (!CHECKLIST_STATUSES.includes(input.status)) throw new BadRequestException('Unknown status');
    const today = await this.admissions.today(tx);
    if (input.status === 'deferred' && !(input.dueOn && input.dueOn >= today)) throw new BadRequestException('Give the date it is due (today or later)');
    if (input.status === 'waived' && !(input.note && input.note.trim().length >= 3)) throw new BadRequestException('Say why the item is waived');
    const set = { status: input.status, dueOn: input.status === 'deferred' ? input.dueOn! : null, referenceNo: input.referenceNo ?? it.referenceNo, note: input.note ?? it.note, updatedBy: actor.userId, updatedAt: new Date() };
    const [row] = await tx.update(admissionChecklistItems).set(set).where(eq(admissionChecklistItems.id, itemId)).returning();
    if (input.status === 'received' && it.original && it.status !== 'received') await this.desk.receiveOriginals(tx, actor, { applicationId: it.applicationId, items: [{ document: it.label, referenceNo: input.referenceNo ?? null }] });
    await audit(tx, { ...auditActor(actor), action: 'admissions.checklist_item_updated.v1', subjectType: 'application', subjectId: it.applicationId, before: { status: it.status, dueOn: it.dueOn }, after: { status: row.status, dueOn: row.dueOn }, data: { item: it.itemKey } });
    await this.confirmIfComplete(tx, actor, it.applicationId);
    return row;
  }

  /**
   * Admits provisionally: every item not yet in is deferred to the due date on the student's and parent's
   * undertaking. The admission is confirmed on its own when the last item comes in.
   */
  async provisionalAdmit(tx: Tx, actor: StaffActor, applicationId: string, input: { dueOn?: string; undertaking: boolean }) {
    const a = await this.admissions.application(tx, applicationId, true);
    if (!['accepted', 'enrolled'].includes(a.status)) throw new BadRequestException('Only an accepted seat can be admitted provisionally');
    if (!input.undertaking) throw new BadRequestException('The student and parent must sign the undertaking to hand in the certificates by the due date');
    await this.ensureChecklist(tx, actor, applicationId);
    const today = await this.admissions.today(tx);
    const max = Number((await readSettings(tx, actor.tenantId, 'admissions')).rules.provisionalDays ?? 30);
    const dueOn = input.dueOn ?? addDays(today, max);
    if (dueOn < today || dueOn > addDays(today, max)) throw new BadRequestException(`The due date must be within ${max} days`);
    const open = await tx.update(admissionChecklistItems).set({ status: 'deferred', dueOn, updatedBy: actor.userId, updatedAt: new Date() }).where(and(eq(admissionChecklistItems.applicationId, applicationId), eq(admissionChecklistItems.required, true), inArray(admissionChecklistItems.status, ['pending']))).returning({ key: admissionChecklistItems.itemKey });
    await tx.update(applications).set({ provisional: true, provisionalUntil: dueOn, updatedAt: new Date() }).where(eq(applications.id, applicationId));
    await audit(tx, { ...auditActor(actor), action: 'admissions.admitted_provisionally.v1', subjectType: 'application', subjectId: applicationId, data: { dueOn, deferred: open.map((o) => o.key) } });
    return this.letter(tx, applicationId);
  }

  private async confirmIfComplete(tx: Tx, actor: Actor, applicationId: string) {
    const c = await this.checklist(tx, applicationId);
    if (!c.complete || c.confirmedAt) return;
    const [a] = await tx.select().from(applications).where(eq(applications.id, applicationId));
    if (!['accepted', 'enrolled'].includes(a.status)) return;
    await tx.update(applications).set({ provisional: false, admissionConfirmedAt: new Date(), updatedAt: new Date() }).where(eq(applications.id, applicationId));
    await audit(tx, { ...auditActor(actor), action: 'admissions.admission_confirmed.v1', subjectType: 'application', subjectId: applicationId, data: { wasProvisional: a.provisional } });
  }

  /** The provisional (or confirmed) admission letter's contents, for the document engine or the printable page. */
  async letter(tx: Tx, applicationId: string) {
    const [row] = await tx
      .select({ a: applications, cycle: admissionCycles.name, programme: programs.name, year: academicYears.label })
      .from(applications)
      .innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId))
      .innerJoin(programs, eq(programs.id, admissionCycles.programId))
      .innerJoin(academicYears, eq(academicYears.id, admissionCycles.academicYearId))
      .where(eq(applications.id, applicationId));
    if (!row) throw new NotFoundException('Application not found');
    const [inst] = await tx.select({ name: tenants.name }).from(tenants);
    const c = await this.checklist(tx, applicationId);
    return {
      kind: row.a.admissionConfirmedAt ? 'confirmed' : 'provisional',
      institution: inst?.name ?? '',
      applicationNo: row.a.applicationNo,
      name: row.a.applicantName,
      guardianName: row.a.guardianName,
      programme: row.programme,
      academicYear: row.year,
      cycle: row.cycle,
      seat: { seatType: row.a.seatType ?? row.a.quota, category: row.a.seatCategory ?? categoryOf(row.a), option: row.a.allottedOption, admissionType: row.a.admissionType },
      provisionalUntil: row.a.provisionalUntil,
      pending: c.items.filter((i) => i.required && !['received', 'verified', 'waived'].includes(i.status)).map((i) => ({ label: i.label, dueOn: i.dueOn })),
      conditions: [
        'This admission is provisional and subject to the approval of the affiliating university.',
        'The documents listed must reach the admissions office by the dates shown; otherwise the admission stands cancelled and fees are refunded under the refund policy.',
        'The candidate and parent have signed the anti-ragging undertaking (UGC Regulations 2009).',
      ],
    };
  }

  // ---- enrolment ----------------------------------------------------------------------------------------------

  /**
   * Enrols an accepted application. With a checklist, it must be complete or the admission provisional. Then: the
   * register number (built when the university's format allows), the fee profile and the matching published fee
   * structures, and sign-in details for the student and parent.
   */
  async enroll(tx: Tx, p: UserPrincipal, applicationId: string, input: { sectionId?: string; rollNo?: string; activate: boolean; duplicateOverride?: string }) {
    const actor = { tenantId: p.tenantId, userId: p.userId };
    const pre = await this.admissions.application(tx, applicationId);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(admissionChecklistItems).where(eq(admissionChecklistItems.applicationId, applicationId));
    if (n > 0 && pre.status === 'accepted') {
      const c = await this.checklist(tx, applicationId);
      if (!c.complete && !c.provisionalOk) throw new BadRequestException(`Documents outstanding: ${c.items.filter((i) => c.open.includes(i.itemKey) && i.status !== 'deferred').map((i) => i.label).join(', ')}. Collect them or admit provisionally.`);
    }
    // With a checklist the office has seen the originals, which stands in for the uploaded copies.
    const res = await this.admissions.enroll(tx, actor, applicationId, { ...input, checklistGoverns: n > 0 });
    const a = await this.admissions.application(tx, applicationId);
    const s = (await readSettings(tx, p.tenantId, 'admissions')).rules;
    const registerNo = await this.assignRegisterNo(tx, actor, res.studentId, a);
    const [y] = await tx.select({ label: academicYears.label }).from(sections).innerJoin(academicYears, eq(academicYears.id, sections.academicYearId)).where(eq(sections.id, res.sectionId));
    await tx
      .insert(feeStudentProfiles)
      .values({ tenantId: p.tenantId, studentId: res.studentId, quota: a.seatType ?? a.quota, category: a.seatCategory ?? categoryOf(a), batch: y?.label ?? null })
      .onConflictDoUpdate({ target: feeStudentProfiles.studentId, set: { quota: a.seatType ?? a.quota, category: a.seatCategory ?? categoryOf(a), batch: y?.label ?? null, updatedAt: new Date() } });
    const fees = s.assignFeesOnEnrol ? await this.assignFees(tx, p, res.studentId) : [];
    const credentials = s.issueCredentialsOnEnrol ? await this.issueCredentials(tx, actor, res.studentId) : [];
    await audit(tx, { ...auditActor(actor), action: 'admissions.enrolment_completed.v1', subjectType: 'application', subjectId: applicationId, data: { studentId: res.studentId, registerNo, fees: fees.map((f) => f.structure), credentials: credentials.map((c) => `${c.role}:${c.status}`) } });
    return { ...res, registerNo, provisional: a.provisional, fees, credentials };
  }

  /** The register number when the university lets the college build it; null leaves the student awaiting one. */
  async assignRegisterNo(tx: Tx, actor: Actor, studentId: string, a: typeof applications.$inferSelect): Promise<string | null> {
    const [ctx] = await tx
      .select({ programId: sections.programId, startsOn: academicYears.startsOn })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
      .where(eq(students.id, studentId));
    const s = (await readSettings(tx, actor.tenantId, 'admissions')).rules;
    const aff = await resolveAffiliation(tx, ctx.programId);
    const template = String(s.registerNumberTemplate || (aff ? (PROFILE_TEMPLATES[aff.profile.code] ?? '') : ''));
    if (!template) return null;
    if (templateProblems(template).length) throw new BadRequestException(`The register number template in Settings → Admissions is not valid: ${templateProblems(template).join('; ')}`);
    const [ps] = await tx.select().from(admissionProgrammeSettings).where(eq(admissionProgrammeSettings.programId, ctx.programId));
    if (template.includes('{branch}') && !ps?.branchCode) throw new BadRequestException('Set the branch code of this programme (Admissions → Programmes) before enrolling: it is part of the register number');
    if (template.includes('{college}') && !s.collegeCode) throw new BadRequestException('Set the college code in Settings → Admissions before enrolling: it is part of the register number');
    // The batch's year: a lateral entrant joins the batch of the year they enter (VTU gives them that year).
    const parts = { region: String(s.regionCode ?? ''), college: String(s.collegeCode ?? ''), year: Number(ctx.startsOn.slice(0, 4)), branch: ps?.branchCode ?? '' };
    const prefix = registerPrefix(template, parts);
    const taken = (await tx.select({ no: studentProfiles.registerNo }).from(studentProfiles).where(like(studentProfiles.registerNo, `${prefix}%`))).map((r) => r.no!).filter(Boolean);
    let no: string;
    try {
      no = nextRegisterNo(template, parts, taken, a.admissionType === 'lateral');
    } catch (e) {
      throw new ConflictException((e as Error).message);
    }
    if (aff?.rules.registerNumber.pattern && !new RegExp(aff.rules.registerNumber.pattern, 'i').test(no)) throw new BadRequestException(`${no} does not match the university's format (${aff.rules.registerNumber.example ?? aff.rules.registerNumber.description})`);
    await tx.update(studentProfiles).set({ registerNo: no, updatedAt: new Date() }).where(eq(studentProfiles.studentId, studentId));
    await audit(tx, { ...auditActor(actor), action: 'student.register_no_assigned.v1', subjectType: 'student', subjectId: studentId, after: { registerNo: no }, data: { template } });
    return no;
  }

  /** Raises every published structure that applies to the new student (programme, batch, seat type, category, term). */
  private async assignFees(tx: Tx, p: UserPrincipal, studentId: string) {
    const candidates = await tx.select({ id: feeStructures.id, name: feeStructures.name }).from(feeStructures).where(and(eq(feeStructures.active, true), eq(feeStructures.status, 'published'))).orderBy(asc(feeStructures.sortOrder), asc(feeStructures.name));
    const out: { structure: string; amountPaise: number; dueOn: string }[] = [];
    for (const fs of candidates) {
      const preview = await this.feeSetup.preview(tx, p.tenantId, fs.id, { studentIds: [studentId] });
      if (!preview.some((r) => r.studentId === studentId && !r.assigned && r.amountPaise > 0)) continue;
      const r = await this.feeSetup.assign(tx, p, fs.id, { studentIds: [studentId] });
      out.push({ structure: fs.name, amountPaise: r.amountPaise, dueOn: r.dueOn });
    }
    return out;
  }

  /**
   * Sends the student and each guardian how to sign in to their app (phone and one-time code; no password is made or
   * sent). SMS goes only through a DLT-registered template `admission.welcome`; else email when there is an address.
   */
  async issueCredentials(tx: Tx, actor: Actor, studentId: string) {
    const [st] = await tx
      .select({ st: students, section: sections.displayName, programme: programs.name })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(programs, eq(programs.id, sections.programId))
      .where(eq(students.id, studentId));
    if (!st) throw new NotFoundException('Student not found');
    const [inst] = await tx.select({ name: tenants.name }).from(tenants);
    const [tpl] = await tx.select().from(messageTemplates).where(and(eq(messageTemplates.key, 'admission.welcome'), eq(messageTemplates.channel, 'sms'), eq(messageTemplates.active, true))).limit(1);
    const people: { userId: string; role: 'student' | 'parent'; app: string }[] = [];
    if (st.st.userId) people.push({ userId: st.st.userId, role: 'student', app: 'ZYNETIX Student' });
    for (const g of await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, studentId))) people.push({ userId: g.userId, role: 'parent', app: 'ZYNETIX Parent' });
    const out: { role: string; channel: string; destination: string; status: string; error?: string }[] = [];
    for (const person of people) {
      const [u] = await tx.select({ phone: users.phone, email: users.email }).from(users).where(eq(users.id, person.userId));
      const phone = toE164(u?.phone);
      const vars = { institution: inst?.name ?? '', name: st.st.fullName, programme: st.programme, roll: st.st.rollNo, app: person.app, login: u?.phone ?? u?.email ?? '' };
      let rec: { channel: string; destination: string; status: string; error?: string };
      try {
        if (phone && tpl?.dltTemplateId) {
          await this.sms.send({ to: phone, text: fillTemplate(tpl.body, vars).text, templateId: tpl.dltTemplateId, vars });
          rec = { channel: 'sms', destination: maskDestination(phone), status: 'sent' };
        } else if (u?.email) {
          await this.mailer.send({ to: [u.email], subject: `${inst?.name ?? 'Admission'}: how to sign in`, text: fillTemplate(WELCOME, vars).text, attachments: [] });
          rec = { channel: 'email', destination: maskDestination(u.email), status: 'sent' };
        } else rec = { channel: phone ? 'sms' : 'none', destination: phone ? maskDestination(phone) : '—', status: 'skipped', error: phone ? 'Register the SMS template "admission.welcome" with its DLT id first' : 'No mobile number or email on file' };
      } catch (e) {
        this.log.warn(`Sign-in details for student ${studentId} (${person.role}) failed: ${(e as Error).message.slice(0, 120)}`);
        rec = { channel: phone ? 'sms' : 'email', destination: phone ? maskDestination(phone) : maskDestination(u?.email ?? ''), status: 'failed', error: 'The message provider refused it; try again' };
      }
      await tx.insert(admissionCredentialIssues).values({ tenantId: actor.tenantId, studentId, userId: person.userId, role: person.role, channel: rec.channel, destination: rec.destination, status: rec.status, error: rec.error ?? null, issuedBy: actor.userId ?? null });
      out.push({ role: person.role, ...rec });
    }
    await audit(tx, { ...auditActor(actor), action: 'admissions.credentials_issued.v1', subjectType: 'student', subjectId: studentId, data: { sent: out.filter((o) => o.status === 'sent').length, of: out.length } });
    return out;
  }

  async credentialLog(tx: Tx, studentId: string) {
    return tx.select().from(admissionCredentialIssues).where(eq(admissionCredentialIssues.studentId, studentId)).orderBy(desc(admissionCredentialIssues.createdAt));
  }

  // ---- programme settings -----------------------------------------------------------------------------------------

  async programmeSettings(tx: Tx) {
    const rows = await tx
      .select({ programId: programs.id, programme: programs.name, level: programs.level, s: admissionProgrammeSettings })
      .from(programs)
      .leftJoin(admissionProgrammeSettings, eq(admissionProgrammeSettings.programId, programs.id))
      .orderBy(asc(programs.sortOrder), asc(programs.name));
    return rows.map((r) => ({ programId: r.programId, programme: r.programme, level: r.level, branchCode: r.s?.branchCode ?? null, sanctionedIntake: r.s?.sanctionedIntake ?? null, approvalBody: r.s?.approvalBody ?? null, approvalRef: r.s?.approvalRef ?? null, approvalValidTo: r.s?.approvalValidTo ?? null }));
  }

  async setProgrammeSettings(tx: Tx, actor: StaffActor, programId: string, input: { branchCode?: string | null; sanctionedIntake?: number | null; approvalBody?: string | null; approvalRef?: string | null; approvalValidTo?: string | null }) {
    const [prog] = await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, programId));
    if (!prog) throw new NotFoundException('Programme not found');
    const [before] = await tx.select().from(admissionProgrammeSettings).where(eq(admissionProgrammeSettings.programId, programId));
    const values = { branchCode: input.branchCode?.toUpperCase() ?? before?.branchCode ?? null, sanctionedIntake: input.sanctionedIntake ?? before?.sanctionedIntake ?? null, approvalBody: input.approvalBody ?? before?.approvalBody ?? null, approvalRef: input.approvalRef ?? before?.approvalRef ?? null, approvalValidTo: input.approvalValidTo ?? before?.approvalValidTo ?? null };
    const [row] = await tx
      .insert(admissionProgrammeSettings)
      .values({ tenantId: actor.tenantId, programId, ...values, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: admissionProgrammeSettings.programId, set: { ...values, updatedBy: actor.userId, updatedAt: new Date() } })
      .returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.programme_settings_set.v1', subjectType: 'programme', subjectId: programId, before: before ? { branchCode: before.branchCode, sanctionedIntake: before.sanctionedIntake, approvalRef: before.approvalRef } : null, after: { branchCode: row.branchCode, sanctionedIntake: row.sanctionedIntake, approvalRef: row.approvalRef }, data: {} });
    return row;
  }

  /** Students admitted without a register number yet (their university issues it; import it on the student list). */
  async awaitingRegisterNo(tx: Tx) {
    return tx
      .select({ studentId: students.id, name: students.fullName, rollNo: students.rollNo, className: sections.displayName, enrolledOn: students.enrolledOn, applicationNo: applications.applicationNo })
      .from(students)
      .innerJoin(applications, eq(applications.id, students.applicationId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .leftJoin(studentProfiles, eq(studentProfiles.studentId, students.id))
      .where(and(inArray(students.status, ['enrolled', 'active']), sql`${studentProfiles.registerNo} is null`))
      .orderBy(asc(sections.displayName), asc(students.rollNo))
      .limit(500);
  }

  /** Provisional admissions with items overdue or due within a week, for the follow-up list. */
  async provisionalFollowUps(tx: Tx) {
    const today = await this.admissions.today(tx);
    const rows = await tx
      .select({ applicationId: applications.id, applicationNo: applications.applicationNo, name: applications.applicantName, phone: applications.guardianPhone, until: applications.provisionalUntil, item: admissionChecklistItems.label, dueOn: admissionChecklistItems.dueOn })
      .from(admissionChecklistItems)
      .innerJoin(applications, eq(applications.id, admissionChecklistItems.applicationId))
      .where(and(eq(admissionChecklistItems.status, 'deferred'), eq(admissionChecklistItems.required, true), sql`${admissionChecklistItems.dueOn} <= ${addDays(today, 7)}::date`))
      .orderBy(asc(admissionChecklistItems.dueOn));
    return rows.map((r) => ({ ...r, overdue: !!r.dueOn && r.dueOn < today }));
  }
}
