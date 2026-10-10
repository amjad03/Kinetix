import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { admissionAgents, admissionCycles, agentCommissionRules, agentCommissions, applications, enquiries } from '../db/schema.js';
import { commissionAmount, pickRule, type CommissionRule } from './depth/commission.js';
import { type Actor, auditActor } from './enquiries.service.js';

type AgentInput = { name: string; kind: 'agent' | 'partner'; phone?: string | null; email?: string | null; commissionPaise: number; referralCode?: string | null; active?: boolean };

/**
 * Called when an application is enrolled: the agent or partner who referred the family (on the
 * application, or on the enquiry it came from) earns their fixed commission, once per student.
 */
export async function accrueCommission(tx: Tx, tenantId: string, app: { id: string; agentId: string | null; enquiryId: string | null }) {
  let agentId = app.agentId;
  if (!agentId && app.enquiryId) {
    const [e] = await tx.select({ agentId: enquiries.agentId }).from(enquiries).where(eq(enquiries.id, app.enquiryId));
    agentId = e?.agentId ?? null;
  }
  if (!agentId) return null;
  const [agent] = await tx.select().from(admissionAgents).where(eq(admissionAgents.id, agentId));
  if (!agent) return null;
  // The most specific commission rule (agent and programme, agent, programme, institution) decides the amount; an agent with no rule gets their fixed commission.
  const [cycle] = await tx.select({ programId: admissionCycles.programId }).from(applications).innerJoin(admissionCycles, eq(admissionCycles.id, applications.cycleId)).where(eq(applications.id, app.id));
  const rule = pickRule((await tx.select().from(agentCommissionRules)) as CommissionRule[], agentId, cycle?.programId ?? null);
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(agentCommissions).where(eq(agentCommissions.agentId, agentId));
  const amountPaise = rule ? commissionAmount(rule, n + 1) : agent.commissionPaise;
  const [row] = await tx
    .insert(agentCommissions)
    .values({ tenantId, agentId, applicationId: app.id, amountPaise })
    .onConflictDoNothing()
    .returning();
  if (row) await audit(tx, { tenantId, actorType: 'system', action: 'admissions.commission_accrued.v1', subjectType: 'application', subjectId: app.id, data: { agentId, amountPaise: row.amountPaise } });
  return row ?? null;
}

/** Agents and referral partners, their referral codes and the commission owed per enrolment. */
@Injectable()
export class AgentsService {
  private code(name: string): string {
    const letters = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4).padEnd(3, 'X');
    return `${letters}${Math.floor(100 + Math.random() * 900)}`;
  }

  async create(tx: Tx, actor: Actor, input: AgentInput) {
    let referralCode = input.referralCode?.trim().toUpperCase() || '';
    if (referralCode && !/^[A-Z0-9-]{4,20}$/.test(referralCode)) throw new BadRequestException('Use 4 to 20 letters, digits or dashes for the referral code');
    if (!referralCode) {
      for (let i = 0; i < 20 && !referralCode; i++) {
        const c = this.code(input.name);
        const [hit] = await tx.select({ id: admissionAgents.id }).from(admissionAgents).where(eq(admissionAgents.referralCode, c));
        if (!hit) referralCode = c;
      }
    }
    const [dup] = await tx.select({ id: admissionAgents.id }).from(admissionAgents).where(eq(admissionAgents.referralCode, referralCode));
    if (dup) throw new ConflictException('That referral code is already in use');
    const [row] = await tx
      .insert(admissionAgents)
      .values({ tenantId: actor.tenantId, name: input.name, kind: input.kind, phone: input.phone ?? null, email: input.email ?? null, commissionPaise: input.commissionPaise, referralCode })
      .returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.agent_created.v1', subjectType: 'admission_agent', subjectId: row.id, data: { name: row.name, referralCode } });
    return row;
  }

  async update(tx: Tx, actor: Actor, id: string, patch: Partial<Pick<AgentInput, 'name' | 'phone' | 'email' | 'commissionPaise' | 'active'>>) {
    const [row] = await tx.update(admissionAgents).set(patch).where(eq(admissionAgents.id, id)).returning();
    if (!row) throw new NotFoundException('Agent not found');
    await audit(tx, { ...auditActor(actor), action: 'admissions.agent_updated.v1', subjectType: 'admission_agent', subjectId: id, data: { fields: Object.keys(patch) } });
    return row;
  }

  /** Every agent with how many enquiries and enrolments they brought and what is owed and paid. */
  async list(tx: Tx) {
    const agents = await tx.select().from(admissionAgents).orderBy(asc(admissionAgents.name));
    const enq = await tx.select({ agentId: enquiries.agentId, n: sql<number>`count(*)::int`, converted: sql<number>`count(*) filter (where ${enquiries.stage} = 'converted')::int` }).from(enquiries).where(sql`${enquiries.agentId} is not null`).groupBy(enquiries.agentId);
    const com = await tx
      .select({ agentId: agentCommissions.agentId, status: agentCommissions.status, n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${agentCommissions.amountPaise}), 0)::bigint` })
      .from(agentCommissions)
      .groupBy(agentCommissions.agentId, agentCommissions.status);
    return agents.map((a) => {
      const e = enq.find((x) => x.agentId === a.id);
      const accrued = com.find((c) => c.agentId === a.id && c.status === 'accrued');
      const paid = com.find((c) => c.agentId === a.id && c.status === 'paid');
      return { ...a, enquiries: e?.n ?? 0, enrolled: (accrued?.n ?? 0) + (paid?.n ?? 0), accruedPaise: Number(accrued?.total ?? 0), paidPaise: Number(paid?.total ?? 0) };
    });
  }

  async commissions(tx: Tx, agentId?: string) {
    const rows = await tx
      .select({ c: agentCommissions, agentName: admissionAgents.name, applicantName: applications.applicantName, applicationNo: applications.applicationNo })
      .from(agentCommissions)
      .innerJoin(admissionAgents, eq(admissionAgents.id, agentCommissions.agentId))
      .innerJoin(applications, eq(applications.id, agentCommissions.applicationId))
      .where(agentId ? eq(agentCommissions.agentId, agentId) : undefined)
      .orderBy(desc(agentCommissions.createdAt));
    return rows.map((r) => ({ ...r.c, agentName: r.agentName, applicantName: r.applicantName, applicationNo: r.applicationNo }));
  }

  /** Marks accrued commissions as paid out on a date. Already-paid ones are left alone. */
  async markPaid(tx: Tx, actor: Actor, ids: string[], paidOn: string, note?: string | null) {
    const rows = await tx.update(agentCommissions).set({ status: 'paid', paidOn, note: note ?? null }).where(and(inArray(agentCommissions.id, ids), eq(agentCommissions.status, 'accrued'))).returning();
    if (rows.length === 0) throw new BadRequestException('No unpaid commission among those selected');
    await audit(tx, { ...auditActor(actor), action: 'admissions.commission_paid.v1', subjectType: 'agent_commission', subjectId: rows[0].id, data: { count: rows.length, totalPaise: rows.reduce((n, r) => n + r.amountPaise, 0), paidOn } });
    return { paid: rows.length, totalPaise: rows.reduce((n, r) => n + r.amountPaise, 0) };
  }

  /** Credits an application to an agent (a walk-in the agent brought) so the commission accrues at enrolment. */
  async setApplicationAgent(tx: Tx, actor: Actor, applicationId: string, agentId: string | null) {
    if (agentId) {
      const [a] = await tx.select({ id: admissionAgents.id }).from(admissionAgents).where(eq(admissionAgents.id, agentId));
      if (!a) throw new BadRequestException('Agent not found');
    }
    const [row] = await tx.update(applications).set({ agentId }).where(eq(applications.id, applicationId)).returning({ id: applications.id, agentId: applications.agentId });
    if (!row) throw new NotFoundException('Application not found');
    await audit(tx, { ...auditActor(actor), action: 'admissions.application_agent_set.v1', subjectType: 'application', subjectId: applicationId, data: { agentId } });
    return row;
  }
}
