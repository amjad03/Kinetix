import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdmissionsEvents, canMoveEnquiry, type EnquiryActivityKind, type EnquirySource, type EnquiryStage } from '@kinetix/shared';
import { and, asc, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { enquiries, enquiryActivities, programs, userRoles, users } from '../db/schema.js';

export const COUNSELLOR_ROLES = ['admissions_officer', 'principal', 'tenant_admin'] as const;
const CLOSED_STAGES: EnquiryStage[] = ['converted', 'lost'];

export interface Actor {
  tenantId: string;
  userId: string | null;
}

export const auditActor = (a: Actor) => ({ tenantId: a.tenantId, actorType: (a.userId ? 'user' : 'system') as 'user' | 'system', actorId: a.userId ?? undefined });

/** The admissions pipeline: enquiries from the public form, walk-ins and calls, owned by counsellors. */
@Injectable()
export class EnquiriesService {
  async create(tx: Tx, actor: Actor, input: { name: string; phone: string; email?: string | null; programId?: string | null; source: EnquirySource; message?: string | null; counsellorId?: string | null; nextFollowUpOn?: string | null }, today: string) {
    if (input.programId) {
      const [p] = await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, input.programId));
      if (!p) throw new BadRequestException('Program not found');
    }
    // The same family asking twice about the same program is one enquiry, not two.
    const [dup] = await tx
      .select()
      .from(enquiries)
      .where(and(eq(enquiries.phone, input.phone), notInArray(enquiries.stage, CLOSED_STAGES), input.programId ? eq(enquiries.programId, input.programId) : sql`${enquiries.programId} is null`))
      .limit(1);
    if (dup) {
      await tx.insert(enquiryActivities).values({ tenantId: actor.tenantId, enquiryId: dup.id, kind: 'note', note: `Asked again (${input.source})${input.message ? `: ${input.message}` : ''}`, actorId: actor.userId });
      return { enquiry: dup, duplicate: true };
    }
    let counsellorId = input.counsellorId ?? null;
    if (counsellorId) await this.assertCounsellor(tx, counsellorId);
    else counsellorId = await this.leastLoadedCounsellor(tx);
    const [row] = await tx
      .insert(enquiries)
      .values({
        tenantId: actor.tenantId,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        programId: input.programId ?? null,
        source: input.source,
        message: input.message ?? null,
        counsellorId,
        createdBy: actor.userId,
        // Every new enquiry gets a first follow-up the next day unless the counsellor sets one.
        nextFollowUpOn: input.nextFollowUpOn ?? addDays(today, 1),
      })
      .returning();
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.EnquiryCreated, subjectType: 'enquiry', subjectId: row.id, data: { source: input.source, counsellorId } });
    return { enquiry: row, duplicate: false };
  }

  /** The active counsellor with the fewest open enquiries; null when the institution has none. */
  async leastLoadedCounsellor(tx: Tx): Promise<string | null> {
    const officers = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, 'admissions_officer'), eq(users.status, 'active')))
      .orderBy(asc(users.createdAt));
    if (officers.length === 0) return null;
    const open = await tx
      .select({ id: enquiries.counsellorId, n: sql<number>`count(*)::int` })
      .from(enquiries)
      .where(and(inArray(enquiries.counsellorId, officers.map((o) => o.id)), notInArray(enquiries.stage, CLOSED_STAGES)))
      .groupBy(enquiries.counsellorId);
    const load = new Map(open.map((r) => [r.id, r.n]));
    return officers.map((o) => o.id).sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0];
  }

  async assertCounsellor(tx: Tx, userId: string) {
    const roles = await tx.select({ role: userRoles.role }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(and(eq(userRoles.userId, userId), eq(users.status, 'active')));
    if (!roles.some((r) => (COUNSELLOR_ROLES as readonly string[]).includes(r.role))) throw new BadRequestException('Choose an admissions officer, principal or admin');
  }

  async assign(tx: Tx, actor: Actor, id: string, counsellorId: string | null) {
    const e = await this.get(tx, id);
    if (counsellorId) await this.assertCounsellor(tx, counsellorId);
    const [row] = await tx.update(enquiries).set({ counsellorId, updatedAt: new Date() }).where(eq(enquiries.id, id)).returning();
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.EnquiryAssigned, subjectType: 'enquiry', subjectId: id, data: { from: e.counsellorId, to: counsellorId } });
    return row;
  }

  async moveStage(tx: Tx, actor: Actor, id: string, to: EnquiryStage, reason?: string | null) {
    const e = await this.get(tx, id, true);
    if (to === 'converted') throw new BadRequestException('An enquiry is converted by enrolling the applicant');
    if (!canMoveEnquiry(e.stage, to)) throw new BadRequestException(`An enquiry that is ${e.stage} cannot become ${to}`);
    if (to === 'lost' && !(reason && reason.trim().length >= 3)) throw new BadRequestException('Say why the enquiry was lost');
    const [row] = await tx
      .update(enquiries)
      .set({ stage: to, lostReason: to === 'lost' ? reason!.trim() : null, nextFollowUpOn: CLOSED_STAGES.includes(to) ? null : e.nextFollowUpOn, updatedAt: new Date() })
      .where(eq(enquiries.id, id))
      .returning();
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.EnquiryStageChanged, subjectType: 'enquiry', subjectId: id, data: { from: e.stage, to, reason: reason ?? null } });
    return row;
  }

  async logActivity(tx: Tx, actor: Actor, id: string, a: { kind: EnquiryActivityKind; note: string; nextFollowUpOn?: string | null }) {
    const e = await this.get(tx, id);
    if (CLOSED_STAGES.includes(e.stage)) throw new BadRequestException('This enquiry is closed');
    const [act] = await tx.insert(enquiryActivities).values({ tenantId: actor.tenantId, enquiryId: id, kind: a.kind, note: a.note, nextFollowUpOn: a.nextFollowUpOn ?? null, actorId: actor.userId }).returning();
    // A logged contact moves a brand-new enquiry on, and sets (or clears) the next follow-up.
    await tx
      .update(enquiries)
      .set({ stage: e.stage === 'new' && a.kind !== 'note' ? 'contacted' : e.stage, nextFollowUpOn: a.nextFollowUpOn ?? null, updatedAt: new Date() })
      .where(eq(enquiries.id, id));
    await audit(tx, { ...auditActor(actor), action: AdmissionsEvents.EnquiryFollowUpLogged, subjectType: 'enquiry', subjectId: id, data: { kind: a.kind, nextFollowUpOn: a.nextFollowUpOn ?? null } });
    return act;
  }

  async get(tx: Tx, id: string, lock = false) {
    const q = tx.select().from(enquiries).where(eq(enquiries.id, id));
    const [e] = await (lock ? q.for('update') : q);
    if (!e) throw new NotFoundException('Enquiry not found');
    return e;
  }

  /** Counts per stage and the follow-ups due today or overdue, for the pipeline board. */
  async pipeline(tx: Tx, today: string, counsellorId?: string) {
    const scope = counsellorId ? eq(enquiries.counsellorId, counsellorId) : undefined;
    const stages = await tx.select({ stage: enquiries.stage, n: sql<number>`count(*)::int` }).from(enquiries).where(scope).groupBy(enquiries.stage);
    const [due] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(enquiries)
      .where(and(scope, lte(enquiries.nextFollowUpOn, today), notInArray(enquiries.stage, CLOSED_STAGES)));
    const [week] = await tx.select({ n: sql<number>`count(*)::int` }).from(enquiries).where(and(scope, gte(enquiries.createdAt, new Date(Date.now() - 7 * 86400_000))));
    return { stages: Object.fromEntries(stages.map((s) => [s.stage, s.n])) as Record<string, number>, followUpsDue: due.n, newThisWeek: week.n };
  }
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
