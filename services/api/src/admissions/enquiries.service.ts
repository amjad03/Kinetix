import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdmissionsEvents, canMoveEnquiry, type EnquiryActivityKind, type EnquirySource, type EnquiryStage } from '@kinetix/shared';
import { and, asc, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { admissionCampaigns, enquiries, enquiryActivities, programs, userRoles, users } from '../db/schema.js';

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
  async create(tx: Tx, actor: Actor, input: { name: string; phone: string; email?: string | null; programId?: string | null; source: EnquirySource; message?: string | null; counsellorId?: string | null; nextFollowUpOn?: string | null; campaignId?: string | null; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null }, today: string) {
    const campaignId = await this.resolveCampaign(tx, input.campaignId ?? null, input.utmCampaign ?? null);
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
        campaignId,
        utmSource: input.utmSource?.trim().slice(0, 80) || null,
        utmMedium: input.utmMedium?.trim().slice(0, 80) || null,
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

  /** The campaign an enquiry belongs to: named by id, or found by its UTM campaign tag. Unknown tags are ignored. */
  async resolveCampaign(tx: Tx, campaignId: string | null, utmCampaign: string | null): Promise<string | null> {
    if (campaignId) {
      const [c] = await tx.select({ id: admissionCampaigns.id }).from(admissionCampaigns).where(eq(admissionCampaigns.id, campaignId));
      if (!c) throw new BadRequestException('Campaign not found');
      return c.id;
    }
    const tag = utmCampaign?.trim().toLowerCase();
    if (!tag) return null;
    const [c] = await tx.select({ id: admissionCampaigns.id }).from(admissionCampaigns).where(and(sql`lower(${admissionCampaigns.utmCampaign}) = ${tag}`, eq(admissionCampaigns.active, true))).limit(1);
    return c?.id ?? null;
  }

  async createCampaign(tx: Tx, actor: Actor, input: { name: string; channel: string; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; startsOn?: string | null; endsOn?: string | null; budgetPaise: number }) {
    if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) throw new BadRequestException('The campaign cannot end before it starts');
    const [dup] = await tx.select({ id: admissionCampaigns.id }).from(admissionCampaigns).where(eq(admissionCampaigns.name, input.name));
    if (dup) throw new BadRequestException('A campaign with this name already exists');
    const [row] = await tx.insert(admissionCampaigns).values({ tenantId: actor.tenantId, name: input.name, channel: input.channel, utmSource: input.utmSource ?? null, utmMedium: input.utmMedium ?? null, utmCampaign: input.utmCampaign ?? null, startsOn: input.startsOn ?? null, endsOn: input.endsOn ?? null, budgetPaise: input.budgetPaise, createdBy: actor.userId }).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.campaign_created.v1', subjectType: 'admission_campaign', subjectId: row.id, data: { name: row.name, channel: row.channel } });
    return row;
  }

  async updateCampaign(tx: Tx, actor: Actor, id: string, patch: { active?: boolean; budgetPaise?: number; endsOn?: string | null }) {
    const [row] = await tx.update(admissionCampaigns).set(patch).where(eq(admissionCampaigns.id, id)).returning();
    if (!row) throw new NotFoundException('Campaign not found');
    await audit(tx, { ...auditActor(actor), action: 'admissions.campaign_updated.v1', subjectType: 'admission_campaign', subjectId: id, data: patch });
    return row;
  }

  /**
   * Enquiries, applications and enrolments per campaign (and one row for enquiries with none), with
   * the conversion rate and the spend per enrolled student. `from`/`to` filter on the enquiry date.
   */
  async campaignReport(tx: Tx, range: { from?: string; to?: string }) {
    const campaigns = await tx.select().from(admissionCampaigns).orderBy(asc(admissionCampaigns.name));
    const conds: (SQL | undefined)[] = [range.from ? gte(enquiries.createdAt, new Date(`${range.from}T00:00:00Z`)) : undefined, range.to ? lte(enquiries.createdAt, new Date(`${range.to}T23:59:59Z`)) : undefined];
    const rows = await tx
      .select({ campaignId: enquiries.campaignId, stage: enquiries.stage, applied: sql<boolean>`${enquiries.applicationId} is not null or ${enquiries.stage} in ('applied', 'converted')` })
      .from(enquiries)
      .where(and(...conds));
    const line = (id: string | null) => {
      const mine = rows.filter((r) => r.campaignId === id);
      const enquiriesN = mine.length;
      const applied = mine.filter((r) => r.applied).length;
      const enrolled = mine.filter((r) => r.stage === 'converted').length;
      return { enquiries: enquiriesN, applied, enrolled, lost: mine.filter((r) => r.stage === 'lost').length, conversionPct: enquiriesN ? Math.round((enrolled / enquiriesN) * 1000) / 10 : 0 };
    };
    const out = campaigns.map((c) => {
      const l = line(c.id);
      return { id: c.id, name: c.name, channel: c.channel, utmSource: c.utmSource, utmMedium: c.utmMedium, utmCampaign: c.utmCampaign, active: c.active, budgetPaise: c.budgetPaise, ...l, costPerEnrolmentPaise: l.enrolled ? Math.round(c.budgetPaise / l.enrolled) : null };
    });
    return { campaigns: out, unattributed: line(null) };
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
