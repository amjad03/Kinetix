import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { BlobBody, putBlob, sendBlob } from '../common/blob.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { disciplineIncidents, grievanceEvents, grievanceTickets, guardians, students, users } from '../db/schema.js';
import { disciplineParentContacts, disciplineWitnesses, grievanceEvidence } from '../db/schema-pathways.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ParentVisibilityService } from '../parent/parent-visibility.js';
import { found, hasRole } from '../placements/placements.access.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { COMMITTEE_ROLES, DISCIPLINE_VIEW, GRIEVANCE_STAFF, INCIDENT_REPORTERS } from './welfare.access.js';

const EvidenceBody = z.object({ title: z.string().trim().min(1).max(160).optional(), file: BlobBody });
const WitnessBody = z.object({ name: z.string().trim().min(1).max(120), role: z.enum(['student', 'staff', 'external']).default('student'), studentId: z.uuid().optional(), statement: z.string().trim().max(3000).default('') });
const ContactBody = z.object({ method: z.enum(['message', 'call', 'meeting', 'letter']).default('message'), summary: z.string().trim().min(3).max(1000), meetingOn: Day.optional() });

/** Evidence on a grievance: files from the reporter, the grievance team or the committee, with the same visibility as the ticket. */
@Controller('v1/grievances')
export class GrievanceEvidenceController {
  constructor(
    private readonly db: DbService,
    private readonly storage: ObjectStorage,
  ) {}

  /** The ticket, and the caller's relationship to it. Committee matters are invisible outside the committee. */
  private async access(tx: Tx, p: UserPrincipal, id: string) {
    const t = found((await tx.select().from(grievanceTickets).where(eq(grievanceTickets.id, id)))[0], 'Ticket');
    if (t.raisedBy === p.userId) return { t, viewer: 'reporter' as const };
    if (t.committee) {
      if (!hasRole(p, COMMITTEE_ROLES)) throw new NotFoundException('Ticket not found');
      return { t, viewer: 'committee' as const };
    }
    if (!hasRole(p, GRIEVANCE_STAFF)) throw new NotFoundException('Ticket not found');
    return { t, viewer: 'staff' as const };
  }

  @Get(':id/evidence')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id);
      const rows = await tx.select().from(grievanceEvidence).where(eq(grievanceEvidence.ticketId, id)).orderBy(asc(grievanceEvidence.createdAt));
      // On an anonymous ticket nobody but the reporter learns who added a file.
      return rows.map((r) => ({ id: r.id, title: r.title, contentType: r.contentType, sizeBytes: r.sizeBytes, createdAt: r.createdAt, mine: r.addedBy === p.userId, ...(t.anonymous && viewer !== 'reporter' ? {} : { addedBy: r.addedBy }) }));
    });
  }

  @Post(':id/evidence')
  @Auth('user')
  add(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EvidenceBody)) b: z.infer<typeof EvidenceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { t, viewer } = await this.access(tx, p, id);
      if (t.status === 'closed') throw new ConflictException('This ticket is closed');
      const stored = await putBlob(this.storage, p.tenantId, `grievances/${id}`, b.file);
      const [row] = await tx.insert(grievanceEvidence).values({ tenantId: p.tenantId, ticketId: id, title: b.title ?? stored.title, contentType: stored.contentType, sizeBytes: stored.sizeBytes, storageKey: stored.storageKey, addedBy: p.userId }).returning({ id: grievanceEvidence.id, title: grievanceEvidence.title, sizeBytes: grievanceEvidence.sizeBytes });
      await tx.insert(grievanceEvents).values({ tenantId: p.tenantId, ticketId: id, actorUserId: p.userId, actorRole: viewer, kind: 'evidence_added', visibility: 'public', body: row.title });
      await auditUser(tx, p, 'grievance.evidence_added', 'grievance', id, { evidenceId: row.id });
      return row;
    });
  }

  @Get('evidence/:evidenceId/download')
  @Auth('user')
  download(@CurrentPrincipal() p: UserPrincipal, @Param('evidenceId', ParseUUIDPipe) evidenceId: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = found((await tx.select().from(grievanceEvidence).where(eq(grievanceEvidence.id, evidenceId)))[0], 'Evidence');
      await this.access(tx, p, e.ticketId);
      await auditUser(tx, p, 'grievance.evidence_downloaded', 'grievance', e.ticketId, { evidenceId });
      return sendBlob(this.storage, res, e);
    });
  }

  @Delete('evidence/:evidenceId')
  @HttpCode(204)
  @Auth('user')
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('evidenceId', ParseUUIDPipe) evidenceId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const e = found((await tx.select().from(grievanceEvidence).where(eq(grievanceEvidence.id, evidenceId)))[0], 'Evidence');
      await this.access(tx, p, e.ticketId);
      if (e.addedBy !== p.userId) throw new NotFoundException('Evidence not found');
      await tx.delete(grievanceEvidence).where(eq(grievanceEvidence.id, evidenceId));
      await this.storage.delete(e.storageKey);
      await auditUser(tx, p, 'grievance.evidence_removed', 'grievance', e.ticketId, { evidenceId });
    });
  }
}

/** Witnesses to a discipline incident, and the record of reaching the parents (with their acknowledgement). */
@Controller('v1/discipline')
export class DisciplineExtrasController {
  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
    private readonly vis: ParentVisibilityService,
  ) {}

  private async incident(tx: Tx, p: UserPrincipal, id: string) {
    const i = found((await tx.select().from(disciplineIncidents).where(eq(disciplineIncidents.id, id)))[0], 'Incident');
    if (!hasRole(p, DISCIPLINE_VIEW) && i.reportedBy !== p.userId) throw new NotFoundException('Incident not found');
    return i;
  }

  @Get('incidents/:id/witnesses')
  @Auth('user', INCIDENT_REPORTERS)
  witnesses(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.incident(tx, p, id);
      return tx.select().from(disciplineWitnesses).where(eq(disciplineWitnesses.incidentId, id)).orderBy(asc(disciplineWitnesses.createdAt));
    });
  }

  @Post('incidents/:id/witnesses')
  @Auth('user', INCIDENT_REPORTERS)
  addWitness(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(WitnessBody)) b: z.infer<typeof WitnessBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.incident(tx, p, id);
      if (b.studentId) found((await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId)))[0], 'Student');
      const [row] = await tx.insert(disciplineWitnesses).values({ tenantId: p.tenantId, incidentId: id, ...b, studentId: b.studentId ?? null, recordedBy: p.userId }).returning();
      await auditUser(tx, p, 'discipline.witness_added', 'incident', id, { witnessId: row.id });
      return row;
    });
  }

  @Get('incidents/:id/parent-contacts')
  @Auth('user', INCIDENT_REPORTERS)
  contacts(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.incident(tx, p, id);
      return tx
        .select({ id: disciplineParentContacts.id, method: disciplineParentContacts.method, summary: disciplineParentContacts.summary, meetingOn: disciplineParentContacts.meetingOn, acknowledgedAt: disciplineParentContacts.acknowledgedAt, guardian: users.fullName, createdAt: disciplineParentContacts.createdAt })
        .from(disciplineParentContacts)
        .leftJoin(users, eq(users.id, disciplineParentContacts.guardianUserId))
        .where(eq(disciplineParentContacts.incidentId, id))
        .orderBy(desc(disciplineParentContacts.createdAt));
    });
  }

  /** Reaches every guardian of the student about the incident: records it and sends them a notice they can acknowledge. */
  @Post('incidents/:id/parent-contacts')
  @Auth('user', DISCIPLINE_VIEW)
  contactParents(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ContactBody)) b: z.infer<typeof ContactBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const i = await this.incident(tx, p, id);
      const gs = await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, i.studentId));
      if (gs.length === 0) throw new ConflictException('This student has no parent or guardian on record');
      const rows = await tx.insert(disciplineParentContacts).values(gs.map((g) => ({ tenantId: p.tenantId, incidentId: id, guardianUserId: g.userId, method: b.method, summary: b.summary, meetingOn: b.meetingOn ?? null, createdBy: p.userId }))).returning();
      const [s] = await tx.select({ fullName: students.fullName }).from(students).where(eq(students.id, i.studentId));
      await this.notifications.notifyUsers(tx, gs.map((g) => g.userId), { kind: 'welfare', text: { title: `A note from the school about ${s?.fullName ?? 'your child'}`, body: b.summary.slice(0, 140) }, data: { incidentId: id }, dedupeKey: `discipline-contact:${rows[0].id}` });
      await auditUser(tx, p, 'discipline.parents_contacted', 'incident', id, { method: b.method, guardians: gs.length });
      return rows;
    });
  }

  /** Notices the school sent to the caller as a parent, with whether they have acknowledged them. */
  @Get('my-notices')
  @Auth('user', ['guardian'])
  myNotices(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.vis.assert(tx, p, 'behaviour');
      return tx
        .select({ id: disciplineParentContacts.id, method: disciplineParentContacts.method, summary: disciplineParentContacts.summary, meetingOn: disciplineParentContacts.meetingOn, acknowledgedAt: disciplineParentContacts.acknowledgedAt, kind: disciplineIncidents.kind, severity: disciplineIncidents.severity, incidentOn: disciplineIncidents.incidentOn, studentId: disciplineIncidents.studentId, studentName: students.fullName })
        .from(disciplineParentContacts)
        .innerJoin(disciplineIncidents, eq(disciplineIncidents.id, disciplineParentContacts.incidentId))
        .innerJoin(students, eq(students.id, disciplineIncidents.studentId))
        .where(eq(disciplineParentContacts.guardianUserId, p.userId))
        .orderBy(desc(disciplineParentContacts.createdAt));
    });
  }

  @Post('parent-contacts/:contactId/acknowledge')
  @HttpCode(200)
  @Auth('user', ['guardian'])
  acknowledge(@CurrentPrincipal() p: UserPrincipal, @Param('contactId', ParseUUIDPipe) contactId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(disciplineParentContacts).set({ acknowledgedAt: new Date() }).where(and(eq(disciplineParentContacts.id, contactId), eq(disciplineParentContacts.guardianUserId, p.userId))).returning({ id: disciplineParentContacts.id, acknowledgedAt: disciplineParentContacts.acknowledgedAt });
      if (!row) throw new NotFoundException('Notice not found');
      return row;
    });
  }
}
