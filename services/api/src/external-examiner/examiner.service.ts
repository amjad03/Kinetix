import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { normalizePhone } from '../auth/phone.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examPapers, examSessions, extExaminerAssignments, extExaminers, extQuestionPapers, extRemunerationClaims, extValuationScripts, marks, students, subjects, userRoles, users } from '../db/schema.js';
import { claimAmount, hashInvite, newInvite, nextQpState, scriptCode, type AssignmentRole, type QpAction, type QpActor, type QpState } from './examiner.logic.js';

const INVITE_DAYS = 7;
type Assignment = typeof extExaminerAssignments.$inferSelect;

@Injectable()
export class ExaminerService {
  constructor(private readonly db: DbService) {}

  // ---- office: examiners and assignments ---------------------------------------------------

  async createExaminer(p: UserPrincipal, b: { fullName: string; phone: string; email?: string; organisation: string }) {
    const phone = normalizePhone(b.phone);
    if (!phone) throw new BadRequestException('Enter a valid mobile number');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone));
      if (dup) throw new ConflictException('This phone number already belongs to a user');
      const [u] = await tx.insert(users).values({ tenantId: p.tenantId, fullName: b.fullName, phone, email: b.email ?? null }).returning();
      await tx.insert(userRoles).values({ tenantId: p.tenantId, userId: u!.id, role: 'external_examiner' });
      const [e] = await tx.insert(extExaminers).values({ tenantId: p.tenantId, userId: u!.id, organisation: b.organisation }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'examiner.created', subjectType: 'ext_examiner', subjectId: e!.id });
      return { id: e!.id, userId: u!.id, fullName: b.fullName, organisation: b.organisation };
    });
  }

  listExaminers(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ex = await tx.select({ id: extExaminers.id, organisation: extExaminers.organisation, fullName: users.fullName, phone: users.phone }).from(extExaminers).innerJoin(users, eq(users.id, extExaminers.userId)).orderBy(asc(users.fullName));
      const as = await tx
        .select({ a: extExaminerAssignments, session: examSessions.name, subject: subjects.name })
        .from(extExaminerAssignments)
        .innerJoin(examSessions, eq(examSessions.id, extExaminerAssignments.sessionId))
        .innerJoin(subjects, eq(subjects.id, extExaminerAssignments.subjectId));
      return ex.map((e) => ({ ...e, assignments: as.filter((x) => x.a.examinerId === e.id).map(({ a, session, subject }) => ({ id: a.id, sessionId: a.sessionId, subjectId: a.subjectId, role: a.role, status: a.status, ratePaise: a.ratePaise, session, subject, inviteExpiresAt: a.inviteExpiresAt })) }));
    });
  }

  assign(p: UserPrincipal, examinerId: string, b: { sessionId: string; subjectId: string; role: AssignmentRole; ratePaise: number }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [e] = await tx.select({ id: extExaminers.id }).from(extExaminers).where(eq(extExaminers.id, examinerId));
      if (!e) throw new NotFoundException('Examiner not found');
      const [s] = await tx.select({ id: examSessions.id }).from(examSessions).where(eq(examSessions.id, b.sessionId));
      const [sub] = await tx.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, b.subjectId));
      if (!s || !sub) throw new NotFoundException('Exam session or subject not found');
      const [dup] = await tx.select({ id: extExaminerAssignments.id }).from(extExaminerAssignments).where(and(eq(extExaminerAssignments.examinerId, examinerId), eq(extExaminerAssignments.sessionId, b.sessionId), eq(extExaminerAssignments.subjectId, b.subjectId), eq(extExaminerAssignments.role, b.role)));
      if (dup) throw new ConflictException('The examiner already has this assignment');
      const invite = newInvite();
      const [a] = await tx
        .insert(extExaminerAssignments)
        .values({ tenantId: p.tenantId, examinerId, ...b, inviteHash: invite.hash, inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000), createdBy: p.userId })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'examiner.assigned', subjectType: 'ext_examiner_assignment', subjectId: a!.id, data: { role: b.role } });
      return { id: a!.id, inviteToken: invite.token, inviteExpiresAt: a!.inviteExpiresAt };
    });
  }

  /** A fresh invite link (the old one stops working). */
  reinvite(p: UserPrincipal, assignmentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.assignment(tx, assignmentId);
      const invite = newInvite();
      await tx.update(extExaminerAssignments).set({ inviteHash: invite.hash, inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) }).where(eq(extExaminerAssignments.id, a.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'examiner.reinvited', subjectType: 'ext_examiner_assignment', subjectId: a.id });
      return { id: a.id, inviteToken: invite.token };
    });
  }

  private async assignment(tx: Tx, id: string): Promise<Assignment> {
    const [a] = await tx.select().from(extExaminerAssignments).where(eq(extExaminerAssignments.id, id));
    if (!a) throw new NotFoundException('Assignment not found');
    return a;
  }

  /** Gives each student of the session's papers in this subject an anonymous script code. */
  prepareScripts(p: UserPrincipal, assignmentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.assignment(tx, assignmentId);
      if (a.role !== 'valuer') throw new ConflictException('Only a valuation assignment has scripts');
      const papers = await tx.select().from(examPapers).where(and(eq(examPapers.sessionId, a.sessionId), eq(examPapers.subjectId, a.subjectId)));
      if (!papers.length) throw new NotFoundException('The session has no paper for that subject');
      let added = 0;
      for (const paper of papers) {
        const sts = await tx.select({ id: students.id }).from(students).where(eq(students.sectionId, paper.sectionId));
        for (const s of sts) {
          const rows = await tx.insert(extValuationScripts).values({ tenantId: p.tenantId, assignmentId: a.id, paperId: paper.id, studentId: s.id, scriptCode: scriptCode(), maxMarks: paper.maxMarks }).onConflictDoNothing().returning({ id: extValuationScripts.id });
          added += rows.length;
        }
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'examiner.scripts_prepared', subjectType: 'ext_examiner_assignment', subjectId: a.id, data: { added } });
      return { added };
    });
  }

  /** Copies valued marks into the paper's assessment, where the exam result is computed from. */
  applyValuations(p: UserPrincipal, assignmentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.assignment(tx, assignmentId);
      const scripts = await tx.select().from(extValuationScripts).where(and(eq(extValuationScripts.assignmentId, a.id), eq(extValuationScripts.status, 'valued')));
      let applied = 0;
      for (const s of scripts) {
        const [paper] = await tx.select({ assessmentId: examPapers.assessmentId }).from(examPapers).where(eq(examPapers.id, s.paperId));
        if (!paper?.assessmentId) continue;
        await tx
          .insert(marks)
          .values({ tenantId: p.tenantId, assessmentId: paper.assessmentId, studentId: s.studentId, marks: s.marks, absent: false, remark: 'External valuation' })
          .onConflictDoUpdate({ target: [marks.assessmentId, marks.studentId], set: { marks: s.marks, absent: false, remark: 'External valuation', updatedAt: new Date() } });
        await tx.update(extValuationScripts).set({ appliedAt: new Date() }).where(eq(extValuationScripts.id, s.id));
        applied++;
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'examiner.valuations_applied', subjectType: 'ext_examiner_assignment', subjectId: a.id, data: { applied } });
      return { applied };
    });
  }

  /** Office view of the valuation progress, with the student behind each code. */
  scriptsForOffice(p: UserPrincipal, assignmentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.assignment(tx, assignmentId);
      return tx
        .select({ id: extValuationScripts.id, scriptCode: extValuationScripts.scriptCode, rollNo: students.rollNo, marks: extValuationScripts.marks, maxMarks: extValuationScripts.maxMarks, status: extValuationScripts.status, appliedAt: extValuationScripts.appliedAt })
        .from(extValuationScripts)
        .innerJoin(students, eq(students.id, extValuationScripts.studentId))
        .where(eq(extValuationScripts.assignmentId, a.id))
        .orderBy(asc(extValuationScripts.scriptCode));
    });
  }

  // ---- question papers: the office side ----------------------------------------------------

  listPapers(p: UserPrincipal, sessionId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: extQuestionPapers.id, sessionId: extQuestionPapers.sessionId, subject: subjects.name, title: extQuestionPapers.title, status: extQuestionPapers.status, scrutinyNote: extQuestionPapers.scrutinyNote })
        .from(extQuestionPapers)
        .innerJoin(subjects, eq(subjects.id, extQuestionPapers.subjectId))
        .where(sessionId ? eq(extQuestionPapers.sessionId, sessionId) : undefined)
        .orderBy(desc(extQuestionPapers.createdAt)),
    );
  }

  officePaperAction(p: UserPrincipal, id: string, action: QpAction, note?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [qp] = await tx.select().from(extQuestionPapers).where(eq(extQuestionPapers.id, id));
      if (!qp) throw new NotFoundException('Question paper not found');
      return this.moveQp(tx, p, qp, action, 'office', note);
    });
  }

  private async moveQp(tx: Tx, p: UserPrincipal, qp: typeof extQuestionPapers.$inferSelect, action: QpAction, actor: QpActor, note?: string) {
    const to = nextQpState(qp.status as QpState, action, actor);
    if (!to) throw new ConflictException(`A paper that is ${qp.status} cannot be ${action === 'approve' ? 'approved' : action === 'lock' ? 'locked' : action === 'submit' ? 'submitted' : 'returned'} now`);
    if (action === 'return' && !note) throw new BadRequestException('Say what needs to change');
    const [row] = await tx.update(extQuestionPapers).set({ status: to, scrutinyNote: action === 'return' ? note : action === 'approve' ? (note ?? null) : qp.scrutinyNote, updatedAt: new Date() }).where(eq(extQuestionPapers.id, qp.id)).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `question_paper.${to}`, subjectType: 'ext_question_paper', subjectId: qp.id, data: { from: qp.status, by: actor } });
    return { id: row!.id, status: row!.status };
  }

  // ---- claims: the office side -------------------------------------------------------------

  listClaims(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: extRemunerationClaims.id, examiner: users.fullName, role: extExaminerAssignments.role, subject: subjects.name, units: extRemunerationClaims.units, amountPaise: extRemunerationClaims.amountPaise, status: extRemunerationClaims.status, note: extRemunerationClaims.note, createdAt: extRemunerationClaims.createdAt })
        .from(extRemunerationClaims)
        .innerJoin(extExaminers, eq(extExaminers.id, extRemunerationClaims.examinerId))
        .innerJoin(users, eq(users.id, extExaminers.userId))
        .innerJoin(extExaminerAssignments, eq(extExaminerAssignments.id, extRemunerationClaims.assignmentId))
        .innerJoin(subjects, eq(subjects.id, extExaminerAssignments.subjectId))
        .orderBy(desc(extRemunerationClaims.createdAt)),
    );
  }

  decideClaim(p: UserPrincipal, id: string, to: 'approved' | 'rejected' | 'paid', note?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select().from(extRemunerationClaims).where(eq(extRemunerationClaims.id, id));
      if (!c) throw new NotFoundException('Claim not found');
      const ok = (c.status === 'submitted' && (to === 'approved' || to === 'rejected')) || (c.status === 'approved' && to === 'paid');
      if (!ok) throw new ConflictException(`A claim that is ${c.status} cannot be marked ${to}`);
      await tx.update(extRemunerationClaims).set({ status: to, note: note ?? c.note, decidedBy: p.userId, decidedAt: new Date() }).where(eq(extRemunerationClaims.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `examiner.claim_${to}`, subjectType: 'ext_remuneration_claim', subjectId: id });
      return { status: to };
    });
  }

  // ---- the examiner's own portal -----------------------------------------------------------

  private async me(tx: Tx, p: UserPrincipal) {
    const [e] = await tx.select().from(extExaminers).where(eq(extExaminers.userId, p.userId));
    if (!e) throw new ForbiddenException('No examiner profile is linked to this login');
    return e;
  }

  private async mine(tx: Tx, p: UserPrincipal, assignmentId: string, role?: AssignmentRole) {
    const e = await this.me(tx, p);
    const [a] = await tx.select().from(extExaminerAssignments).where(and(eq(extExaminerAssignments.id, assignmentId), eq(extExaminerAssignments.examinerId, e.id)));
    if (!a || (role && a.role !== role)) throw new NotFoundException('Assignment not found');
    if (a.status === 'revoked') throw new ForbiddenException('This assignment has been withdrawn');
    return { e, a };
  }

  portalHome(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.me(tx, p);
      const [u] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, p.userId));
      const rows = await tx
        .select({ a: extExaminerAssignments, session: examSessions.name, subject: subjects.name })
        .from(extExaminerAssignments)
        .innerJoin(examSessions, eq(examSessions.id, extExaminerAssignments.sessionId))
        .innerJoin(subjects, eq(subjects.id, extExaminerAssignments.subjectId))
        .where(and(eq(extExaminerAssignments.examinerId, e.id), sql`${extExaminerAssignments.status} <> 'revoked'`));
      const ids = rows.map((r) => r.a.id);
      const scripts = ids.length ? await tx.select({ assignmentId: extValuationScripts.assignmentId, status: extValuationScripts.status }).from(extValuationScripts).where(inArray(extValuationScripts.assignmentId, ids)) : [];
      return {
        name: u?.fullName ?? '',
        organisation: e.organisation,
        assignments: rows.map(({ a, session, subject }) => ({ id: a.id, role: a.role, session, subject, status: a.status, ratePaise: a.ratePaise, scripts: scripts.filter((s) => s.assignmentId === a.id).length, valued: scripts.filter((s) => s.assignmentId === a.id && s.status === 'valued').length })),
      };
    });
  }

  /** Anonymised scripts: a code and a maximum, never the candidate. */
  portalScripts(p: UserPrincipal, assignmentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a } = await this.mine(tx, p, assignmentId, 'valuer');
      return tx
        .select({ id: extValuationScripts.id, scriptCode: extValuationScripts.scriptCode, maxMarks: extValuationScripts.maxMarks, marks: extValuationScripts.marks, remarks: extValuationScripts.remarks, status: extValuationScripts.status })
        .from(extValuationScripts)
        .where(eq(extValuationScripts.assignmentId, a.id))
        .orderBy(asc(extValuationScripts.scriptCode));
    });
  }

  valueScript(p: UserPrincipal, scriptId: string, b: { marks: number; remarks?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select().from(extValuationScripts).where(eq(extValuationScripts.id, scriptId));
      if (!s) throw new NotFoundException('Script not found');
      await this.mine(tx, p, s.assignmentId, 'valuer');
      if (s.appliedAt) throw new ConflictException('The office has already taken these marks into the result');
      if (b.marks > s.maxMarks) throw new BadRequestException(`Marks cannot be more than ${s.maxMarks}`);
      await tx.update(extValuationScripts).set({ marks: b.marks, remarks: b.remarks ?? null, status: 'valued', valuedAt: new Date() }).where(eq(extValuationScripts.id, scriptId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'examiner.script_valued', subjectType: 'ext_valuation_script', subjectId: scriptId });
      return { id: scriptId, status: 'valued' };
    });
  }

  /** The assignment's question paper (setter or scrutiniser). */
  portalPaper(p: UserPrincipal, assignmentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a } = await this.mine(tx, p, assignmentId);
      if (a.role === 'valuer') throw new NotFoundException('Assignment not found');
      const [qp] = await tx.select().from(extQuestionPapers).where(and(eq(extQuestionPapers.sessionId, a.sessionId), eq(extQuestionPapers.subjectId, a.subjectId)));
      // A scrutiniser sees the paper only once it has been submitted.
      if (qp && a.role === 'scrutiniser' && qp.status === 'draft') return null;
      return qp ? { id: qp.id, title: qp.title, content: qp.content, status: qp.status, scrutinyNote: qp.scrutinyNote } : null;
    });
  }

  savePaper(p: UserPrincipal, assignmentId: string, b: { title: string; content: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a } = await this.mine(tx, p, assignmentId, 'qp_setter');
      const [qp] = await tx.select().from(extQuestionPapers).where(and(eq(extQuestionPapers.sessionId, a.sessionId), eq(extQuestionPapers.subjectId, a.subjectId)));
      if (qp && qp.status !== 'draft') throw new ConflictException('Only a draft can be edited');
      const [row] = qp
        ? await tx.update(extQuestionPapers).set({ title: b.title, content: b.content, updatedAt: new Date() }).where(eq(extQuestionPapers.id, qp.id)).returning()
        : await tx.insert(extQuestionPapers).values({ tenantId: p.tenantId, sessionId: a.sessionId, subjectId: a.subjectId, setterAssignmentId: a.id, title: b.title, content: b.content }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'question_paper.saved', subjectType: 'ext_question_paper', subjectId: row!.id });
      return { id: row!.id, status: row!.status };
    });
  }

  paperAction(p: UserPrincipal, assignmentId: string, action: 'submit' | 'approve' | 'return', note?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { a } = await this.mine(tx, p, assignmentId);
      const actor: QpActor = a.role === 'qp_setter' ? 'setter' : a.role === 'scrutiniser' ? 'scrutiniser' : 'office';
      if (a.role === 'valuer') throw new NotFoundException('Assignment not found');
      const [qp] = await tx.select().from(extQuestionPapers).where(and(eq(extQuestionPapers.sessionId, a.sessionId), eq(extQuestionPapers.subjectId, a.subjectId)));
      if (!qp) throw new NotFoundException('There is no question paper yet');
      return this.moveQp(tx, p, qp, action, actor, note);
    });
  }

  portalClaims(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = await this.me(tx, p);
      return tx.select({ id: extRemunerationClaims.id, units: extRemunerationClaims.units, amountPaise: extRemunerationClaims.amountPaise, status: extRemunerationClaims.status, note: extRemunerationClaims.note, createdAt: extRemunerationClaims.createdAt }).from(extRemunerationClaims).where(eq(extRemunerationClaims.examinerId, e.id)).orderBy(desc(extRemunerationClaims.createdAt));
    });
  }

  /** Claims what has been done and not yet claimed; the server prices it with the assignment's rate. */
  claim(p: UserPrincipal, assignmentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { e, a } = await this.mine(tx, p, assignmentId);
      const scripts = a.role === 'valuer' ? await tx.select({ id: extValuationScripts.id }).from(extValuationScripts).where(and(eq(extValuationScripts.assignmentId, a.id), eq(extValuationScripts.status, 'valued'))) : [];
      const earlier = await tx.select({ units: extRemunerationClaims.units, status: extRemunerationClaims.status }).from(extRemunerationClaims).where(eq(extRemunerationClaims.assignmentId, a.id));
      const claimed = earlier.filter((c) => c.status !== 'rejected').reduce((n, c) => n + c.units, 0);
      const [qp] = a.role === 'valuer' ? [] : await tx.select({ status: extQuestionPapers.status }).from(extQuestionPapers).where(and(eq(extQuestionPapers.sessionId, a.sessionId), eq(extQuestionPapers.subjectId, a.subjectId)));
      const { units, amountPaise } = claimAmount(a.role as AssignmentRole, a.ratePaise, scripts.length, claimed, (qp?.status as QpState | undefined) ?? null);
      if (units <= 0) throw new ConflictException('There is nothing new to claim for this assignment');
      const [row] = await tx.insert(extRemunerationClaims).values({ tenantId: p.tenantId, examinerId: e.id, assignmentId: a.id, units, amountPaise }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'examiner.claim_submitted', subjectType: 'ext_remuneration_claim', subjectId: row!.id, data: { units, amountPaise } });
      return { id: row!.id, units, amountPaise, status: row!.status };
    });
  }

  // ---- invite (public side, called with the tenant already resolved) -----------------------

  /** The assignment behind an invite token, and the phone to send the code to. */
  async inviteInfo(tx: Tx, token: string) {
    const [row] = await tx
      .select({ a: extExaminerAssignments, name: users.fullName, phone: users.phone })
      .from(extExaminerAssignments)
      .innerJoin(extExaminers, eq(extExaminers.id, extExaminerAssignments.examinerId))
      .innerJoin(users, eq(users.id, extExaminers.userId))
      .where(eq(extExaminerAssignments.inviteHash, hashInvite(token)));
    if (!row || row.a.status === 'revoked' || !row.a.inviteExpiresAt || row.a.inviteExpiresAt < new Date()) return null;
    return row;
  }

  async accept(tx: Tx, assignmentId: string) {
    await tx.update(extExaminerAssignments).set({ acceptedAt: new Date(), status: 'active' }).where(and(eq(extExaminerAssignments.id, assignmentId), eq(extExaminerAssignments.status, 'invited')));
  }

  revoke(p: UserPrincipal, assignmentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.assignment(tx, assignmentId);
      await tx.update(extExaminerAssignments).set({ status: 'revoked', inviteHash: null }).where(eq(extExaminerAssignments.id, a.id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'examiner.revoked', subjectType: 'ext_examiner_assignment', subjectId: a.id });
      return { status: 'revoked' };
    });
  }
}
