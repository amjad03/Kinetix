import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { BROADCAST_ROLES } from '../auth/auth.decorators.js';
import { users } from '../db/schema.js';
import { contactSuppressions } from '../db/schema-life.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { Text } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { insertRecord } from '../campus-life/kit-shared.js';

const choices = (m: Record<string, string>): FieldOption[] => Object.entries(m).map(([value, label]) => ({ value, label }));
export const SUPPRESS_CHANNELS = choices({ sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', all: 'Every channel' });
export const SUPPRESS_REASONS = choices({ dnd: 'On DND', bounced: 'Email bounced', opted_out: 'Opted out', invalid: 'Wrong number or address' });
const pick = (opts: FieldOption[]) => z.enum(opts.map((o) => o.value) as [string, ...string[]]);
const labelOf = (opts: FieldOption[], v: unknown) => opts.find((o) => o.value === v)?.label ?? String(v ?? '');

/** An address in the form it is compared in: emails lower case, phones as their last ten digits. */
export function normaliseAddress(channel: string, address: string): string {
  const a = address.trim();
  if (channel === 'email' || a.includes('@')) return a.toLowerCase();
  const digits = a.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : a;
}

/** The person an address belongs to, when one of the institution's users has it. */
async function ownerOf(ctx: KitCtx, address: string): Promise<string | null> {
  const a = normaliseAddress('', address);
  const [u] = await ctx.tx
    .select({ id: users.id })
    .from(users)
    .where(a.includes('@') ? sql`lower(${users.email}) = ${a}` : sql`right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10) = ${a}`)
    .limit(1);
  return u?.id ?? null;
}

/** Numbers and addresses messages must not go to: on DND, bounced, opted out or wrong. Campaigns skip them. */
export function suppressionsEntity(): RecordEntity {
  return {
    key: 'contact-suppressions',
    module: 'communication',
    table: contactSuppressions,
    subjectType: 'contact_suppression',
    roles: { read: [...BROADCAST_ROLES, 'admissions_officer'], write: [...BROADCAST_ROLES, 'admissions_officer'] },
    label: (r) => String(r.address),
    list: {
      select: { id: contactSuppressions.id, channel: contactSuppressions.channel, address: contactSuppressions.address, reason: contactSuppressions.reason, note: contactSuppressions.note, userId: contactSuppressions.userId, personName: users.fullName, createdAt: contactSuppressions.createdAt },
      joins: (q) => q.leftJoin(users, eq(users.id, contactSuppressions.userId)),
      search: [contactSuppressions.address, users.fullName, contactSuppressions.note],
      filters: {
        channel: { label: 'Channel', options: SUPPRESS_CHANNELS, where: (v) => eq(contactSuppressions.channel, v as 'sms') },
        reason: { label: 'Reason', options: SUPPRESS_REASONS, where: (v) => eq(contactSuppressions.reason, v as 'dnd') },
      },
      sorts: { created: contactSuppressions.createdAt, address: contactSuppressions.address, person: users.fullName },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    fields: {
      channel: { label: 'Channel', type: 'select', schema: pick(SUPPRESS_CHANNELS), column: contactSuppressions.channel, options: SUPPRESS_CHANNELS, required: true, bulk: true },
      address: { label: 'Number or email', type: 'text', schema: Text(200), column: contactSuppressions.address, required: true },
      reason: { label: 'Reason', type: 'select', schema: pick(SUPPRESS_REASONS), column: contactSuppressions.reason, options: SUPPRESS_REASONS, required: true, bulk: true },
      note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: contactSuppressions.note },
    },
    create: async (ctx, v) => {
      const address = normaliseAddress(String(v.channel), String(v.address));
      if (v.channel === 'email' && !address.includes('@')) throw new BadRequestException('Enter an email address');
      if (v.channel !== 'email' && v.channel !== 'all' && !/^\d{10}$/.test(address)) throw new BadRequestException('Enter a 10-digit mobile number');
      return insertRecord(ctx, contactSuppressions, { ...v, address, userId: await ownerOf(ctx, address) });
    },
    columns: [
      { key: 'address', header: 'Number or email' },
      { key: 'personName', header: 'Person' },
      { key: 'channel', header: 'Channel', value: (r) => labelOf(SUPPRESS_CHANNELS, r.channel) },
      { key: 'reason', header: 'Reason', value: (r) => labelOf(SUPPRESS_REASONS, r.reason) },
      { key: 'note', header: 'Note' },
      { key: 'createdAt', header: 'Added on', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt ?? '')) },
    ],
    import: {
      columns: [
        { key: 'address', header: 'Number or email', required: true, example: '9845012345' },
        { key: 'channel', header: 'Channel', required: true, options: SUPPRESS_CHANNELS.map((o) => o.value), example: 'sms' },
        { key: 'reason', header: 'Reason', required: true, options: SUPPRESS_REASONS.map((o) => o.value), example: 'dnd' },
        { key: 'note', header: 'Note' },
      ],
      key: ['address', 'channel'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: contactSuppressions.id }).from(contactSuppressions).where(and(eq(contactSuppressions.channel, lc(r.get('channel')) as 'sms'), sql`lower(${contactSuppressions.address}) = ${normaliseAddress(lc(r.get('channel')), r.get('address'))}`)))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const channel = lc(required(r, 'channel'));
          if (!SUPPRESS_CHANNELS.some((c) => c.value === channel)) fail('Use sms, whatsapp, email or all', channel);
          const reason = lc(required(r, 'reason'));
          if (!SUPPRESS_REASONS.some((c) => c.value === reason)) fail('Use dnd, bounced, opted_out or invalid', reason);
          const address = normaliseAddress(channel, required(r, 'address'));
          const [hit] = await tx.select({ id: contactSuppressions.id }).from(contactSuppressions).where(and(eq(contactSuppressions.channel, channel as 'sms'), sql`lower(${contactSuppressions.address}) = ${address}`));
          if (hit) {
            await tx.update(contactSuppressions).set({ reason: reason as 'dnd', note: r.get('note') }).where(eq(contactSuppressions.id, hit.id));
            return outcome(false, true, [address]);
          }
          await tx.insert(contactSuppressions).values({ tenantId: ctx.p.tenantId, channel: channel as 'sms', address, reason: reason as 'dnd', note: r.get('note'), userId: await ownerOf({ tx, p: ctx.p }, address), createdBy: ctx.p.userId });
          return outcome(true, false, [address]);
        }),
    },
  };
}

@Injectable()
export class CommsRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(suppressionsEntity());
  }
}
