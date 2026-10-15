import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { RoleName } from '../auth/principal.js';
import { courses } from '../db/schema.js';
import { accessDevices, apiTokens, dlDocuments, ltiTools, scormPackages } from '../db/schema-integrations.js';
import { qualified } from '../campus-life/kit-shared.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { choices, kitEntity, rowOf } from '../research/kit.js';
import { INTEGRATION_ADMIN } from './common.js';
import { pushDigilockerDocument } from './digilocker.controller.js';

const ADMIN = [...INTEGRATION_ADMIN] as RoleName[];
/** Who registers devices (devices.controller.ts ADMIN). */
const DEVICE_ADMIN: RoleName[] = [...ADMIN, 'hr_manager', 'librarian', 'transport_manager'];
/** Who prepares and pushes DigiLocker documents. */
const DL_ROLES: RoleName[] = [...ADMIN, 'exam_controller'];
/** Who uploads and removes SCORM packages (scorm.controller.ts AUTHORS). */
const SCORM_AUTHORS: RoleName[] = ['teacher', 'hod', 'principal', 'tenant_admin'];

const courseOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: courses.id, title: courses.title }).from(courses).orderBy(asc(courses.title))).map((c) => ({ value: c.id, label: c.title }));
const ist = (col: unknown) => sql<string | null>`to_char(${col} at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')`;

/**
 * The integrations an administrator looks after, as record kit lists: LTI tools (added and edited here), attendance
 * and RFID devices (registered from the page, which shows the device key once; renamed, moved or switched off here),
 * SCORM packages (uploaded in a course), DigiLocker documents (prepared from results; pushed here) and API tokens
 * (created from the page, which shows the token once; revoked here).
 */
@Injectable()
export class IntegrationsRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    for (const e of [ltiToolsEntity(), devicesEntity(), scormEntity(), digilockerEntity(), tokensEntity()]) this.registry.register(e);
  }
}

export function ltiToolsEntity(): RecordEntity {
  const e = kitEntity({
    key: 'lti-tools',
    module: 'integrations',
    table: ltiTools,
    subjectType: 'lti_tool',
    roles: { read: ADMIN, write: ADMIN },
    title: 'name',
    fields: {
      name: { label: 'Name', kind: 'text', column: ltiTools.name, required: true, max: 100, example: 'Turnitin' },
      clientId: { label: 'Client ID', kind: 'text', column: ltiTools.clientId, required: true, max: 120, example: 'zynetix-turnitin' },
      loginUrl: { label: 'Login address', kind: 'text', column: ltiTools.loginUrl, required: true, max: 500, example: 'https://tool.example.com/lti/login' },
      launchUrl: { label: 'Launch address', kind: 'text', column: ltiTools.launchUrl, required: true, max: 500, example: 'https://tool.example.com/lti/launch' },
      jwksUrl: { label: 'Key set address', kind: 'text', column: ltiTools.jwksUrl, max: 500 },
      deploymentId: { label: 'Deployment ID', kind: 'text', column: ltiTools.deploymentId, required: true, max: 60, example: '1' },
      active: { label: 'In use', kind: 'boolean', column: ltiTools.active, bulk: true },
    },
    defaultSort: { id: 'name', dir: 'asc' },
    search: [ltiTools.name, ltiTools.clientId],
    importKey: ['clientId'],
    duplicate: (_ctx, row) => ({ client_id: `${String(row.client_id)}-copy` }),
  });
  e.check = async (ctx, id) => {
    const r = await rowOf(ctx, ltiTools, id);
    for (const u of [r.loginUrl, r.launchUrl, r.jwksUrl]) if (u && !/^https?:\/\/\S+$/.test(String(u))) throw new BadRequestException('Enter web addresses that start with https://');
    const [dup] = await ctx.tx.select({ id: ltiTools.id }).from(ltiTools).where(and(eq(ltiTools.clientId, String(r.clientId)), sql`${ltiTools.id} <> ${id}`));
    if (dup) throw new BadRequestException('A tool with that client id is already registered');
  };
  return e;
}

export function devicesEntity(): RecordEntity {
  const e = kitEntity({
    key: 'access-devices',
    module: 'integrations',
    table: accessDevices,
    subjectType: 'access_device',
    roles: { read: DEVICE_ADMIN, write: DEVICE_ADMIN },
    title: 'name',
    fields: {
      name: { label: 'Name', kind: 'text', column: accessDevices.name, required: true, max: 100, create: false },
      serial: { label: 'Serial number', kind: 'text', column: accessDevices.serial, required: true, max: 60, create: false, edit: false },
      kind: { label: 'Kind', kind: 'select', column: accessDevices.kind, options: choices(['biometric', 'rfid_reader'], { biometric: 'Biometric', rfid_reader: 'RFID reader' }), create: false, edit: false },
      vendor: { label: 'Make', kind: 'select', column: accessDevices.vendor, options: choices(['essl', 'zkteco', 'cosec', 'generic'], { essl: 'eSSL', zkteco: 'ZKTeco', cosec: 'COSEC', generic: 'Other' }), create: false, edit: false },
      purpose: { label: 'Used for', kind: 'select', column: accessDevices.purpose, options: choices(['attendance', 'library', 'transport', 'board_signin'], { board_signin: 'Board sign-in' }), create: false, bulk: true },
      location: { label: 'Location', kind: 'text', column: accessDevices.location, max: 120, create: false, bulk: true },
      active: { label: 'In use', kind: 'boolean', column: accessDevices.active, create: false, bulk: true },
    },
    extra: { lastSeenAt: ist(accessDevices.lastSeenAt) },
    sorts: { lastSeenAt: accessDevices.lastSeenAt },
    defaultSort: { id: 'name', dir: 'asc' },
    search: [accessDevices.name, accessDevices.serial, accessDevices.location],
    exportExtra: [{ key: 'lastSeenAt', header: 'Last seen' }],
    noImport: true,
  });
  // Location is kept as text, never null.
  e.fields!.location.schema = e.fields!.location.schema.transform((v: unknown) => (v ?? '') as string);
  return e;
}

export function scormEntity(): RecordEntity {
  return kitEntity({
    key: 'scorm-packages',
    module: 'integrations',
    table: scormPackages,
    subjectType: 'scorm_package',
    roles: { read: SCORM_AUTHORS, write: SCORM_AUTHORS },
    title: 'title',
    fields: {
      title: { label: 'Title', kind: 'text', column: scormPackages.title, required: true, max: 200, create: false },
      courseId: { label: 'Course', kind: 'ref', column: scormPackages.courseId, options: courseOptions, create: false, bulk: true, filter: true },
      version: { label: 'SCORM version', kind: 'text', column: scormPackages.version, create: false, edit: false },
    },
    extra: {
      fileCount: scormPackages.fileCount,
      course: sql<string | null>`(select c.title from courses c where c.id = ${qualified('scorm_packages', 'course_id')})`,
      attempts: sql<number>`(select count(*)::int from scorm_attempts a where a.package_id = ${qualified('scorm_packages', 'id')})`,
      createdAt: scormPackages.createdAt,
    },
    sorts: { createdAt: scormPackages.createdAt },
    defaultSort: { id: 'title', dir: 'asc' },
    exportExtra: [
      { key: 'course', header: 'Course name' },
      { key: 'fileCount', header: 'Files' },
      { key: 'attempts', header: 'Attempts' },
    ],
    noImport: true,
  });
}

export function digilockerEntity(): RecordEntity {
  const STATUSES = ['pending', 'issued', 'failed'] as const;
  return kitEntity({
    key: 'digilocker-documents',
    module: 'integrations',
    table: dlDocuments,
    subjectType: 'dl_document',
    roles: { read: DL_ROLES, write: DL_ROLES },
    title: 'title',
    fields: {
      title: { label: 'Title', kind: 'text', column: dlDocuments.title, required: true, max: 200, create: false },
      docType: { label: 'Document', kind: 'select', column: dlDocuments.docType, options: choices(['degree', 'marksheet', 'transcript']), create: false, edit: false },
      status: { label: 'Status', kind: 'select', column: dlDocuments.status, options: choices(STATUSES), create: false, edit: false },
    },
    extra: {
      studentId: dlDocuments.studentId,
      studentName: sql<string>`(select s.full_name from students s where s.id = ${qualified('dl_documents', 'student_id')})`,
      docRef: dlDocuments.docRef,
      uri: dlDocuments.uri,
      error: dlDocuments.error,
      attempts: dlDocuments.attempts,
      issuedAt: ist(dlDocuments.issuedAt),
      createdAt: dlDocuments.createdAt,
    },
    sorts: { createdAt: dlDocuments.createdAt, student: sql`(select s.full_name from students s where s.id = ${qualified('dl_documents', 'student_id')})` },
    search: [dlDocuments.title, dlDocuments.docRef, sql`(select s.full_name from students s where s.id = ${qualified('dl_documents', 'student_id')})`],
    defaultSort: { id: 'createdAt', dir: 'desc' },
    exportExtra: [
      { key: 'studentName', header: 'Student' },
      { key: 'docRef', header: 'Reference' },
      { key: 'uri', header: 'DigiLocker URI' },
      { key: 'issuedAt', header: 'Issued' },
      { key: 'error', header: 'Last error' },
    ],
    noImport: true,
    remove: { guard: async (ctx, id) => ((await rowOf(ctx, dlDocuments, id)).status === 'issued' ? 'A document already in DigiLocker stays on record' : null) },
    actions: {
      push: {
        label: 'Push to DigiLocker',
        apply: async (ctx, id) => {
          const d = await pushDigilockerDocument(ctx.tx, ctx.p, id);
          if (d.status === 'failed') throw new BadRequestException(d.error ?? 'DigiLocker did not accept the document');
          return d.uri ?? undefined;
        },
      },
    },
  });
}

export function tokensEntity(): RecordEntity {
  return kitEntity({
    key: 'api-tokens',
    module: 'integrations',
    table: apiTokens,
    subjectType: 'api_token',
    roles: { read: ADMIN, write: ADMIN },
    title: 'name',
    fields: {
      name: { label: 'Name', kind: 'text', column: apiTokens.name, required: true, max: 80, create: false },
    },
    extra: {
      scopes: sql<string>`array_to_string(${apiTokens.scopes}, ', ')`,
      revokedAt: ist(apiTokens.revokedAt),
      lastUsedAt: ist(apiTokens.lastUsedAt),
      createdAt: apiTokens.createdAt,
      createdByName: sql<string | null>`(select u.full_name from users u where u.id = ${qualified('api_tokens', 'created_by')})`,
      state: sql<string>`case when ${apiTokens.revokedAt} is null then 'active' else 'revoked' end`,
    },
    filters: { state: { label: 'State', options: choices(['active', 'revoked']), where: (v) => (v === 'active' ? sql`${apiTokens.revokedAt} is null` : v === 'revoked' ? sql`${apiTokens.revokedAt} is not null` : undefined) } },
    sorts: { createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt },
    defaultSort: { id: 'createdAt', dir: 'desc' },
    exportExtra: [
      { key: 'scopes', header: 'Scopes' },
      { key: 'state', header: 'State' },
      { key: 'lastUsedAt', header: 'Last used' },
      { key: 'createdByName', header: 'Created by' },
    ],
    noImport: true,
    actions: {
      revoke: {
        label: 'Revoke',
        tone: 'danger',
        apply: async (ctx, id) => {
          const r = await rowOf(ctx, apiTokens, id);
          if (r.revokedAt) return 'Already revoked';
          await ctx.tx.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id));
        },
      },
    },
  });
}
