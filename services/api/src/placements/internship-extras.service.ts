import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { internshipDiary, internships } from '../db/schema.js';
import { internshipAttendance, internshipCertificates } from '../db/schema-pathways.js';
import { AutoCertificatesService } from '../documents/auto-certificates.service.js';
import { type AttendanceSummary, summariseAttendance } from './internship-rules.js';

const COMPLETION: Parameters<AutoCertificatesService['issueForStudent']>[3] = {
  name: 'Internship completion',
  title: 'Internship Completion Certificate',
  body: 'This is to certify that {{name}} (Roll {{rollNo}}, {{className}}) of {{institution}} completed an internship as {{fields.title}} at {{fields.organisation}} from {{fields.from}} to {{fields.to}}, attending {{fields.attendance}} of the working days.\n\nThe employer evaluation was {{fields.evaluation}}.\n\nIssued on {{issuedOn}} under serial {{serialNo}}.',
  serialPrefix: 'INT',
  fieldKeys: ['title', 'organisation', 'from', 'to', 'attendance', 'evaluation'],
};

/** Attendance for internships and the certificate issued when one is completed. */
@Injectable()
export class InternshipExtrasService {
  constructor(
    private readonly clock: Clock,
    private readonly auto: AutoCertificatesService,
  ) {}

  async summary(tx: Tx, i: typeof internships.$inferSelect): Promise<AttendanceSummary> {
    const marks = await tx.select().from(internshipAttendance).where(eq(internshipAttendance.internshipId, i.id));
    const diary = await tx.select({ d: internshipDiary.entryDate }).from(internshipDiary).where(eq(internshipDiary.internshipId, i.id));
    const today = await tenantToday(tx, this.clock);
    return summariseAttendance(i, marks.map((m) => ({ onDate: m.onDate, present: m.present, hours: m.hours })), diary.map((d) => d.d), today);
  }

  /**
   * Issues the completion certificate when attendance is good enough (or the office waives it). Idempotent: an
   * internship has at most one certificate. Returns the certificate id, or null with the reason.
   */
  async issueCertificate(tx: Tx, p: UserPrincipal, i: typeof internships.$inferSelect, waive = false): Promise<{ certificateId: string | null; reason?: string }> {
    const [have] = await tx.select().from(internshipCertificates).where(eq(internshipCertificates.internshipId, i.id));
    if (have) return { certificateId: have.certificateId };
    const s = await this.summary(tx, i);
    if (!s.eligible && !waive) return { certificateId: null, reason: `Attendance is ${s.percent}%, below the required minimum` };
    const certificateId = await this.auto.issueForStudent(
      tx,
      p,
      i.studentId,
      COMPLETION,
      { title: i.title, organisation: i.orgName, from: i.startsOn, to: i.endsOn, attendance: `${s.percent}%`, evaluation: i.evaluationScore === null ? 'not recorded' : `${i.evaluationScore}/100` },
      'internship completion',
    );
    await tx.insert(internshipCertificates).values({ tenantId: p.tenantId, internshipId: i.id, certificateId });
    await auditUser(tx, p, 'internship.certificate_issued', 'internship', i.id, { certificateId, waived: waive && !s.eligible });
    return { certificateId };
  }
}
