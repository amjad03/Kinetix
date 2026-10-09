import { Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { BlobBody, putBlob, sendBlob } from '../common/blob.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { campusEvents, clubMembers, clubs, committeeActionItems, committeeMeetings, committeeMembers, committees, eventRegistrations, sections, students, tenants, users } from '../db/schema.js';
import { clubAchievements, clubOfficeBearers, committeeEvidence, eventCertificates, eventMedia } from '../db/schema-pathways.js';
import { AutoCertificatesService } from '../documents/auto-certificates.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { found, hasRole } from '../placements/placements.access.js';
import { COMMITTEE_STAFF, FAMILY, LIFE_STAFF } from './campus-life.access.js';
import { CampusLifeService } from './campus-life.service.js';
import { reportPackPdf } from './report-pack.js';

const BearerBody = z.object({ studentId: z.uuid(), post: z.string().trim().min(2).max(60), fromOn: Day, toOn: Day.optional() });
const AchievementBody = z.object({
  title: z.string().trim().min(3).max(200),
  level: z.enum(['institutional', 'district', 'state', 'national', 'international']).default('institutional'),
  position: z.string().trim().max(60).default(''),
  achievedOn: Day,
  participants: z.array(z.object({ studentId: z.uuid().optional(), name: z.string().trim().min(1).max(120) })).max(30).default([]),
  description: z.string().trim().max(1000).default(''),
});
const EvidenceBody = z
  .object({ title: z.string().trim().min(1).max(160).optional(), kind: z.enum(['photo', 'document', 'attendance', 'other']).default('document'), meetingId: z.uuid().optional(), url: z.url().max(500).optional(), file: BlobBody.optional() })
  .refine((b) => !!b.url !== !!b.file, 'Send either a link or a file')
  .refine((b) => !!b.title || !!b.file, 'A link needs a title');
const MediaBody = z
  .object({ caption: z.string().trim().max(300).default(''), kind: z.enum(['photo', 'video']).default('photo'), url: z.url().max(500).optional(), file: BlobBody.optional() })
  .refine((b) => !!b.url !== !!b.file, 'Send either a link or a file');

const EVENT_CERT = {
  name: 'Event attendance',
  title: 'Certificate of Participation',
  body: 'This is to certify that {{name}} (Roll {{rollNo}}, {{className}}) of {{institution}} attended {{fields.event}} held on {{fields.date}}{{fields.venueNote}}.\n\nIssued on {{issuedOn}} under serial {{serialNo}}.',
  serialPrefix: 'EVT',
  fieldKeys: ['event', 'date', 'venueNote'],
};

/**
 * Student-life extras: club office bearers and the achievements log, committee evidence and report packs,
 * attendance certificates for events, and the event media gallery.
 */
@Controller('v1/campus-life')
export class LifeExtrasController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CampusLifeService,
    private readonly storage: ObjectStorage,
    private readonly auto: AutoCertificatesService,
  ) {}

  // ---- club office bearers and achievements ------------------------------------------------------

  @Get('clubs/:id/office-bearers')
  @Auth('user', [...LIFE_STAFF, ...FAMILY])
  bearers(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: clubOfficeBearers.id, post: clubOfficeBearers.post, studentId: clubOfficeBearers.studentId, fullName: students.fullName, fromOn: clubOfficeBearers.fromOn, toOn: clubOfficeBearers.toOn, active: clubOfficeBearers.active })
        .from(clubOfficeBearers)
        .innerJoin(students, eq(students.id, clubOfficeBearers.studentId))
        .where(eq(clubOfficeBearers.clubId, id))
        .orderBy(desc(clubOfficeBearers.active), asc(clubOfficeBearers.post)),
    );
  }

  /** Names a student office bearer. They must be an active member of the club, and only one person holds a post at a time. */
  @Post('clubs/:id/office-bearers')
  @Auth('user', LIFE_STAFF)
  addBearer(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(BearerBody)) b: z.infer<typeof BearerBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, id)))[0], 'Club');
      const [m] = await tx.select({ id: clubMembers.id }).from(clubMembers).where(and(eq(clubMembers.clubId, id), eq(clubMembers.studentId, b.studentId), eq(clubMembers.status, 'active')));
      if (!m) throw new ConflictException('Only an active member of the club can be an office bearer');
      const [held] = await tx.select({ id: clubOfficeBearers.id }).from(clubOfficeBearers).where(and(eq(clubOfficeBearers.clubId, id), sql`lower(${clubOfficeBearers.post}) = lower(${b.post})`, eq(clubOfficeBearers.active, true)));
      if (held) throw new ConflictException(`${b.post} is already held. End that term first.`);
      const [row] = await tx.insert(clubOfficeBearers).values({ tenantId: p.tenantId, clubId: id, studentId: b.studentId, post: b.post, fromOn: b.fromOn, toOn: b.toOn ?? null }).returning();
      await auditUser(tx, p, 'club.office_bearer_added', 'club', id, { studentId: b.studentId, post: b.post });
      return row;
    });
  }

  @Post('office-bearers/:bearerId/end')
  @HttpCode(200)
  @Auth('user', LIFE_STAFF)
  endBearer(@CurrentPrincipal() p: UserPrincipal, @Param('bearerId', ParseUUIDPipe) bearerId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(clubOfficeBearers).set({ active: false, toOn: this.svc.now().toISOString().slice(0, 10) }).where(and(eq(clubOfficeBearers.id, bearerId), eq(clubOfficeBearers.active, true))).returning();
      if (!row) throw new NotFoundException('Office bearer not found');
      return row;
    });
  }

  @Get('clubs/:id/achievements')
  @Auth('user', [...LIFE_STAFF, ...FAMILY])
  achievements(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(clubAchievements).where(eq(clubAchievements.clubId, id)).orderBy(desc(clubAchievements.achievedOn)));
  }

  @Post('clubs/:id/achievements')
  @Auth('user', LIFE_STAFF)
  addAchievement(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AchievementBody)) b: z.infer<typeof AchievementBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, id)))[0], 'Club');
      const [row] = await tx.insert(clubAchievements).values({ tenantId: p.tenantId, clubId: id, ...b, recordedBy: p.userId }).returning();
      await auditUser(tx, p, 'club.achievement_logged', 'club', id, { title: b.title, level: b.level });
      return row;
    });
  }

  /** The institution's achievements log across clubs. */
  @Get('achievements')
  @Auth('user', [...LIFE_STAFF, ...FAMILY])
  allAchievements(@CurrentPrincipal() p: UserPrincipal, @Query('level') level?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: clubAchievements.id, club: clubs.name, title: clubAchievements.title, level: clubAchievements.level, position: clubAchievements.position, achievedOn: clubAchievements.achievedOn, participants: clubAchievements.participants })
        .from(clubAchievements)
        .innerJoin(clubs, eq(clubs.id, clubAchievements.clubId))
        .where(level ? eq(clubAchievements.level, level) : undefined)
        .orderBy(desc(clubAchievements.achievedOn))
        .limit(200),
    );
  }

  // ---- committee evidence and report pack ----------------------------------------------------------

  @Get('committees/:id/evidence')
  @Auth('user', COMMITTEE_STAFF)
  evidence(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: committeeEvidence.id, title: committeeEvidence.title, kind: committeeEvidence.kind, meetingId: committeeEvidence.meetingId, url: committeeEvidence.url, contentType: committeeEvidence.contentType, sizeBytes: committeeEvidence.sizeBytes, createdAt: committeeEvidence.createdAt })
        .from(committeeEvidence)
        .where(eq(committeeEvidence.committeeId, id))
        .orderBy(desc(committeeEvidence.createdAt)),
    );
  }

  @Post('committees/:id/evidence')
  @Auth('user', COMMITTEE_STAFF)
  addEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(EvidenceBody)) b: z.infer<typeof EvidenceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: committees.id }).from(committees).where(eq(committees.id, id)))[0], 'Committee');
      if (b.meetingId) found((await tx.select({ id: committeeMeetings.id }).from(committeeMeetings).where(and(eq(committeeMeetings.id, b.meetingId), eq(committeeMeetings.committeeId, id))))[0], 'Meeting');
      const stored = b.file ? await putBlob(this.storage, p.tenantId, `committees/${id}`, b.file) : null;
      const [row] = await tx
        .insert(committeeEvidence)
        .values({ tenantId: p.tenantId, committeeId: id, meetingId: b.meetingId ?? null, title: b.title ?? stored?.title ?? 'Evidence', kind: b.kind, url: b.url ?? null, storageKey: stored?.storageKey ?? null, contentType: stored?.contentType ?? null, sizeBytes: stored?.sizeBytes ?? null, uploadedBy: p.userId })
        .returning({ id: committeeEvidence.id, title: committeeEvidence.title, kind: committeeEvidence.kind });
      await auditUser(tx, p, 'committee.evidence_added', 'committee', id, { evidenceId: row.id });
      return row;
    });
  }

  @Get('evidence/:evidenceId/download')
  @Auth('user', COMMITTEE_STAFF)
  downloadEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('evidenceId', ParseUUIDPipe) evidenceId: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => sendBlob(this.storage, res, found((await tx.select().from(committeeEvidence).where(eq(committeeEvidence.id, evidenceId)))[0], 'Evidence')));
  }

  @Delete('evidence/:evidenceId')
  @HttpCode(204)
  @Auth('user', COMMITTEE_STAFF)
  removeEvidence(@CurrentPrincipal() p: UserPrincipal, @Param('evidenceId', ParseUUIDPipe) evidenceId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [e] = await tx.delete(committeeEvidence).where(eq(committeeEvidence.id, evidenceId)).returning();
      if (!e) throw new NotFoundException('Evidence not found');
      if (e.storageKey) await this.storage.delete(e.storageKey);
    });
  }

  /** One PDF for an audit or accreditation visit: members, meetings with minutes, action items and the evidence on file. */
  @Get('committees/:id/report-pack')
  @Auth('user', COMMITTEE_STAFF)
  reportPack(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(committees).where(eq(committees.id, id)))[0], 'Committee');
      const today = this.svc.now().toISOString().slice(0, 10);
      const lo = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : `${today.slice(0, 4)}-01-01`;
      const hi = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      const members = await tx.select({ name: users.fullName, role: committeeMembers.role, start: committeeMembers.tenureStart, end: committeeMembers.tenureEnd }).from(committeeMembers).innerJoin(users, eq(users.id, committeeMembers.userId)).where(eq(committeeMembers.committeeId, id));
      const meetings = await tx.select().from(committeeMeetings).where(and(eq(committeeMeetings.committeeId, id), gte(committeeMeetings.meetingOn, lo), lte(committeeMeetings.meetingOn, hi))).orderBy(asc(committeeMeetings.meetingOn));
      const meetingIds = meetings.map((m) => m.id);
      const actions = meetingIds.length ? await tx.select({ title: committeeActionItems.title, owner: users.fullName, dueOn: committeeActionItems.dueOn, status: committeeActionItems.status }).from(committeeActionItems).innerJoin(users, eq(users.id, committeeActionItems.ownerUserId)).where(inArray(committeeActionItems.meetingId, meetingIds)) : [];
      const ev = await tx.select().from(committeeEvidence).where(eq(committeeEvidence.committeeId, id)).orderBy(asc(committeeEvidence.createdAt));
      const pdf = reportPackPdf({
        institution: t?.name ?? '',
        committee: c.name,
        statutory: c.statutory,
        from: lo,
        to: hi,
        members: members.map((m) => ({ name: m.name, role: m.role, tenure: `${m.start}${m.end ? ` to ${m.end}` : ' onwards'}` })),
        meetings: meetings.map((m) => ({ title: m.title, on: m.meetingOn, status: m.status, agenda: m.agenda, minutes: m.minutes })),
        actions: actions.map((a) => ({ title: a.title, owner: a.owner, dueOn: a.dueOn, status: a.status })),
        evidence: ev.map((e) => ({ title: e.title, kind: e.kind, on: e.createdAt.toISOString().slice(0, 10) })),
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="committee-report-pack.pdf"`);
      return new StreamableFile(pdf);
    });
  }

  // ---- event attendance certificates ------------------------------------------------------------------

  /** Issues an attendance certificate to every checked-in student who does not have one yet. */
  @Post('events/:id/certificates')
  @HttpCode(200)
  @Auth('user', LIFE_STAFF)
  issueCertificates(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const ev = found((await tx.select().from(campusEvents).where(eq(campusEvents.id, id)))[0], 'Event');
      const rows = await tx
        .select({ reg: eventRegistrations.id, studentId: eventRegistrations.studentId })
        .from(eventRegistrations)
        .leftJoin(eventCertificates, eq(eventCertificates.registrationId, eventRegistrations.id))
        .where(and(eq(eventRegistrations.eventId, id), sql`${eventRegistrations.checkedInAt} is not null`, isNull(eventCertificates.id)));
      let issued = 0;
      for (const r of rows) {
        const certificateId = await this.auto.issueForStudent(tx, p, r.studentId, EVENT_CERT, { event: ev.title, date: ev.startsAt.toISOString().slice(0, 10), venueNote: ev.venue ? ` at ${ev.venue}` : '' }, `attendance at ${ev.title}`);
        await tx.insert(eventCertificates).values({ tenantId: p.tenantId, registrationId: r.reg, certificateId });
        issued += 1;
      }
      await auditUser(tx, p, 'event.certificates_issued', 'event', id, { issued });
      return { issued, alreadyHad: (await tx.select({ n: sql<number>`count(*)::int` }).from(eventCertificates).innerJoin(eventRegistrations, eq(eventRegistrations.id, eventCertificates.registrationId)).where(eq(eventRegistrations.eventId, id)))[0].n - issued };
    });
  }

  /** The caller's own (or child's) attendance certificate for an event. */
  @Get('events/:id/my-certificate')
  @Auth('user', FAMILY)
  myCertificate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('studentId') studentId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sid = await this.svc.actingStudent(tx, p, studentId);
      const [c] = await tx
        .select({ certificateId: eventCertificates.certificateId })
        .from(eventCertificates)
        .innerJoin(eventRegistrations, eq(eventRegistrations.id, eventCertificates.registrationId))
        .where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.studentId, sid)));
      return c ?? { certificateId: null };
    });
  }

  // ---- event media gallery ------------------------------------------------------------------------------

  private async canUpload(tx: Tx, p: UserPrincipal, eventId: string) {
    if (hasRole(p, LIFE_STAFF)) return 'staff' as const;
    const [r] = await tx.select({ id: eventRegistrations.id }).from(eventRegistrations).innerJoin(students, eq(students.id, eventRegistrations.studentId)).where(and(eq(eventRegistrations.eventId, eventId), eq(students.userId, p.userId), sql`${eventRegistrations.checkedInAt} is not null`));
    if (!r) throw new ForbiddenException('Only people who attended can add to the gallery');
    return 'attendee' as const;
  }

  @Get('events/:id/media')
  @Auth('user', [...LIFE_STAFF, ...FAMILY])
  gallery(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: eventMedia.id, caption: eventMedia.caption, kind: eventMedia.kind, url: eventMedia.url, contentType: eventMedia.contentType, approved: eventMedia.approved, createdAt: eventMedia.createdAt })
        .from(eventMedia)
        .where(and(eq(eventMedia.eventId, id), hasRole(p, LIFE_STAFF) ? undefined : eq(eventMedia.approved, true)))
        .orderBy(desc(eventMedia.createdAt)),
    );
  }

  /** Staff add approved items; attendees add items that wait for approval. */
  @Post('events/:id/media')
  @Auth('user', [...LIFE_STAFF, 'student'])
  addMedia(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MediaBody)) b: z.infer<typeof MediaBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: campusEvents.id }).from(campusEvents).where(eq(campusEvents.id, id)))[0], 'Event');
      const who = await this.canUpload(tx, p, id);
      if (b.file && !['image/png', 'image/jpeg', 'video/mp4'].includes(b.file.contentType)) throw new ConflictException('Gallery files must be PNG, JPEG or MP4');
      const stored = b.file ? await putBlob(this.storage, p.tenantId, `events/${id}`, b.file) : null;
      const [row] = await tx
        .insert(eventMedia)
        .values({ tenantId: p.tenantId, eventId: id, caption: b.caption, kind: b.kind, url: b.url ?? null, storageKey: stored?.storageKey ?? null, contentType: stored?.contentType ?? null, sizeBytes: stored?.sizeBytes ?? null, approved: who === 'staff', uploadedBy: p.userId })
        .returning({ id: eventMedia.id, approved: eventMedia.approved });
      return row;
    });
  }

  @Post('media/:mediaId/approve')
  @HttpCode(200)
  @Auth('user', LIFE_STAFF)
  approveMedia(@CurrentPrincipal() p: UserPrincipal, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(eventMedia).set({ approved: true }).where(eq(eventMedia.id, mediaId)).returning({ id: eventMedia.id, approved: eventMedia.approved });
      if (!row) throw new NotFoundException('Item not found');
      return row;
    });
  }

  @Get('media/:mediaId/file')
  @Auth('user', [...LIFE_STAFF, ...FAMILY])
  mediaFile(@CurrentPrincipal() p: UserPrincipal, @Param('mediaId', ParseUUIDPipe) mediaId: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = found((await tx.select().from(eventMedia).where(eq(eventMedia.id, mediaId)))[0], 'Item');
      if (!m.approved && !hasRole(p, LIFE_STAFF)) throw new NotFoundException('Item not found');
      return sendBlob(this.storage, res, { storageKey: m.storageKey, contentType: m.contentType, title: `event-${m.id}` });
    });
  }

  @Delete('media/:mediaId')
  @HttpCode(204)
  @Auth('user', LIFE_STAFF)
  removeMedia(@CurrentPrincipal() p: UserPrincipal, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.delete(eventMedia).where(eq(eventMedia.id, mediaId)).returning();
      if (!m) throw new NotFoundException('Item not found');
      if (m.storageKey) await this.storage.delete(m.storageKey);
    });
  }
}
