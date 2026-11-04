import { Injectable, OnModuleInit } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { BROADCAST_ROLES, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { departments, users } from '../db/schema.js';
import { commChannelPrefs, commCreditLedger, commSendLog } from '../db/schema-comms.js';
import { RecordRegistry, type FieldOption, type RecordEntity } from '../records/entity.js';
import { CREDIT_ROLES } from './comms-admin.controller.js';

const choices = (m: Record<string, string>): FieldOption[] => Object.entries(m).map(([value, label]) => ({ value, label }));
export const SEND_CHANNELS = choices({ in_app: 'In the app', sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email' });
export const SEND_STATUSES = choices({ accepted: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed', bounced: 'Bounced', suppressed: 'Held back', deferred: 'Waiting' });
export const LEDGER_KINDS = choices({ topup: 'Top-up', spend: 'Spent', refund: 'Refund', adjust: 'Correction' });
export const PREF_SOURCES = choices({ app: 'In the app', erp: 'Recorded by the office', reply_stop: 'By reply', import: 'Imported' });
const PREF_CHANNEL_CHOICES = choices({ sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', push: 'Phone alerts' });
const labelOf = (opts: FieldOption[], v: unknown) => opts.find((o) => o.value === v)?.label ?? String(v ?? '');
const when = (v: unknown) => (v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 16) : String(v ?? ''));
const rupees = (paise: unknown) => (Number(paise ?? 0) / 100).toFixed(2);
const hodOnly = (p: UserPrincipal) => p.roles.includes('hod') && !p.roles.some((r) => STAFF_ADMIN_ROLES.includes(r) || r === 'accountant');

/** Every send and hold-back with its cost (read-only: the audit trail of communication; the retention rule clears it). */
export function sendLogEntity(): RecordEntity {
  return {
    key: 'comm-send-log',
    module: 'communication',
    table: commSendLog,
    subjectType: 'comm_send',
    roles: { read: [...BROADCAST_ROLES, 'accountant'], write: STAFF_ADMIN_ROLES },
    label: (r) => `${r.recipient ?? ''} · ${r.channel}`,
    list: {
      select: {
        id: commSendLog.id,
        attemptedAt: commSendLog.attemptedAt,
        title: sql<string | null>`coalesce((select c.title from message_campaigns c where c.id = ${commSendLog.sourceId}), (select a.title from announcements a where a.id = ${commSendLog.sourceId}))`,
        recipient: users.fullName,
        channel: commSendLog.channel,
        provider: commSendLog.provider,
        address: commSendLog.address,
        status: commSendLog.status,
        step: commSendLog.step,
        units: commSendLog.units,
        costPaise: commSendLog.costPaise,
        cost: sql<number>`${commSendLog.costPaise} / 100.0`,
        error: commSendLog.error,
        emergency: commSendLog.emergency,
        department: departments.name,
        statusAt: commSendLog.statusAt,
      },
      joins: (q) => q.leftJoin(users, eq(users.id, commSendLog.userId)).leftJoin(departments, eq(departments.id, commSendLog.departmentId)),
      search: [users.fullName, commSendLog.address, commSendLog.error],
      filters: {
        channel: { label: 'Channel', options: SEND_CHANNELS, where: (v) => eq(commSendLog.channel, v) },
        status: { label: 'Status', options: SEND_STATUSES, where: (v) => eq(commSendLog.status, v as 'accepted') },
        emergency: { label: 'Emergency', options: choices({ yes: 'Emergency only' }), where: (v) => (v === 'yes' ? eq(commSendLog.emergency, true) : undefined) },
        // One campaign's or notice's sends (from its detail).
        source: { label: 'Message', where: (v) => (/^[0-9a-f-]{36}$/i.test(v) ? eq(commSendLog.sourceId, v) : undefined) },
      },
      sorts: { attempted: commSendLog.attemptedAt, recipient: users.fullName, cost: commSendLog.costPaise, status: commSendLog.status },
      defaultSort: { id: 'attempted', dir: 'desc' },
      // A head of department sees the sends of their department.
      scope: (ctx) => (hodOnly(ctx.p) ? sql`${commSendLog.departmentId} in (select id from departments where head_user_id = ${ctx.p.userId}::uuid)` : undefined),
    },
    columns: [
      { key: 'attemptedAt', header: 'When', value: (r) => when(r.attemptedAt) },
      { key: 'title', header: 'Message' },
      { key: 'recipient', header: 'To' },
      { key: 'address', header: 'Address' },
      { key: 'channel', header: 'Channel', value: (r) => labelOf(SEND_CHANNELS, r.channel) },
      { key: 'provider', header: 'Provider' },
      { key: 'status', header: 'Status', value: (r) => labelOf(SEND_STATUSES, r.status) },
      { key: 'step', header: 'Fallback step', value: (r) => Number(r.step) + 1 },
      { key: 'units', header: 'Units' },
      { key: 'costPaise', header: 'Cost (₹)', value: (r) => rupees(r.costPaise) },
      { key: 'department', header: 'Department' },
      { key: 'error', header: 'Reason' },
      { key: 'emergency', header: 'Emergency', value: (r) => (r.emergency ? 'Yes' : '') },
    ],
    remove: { guard: async () => 'The send log is the record of what was sent; the retention rule clears old entries' },
  };
}

/** Top-ups, spends and corrections of message credits (read-only: top up from Communication > Channels). */
export function creditLedgerEntity(): RecordEntity {
  return {
    key: 'comm-credit-ledger',
    module: 'communication',
    table: commCreditLedger,
    subjectType: 'comm_credit',
    roles: { read: CREDIT_ROLES, write: CREDIT_ROLES },
    label: (r) => `${labelOf(LEDGER_KINDS, r.kind)} ${r.units}`,
    list: {
      select: { id: commCreditLedger.id, createdAt: commCreditLedger.createdAt, channel: commCreditLedger.channel, kind: commCreditLedger.kind, units: commCreditLedger.units, amountPaise: commCreditLedger.amountPaise, amount: sql<number>`${commCreditLedger.amountPaise} / 100.0`, reference: commCreditLedger.reference, note: commCreditLedger.note, by: users.fullName },
      joins: (q) => q.leftJoin(users, eq(users.id, commCreditLedger.createdBy)),
      search: [commCreditLedger.reference, commCreditLedger.note, users.fullName],
      filters: {
        channel: { label: 'Channel', options: SEND_CHANNELS.filter((c) => c.value !== 'in_app'), where: (v) => eq(commCreditLedger.channel, v as 'sms') },
        kind: { label: 'Entry', options: LEDGER_KINDS, where: (v) => eq(commCreditLedger.kind, v as 'topup') },
      },
      sorts: { created: commCreditLedger.createdAt, units: commCreditLedger.units, amount: commCreditLedger.amountPaise },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    columns: [
      { key: 'createdAt', header: 'When', value: (r) => when(r.createdAt) },
      { key: 'channel', header: 'Channel', value: (r) => labelOf(SEND_CHANNELS, r.channel) },
      { key: 'kind', header: 'Entry', value: (r) => labelOf(LEDGER_KINDS, r.kind) },
      { key: 'units', header: 'Messages' },
      { key: 'amountPaise', header: 'Amount (₹)', value: (r) => rupees(r.amountPaise) },
      { key: 'reference', header: 'Reference' },
      { key: 'note', header: 'Note' },
      { key: 'by', header: 'By' },
    ],
    remove: { guard: async () => 'Credit entries are kept; correct the balance with a new entry' },
  };
}

/** Every consent choice per channel, newest first (append-only under the DPDP Act). */
export function channelPrefsEntity(): RecordEntity {
  return {
    key: 'comm-channel-prefs',
    module: 'communication',
    table: commChannelPrefs,
    subjectType: 'comm_channel_pref',
    roles: { read: STAFF_ADMIN_ROLES, write: STAFF_ADMIN_ROLES },
    label: (r) => `${r.person} · ${r.channel}`,
    list: {
      select: { id: commChannelPrefs.id, createdAt: commChannelPrefs.createdAt, person: users.fullName, channel: commChannelPrefs.channel, granted: commChannelPrefs.granted, source: commChannelPrefs.source, noticeVersion: commChannelPrefs.noticeVersion, note: commChannelPrefs.note },
      joins: (q) => q.innerJoin(users, eq(users.id, commChannelPrefs.userId)),
      search: [users.fullName, commChannelPrefs.note],
      filters: {
        channel: { label: 'Channel', options: PREF_CHANNEL_CHOICES, where: (v) => eq(commChannelPrefs.channel, v as 'sms') },
        granted: { label: 'Choice', options: choices({ yes: 'Opted in', no: 'Opted out' }), where: (v) => (v === 'yes' || v === 'no' ? eq(commChannelPrefs.granted, v === 'yes') : undefined) },
        source: { label: 'How', options: PREF_SOURCES, where: (v) => eq(commChannelPrefs.source, v as 'app') },
      },
      sorts: { created: commChannelPrefs.createdAt, person: users.fullName },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    columns: [
      { key: 'createdAt', header: 'When', value: (r) => when(r.createdAt) },
      { key: 'person', header: 'Person' },
      { key: 'channel', header: 'Channel', value: (r) => labelOf(PREF_CHANNEL_CHOICES, r.channel) },
      { key: 'granted', header: 'Choice', value: (r) => (r.granted ? 'Opted in' : 'Opted out') },
      { key: 'source', header: 'How', value: (r) => labelOf(PREF_SOURCES, r.source) },
      { key: 'noticeVersion', header: 'Privacy notice' },
      { key: 'note', header: 'Note' },
    ],
    remove: { guard: async () => 'Consent records are kept as proof of the choice; record a new choice instead' },
  };
}

@Injectable()
export class CommsPassRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(sendLogEntity());
    this.registry.register(creditLedgerEntity());
    this.registry.register(channelPrefsEntity());
  }
}
