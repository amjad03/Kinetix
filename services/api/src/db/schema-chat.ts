// Staff chat (migration 0134): direct, group and external (email / WhatsApp) threads.
import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';

const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const chatThreads = pgTable('chat_threads', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: tenantId(),
  /** direct | group | external */
  kind: text('kind').notNull(),
  title: text('title').notNull().default(''),
  description: text('description').notNull().default(''),
  /** External threads: email | whatsapp. */
  channel: text('channel'),
  contactName: text('contact_name'),
  contactAddress: text('contact_address'),
  /** parent | vendor | university | other */
  contactKind: text('contact_kind'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastMessageAt: ts('last_message_at'),
  /** Group chats for a class or club (migration 0176): section | club and its id; members follow its roster. */
  linkedKind: text('linked_kind'),
  linkedId: uuid('linked_id'),
  /** all | admins: who may post. */
  postPolicy: text('post_policy').notNull().default('all'),
  /** No push notifications between these local times (HH:MM). */
  quietStart: text('quiet_start'),
  quietEnd: text('quiet_end'),
});

export const chatMembers = pgTable(
  'chat_members',
  {
    threadId: uuid('thread_id').notNull().references(() => chatThreads.id, { onDelete: 'cascade' }),
    tenantId: tenantId(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    pinned: boolean('pinned').notNull().default(false),
    lastReadAt: ts('last_read_at'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: tenantId(),
  threadId: uuid('thread_id').notNull().references(() => chatThreads.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  /** internal | outbound (to the external contact) | inbound (from them) */
  direction: text('direction').notNull().default('internal'),
  body: text('body').notNull().default(''),
  externalFrom: text('external_from'),
  /** Outbound: sent | queued (channel not connected) | failed */
  delivery: text('delivery'),
  attachmentKey: text('attachment_key'),
  attachmentName: text('attachment_name'),
  attachmentType: text('attachment_type'),
  attachmentSize: integer('attachment_size'),
  createdAt: ts('created_at').notNull().defaultNow(),
});
