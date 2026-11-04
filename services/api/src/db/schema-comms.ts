// Communication production pass (migrations 0212-0213): channel providers with DLT registration, credits, per-channel
// consent, the log of every send (cost and delivery report), provider webhooks, notice polls, event RSVPs, chat
// moderation (reports, blocks), staff do-not-disturb.
import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { announcements, calendarEvents, conversations, departments, messages, tenants, users } from './schema.js';
import { messageDeliveries } from './schema-pathways.js';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts('created_at').notNull().defaultNow();
const by = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });

/** Channels that cost money and go through an outside provider. */
export const PAID_CHANNELS = ['sms', 'whatsapp', 'email'] as const;
/** Channels a person can opt in to or out of (in-app messages are part of the service and always arrive). */
export const PREF_CHANNELS = ['sms', 'whatsapp', 'email', 'push'] as const;
export type PaidChannel = (typeof PAID_CHANNELS)[number];
export type PrefChannel = (typeof PREF_CHANNELS)[number];
/** TRAI DLT content types of a registered SMS template. */
export const DLT_CONTENT_TYPES = ['transactional', 'service_implicit', 'service_explicit', 'promotional'] as const;

/**
 * One channel's provider and limits for an institution. Credentials stay in the environment; this holds the
 * institution's own registration: the DLT principal entity id and header (sender id), the WhatsApp phone number id,
 * the email from-address, the price per message and the hourly and daily caps.
 */
export const commChannelSettings = pgTable(
  'comm_channel_settings',
  {
    id: id(),
    tenantId: tenantId(),
    channel: text('channel').$type<PaidChannel | 'push'>().notNull(),
    provider: text('provider').notNull().default('console'),
    enabled: boolean('enabled').notNull().default(true),
    /** SMS: the DLT header (6 letters); WhatsApp: the phone number id; email: the from-address. */
    senderId: text('sender_id').notNull().default(''),
    /** TRAI DLT principal entity id (19 digits). */
    dltEntityId: text('dlt_entity_id').notNull().default(''),
    /** Price of one unit (an SMS part, a WhatsApp conversation, an email) in paise. */
    unitCostPaise: integer('unit_cost_paise').notNull().default(0),
    /** 0 = no cap. */
    hourlyLimit: integer('hourly_limit').notNull().default(0),
    dailyLimit: integer('daily_limit').notNull().default(0),
    /** Warn the office when the balance falls to this many units. */
    lowBalanceUnits: integer('low_balance_units').notNull().default(0),
    /** The secret part of the provider's delivery-report URL. */
    webhookToken: text('webhook_token').notNull().default(sql`replace(gen_random_uuid()::text, '-', '')`),
    updatedBy: by('updated_by'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('comm_channel_settings_uq').on(t.tenantId, t.channel)],
);

/** Credits per channel: top-ups add units, each accepted send takes its units off. The balance is the sum. */
export const commCreditLedger = pgTable(
  'comm_credit_ledger',
  {
    id: id(),
    tenantId: tenantId(),
    channel: text('channel').$type<PaidChannel>().notNull(),
    /** topup | spend | refund | adjust */
    kind: text('kind').$type<'topup' | 'spend' | 'refund' | 'adjust'>().notNull(),
    units: integer('units').notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull().default(0),
    note: text('note').notNull().default(''),
    /** A top-up's invoice or payment reference. */
    reference: text('reference').notNull().default(''),
    sendId: uuid('send_id'),
    createdBy: by('created_by'),
    createdAt: createdAt(),
  },
  (t) => [index('comm_credit_ledger_channel_idx').on(t.tenantId, t.channel, t.createdAt)],
);

/** A person's choice for a channel under the DPDP Act, append-only: the latest row is the choice in force. */
export const commChannelPrefs = pgTable(
  'comm_channel_prefs',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').$type<PrefChannel>().notNull(),
    granted: boolean('granted').notNull(),
    /** app | erp (recorded by the office from a signed form) | reply_stop (the person replied STOP) | import */
    source: text('source').$type<'app' | 'erp' | 'reply_stop' | 'import'>().notNull().default('app'),
    noticeVersion: text('notice_version').notNull().default(''),
    recordedBy: by('recorded_by'),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('comm_channel_prefs_user_idx').on(t.userId, t.channel, t.createdAt)],
);

export type SendStatus = 'accepted' | 'delivered' | 'read' | 'failed' | 'bounced' | 'suppressed' | 'deferred';

/** Every hand-over to a channel (and every hold-back), with its cost and the provider's delivery report: the send audit trail. */
export const commSendLog = pgTable(
  'comm_send_log',
  {
    id: id(),
    tenantId: tenantId(),
    /** campaign | announcement */
    sourceType: text('source_type').$type<'campaign' | 'announcement'>().notNull(),
    sourceId: uuid('source_id').notNull(),
    deliveryId: uuid('delivery_id').references(() => messageDeliveries.id, { onDelete: 'set null' }),
    userId: by('user_id'),
    channel: text('channel').notNull(),
    provider: text('provider').notNull().default(''),
    /** Masked: +91******3210, r***@example.com. */
    address: text('address').notNull().default(''),
    status: text('status').$type<SendStatus>().notNull(),
    providerMessageId: text('provider_message_id'),
    units: integer('units').notNull().default(0),
    costPaise: integer('cost_paise').notNull().default(0),
    error: text('error'),
    /** The sender's department, for cost by department. */
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    sentBy: by('sent_by'),
    emergency: boolean('emergency').notNull().default(false),
    /** Position in the fallback chain (0 = the first channel). */
    step: smallint('step').notNull().default(0),
    attemptedAt: ts('attempted_at').notNull().defaultNow(),
    statusAt: ts('status_at').notNull().defaultNow(),
  },
  (t) => [index('comm_send_log_time_idx').on(t.tenantId, t.attemptedAt), index('comm_send_log_source_idx').on(t.sourceType, t.sourceId)],
);

/** Provider callbacks already applied, so a repeated delivery report or bounce changes nothing. */
export const commWebhookEvents = pgTable(
  'comm_webhook_events',
  {
    id: id(),
    tenantId: tenantId(),
    provider: text('provider').notNull(),
    eventKey: text('event_key').notNull(),
    kind: text('kind').notNull().default(''),
    receivedAt: ts('received_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('comm_webhook_events_uq').on(t.tenantId, t.provider, t.eventKey)],
);

/** One answer per person to the quick poll on a notice (changeable until the poll closes). */
export const announcementPollVotes = pgTable(
  'announcement_poll_votes',
  {
    id: id(),
    tenantId: tenantId(),
    announcementId: uuid('announcement_id').notNull().references(() => announcements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    option: smallint('option').notNull(),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('announcement_poll_votes_uq').on(t.announcementId, t.userId)],
);

export type RsvpResponse = 'going' | 'maybe' | 'not_going';

/** A person's reply to a calendar event that asks for RSVPs, with how many others they bring. */
export const calendarEventRsvps = pgTable(
  'calendar_event_rsvps',
  {
    id: id(),
    tenantId: tenantId(),
    eventId: uuid('event_id').notNull().references(() => calendarEvents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    response: text('response').$type<RsvpResponse>().notNull(),
    guests: smallint('guests').notNull().default(0),
    note: text('note').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('calendar_event_rsvps_uq').on(t.eventId, t.userId)],
);

export const REPORT_REASONS = ['abusive', 'harassment', 'spam', 'inappropriate', 'privacy', 'other'] as const;

/** A chat message someone reported, or that the language filter flagged; leaders act on it. */
export const messageReports = pgTable(
  'message_reports',
  {
    id: id(),
    tenantId: tenantId(),
    messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    /** Null when the language filter raised it. */
    reportedBy: by('reported_by'),
    reason: text('reason').$type<(typeof REPORT_REASONS)[number] | 'filter'>().notNull(),
    note: text('note').notNull().default(''),
    status: text('status').$type<'open' | 'actioned' | 'dismissed'>().notNull().default('open'),
    /** hide | block | warn | dismiss */
    action: text('action'),
    resolvedBy: by('resolved_by'),
    resolvedAt: ts('resolved_at'),
    resolutionNote: text('resolution_note').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('message_reports_status_idx').on(t.tenantId, t.status, t.createdAt), uniqueIndex('message_reports_once_uq').on(t.messageId, t.reportedBy)],
);

/** Someone stopped from writing in chat: everywhere (set by a leader) or to one member of staff (`staffId`). */
export const chatBlocks = pgTable(
  'chat_blocks',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    blockedBy: by('blocked_by'),
    staffId: uuid('staff_id').references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    until: ts('until'),
    liftedAt: ts('lifted_at'),
    liftedBy: by('lifted_by'),
    createdAt: createdAt(),
  },
  (t) => [index('chat_blocks_user_idx').on(t.userId)],
);

/** A member of staff's own chat hours and do-not-disturb: families are told when to expect a reply and no push goes out. */
export const chatAvailability = pgTable(
  'chat_availability',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    dndUntil: ts('dnd_until'),
    hours: jsonb('hours').$type<{ start: string; end: string; days: number[] } | null>(),
    awayNote: text('away_note').notNull().default(''),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('chat_availability_user_uq').on(t.userId)],
);
