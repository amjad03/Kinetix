import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { A4, Pdf } from '../common/pdf-doc.js';
import { orConflict } from '../common/ops.js';
import type { Tx } from '../db/db.service.js';
import { alumniDonations, alumniProfiles, assessments, attendanceRecords, dpdpRequests, feePayments, guardians, leaveRequests, marks, payslips, payrollRuns, students, tenants, userRoles, users } from '../db/schema.js';
import { ERASED_NAME, correctionProblem, retentionReasons, type CorrectableField, type RetentionFacts } from './dpdp.logic.js';

export type DpdpRequest = typeof dpdpRequests.$inferSelect;

/** Everything the institution holds about one person: the bundle behind "export my data". */
export interface DataBundle {
  generatedAt: string;
  institution: string;
  profile: { id: string; fullName: string; email: string | null; phone: string | null; preferredLanguage: string; status: string; roles: string[]; createdAt: string };
  student: Record<string, unknown> | null;
  wards: Record<string, unknown>[];
  attendance: { present: number; absent: number; late: number; excused: number } | null;
  marks: { assessment: string; kind: string; marks: number | null; absent: boolean }[];
  feePayments: { receiptNo: string | null; amountPaise: number; method: string; status: string; paidAt: string | null }[];
  leave: { from: string; to: string; days: number; status: string; reason: string }[];
  payslips: { month: string; grossPaise: number; netPaise: number }[];
  alumni: { profile: Record<string, unknown>; donations: { receiptSerial: string; amountPaise: number; receivedOn: string }[] } | null;
  requests: { kind: string; status: string; createdAt: string; resolutionNote: string | null }[];
}

@Injectable()
export class DpdpService {
  /** Who to write to with a complaint: the institution's named grievance officer, or the staff member holding that role. */
  async grievanceOfficer(tx: Tx): Promise<{ name: string; email: string | null; phone: string | null } | null> {
    const [t] = await tx.select({ settings: tenants.settings }).from(tenants);
    const named = t?.settings.grievanceOfficer;
    if (named?.name) return { name: named.name, email: named.email ?? null, phone: named.phone ?? null };
    const [row] = await tx
      .select({ name: users.fullName, email: users.email, phone: users.phone })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(eq(userRoles.role, 'grievance_officer'))
      .limit(1);
    return row ?? null;
  }

  async bundle(tx: Tx, userId: string): Promise<DataBundle> {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u) throw new NotFoundException('User not found');
    const [t] = await tx.select({ name: tenants.name }).from(tenants);
    const roles = (await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role);
    const [own] = await tx.select().from(students).where(eq(students.userId, userId));
    const wardRows = await tx.select({ s: students, relation: guardians.relation }).from(guardians).innerJoin(students, eq(students.id, guardians.studentId)).where(eq(guardians.userId, userId));
    const sView = (s: typeof students.$inferSelect) => ({ id: s.id, fullName: s.fullName, rollNo: s.rollNo, status: s.status, enrolledOn: s.enrolledOn });

    const att = own
      ? await tx.select({ status: attendanceRecords.status, n: sql<number>`count(*)::int` }).from(attendanceRecords).where(eq(attendanceRecords.studentId, own.id)).groupBy(attendanceRecords.status)
      : [];
    const count = (s: string) => att.find((a) => a.status === s)?.n ?? 0;
    const markRows = own
      ? await tx.select({ title: assessments.title, kind: assessments.kind, marks: marks.marks, absent: marks.absent }).from(marks).innerJoin(assessments, eq(assessments.id, marks.assessmentId)).where(eq(marks.studentId, own.id))
      : [];
    const studentIds = [own?.id, ...wardRows.map((w) => w.s.id)].filter((x): x is string => !!x);
    const payRows = await tx
      .select({ receiptNo: feePayments.receiptNo, amountPaise: feePayments.amountPaise, method: feePayments.method, status: feePayments.status, paidAt: feePayments.paidAt })
      .from(feePayments)
      .where(studentIds.length ? sql`${feePayments.payerUserId} = ${userId}::uuid or ${inArray(feePayments.studentId, studentIds)}` : eq(feePayments.payerUserId, userId))
      .orderBy(desc(feePayments.createdAt))
      .limit(500);
    const leaves = await tx.select().from(leaveRequests).where(eq(leaveRequests.userId, userId)).orderBy(desc(leaveRequests.fromDate)).limit(300);
    const slips = await tx.select({ month: payrollRuns.month, gross: payslips.grossPaise, net: payslips.netPaise }).from(payslips).innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId)).where(eq(payslips.userId, userId)).orderBy(desc(payrollRuns.month));
    const [alum] = await tx.select().from(alumniProfiles).where(eq(alumniProfiles.userId, userId));
    const gifts = alum ? await tx.select().from(alumniDonations).where(eq(alumniDonations.alumniId, alum.id)).orderBy(desc(alumniDonations.receivedOn)) : [];
    const reqs = await tx.select().from(dpdpRequests).where(eq(dpdpRequests.userId, userId)).orderBy(desc(dpdpRequests.createdAt));
    return {
      generatedAt: new Date().toISOString(),
      institution: t?.name ?? '',
      profile: { id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, preferredLanguage: u.preferredLanguage, status: u.status, roles, createdAt: u.createdAt.toISOString() },
      student: own ? sView(own) : null,
      wards: wardRows.map((w) => ({ ...sView(w.s), relation: w.relation })),
      attendance: own ? { present: count('present'), absent: count('absent'), late: count('late'), excused: count('excused') } : null,
      marks: markRows.map((m) => ({ assessment: m.title, kind: m.kind, marks: m.marks, absent: m.absent })),
      feePayments: payRows.map((r) => ({ receiptNo: r.receiptNo, amountPaise: r.amountPaise, method: r.method, status: r.status, paidAt: r.paidAt?.toISOString() ?? null })),
      leave: leaves.map((l) => ({ from: l.fromDate, to: l.toDate, days: l.days, status: l.status, reason: l.reason })),
      payslips: slips.map((s) => ({ month: s.month, grossPaise: s.gross, netPaise: s.net })),
      alumni: alum ? { profile: { fullName: alum.fullName, graduationYear: alum.graduationYear, program: alum.program, email: alum.email, phone: alum.phone, employer: alum.employer, designation: alum.designation, city: alum.city, bio: alum.bio }, donations: gifts.map((g) => ({ receiptSerial: g.receiptSerial, amountPaise: g.amountPaise, receivedOn: g.receivedOn })) } : null,
      requests: reqs.map((r) => ({ kind: r.kind, status: r.status, createdAt: r.createdAt.toISOString(), resolutionNote: r.resolutionNote })),
    };
  }

  /** The bundle as a readable PDF (the JSON carries the exact values; accented and Indic text is shown as ? in the PDF). */
  pdf(b: DataBundle): Buffer {
    const pdf = new Pdf(`My data ${b.profile.fullName}`);
    const money = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const lines: { text: string; bold?: boolean }[] = [];
    const head = (s: string) => lines.push({ text: '' }, { text: s, bold: true });
    const row = (s: string) => lines.push({ text: s });
    row(`${b.institution}: copy of personal data held (DPDP Act)`);
    row(`Prepared ${b.generatedAt.slice(0, 10)}`);
    head('Profile');
    row(`Name: ${b.profile.fullName}`);
    row(`Email: ${b.profile.email ?? '-'}   Phone: ${b.profile.phone ?? '-'}`);
    row(`Roles: ${b.profile.roles.join(', ') || '-'}   Language: ${b.profile.preferredLanguage}   Status: ${b.profile.status}`);
    if (b.student) {
      head('Student record');
      row(`Roll no ${String(b.student.rollNo)}   Status ${String(b.student.status)}   Enrolled ${String(b.student.enrolledOn ?? '-')}`);
    }
    if (b.wards.length) {
      head('Children linked to you');
      for (const w of b.wards) row(`${String(w.fullName)} (roll ${String(w.rollNo)}, ${String(w.relation)}, ${String(w.status)})`);
    }
    if (b.attendance) {
      head('Attendance');
      row(`Present ${b.attendance.present}, absent ${b.attendance.absent}, late ${b.attendance.late}, excused ${b.attendance.excused}`);
    }
    if (b.marks.length) {
      head('Marks');
      for (const m of b.marks) row(`${m.assessment} (${m.kind}): ${m.absent ? 'absent' : (m.marks ?? '-')}`);
    }
    if (b.feePayments.length) {
      head('Fee payments');
      for (const f of b.feePayments) row(`${f.receiptNo ?? '-'}  Rs. ${money(f.amountPaise)}  ${f.method}  ${f.status}  ${f.paidAt?.slice(0, 10) ?? ''}`);
    }
    if (b.leave.length) {
      head('Leave');
      for (const l of b.leave) row(`${l.from} to ${l.to}  ${l.days} day(s)  ${l.status}`);
    }
    if (b.payslips.length) {
      head('Payslips');
      for (const s of b.payslips) row(`${s.month}  gross Rs. ${money(s.grossPaise)}  net Rs. ${money(s.netPaise)}`);
    }
    if (b.alumni) {
      head('Alumni record');
      row(`${String(b.alumni.profile.program)} ${String(b.alumni.profile.graduationYear)}   ${String(b.alumni.profile.employer ?? '')}`);
      for (const d of b.alumni.donations) row(`Donation ${d.receiptSerial}  Rs. ${money(d.amountPaise)}  ${d.receivedOn}`);
    }
    if (b.requests.length) {
      head('Your data requests');
      for (const r of b.requests) row(`${r.createdAt.slice(0, 10)}  ${r.kind}  ${r.status}`);
    }
    let y = 0;
    lines.forEach((l, i) => {
      if (i === 0 || y > A4.h - 60) {
        pdf.addPage();
        y = 60;
      }
      if (l.text) pdf.text(l.text, 40, y, { size: i === 0 ? 13 : 10, bold: l.bold || i === 0 });
      y += i === 0 ? 22 : 14;
    });
    return pdf.build();
  }

  async facts(tx: Tx, userId: string): Promise<RetentionFacts> {
    const [own] = await tx.select({ id: students.id, status: students.status }).from(students).where(eq(students.userId, userId));
    const wards = await tx.select({ id: students.id, status: students.status }).from(guardians).innerJoin(students, eq(students.id, guardians.studentId)).where(eq(guardians.userId, userId));
    const ids = [own?.id, ...wards.map((w) => w.id)].filter((x): x is string => !!x);
    const [pay] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(feePayments)
      .where(ids.length ? sql`${feePayments.payerUserId} = ${userId}::uuid or ${inArray(feePayments.studentId, ids)}` : eq(feePayments.payerUserId, userId));
    const [slip] = await tx.select({ n: sql<number>`count(*)::int` }).from(payslips).where(eq(payslips.userId, userId));
    const [mk] = own ? await tx.select({ n: sql<number>`count(*)::int` }).from(marks).where(eq(marks.studentId, own.id)) : [{ n: 0 }];
    const [gift] = await tx.select({ n: sql<number>`count(*)::int` }).from(alumniDonations).innerJoin(alumniProfiles, eq(alumniProfiles.id, alumniDonations.alumniId)).where(eq(alumniProfiles.userId, userId));
    return { feePayments: pay.n, payslips: slip.n, donations: gift.n, examMarks: mk.n, activeWards: wards.filter((w) => w.status === 'active').length, enrolledStudent: own?.status === 'active' };
  }

  /** Records a request. A second open request of the same kind is refused. */
  async open(tx: Tx, tenantId: string, userId: string, kind: DpdpRequest['kind'], details: string, correction?: { field: string; value: string }): Promise<DpdpRequest> {
    const [open] = await tx.select({ id: dpdpRequests.id }).from(dpdpRequests).where(and(eq(dpdpRequests.userId, userId), eq(dpdpRequests.kind, kind), eq(dpdpRequests.status, 'pending')));
    if (open) throw new ConflictException('You already have an open request of this kind');
    const [row] = await tx.insert(dpdpRequests).values({ tenantId, userId, kind, details, correction: correction ?? null }).returning();
    await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: `dpdp.${kind}_requested`, subjectType: 'dpdp_request', subjectId: row.id });
    return row;
  }

  /** Applies a correction, or closes the request as rejected. */
  async processCorrection(tx: Tx, req: DpdpRequest, approve: boolean, note: string, actorId: string): Promise<DpdpRequest> {
    if (approve) {
      const c = req.correction;
      if (!c) throw new ConflictException('The request names no field to correct; reject it and ask the person to resubmit');
      const bad = correctionProblem(c.field, c.value);
      if (bad) throw new ConflictException(bad);
      const value = c.value.trim();
      const set = { [c.field as CorrectableField]: value } as Partial<typeof users.$inferInsert>;
      await orConflict('Another account already uses that value', () => tx.update(users).set(set).where(eq(users.id, req.userId)));
      if (c.field === 'fullName') {
        await tx.update(students).set({ fullName: value }).where(eq(students.userId, req.userId));
        await tx.update(alumniProfiles).set({ fullName: value }).where(eq(alumniProfiles.userId, req.userId));
      }
    }
    return this.close(tx, req, approve ? 'completed' : 'rejected', note, [], actorId);
  }

  /** Erases a person's data unless a retention rule blocks it; then the request is `blocked` with the reasons. */
  async processErasure(tx: Tx, req: DpdpRequest, approve: boolean, note: string, actorId: string): Promise<DpdpRequest> {
    if (!approve) return this.close(tx, req, 'rejected', note, [], actorId);
    const reasons = retentionReasons(await this.facts(tx, req.userId));
    if (reasons.length) return this.close(tx, req, 'blocked', note, reasons, actorId);
    await this.anonymise(tx, req.userId);
    return this.close(tx, req, 'completed', note, [], actorId);
  }

  /** Strips identity from the account and the records linked to it; the rows stay so counts and references hold. */
  async anonymise(tx: Tx, userId: string): Promise<void> {
    await tx.update(users).set({ fullName: ERASED_NAME, email: null, phone: null, passwordHash: null, photoKey: null, status: 'disabled' }).where(eq(users.id, userId));
    await tx.update(students).set({ fullName: 'Erased student' }).where(eq(students.userId, userId));
    await tx.update(alumniProfiles).set({ fullName: ERASED_NAME, email: null, phone: null, employer: null, designation: null, city: null, bio: '', directoryVisible: false, mentorAvailable: false }).where(eq(alumniProfiles.userId, userId));
  }

  private async close(tx: Tx, req: DpdpRequest, status: DpdpRequest['status'], note: string, reasons: string[], actorId: string): Promise<DpdpRequest> {
    const [row] = await tx.update(dpdpRequests).set({ status, resolutionNote: note || null, retentionReasons: reasons, processedBy: actorId, processedAt: new Date() }).where(eq(dpdpRequests.id, req.id)).returning();
    await audit(tx, { tenantId: req.tenantId, actorType: 'user', actorId, action: `dpdp.${req.kind}_${status}`, subjectType: 'dpdp_request', subjectId: req.id, data: { reasons } });
    return row;
  }
}
