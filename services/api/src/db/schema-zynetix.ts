// Zynetix board edition (migration 0139): topic materials beyond videos and edge telemetry.
import { sql } from 'drizzle-orm';
import { index, integer, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { devices, language, tenants, topics, users } from './schema.js';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const MATERIAL_KINDS = ['pdf', 'book', 'syllabus', 'link', 'animation', 'model3d', 'sim'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export const AUDIENCES = ['board', 'teacher', 'student', 'parent'] as const;
export type Audience = (typeof AUDIENCES)[number];

/**
 * What a topic is taught with besides videos: PDFs, a book's chapter or page range, syllabus
 * documents, links, the board's built-in animations (kinetix_animations ids), 3D models and sims.
 * Platform rows (tenant null) are the global library, written by the platform team as the owner;
 * institution rows are the institution's own (an admin's are approved at once, a teacher's wait
 * for an admin). `audience` says which apps show it.
 */
export const topicMaterials = pgTable(
  'topic_materials',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: text('scope').$type<'platform' | 'institution'>().notNull().default('institution'),
    topicId: uuid('topic_id').notNull().references(() => topics.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<MaterialKind>().notNull(),
    title: text('title').notNull(),
    /** A web link or stored file URL (pdf, book, syllabus, link, sim). */
    url: text('url'),
    /** A catalogue key: an animation id, a 3D model id or a sim id. */
    ref: text('ref'),
    author: text('author'),
    bookChapter: text('book_chapter'),
    pageFrom: integer('page_from'),
    pageTo: integer('page_to'),
    language: language('language').notNull().default('en'),
    audience: text('audience').array().$type<Audience[]>().notNull().default(sql`'{board,teacher,student,parent}'::text[]`),
    status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('approved'),
    reviewReason: text('review_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    position: integer('position').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('topic_materials_topic_idx').on(t.topicId, t.position), index('topic_materials_tenant_idx').on(t.tenantId, t.status)],
);

/** One compute sample from a board or edge box's health report (CPU/GPU/NPU/RAM, temperatures, AI inferences since the last report). */
export const deviceTelemetry = pgTable(
  'device_telemetry',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    cpuPct: real('cpu_pct'),
    gpuPct: real('gpu_pct'),
    npuPct: real('npu_pct'),
    ramPct: real('ram_pct'),
    diskPct: real('disk_pct'),
    cpuTempC: real('cpu_temp_c'),
    gpuTempC: real('gpu_temp_c'),
    aiInferences: integer('ai_inferences').notNull().default(0),
    aiInferenceMs: integer('ai_inference_ms').notNull().default(0),
    appVersion: text('app_version'),
  },
  (t) => [index('device_telemetry_device_at_idx').on(t.tenantId, t.deviceId, t.at)],
);
