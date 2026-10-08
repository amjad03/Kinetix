import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { counsellingSessions, students, userRoles } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';
import { COUNSELLING_OVERSIGHT, COUNSELLING_STAFF } from './welfare.access.js';
import { WelfareService } from './welfare.service.js';

type Session = typeof counsellingSessions.$inferSelect;

/** What each reader may see. The notes leave this file only for the counsellor who holds the session. */
function present(s: Session, p: UserPrincipal, isCounsellor: boolean, withNotes = false) {
  const { confidentialNotes, reason, ...rest } = s;
  const mine = s.counsellorUserId === p.userId && isCounsellor;
  const seesReason = mine || s.requestedBy === p.userId || (isCounsellor && s.counsellorUserId === null);
  return { ...rest, ...(seesReason ? { reason } : {}), ...(mine && withNotes ? { confidentialNotes } : {}), hasNotes: mine ? confidentialNotes !== null : undefined };
}

/** Counselling sessions. Confidential notes are readable only by the counsellor who holds the session (docs/architecture/placements-research-welfare.md). */
@Controller('v1/counselling')
export class CounsellingController {
  constructor(
    private readonly db: DbService,
    private readonly svc: WelfareService,
  ) {}

  private async load(tx: Tx, p: UserPrincipal, id: string, lock = false) {
    const q = tx.select().from(counsellingSessions).where(eq(counsellingSessions.id, id));
    const s = found((await (lock ? q.for('update') : q))[0], 'Session');
    const counsellor = hasRole(p, COUNSELLING_STAFF);
    const family = s.requestedBy === p.userId || (await this.svc.familyStudents(tx, p)).includes(s.studentId);
    const guardianOnly = hasRole(p, ['guardian']) && !hasRole(p, ['student']);
    // Parents see only what they asked for; a student sees their own sessions.
    const familyOk = family && (!guardianOnly || s.requestedBy === p.userId);
    const ownDesk = counsellor && (s.counsellorUserId === p.userId || s.counsellorUserId === null);
    if (!ownDesk && !hasRole(p, ['principal', 'tenant_admin']) && !familyOk && s.requestedBy !== p.userId) throw new NotFoundException('Session not found');
    return { s, counsellor };
  }

  /** A student, parent or staff member asks for counselling; a counsellor can also log a walk-in. */
  @Post('sessions')
  @Auth('user')
  request(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ studentId: z.uuid().optional(), reason: z.string().trim().max(1000).default('') }))) b: { studentId?: string; reason: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const family = hasRole(p, ['student', 'guardian']);
      const studentId = family ? await this.svc.actingStudent(tx, p, b.studentId) : b.studentId;
      if (!studentId) throw new ConflictException('studentId is required');
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)))[0], 'Student');
      const walkIn = hasRole(p, COUNSELLING_STAFF);
      const [row] = await tx.insert(counsellingSessions).values({ tenantId: p.tenantId, studentId, requestedBy: p.userId, reason: b.reason, counsellorUserId: walkIn ? p.userId : null, status: walkIn ? 'scheduled' : 'requested', scheduledAt: walkIn ? this.svc.now() : null }).returning();
      // The audit entry records that a session exists, never why.
      await auditUser(tx, p, 'counselling.requested', 'counselling', row.id, { studentId });
      if (!walkIn) await this.svc.notify(tx, await this.svc.usersWithRole(tx, ['counsellor']), 'welfare', 'A counselling request is waiting', 'Please review the queue.', `counselling:new:${row.id}`, { sessionId: row.id });
      return present(row, p, walkIn);
    });
  }

  @Get('sessions')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const counsellor = hasRole(p, COUNSELLING_STAFF);
      const oversight = hasRole(p, COUNSELLING_OVERSIGHT);
      const kids = await this.svc.familyStudents(tx, p);
      const asParent = hasRole(p, ['guardian']) && !hasRole(p, ['student']);
      const scope = oversight && !counsellor ? undefined : or(counsellor ? or(eq(counsellingSessions.counsellorUserId, p.userId), isNull(counsellingSessions.counsellorUserId)) : undefined, eq(counsellingSessions.requestedBy, p.userId), kids.length && !asParent ? inArray(counsellingSessions.studentId, kids) : undefined);
      const rows = await tx.select().from(counsellingSessions).where(scope).orderBy(desc(counsellingSessions.createdAt));
      return rows.map((s) => present(s, p, counsellor));
    });
  }

  /** One session. The counsellor who holds it gets the notes, and each read of them is audited. */
  @Get('sessions/:id')
  @Auth('user')
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s, counsellor } = await this.load(tx, p, id);
      const notes = counsellor && s.counsellorUserId === p.userId;
      if (notes && s.confidentialNotes !== null) await auditUser(tx, p, 'counselling.notes_viewed', 'counselling', id);
      return present(s, p, counsellor, notes);
    });
  }

  /** A counsellor takes an unassigned session, or the principal assigns one to a counsellor. */
  @Post('sessions/:id/schedule')
  @Auth('user', COUNSELLING_OVERSIGHT)
  @HttpCode(200)
  schedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ counsellorUserId: z.uuid().optional(), scheduledAt: z.iso.datetime() }))) b: { counsellorUserId?: string; scheduledAt: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s, counsellor } = await this.load(tx, p, id, true);
      if (!['requested', 'scheduled'].includes(s.status)) throw new ConflictException(`A ${s.status} session cannot be scheduled`);
      const target = counsellor ? p.userId : b.counsellorUserId;
      if (!target) throw new ConflictException('Choose a counsellor');
      if (counsellor && s.counsellorUserId && s.counsellorUserId !== p.userId) throw new ForbiddenException('This session belongs to another counsellor');
      const [c] = await tx.select({ id: userRoles.id }).from(userRoles).where(and(eq(userRoles.userId, target), eq(userRoles.role, 'counsellor')));
      if (!c) throw new ConflictException('That person is not a counsellor');
      if (new Date(b.scheduledAt) < this.svc.now()) throw new ConflictException('Pick a time in the future');
      const [row] = await tx.update(counsellingSessions).set({ counsellorUserId: target, scheduledAt: new Date(b.scheduledAt), status: 'scheduled' }).where(eq(counsellingSessions.id, id)).returning();
      await auditUser(tx, p, 'counselling.scheduled', 'counselling', id, { counsellorUserId: target });
      await this.svc.notify(tx, [s.requestedBy], 'welfare', 'Your counselling session is scheduled', b.scheduledAt, `counselling:sched:${id}:${b.scheduledAt}`, { sessionId: id });
      return present(row, p, counsellor);
    });
  }

  /** Saves the confidential notes (the counsellor holding the session only). */
  @Put('sessions/:id/notes')
  @Auth('user', COUNSELLING_STAFF)
  saveNotes(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ notes: z.string().trim().max(20000) }))) b: { notes: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s } = await this.load(tx, p, id, true);
      if (s.counsellorUserId !== p.userId) throw new NotFoundException('Session not found');
      if (['cancelled', 'requested'].includes(s.status)) throw new ConflictException('Schedule the session before writing notes');
      const [row] = await tx.update(counsellingSessions).set({ confidentialNotes: b.notes }).where(eq(counsellingSessions.id, id)).returning();
      await auditUser(tx, p, 'counselling.notes_saved', 'counselling', id);
      return present(row, p, true, true);
    });
  }

  @Post('sessions/:id/outcome')
  @Auth('user', COUNSELLING_STAFF)
  @HttpCode(200)
  outcome(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['completed', 'no_show']) }))) b: { status: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s } = await this.load(tx, p, id, true);
      if (s.counsellorUserId !== p.userId) throw new NotFoundException('Session not found');
      if (s.status !== 'scheduled') throw new ConflictException(`A ${s.status} session cannot be closed out`);
      const [row] = await tx.update(counsellingSessions).set({ status: b.status }).where(eq(counsellingSessions.id, id)).returning();
      await auditUser(tx, p, `counselling.${b.status}`, 'counselling', id);
      return present(row, p, true, true);
    });
  }

  @Post('sessions/:id/cancel')
  @Auth('user')
  @HttpCode(200)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { s, counsellor } = await this.load(tx, p, id, true);
      const mine = s.requestedBy === p.userId || s.counsellorUserId === p.userId;
      if (!mine) throw new ForbiddenException('Only the requester or the counsellor can cancel');
      if (!['requested', 'scheduled'].includes(s.status)) throw new ConflictException(`A ${s.status} session cannot be cancelled`);
      const [row] = await tx.update(counsellingSessions).set({ status: 'cancelled' }).where(eq(counsellingSessions.id, id)).returning();
      await auditUser(tx, p, 'counselling.cancelled', 'counselling', id);
      return present(row, p, counsellor);
    });
  }
}
