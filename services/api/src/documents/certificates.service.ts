import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BOUND, assertNotRouted } from '../workflows/bound-flows.js';
import type { CertificateKind, CertificateRequest, CertificateStatus, CertificateSubject, CertificateTemplate } from '@kinetix/shared';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import type { Tx } from '../db/db.service.js';
import { academicYears, certificateCounters, certificates, certificateTemplates, departments, designations, guardians, programs, sections, staffProfiles, students, tenants, userRoles, users } from '../db/schema.js';
import { financialYear } from '../fees/fees.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { hasRole, OFFICE_ROLES } from './documents.access.js';
import { DEFAULT_TEMPLATES, longDate, renderTemplate } from './render.js';

type Cert = typeof certificates.$inferSelect;
type Tmpl = typeof certificateTemplates.$inferSelect;

export const templateView = (t: Tmpl): CertificateTemplate => ({ id: t.id, kind: t.kind as CertificateKind, name: t.name, subjectType: t.subjectType as CertificateSubject, title: t.title, body: t.body, fields: t.fields, serialPrefix: t.serialPrefix, active: t.active, version: t.version });

/** What a certificate is about: the values behind {{name}}, {{rollNo}}… */
export interface SubjectInfo {
  id: string;
  name: string;
  detail: string | null;
  values: Record<string, string | null>;
}

@Injectable()
export class CertificatesService {
  private readonly verifyBase: string;

  constructor(
    @Inject(ENV) env: Env,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {
    this.verifyBase = env.VERIFY_BASE_URL.replace(/\/$/, '');
  }

  async templates(tx: Tx, tenantId: string): Promise<Tmpl[]> {
    const any = await tx.select({ id: certificateTemplates.id }).from(certificateTemplates).limit(1);
    if (!any.length) await tx.insert(certificateTemplates).values(DEFAULT_TEMPLATES.map((t) => ({ ...t, tenantId })));
    return tx.select().from(certificateTemplates).orderBy(asc(certificateTemplates.name));
  }

  async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  /** The student or staff member a certificate is for. */
  async subject(tx: Tx, type: CertificateSubject, id: string): Promise<SubjectInfo> {
    if (type === 'student') {
      const [r] = await tx
        .select({ id: students.id, name: students.fullName, rollNo: students.rollNo, className: sections.displayName, program: programs.name, year: academicYears.label })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(programs, eq(programs.id, sections.programId))
        .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
        .where(eq(students.id, id));
      if (!r) throw new NotFoundException('Student not found');
      return { id: r.id, name: r.name, detail: `${r.className}, Roll ${r.rollNo}`, values: { name: r.name, rollNo: r.rollNo, className: r.className, program: r.program, academicYear: r.year } };
    }
    const [r] = await tx
      .select({ id: users.id, name: users.fullName, code: staffProfiles.employeeCode, joined: staffProfiles.dateOfJoining, designation: designations.name, department: departments.name })
      .from(users)
      .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .leftJoin(designations, eq(designations.id, staffProfiles.designationId))
      .leftJoin(departments, eq(departments.id, staffProfiles.departmentId))
      .where(eq(users.id, id));
    if (!r) throw new NotFoundException('Staff member not found');
    return { id: r.id, name: r.name, detail: r.designation, values: { name: r.name, employeeCode: r.code, designation: r.designation, department: r.department, dateOfJoining: r.joined ? longDate(r.joined) : null } };
  }

  /** Who may ask for, and read, a certificate about this subject. */
  async canAccessSubject(tx: Tx, p: UserPrincipal, type: CertificateSubject, id: string): Promise<boolean> {
    if (hasRole(p, OFFICE_ROLES)) return true;
    if (type === 'staff') return id === p.userId;
    const [own] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, id), eq(students.userId, p.userId)));
    if (own) return true;
    const [g] = await tx.select({ id: guardians.id }).from(guardians).where(and(eq(guardians.studentId, id), eq(guardians.userId, p.userId)));
    return !!g;
  }

  async request(tx: Tx, p: UserPrincipal, body: { templateId: string; studentId?: string; staffUserId?: string; purpose: string; fields: Record<string, string> }): Promise<CertificateRequest> {
    const [tmpl] = await tx.select().from(certificateTemplates).where(eq(certificateTemplates.id, body.templateId));
    if (!tmpl || !tmpl.active) throw new NotFoundException('Certificate template not found');
    const type = tmpl.subjectType as CertificateSubject;
    const subjectId = type === 'student' ? body.studentId : (body.staffUserId ?? p.userId);
    if (!subjectId) throw new BadRequestException('Choose the student');
    if (!(await this.canAccessSubject(tx, p, type, subjectId))) throw new NotFoundException(type === 'student' ? 'Student not found' : 'Staff member not found');
    await this.subject(tx, type, subjectId); // 404 when it does not exist
    if (type === 'staff') {
      const [staff] = await tx.select({ r: userRoles.role }).from(userRoles).where(and(eq(userRoles.userId, subjectId), inArray(userRoles.role, ['teacher', 'hod', 'principal', 'tenant_admin', 'librarian', 'accountant', 'hr_manager']))).limit(1);
      if (!staff) throw new NotFoundException('Staff member not found');
    }
    for (const f of tmpl.fields) if (f.required && !body.fields[f.key]?.trim()) throw new BadRequestException(`${f.label} is required`);
    const known = new Set(tmpl.fields.map((f) => f.key));
    const fields = Object.fromEntries(Object.entries(body.fields).filter(([k]) => known.has(k)).map(([k, v]) => [k, v.trim()]));
    const [open] = await tx
      .select({ id: certificates.id })
      .from(certificates)
      .where(and(eq(certificates.templateId, tmpl.id), inArray(certificates.status, ['requested', 'approved']), type === 'student' ? eq(certificates.studentId, subjectId) : eq(certificates.staffUserId, subjectId)));
    if (open) throw new ConflictException('There is already an open request for this certificate');
    const [row] = await tx
      .insert(certificates)
      .values({ tenantId: p.tenantId, templateId: tmpl.id, subjectType: type, studentId: type === 'student' ? subjectId : null, staffUserId: type === 'staff' ? subjectId : null, purpose: body.purpose, fields, requestedBy: p.userId })
      .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'certificate.requested', subjectType: 'certificate', subjectId: row.id, data: { kind: tmpl.kind, subject: subjectId } });
    return (await this.views(tx, [row]))[0];
  }

  /** Request views with the names they show, loaded together. */
  async views(tx: Tx, rows: Cert[]): Promise<CertificateRequest[]> {
    if (!rows.length) return [];
    const tmpls = new Map((await tx.select().from(certificateTemplates).where(inArray(certificateTemplates.id, [...new Set(rows.map((r) => r.templateId))]))).map((t) => [t.id, t]));
    const userIds = [...new Set(rows.flatMap((r) => [r.requestedBy, r.decidedBy, r.staffUserId]).filter((x): x is string => !!x))];
    const names = new Map((await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, userIds))).map((u) => [u.id, u.name]));
    const studentIds = [...new Set(rows.map((r) => r.studentId).filter((x): x is string => !!x))];
    const stu = new Map((studentIds.length ? await tx.select({ id: students.id, name: students.fullName, rollNo: students.rollNo, className: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(inArray(students.id, studentIds)) : []).map((s) => [s.id, s]));
    const slug = (await tx.select({ slug: tenants.slug }).from(tenants))[0]?.slug ?? '';
    return rows.map((r) => {
      const t = tmpls.get(r.templateId)!;
      const s = r.studentId ? stu.get(r.studentId) : null;
      return {
        id: r.id,
        template: { id: t.id, kind: t.kind as CertificateKind, name: t.name },
        subjectType: r.subjectType as CertificateSubject,
        subject: s ? { id: s.id, name: s.name, detail: `${s.className}, Roll ${s.rollNo}` } : { id: r.staffUserId!, name: names.get(r.staffUserId!) ?? '', detail: null },
        purpose: r.purpose,
        fields: r.fields,
        status: r.status as CertificateStatus,
        requestedBy: { id: r.requestedBy, fullName: names.get(r.requestedBy) ?? '' },
        decidedBy: r.decidedBy ? { id: r.decidedBy, fullName: names.get(r.decidedBy) ?? '' } : null,
        decisionNote: r.decisionNote,
        serialNo: r.serialNo,
        issuedAt: r.issuedAt?.toISOString() ?? null,
        revokedAt: r.revokedAt?.toISOString() ?? null,
        revokedReason: r.revokedReason,
        verifyUrl: r.verifyToken ? `${this.verifyBase}/${slug}/${r.verifyToken}` : null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  async get(tx: Tx, id: string): Promise<Cert> {
    const [r] = await tx.select().from(certificates).where(eq(certificates.id, id));
    if (!r) throw new NotFoundException('Certificate not found');
    return r;
  }

  async list(tx: Tx, p: UserPrincipal, filter: { status?: CertificateStatus; mine?: boolean }): Promise<CertificateRequest[]> {
    const conds = [filter.status ? eq(certificates.status, filter.status) : undefined];
    if (filter.mine || !hasRole(p, OFFICE_ROLES)) {
      conds.push(or(eq(certificates.requestedBy, p.userId), eq(certificates.staffUserId, p.userId), sql`${certificates.studentId} in (select id from students where user_id = ${p.userId}::uuid union select student_id from guardians where user_id = ${p.userId}::uuid)`));
    }
    const rows = await tx.select().from(certificates).where(and(...conds)).orderBy(desc(certificates.createdAt)).limit(500);
    return this.views(tx, rows);
  }

  /** Whether the caller may see this certificate (office, the requester, or the subject's family). */
  async assertCanSee(tx: Tx, p: UserPrincipal, c: Cert): Promise<void> {
    if (hasRole(p, OFFICE_ROLES) || c.requestedBy === p.userId) return;
    if (!(await this.canAccessSubject(tx, p, c.subjectType as CertificateSubject, (c.studentId ?? c.staffUserId)!))) throw new NotFoundException('Certificate not found');
  }

  async decide(tx: Tx, p: UserPrincipal, id: string, status: 'approved' | 'rejected', note: string | null): Promise<CertificateRequest> {
    const [c] = await tx.select().from(certificates).where(eq(certificates.id, id));
    if (!c) throw new NotFoundException('Certificate not found');
    if (c.subjectType === 'staff' ? !hasRole(p, ['tenant_admin', 'principal', 'hr_manager']) : !hasRole(p, ['tenant_admin', 'principal'])) throw new ForbiddenException('Insufficient role');
    // Rejecting grants nothing, so only approval has to go through the workflow when the institution has one.
    if (status === 'approved') await assertNotRouted(tx, BOUND.certificate);
    return this.applyDecision(tx, { tenantId: p.tenantId, userId: p.userId }, id, status, note);
  }

  /** Records the decision of whoever is entitled to make it (a role check in {@link decide}, or the approvers of a workflow). */
  async applyDecision(tx: Tx, actor: { tenantId: string; userId: string }, id: string, status: 'approved' | 'rejected', note: string | null): Promise<CertificateRequest> {
    const [c] = await tx.select().from(certificates).where(eq(certificates.id, id)).for('update');
    if (!c) throw new NotFoundException('Certificate not found');
    if (c.status !== 'requested') throw new ConflictException(`This request is already ${c.status}`);
    await tx.update(certificates).set({ status, decidedBy: actor.userId, decidedAt: new Date(), decisionNote: note }).where(eq(certificates.id, id));
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: `certificate.${status}`, subjectType: 'certificate', subjectId: id, data: { note } });
    return (await this.views(tx, [await this.get(tx, id)]))[0];
  }

  /** Numbers, freezes and publishes an approved certificate. Idempotent: issuing again returns the same one. */
  async issue(tx: Tx, p: UserPrincipal, id: string): Promise<CertificateRequest> {
    const [c] = await tx.select().from(certificates).where(eq(certificates.id, id)).for('update');
    if (!c) throw new NotFoundException('Certificate not found');
    if (c.status === 'issued') return (await this.views(tx, [c]))[0];
    if (c.status !== 'approved') throw new ConflictException(`A ${c.status} request cannot be issued`);
    const [tmpl] = await tx.select().from(certificateTemplates).where(eq(certificateTemplates.id, c.templateId));
    const today = await this.today(tx);
    const fy = financialYear(today);
    // The upsert takes the counter row's lock, so concurrent issues queue and never share a number.
    const [counter] = await tx
      .insert(certificateCounters)
      .values({ tenantId: p.tenantId, prefix: tmpl.serialPrefix, financialYear: fy, lastNo: 1 })
      .onConflictDoUpdate({ target: [certificateCounters.tenantId, certificateCounters.prefix, certificateCounters.financialYear], set: { lastNo: sql`${certificateCounters.lastNo} + 1` } })
      .returning();
    const serialNo = `${tmpl.serialPrefix}/${fy}/${String(counter.lastNo).padStart(5, '0')}`;
    const subject = await this.subject(tx, c.subjectType as CertificateSubject, (c.studentId ?? c.staffUserId)!);
    const [tenant] = await tx.select({ name: tenants.name }).from(tenants);
    const values: Record<string, string | null> = {
      ...subject.values,
      institution: tenant.name,
      purpose: c.purpose || 'whatever purpose it may be required for',
      serialNo,
      issuedOn: longDate(today),
      ...Object.fromEntries(tmpl.fields.map((f) => [`fields.${f.key}`, c.fields[f.key] ?? ''])),
    };
    const now = this.clock.now();
    await tx
      .update(certificates)
      .set({ status: 'issued', serialNo, issuedBy: p.userId, issuedAt: now, renderedTitle: tmpl.title, renderedBody: renderTemplate(tmpl.body, values), verifyToken: randomBytes(16).toString('hex') })
      .where(eq(certificates.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'certificate.issued', subjectType: 'certificate', subjectId: id, data: { serialNo, kind: tmpl.kind, templateVersion: tmpl.version } });
    const recipients = c.staffUserId ? [c.staffUserId] : ((await tx.execute<{ user_id: string }>(sql`select user_id from guardians where student_id = ${c.studentId}::uuid union select user_id from students where id = ${c.studentId}::uuid and user_id is not null`)).rows.map((r) => r.user_id));
    await this.notifications.notifyUsers(tx, recipients, { kind: 'certificate', text: texts.certificateIssued({ title: tmpl.title, serialNo }), data: { certificateId: id }, dedupeKey: `certificate:${id}` });
    return (await this.views(tx, [await this.get(tx, id)]))[0];
  }

  async revoke(tx: Tx, p: UserPrincipal, id: string, reason: string): Promise<CertificateRequest> {
    const [c] = await tx.select().from(certificates).where(eq(certificates.id, id)).for('update');
    if (!c) throw new NotFoundException('Certificate not found');
    if (c.status !== 'issued') throw new ConflictException('Only an issued certificate can be revoked');
    await tx.update(certificates).set({ status: 'revoked', revokedAt: this.clock.now(), revokedBy: p.userId, revokedReason: reason }).where(eq(certificates.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'certificate.revoked', subjectType: 'certificate', subjectId: id, data: { serialNo: c.serialNo, reason } });
    return (await this.views(tx, [await this.get(tx, id)]))[0];
  }

  /** Creates, approves and issues one certificate of a template for each student without a live one. */
  async bulkIssue(tx: Tx, p: UserPrincipal, body: { templateId: string; sectionId?: string; studentIds?: string[]; purpose: string }): Promise<{ issued: number; skipped: number }> {
    const [tmpl] = await tx.select().from(certificateTemplates).where(and(eq(certificateTemplates.id, body.templateId), eq(certificateTemplates.active, true)));
    if (!tmpl) throw new NotFoundException('Certificate template not found');
    if (tmpl.subjectType !== 'student') throw new BadRequestException('Bulk issue is for student certificates');
    if (tmpl.fields.some((f) => f.required)) throw new BadRequestException('This template needs details for each student: request them one by one');
    const roster = body.sectionId
      ? await tx.select({ id: students.id }).from(students).where(and(eq(students.sectionId, body.sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo))
      : await tx.select({ id: students.id }).from(students).where(and(inArray(students.id, body.studentIds ?? []), eq(students.status, 'active')));
    if (!roster.length) throw new BadRequestException('There are no students to issue to');
    const live = new Set((await tx.select({ id: certificates.studentId }).from(certificates).where(and(eq(certificates.templateId, tmpl.id), inArray(certificates.status, ['requested', 'approved', 'issued'])))).map((r) => r.id));
    let issued = 0;
    for (const s of roster) {
      if (live.has(s.id)) continue;
      const [row] = await tx.insert(certificates).values({ tenantId: p.tenantId, templateId: tmpl.id, subjectType: 'student', studentId: s.id, purpose: body.purpose, fields: {}, status: 'approved', requestedBy: p.userId, decidedBy: p.userId, decidedAt: new Date(), decisionNote: 'Bulk issue' }).returning({ id: certificates.id });
      await this.issue(tx, p, row.id);
      issued++;
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'certificate.bulk_issued', subjectType: 'certificate_template', subjectId: tmpl.id, data: { issued, skipped: roster.length - issued, sectionId: body.sectionId ?? null } });
    return { issued, skipped: roster.length - issued };
  }
}
