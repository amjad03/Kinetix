import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { audit } from '../../common/audit.js';
import { normalizePhone } from '../../auth/phone.js';
import type { Tx } from '../../db/db.service.js';
import { agentCommissions, enquiries, leadConnectors, leadEvents, leadSpend } from '../../db/schema.js';
import { type Actor, auditActor, EnquiriesService } from '../enquiries.service.js';

export type LeadKind = 'meta' | 'google' | 'website';

/** What a lead source hands us once its payload is read: who to call and where they came from. */
export interface NormalLead {
  externalId: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  utmCampaign: string | null;
}

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Meta signs the raw body with the app secret: `sha256=<hex>`. */
export function metaSignatureOk(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  return safeEq(createHmac('sha256', secret).update(rawBody).digest('hex'), header.slice(7));
}

type Field = { name?: string; values?: string[] };

/** Reads a Meta lead: either the lead itself or a webhook entry wrapping it (`entry[].changes[].value`). Field names follow Meta's form fields. */
export function readMetaLead(body: Record<string, unknown>): NormalLead | { error: string } {
  const entry = (body.entry as { changes?: { value?: Record<string, unknown> }[] }[] | undefined)?.[0]?.changes?.[0]?.value;
  const v = entry ?? body;
  const fields = (v.field_data as Field[] | undefined) ?? [];
  const get = (...names: string[]) => fields.find((f) => names.includes((f.name ?? '').toLowerCase()))?.values?.[0]?.trim() || null;
  const id = String(v.leadgen_id ?? v.id ?? '');
  if (!id) return { error: 'No lead id' };
  if (!fields.length) return { error: 'The lead has no form fields; send the lead through a relay that fetches it from the Graph API' };
  const name = get('full_name', 'name') ?? [get('first_name'), get('last_name')].filter(Boolean).join(' ');
  return { externalId: id, name, phone: get('phone_number', 'phone', 'mobile') ?? '', email: get('email'), message: get('message', 'comments'), utmCampaign: typeof v.campaign_name === 'string' ? v.campaign_name : null };
}

/** Reads a Google Ads lead-form webhook: `lead_id`, `user_column_data[{column_id, string_value}]`. */
export function readGoogleLead(body: Record<string, unknown>): NormalLead | { error: string } {
  const cols = (body.user_column_data as { column_id?: string; column_name?: string; string_value?: string }[] | undefined) ?? [];
  const get = (...ids: string[]) => cols.find((c) => ids.includes((c.column_id ?? '').toUpperCase()))?.string_value?.trim() || null;
  const id = String(body.lead_id ?? '');
  if (!id) return { error: 'No lead id' };
  return { externalId: id, name: get('FULL_NAME') ?? [get('FIRST_NAME'), get('LAST_NAME')].filter(Boolean).join(' '), phone: get('PHONE_NUMBER') ?? '', email: get('EMAIL'), message: get('MESSAGE', 'COMMENTS'), utmCampaign: body.campaign_id ? String(body.campaign_id) : null };
}

/** Reads the website form post: `{ name, phone, email, message, utmCampaign, submissionId }`. */
export function readWebsiteLead(body: Record<string, unknown>): NormalLead | { error: string } {
  const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() || null : null);
  return { externalId: s('submissionId') ?? randomUUID(), name: s('name') ?? '', phone: s('phone') ?? '', email: s('email'), message: s('message'), utmCampaign: s('utmCampaign') };
}

/** Lead connectors (Meta lead ads, Google Ads, website form) that turn ad leads into enquiries, plus ad spend and the source ROI report. */
@Injectable()
export class LeadsService {
  constructor(private readonly enquiries: EnquiriesService) {}

  private publicView<T extends { secret: string }>(c: T): Omit<T, 'secret'> {
    const { secret: _s, ...rest } = c;
    return rest;
  }

  async list(tx: Tx) {
    const rows = await tx.select().from(leadConnectors).orderBy(asc(leadConnectors.name));
    const counts = await tx.select({ connectorId: leadEvents.connectorId, status: leadEvents.status, n: sql<number>`count(*)::int` }).from(leadEvents).groupBy(leadEvents.connectorId, leadEvents.status);
    return rows.map((c) => ({ ...this.publicView(c), events: Object.fromEntries(counts.filter((x) => x.connectorId === c.id).map((x) => [x.status, x.n])) }));
  }

  /** Creates a connector. The secret is returned once: for Meta, give the app secret so signatures can be checked. */
  async create(tx: Tx, actor: Actor, input: { kind: LeadKind; name: string; secret?: string; programId?: string | null; campaignId?: string | null }) {
    const [dup] = await tx.select({ id: leadConnectors.id }).from(leadConnectors).where(eq(leadConnectors.name, input.name));
    if (dup) throw new ConflictException('A connector with this name exists');
    const secret = input.secret?.trim() || randomBytes(24).toString('hex');
    const [row] = await tx.insert(leadConnectors).values({ tenantId: actor.tenantId, kind: input.kind, name: input.name, secret, programId: input.programId ?? null, campaignId: input.campaignId ?? null, createdBy: actor.userId }).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.lead_connector_created.v1', subjectType: 'lead_connector', subjectId: row.id, data: { kind: row.kind } });
    return { ...this.publicView(row), secret };
  }

  async update(tx: Tx, actor: Actor, id: string, patch: { active?: boolean; programId?: string | null; campaignId?: string | null; rotateSecret?: boolean }) {
    const { rotateSecret, ...rest } = patch;
    const secret = rotateSecret ? randomBytes(24).toString('hex') : undefined;
    const [row] = await tx.update(leadConnectors).set({ ...rest, ...(secret ? { secret } : {}) }).where(eq(leadConnectors.id, id)).returning();
    if (!row) throw new NotFoundException('Connector not found');
    await audit(tx, { ...auditActor(actor), action: 'admissions.lead_connector_updated.v1', subjectType: 'lead_connector', subjectId: id, data: { fields: Object.keys(rest), rotated: !!secret } });
    return secret ? { ...this.publicView(row), secret } : this.publicView(row);
  }

  async connector(tx: Tx, id: string) {
    const [c] = await tx.select().from(leadConnectors).where(eq(leadConnectors.id, id));
    return c ?? null;
  }

  /** Checks the caller against the connector's secret in the way its platform proves itself. */
  authorised(c: { kind: string; secret: string }, rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): boolean {
    const h = (n: string) => (typeof headers[n] === 'string' ? (headers[n] as string) : undefined);
    if (c.kind === 'meta') return !!rawBody && metaSignatureOk(c.secret, rawBody, h('x-hub-signature-256'));
    if (c.kind === 'google') return typeof body.google_key === 'string' && safeEq(body.google_key, c.secret);
    const key = h('x-lead-key');
    return !!key && safeEq(key, c.secret);
  }

  /**
   * Takes one lead from a connector and files it as an enquiry (the same duplicate rule as the public form: the same phone and
   * programme is one enquiry). Every call is logged in lead_events; a repeated external id is reported as a duplicate and does nothing.
   */
  async ingest(tx: Tx, c: typeof leadConnectors.$inferSelect, body: Record<string, unknown>, today: string) {
    const read = c.kind === 'meta' ? readMetaLead(body) : c.kind === 'google' ? readGoogleLead(body) : readWebsiteLead(body);
    const log = async (externalId: string, status: string, enquiryId: string | null, error: string | null) => {
      await tx.insert(leadEvents).values({ tenantId: c.tenantId, connectorId: c.id, externalId, payload: body, enquiryId, status, error }).onConflictDoNothing();
    };
    if ('error' in read) {
      await log(randomUUID(), 'rejected', null, read.error);
      return { status: 'rejected' as const, error: read.error };
    }
    const [seen] = await tx.select({ id: leadEvents.id, enquiryId: leadEvents.enquiryId }).from(leadEvents).where(and(eq(leadEvents.connectorId, c.id), eq(leadEvents.externalId, read.externalId)));
    if (seen) return { status: 'duplicate' as const, enquiryId: seen.enquiryId };
    const phone = normalizePhone(read.phone);
    if (read.name.length < 2 || !/^\+\d{8,15}$/.test(phone)) {
      await log(read.externalId, 'rejected', null, 'A name and a phone number are needed');
      return { status: 'rejected' as const, error: 'A name and a phone number are needed' };
    }
    const channel = c.kind;
    const res = await this.enquiries.create(
      tx,
      { tenantId: c.tenantId, userId: null },
      { name: read.name, phone, email: read.email, programId: c.programId, source: c.kind === 'website' ? 'web' : 'campaign', message: read.message, campaignId: c.campaignId, utmSource: channel, utmMedium: c.kind === 'website' ? 'form' : 'lead_ad', utmCampaign: read.utmCampaign },
      today,
    );
    await log(read.externalId, res.duplicate ? 'duplicate' : 'ok', res.enquiry.id, null);
    return { status: res.duplicate ? ('duplicate' as const) : ('ok' as const), enquiryId: res.enquiry.id };
  }

  // ---- spend and ROI --------------------------------------------------------------------------------

  async addSpend(tx: Tx, actor: Actor, rows: { channel: string; day: string; spendPaise: number; impressions?: number; clicks?: number }[]) {
    for (const r of rows) {
      const channel = r.channel.trim().toLowerCase();
      await tx
        .insert(leadSpend)
        .values({ tenantId: actor.tenantId, channel, day: r.day, spendPaise: r.spendPaise, impressions: r.impressions ?? 0, clicks: r.clicks ?? 0 })
        .onConflictDoUpdate({ target: [leadSpend.tenantId, leadSpend.channel, leadSpend.day], set: { spendPaise: r.spendPaise, impressions: r.impressions ?? 0, clicks: r.clicks ?? 0 } });
    }
    await audit(tx, { ...auditActor(actor), action: 'admissions.lead_spend_recorded.v1', subjectType: 'lead_spend', subjectId: actor.tenantId, data: { rows: rows.length } });
    return { saved: rows.length };
  }

  /**
   * Source ROI: per channel (the enquiry's utm source, else how it arrived) the leads, applications, enrolments, ad spend, cost per lead
   * and per enrolment, and, when a revenue per enrolment is given, the return. Agent commissions count as the cost of the `referral` channel.
   */
  async roi(tx: Tx, range: { from?: string; to?: string; revenuePerEnrolmentPaise?: number }) {
    const ec: (SQL | undefined)[] = [range.from ? gte(enquiries.createdAt, new Date(`${range.from}T00:00:00Z`)) : undefined, range.to ? lte(enquiries.createdAt, new Date(`${range.to}T23:59:59Z`)) : undefined];
    const chan = sql<string>`lower(coalesce(${enquiries.utmSource}, ${enquiries.source}::text))`;
    const leads = await tx
      .select({
        channel: chan,
        leads: sql<number>`count(*)::int`,
        applied: sql<number>`count(*) filter (where ${enquiries.applicationId} is not null or ${enquiries.stage} in ('applied', 'converted'))::int`,
        enrolled: sql<number>`count(*) filter (where ${enquiries.stage} = 'converted')::int`,
        lost: sql<number>`count(*) filter (where ${enquiries.stage} = 'lost')::int`,
      })
      .from(enquiries)
      .where(and(...ec))
      .groupBy(chan);
    const sc: (SQL | undefined)[] = [range.from ? gte(leadSpend.day, range.from) : undefined, range.to ? lte(leadSpend.day, range.to) : undefined];
    const spend = await tx
      .select({ channel: leadSpend.channel, spend: sql<number>`coalesce(sum(${leadSpend.spendPaise}), 0)::bigint`, impressions: sql<number>`coalesce(sum(${leadSpend.impressions}), 0)::bigint`, clicks: sql<number>`coalesce(sum(${leadSpend.clicks}), 0)::bigint` })
      .from(leadSpend)
      .where(and(...sc))
      .groupBy(leadSpend.channel);
    const [com] = await tx
      .select({ total: sql<number>`coalesce(sum(${agentCommissions.amountPaise}), 0)::bigint` })
      .from(agentCommissions)
      .where(and(range.from ? gte(agentCommissions.createdAt, new Date(`${range.from}T00:00:00Z`)) : undefined, range.to ? lte(agentCommissions.createdAt, new Date(`${range.to}T23:59:59Z`)) : undefined));
    const channels = new Set([...leads.map((l) => l.channel), ...spend.map((s) => s.channel)]);
    if (Number(com?.total ?? 0) > 0) channels.add('referral');
    const rev = range.revenuePerEnrolmentPaise ?? 0;
    const rows = [...channels].sort().map((channel) => {
      const l = leads.find((x) => x.channel === channel);
      const s = spend.find((x) => x.channel === channel);
      const spendPaise = Number(s?.spend ?? 0) + (channel === 'referral' ? Number(com?.total ?? 0) : 0);
      const n = l?.leads ?? 0;
      const enrolled = l?.enrolled ?? 0;
      const revenuePaise = enrolled * rev;
      return {
        channel,
        leads: n,
        applied: l?.applied ?? 0,
        enrolled,
        lost: l?.lost ?? 0,
        conversionPct: n ? Math.round((enrolled / n) * 1000) / 10 : 0,
        impressions: Number(s?.impressions ?? 0),
        clicks: Number(s?.clicks ?? 0),
        spendPaise,
        costPerLeadPaise: n && spendPaise ? Math.round(spendPaise / n) : null,
        costPerEnrolmentPaise: enrolled && spendPaise ? Math.round(spendPaise / enrolled) : null,
        revenuePaise,
        roiPct: spendPaise && rev ? Math.round(((revenuePaise - spendPaise) / spendPaise) * 1000) / 10 : null,
      };
    });
    const total = rows.reduce((t, r) => ({ leads: t.leads + r.leads, applied: t.applied + r.applied, enrolled: t.enrolled + r.enrolled, spendPaise: t.spendPaise + r.spendPaise, revenuePaise: t.revenuePaise + r.revenuePaise }), { leads: 0, applied: 0, enrolled: 0, spendPaise: 0, revenuePaise: 0 });
    return { rows, total: { ...total, roiPct: total.spendPaise && rev ? Math.round(((total.revenuePaise - total.spendPaise) / total.spendPaise) * 1000) / 10 : null } };
  }

  async spendRows(tx: Tx, range: { from?: string; to?: string }) {
    return tx.select().from(leadSpend).where(and(range.from ? gte(leadSpend.day, range.from) : undefined, range.to ? lte(leadSpend.day, range.to) : undefined)).orderBy(asc(leadSpend.day), asc(leadSpend.channel));
  }
}
