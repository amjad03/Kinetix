import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicDocRequests, examResultLines, examResults, examSessions, guardians, legacyMarks, programs, sections, students, subjects, tenants } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { consolidate, DEFAULT_CLASSES, docCode, docPdf, DOC_TITLE, importedTerm, serialFor, type DocKind, type DocSnapshot, type TermBlock } from './academic-docs.logic.js';

/** Staff who decide and issue. */
export const DOC_ADMIN: RoleName[] = ['tenant_admin', 'principal', 'exam_controller'];

@Injectable()
export class AcademicDocsService {
  constructor(
    private readonly db: DbService,
    private readonly notes: NotificationsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private isAdmin(p: UserPrincipal) {
    return p.roles.some((r) => DOC_ADMIN.includes(r));
  }

  /** The student's published results and imported history, oldest first, and the consolidated figures. */
  async snapshot(tx: Tx, tenantId: string, studentId: string): Promise<DocSnapshot> {
    const [t] = await tx.select({ name: tenants.name }).from(tenants);
    const [s] = await tx
      .select({ name: students.fullName, rollNo: students.rollNo, className: sections.displayName, program: programs.name })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(programs, eq(programs.id, sections.programId))
      .where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    const history = await tx.select().from(legacyMarks).where(or(eq(legacyMarks.studentId, studentId), eq(legacyMarks.rollNo, s.rollNo)));
    const groups = new Map<string, typeof history>();
    for (const m of history) {
      const key = `${m.academicYear}|${String(m.term).padStart(2, '0')}`;
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    const terms: TermBlock[] = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
      const [year, term] = key.split('|');
      return importedTerm(`${year} - Semester ${Number(term)}`, rows.map((r) => ({ code: r.subjectCode, subject: r.subjectName || r.subjectCode, credits: r.credits, internal: r.internalMarks, external: r.externalMarks, maxInternal: r.maxInternal, maxExternal: r.maxExternal, grade: r.grade, gradePoint: r.gradePoint, result: r.result })));
    });
    const rs = await tx
      .select({ id: examResults.id, name: examSessions.name, term: examSessions.term, sgpa: examResults.sgpa, creditsAttempted: examResults.creditsAttempted, creditsEarned: examResults.creditsEarned, creditPoints: examResults.creditPoints })
      .from(examResults)
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .where(and(eq(examResults.studentId, studentId), inArray(examSessions.status, ['published', 'locked'])))
      .orderBy(asc(examSessions.startsOn));
    if (rs.length) {
      const lines = await tx
        .select({ resultId: examResultLines.resultId, code: subjects.code, subject: subjects.name, credits: examResultLines.credits, percent: examResultLines.percent, grade: examResultLines.grade, gradePoint: examResultLines.gradePoint, passed: examResultLines.passed })
        .from(examResultLines)
        .innerJoin(subjects, eq(subjects.id, examResultLines.subjectId))
        .where(inArray(examResultLines.resultId, rs.map((r) => r.id)));
      for (const r of rs) terms.push({ label: `${r.name} - Semester ${r.term}`, source: 'kinetix', lines: lines.filter((l) => l.resultId === r.id).sort((a, b) => a.code.localeCompare(b.code)).map(({ resultId: _r, ...l }) => l), sgpa: r.sgpa, creditsAttempted: r.creditsAttempted, creditsEarned: r.creditsEarned, creditPoints: r.creditPoints });
    }
    return { header: { institution: t?.name ?? '', ...s }, terms, ...consolidate(terms, DEFAULT_CLASSES) };
  }

  create(p: UserPrincipal, b: { studentId: string; kind: DocKind; purpose: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, DOC_ADMIN);
      const open = await tx.select({ id: academicDocRequests.id }).from(academicDocRequests).where(and(eq(academicDocRequests.studentId, b.studentId), eq(academicDocRequests.kind, b.kind), inArray(academicDocRequests.status, ['requested', 'approved'])));
      if (open.length) throw new ConflictException('A request for this document is already open');
      const snap = await this.snapshot(tx, p.tenantId, b.studentId);
      if (!snap.terms.length) throw new ConflictException('There are no results to issue a document from yet');
      const [row] = await tx.insert(academicDocRequests).values({ tenantId: p.tenantId, studentId: b.studentId, kind: b.kind, purpose: b.purpose, requestedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'academic_doc.requested', subjectType: 'academic_doc_request', subjectId: row!.id, data: { kind: b.kind, studentId: b.studentId } });
      return this.view(row!);
    });
  }

  private view(r: typeof academicDocRequests.$inferSelect, studentName?: string, rollNo?: string) {
    const { snapshot: _s, verifyToken: _v, ...rest } = r;
    return { ...rest, title: DOC_TITLE[r.kind as DocKind], ...(studentName !== undefined && { studentName, rollNo }) };
  }

  /** One student's requests (student, family, staff). */
  forStudent(p: UserPrincipal, studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, DOC_ADMIN);
      const rows = await tx.select().from(academicDocRequests).where(eq(academicDocRequests.studentId, studentId)).orderBy(desc(academicDocRequests.createdAt));
      return rows.map((r) => this.view(r));
    });
  }

  /** The office queue. */
  inbox(p: UserPrincipal, status?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ r: academicDocRequests, name: students.fullName, rollNo: students.rollNo })
        .from(academicDocRequests)
        .innerJoin(students, eq(students.id, academicDocRequests.studentId))
        .where(status ? eq(academicDocRequests.status, status) : undefined)
        .orderBy(desc(academicDocRequests.createdAt))
        .limit(300);
      return rows.map((x) => this.view(x.r, x.name, x.rollNo));
    });
  }

  private async load(tx: Tx, id: string) {
    const [r] = await tx.select().from(academicDocRequests).where(eq(academicDocRequests.id, id));
    if (!r) throw new NotFoundException('Request not found');
    return r;
  }

  private async tell(tx: Tx, r: typeof academicDocRequests.$inferSelect, what: 'approved' | 'rejected' | 'issued') {
    const [st] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, r.studentId));
    const gs = await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, r.studentId));
    const title = DOC_TITLE[r.kind as DocKind].toLowerCase();
    const msg = { approved: `Your request for the ${title} was approved.`, rejected: `Your request for the ${title} was not approved.`, issued: `Your ${title} is ready to download.` }[what];
    const text = { title: 'Academic document', body: msg };
    await this.notes.notifyUsers(tx, [...new Set([...gs.map((g) => g.userId), ...(st?.userId ? [st.userId] : [])])], { kind: 'certificate', text: { en: text, hi: text, kn: text }, data: { requestId: r.id, kind: r.kind }, dedupeKey: `academic-doc:${r.id}:${what}` });
  }

  decide(p: UserPrincipal, id: string, approve: boolean, note: string | undefined) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.load(tx, id);
      if (r.status !== 'requested') throw new ConflictException('Already decided');
      const status = approve ? 'approved' : 'rejected';
      const [row] = await tx.update(academicDocRequests).set({ status, decidedBy: p.userId, decidedAt: new Date(), decisionNote: note ?? null }).where(eq(academicDocRequests.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `academic_doc.${status}`, subjectType: 'academic_doc_request', subjectId: id });
      await this.tell(tx, row!, status);
      return this.view(row!);
    });
  }

  /** Freezes the figures, numbers the document and signs its QR. */
  issue(p: UserPrincipal, id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.load(tx, id);
      if (r.status !== 'approved') throw new ConflictException('Approve the request first');
      const snap = await this.snapshot(tx, p.tenantId, r.studentId);
      const now = new Date();
      const [{ n }] = await tx.select({ n: count() }).from(academicDocRequests).where(and(eq(academicDocRequests.kind, r.kind), isNotNull(academicDocRequests.serialNo)));
      const serial = serialFor(r.kind as DocKind, now.getUTCFullYear(), Number(n) + 1);
      const [row] = await tx
        .update(academicDocRequests)
        .set({ status: 'issued', issuedAt: now, serialNo: serial, verifyToken: docCode(this.env.JWT_SECRET, p.tenantId, serial), snapshot: snap })
        .where(eq(academicDocRequests.id, id))
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'academic_doc.issued', subjectType: 'academic_doc_request', subjectId: id, data: { serial, kind: r.kind } });
      await this.tell(tx, row!, 'issued');
      return this.view(row!);
    });
  }

  /** The issued PDF: staff, the student or their family. */
  async download(p: UserPrincipal, id: string): Promise<{ pdf: Buffer; name: string }> {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.load(tx, id);
      await assertCanSeeStudent(tx, p, r.studentId, DOC_ADMIN);
      if (r.status !== 'issued' || !r.snapshot || !r.serialNo) throw new ForbiddenException('This document has not been issued yet');
      const [t] = await tx.select({ slug: tenants.slug }).from(tenants);
      const verifyUrl = `${this.env.VERIFY_BASE_URL.replace(/\/$/, '')}/academic/${t!.slug}/${encodeURIComponent(docCode(this.env.JWT_SECRET, p.tenantId, r.serialNo))}`;
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'academic_doc.downloaded', subjectType: 'academic_doc_request', subjectId: id });
      return { pdf: docPdf(r.kind as DocKind, r.snapshot as DocSnapshot, r.serialNo, (r.issuedAt ?? new Date()).toISOString().slice(0, 10), verifyUrl), name: `${r.kind}-${r.serialNo.replace(/\//g, '-')}.pdf` };
    });
  }
}
