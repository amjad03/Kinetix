import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Headers } from '@nestjs/common';
import { createHmac, generateKeyPairSync, sign as edSign, verify as edVerify, createPrivateKey, createPublicKey } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examResultLines, examResults, examSessions, programs, sections, students, subjects } from '../db/schema.js';
import { dlDocuments, integrationExports, studentAcademicIds } from '../db/schema-integrations.js';
import { INTEGRATION_ADMIN, call, getSetting, maskSecrets, putSetting, safeEqual, sha256 } from './common.js';

const SECRETS = ['clientSecret'];
const DL_ENV = () => ({ baseUrl: process.env.DIGILOCKER_BASE_URL, clientId: process.env.DIGILOCKER_CLIENT_ID, clientSecret: process.env.DIGILOCKER_CLIENT_SECRET, issuerId: process.env.DIGILOCKER_ISSUER_ID });
const NAD_ENV = { baseUrl: process.env.NAD_BASE_URL, institutionCode: process.env.NAD_INSTITUTION_CODE };
const DOC_TYPES = ['degree', 'marksheet', 'transcript'] as const;
/** JSON with sorted keys, so a document hashes and verifies the same after a round trip through jsonb. */
export const canon = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v ?? null));
const Id12 = z.string().trim().regex(/^\d{12}$/, 'Enter the 12 digit number');

const ConfigBody = z.object({ baseUrl: z.url().optional(), clientId: z.string().trim().max(120).optional(), clientSecret: z.string().trim().max(200).optional(), issuerId: z.string().trim().max(60).optional() });
const NadConfigBody = z.object({ baseUrl: z.url().optional(), institutionCode: z.string().trim().max(40).optional() });
const DocBody = z.object({ studentId: z.uuid(), docType: z.enum(DOC_TYPES), title: z.string().trim().min(1).max(160).optional(), sessionId: z.uuid().optional() });
const IdsBody = z.object({ apaarId: Id12.nullable().optional(), abcId: Id12.nullable().optional(), source: z.enum(['admission', 'manual', 'import']).default('manual') });

/** The signing key the institution issues documents with (Ed25519, created on first use; only the public half is ever shown). */
async function signingKey(tx: Tx, tenantId: string) {
  let cfg = await getSetting(tx, tenantId, 'digilocker_keys');
  if (!cfg.privatePem) {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    cfg = await putSetting(tx, tenantId, 'digilocker_keys', { privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }), publicPem: publicKey.export({ type: 'spki', format: 'pem' }) });
  }
  return { privatePem: cfg.privatePem as string, publicPem: cfg.publicPem as string };
}

/** Builds the payload of a document from the student's published results. */
async function buildPayload(tx: Tx, studentId: string, docType: (typeof DOC_TYPES)[number], sessionId?: string) {
  const [st] = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, program: programs.name }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)).where(eq(students.id, studentId));
  if (!st) throw new NotFoundException('Student not found');
  const [ids] = await tx.select().from(studentAcademicIds).where(eq(studentAcademicIds.studentId, studentId));
  const rows = await tx
    .select({ session: examSessions.name, startsOn: examSessions.startsOn, sessionId: examSessions.id, sgpa: examResults.sgpa, cgpa: examResults.cgpa, outcome: examResults.outcome, subject: subjects.name, code: subjects.code, grade: examResultLines.grade, percent: examResultLines.percent, credits: examResultLines.credits })
    .from(examResults)
    .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
    .innerJoin(examResultLines, eq(examResultLines.resultId, examResults.id))
    .innerJoin(subjects, eq(subjects.id, examResultLines.subjectId))
    .where(and(eq(examResults.studentId, studentId), inArray(examSessions.status, ['published', 'locked']), sessionId ? eq(examResults.sessionId, sessionId) : undefined))
    .orderBy(asc(examSessions.startsOn), asc(subjects.code));
  if (!rows.length) throw new BadRequestException('There are no published results for this student yet');
  const sessions = new Map<string, { session: string; sgpa: number; outcome: string; lines: { code: string; subject: string; grade: string; percent: number; credits: number }[] }>();
  for (const r of rows) {
    const s = sessions.get(r.sessionId) ?? { session: r.session, sgpa: r.sgpa, outcome: r.outcome, lines: [] };
    s.lines.push({ code: r.code, subject: r.subject, grade: r.grade, percent: r.percent, credits: r.credits });
    sessions.set(r.sessionId, s);
  }
  const list = [...sessions.values()];
  const cgpa = rows[rows.length - 1].cgpa;
  return { student: { name: st.fullName, rollNo: st.rollNo, program: st.program, apaarId: ids?.apaarId ?? null, abcId: ids?.abcId ?? null }, docType, cgpa, results: docType === 'marksheet' ? [list[list.length - 1]] : list };
}

/** DigiLocker issuer (documents signed and pushed), the NAD upload batch and the APAAR / ABC identifiers of students. */
@Controller('v1')
export class DigiLockerController {
  constructor(private readonly db: DbService) {}

  // ---- configuration ------------------------------------------------------------------------

  @Get('digilocker/config')
  @Auth('user', [...INTEGRATION_ADMIN])
  config(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const dl = await getSetting(tx, p.tenantId, 'digilocker', DL_ENV());
      const nad = await getSetting(tx, p.tenantId, 'nad', NAD_ENV);
      const keys = await signingKey(tx, p.tenantId);
      return { digilocker: maskSecrets(dl, SECRETS), nad, publicKey: keys.publicPem };
    });
  }

  @Put('digilocker/config')
  @Auth('user', [...INTEGRATION_ADMIN])
  saveConfig(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ConfigBody.extend({ nad: NadConfigBody.optional() }))) b: z.infer<typeof ConfigBody> & { nad?: z.infer<typeof NadConfigBody> }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { nad, ...dl } = b;
      const v = await putSetting(tx, p.tenantId, 'digilocker', dl);
      const n = nad ? await putSetting(tx, p.tenantId, 'nad', nad) : await getSetting(tx, p.tenantId, 'nad');
      await auditUser(tx, p, 'digilocker.config_saved', 'integration', undefined, { keys: Object.keys(b) });
      return { digilocker: maskSecrets(v, SECRETS), nad: n };
    });
  }

  // ---- documents ----------------------------------------------------------------------------

  /** Every document with its push status. */
  @Get('digilocker/documents')
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  documents(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select({ id: dlDocuments.id, studentId: dlDocuments.studentId, studentName: students.fullName, docType: dlDocuments.docType, title: dlDocuments.title, docRef: dlDocuments.docRef, uri: dlDocuments.uri, status: dlDocuments.status, error: dlDocuments.error, attempts: dlDocuments.attempts, issuedAt: dlDocuments.issuedAt, nadExportId: dlDocuments.nadExportId, createdAt: dlDocuments.createdAt })
        .from(dlDocuments).innerJoin(students, eq(students.id, dlDocuments.studentId)).orderBy(desc(dlDocuments.createdAt)).limit(500),
    );
  }

  /** Prepares a signed document (degree, marksheet or transcript) from published results. It is pushed separately. */
  @Post('digilocker/documents')
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DocBody)) b: z.infer<typeof DocBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const payload = await buildPayload(tx, b.studentId, b.docType, b.sessionId);
      const keys = await signingKey(tx, p.tenantId);
      const canonical = canon(payload);
      const docRef = `${b.docType.toUpperCase()}-${b.studentId.slice(0, 8)}-${sha256(canonical).slice(0, 10)}`;
      const signature = edSign(null, Buffer.from(canonical), createPrivateKey(keys.privatePem)).toString('base64');
      const [dup] = await tx.select({ id: dlDocuments.id }).from(dlDocuments).where(eq(dlDocuments.docRef, docRef));
      if (dup) return { ...(await tx.select().from(dlDocuments).where(eq(dlDocuments.id, dup.id)))[0], reused: true };
      const [row] = await tx.insert(dlDocuments).values({ tenantId: p.tenantId, studentId: b.studentId, docType: b.docType, title: b.title ?? `${payload.student.name} - ${b.docType}`, docRef, status: 'pending', sha256: sha256(canonical), signature, payload, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'digilocker.document_prepared', 'dl_document', row.id, { docType: b.docType });
      return row;
    });
  }

  /** Pushes one document to the DigiLocker issuer API; the answer's URI is stored, a failure is recorded and can be retried. */
  @Post('digilocker/documents/:id/push')
  @HttpCode(200)
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  push(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) docId: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.pushOne(tx, p, docId));
  }

  @Post('digilocker/push-pending')
  @HttpCode(200)
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  pushPending(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ id: dlDocuments.id }).from(dlDocuments).where(inArray(dlDocuments.status, ['pending', 'failed']));
      const out = [];
      for (const r of rows) out.push(await this.pushOne(tx, p, r.id));
      return { pushed: out.filter((d) => d.status === 'issued').length, failed: out.filter((d) => d.status === 'failed').length, documents: out };
    });
  }

  private async pushOne(tx: Tx, p: UserPrincipal, docId: string) {
    const [d] = await tx.select().from(dlDocuments).where(eq(dlDocuments.id, docId));
    if (!d) throw new NotFoundException('Document not found');
    if (d.status === 'issued') return d;
    const cfg = await getSetting(tx, p.tenantId, 'digilocker', DL_ENV());
    if (!cfg.baseUrl || !cfg.clientId || !cfg.clientSecret) throw new BadRequestException('DigiLocker is not configured yet: add the issuer URL, client id and secret');
    const body = JSON.stringify({ issuerId: cfg.issuerId ?? cfg.clientId, docType: d.docType, docRef: d.docRef, title: d.title, sha256: d.sha256, signature: d.signature, document: d.payload });
    const res = await call(`${String(cfg.baseUrl).replace(/\/$/, '')}/issuer/v1/documents`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-id': cfg.clientId, 'x-signature': createHmac('sha256', cfg.clientSecret).update(body).digest('hex') }, body });
    const uri = res.ok && typeof res.body?.uri === 'string' ? (res.body.uri as string) : null;
    const [row] = await tx.update(dlDocuments).set(uri ? { status: 'issued', uri, issuedAt: new Date(), error: null, attempts: d.attempts + 1 } : { status: 'failed', error: (res.error ?? res.body?.message ?? 'No URI in the answer').toString().slice(0, 300), attempts: d.attempts + 1 }).where(eq(dlDocuments.id, docId)).returning();
    await auditUser(tx, p, uri ? 'digilocker.document_issued' : 'digilocker.document_failed', 'dl_document', docId, { uri });
    return row;
  }

  /** Asks the issuer API for the state of an issued document by its URI. */
  @Post('digilocker/documents/:id/check')
  @HttpCode(200)
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  check(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) docId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select().from(dlDocuments).where(eq(dlDocuments.id, docId));
      if (!d?.uri) throw new NotFoundException('That document has no URI yet');
      const cfg = await getSetting(tx, p.tenantId, 'digilocker', DL_ENV());
      const res = await call(`${String(cfg.baseUrl).replace(/\/$/, '')}/issuer/v1/documents/${encodeURIComponent(d.uri)}`, { headers: { 'x-client-id': cfg.clientId ?? '' } });
      return { uri: d.uri, reachable: res.ok, remote: res.body, matches: res.ok && res.body?.sha256 === d.sha256 };
    });
  }

  /**
   * The pull-URI call: DigiLocker sends a URI and gets the document back. The request is signed with the shared client secret
   * (`x-signature` = HMAC-SHA256 of the URI), so only DigiLocker can read documents here.
   */
  @Post('digilocker/pull/:tenantId')
  @HttpCode(200)
  async pull(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Headers('x-signature') signature: string | undefined, @Body() b: { uri?: string }) {
    if (typeof b?.uri !== 'string' || !signature) throw new BadRequestException('A uri and signature are required');
    return this.db.withTenant(tenantId, async (tx) => {
      const cfg = await getSetting(tx, tenantId, 'digilocker', DL_ENV());
      if (!cfg.clientSecret || !safeEqual(createHmac('sha256', cfg.clientSecret).update(b.uri!).digest('hex'), signature)) throw new ForbiddenException('Bad signature');
      const [d] = await tx.select().from(dlDocuments).where(and(eq(dlDocuments.uri, b.uri!), eq(dlDocuments.status, 'issued')));
      if (!d) throw new NotFoundException('No document with that URI');
      return { uri: d.uri, docType: d.docType, title: d.title, sha256: d.sha256, signature: d.signature, document: d.payload };
    });
  }

  /** Checks a document's signature against the institution's public key (what a verifier does). */
  @Get('digilocker/documents/:id/verify')
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) docId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.select().from(dlDocuments).where(eq(dlDocuments.id, docId));
      if (!d) throw new NotFoundException('Document not found');
      const keys = await signingKey(tx, p.tenantId);
      const ok = !!d.signature && edVerify(null, Buffer.from(canon(d.payload)), createPublicKey(keys.publicPem), Buffer.from(d.signature, 'base64'));
      return { valid: ok && sha256(canon(d.payload)) === d.sha256 };
    });
  }

  // ---- NAD ----------------------------------------------------------------------------------

  @Get('nad/batches')
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  batches(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select({ id: integrationExports.id, kind: integrationExports.kind, ref: integrationExports.ref, rows: integrationExports.rows, status: integrationExports.status, error: integrationExports.error, createdAt: integrationExports.createdAt, sentAt: integrationExports.sentAt }).from(integrationExports).orderBy(desc(integrationExports.createdAt)).limit(100),
    );
  }

  /** Gathers every issued document not yet sent into one NAD upload file (CSV). */
  @Post('nad/batches')
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  buildBatch(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const docs = await tx
        .select({ id: dlDocuments.id, uri: dlDocuments.uri, docType: dlDocuments.docType, sha256: dlDocuments.sha256, issuedAt: dlDocuments.issuedAt, name: students.fullName, apaarId: studentAcademicIds.apaarId, abcId: studentAcademicIds.abcId })
        .from(dlDocuments).innerJoin(students, eq(students.id, dlDocuments.studentId)).leftJoin(studentAcademicIds, eq(studentAcademicIds.studentId, dlDocuments.studentId))
        .where(and(eq(dlDocuments.status, 'issued'), isNull(dlDocuments.nadExportId)));
      if (!docs.length) throw new BadRequestException('There are no issued documents waiting for NAD');
      const nad = await getSetting(tx, p.tenantId, 'nad', NAD_ENV);
      const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const content = [['institution_code', 'abc_id', 'apaar_id', 'student_name', 'doc_type', 'digilocker_uri', 'sha256', 'issued_at'].join(','), ...docs.map((d) => [nad.institutionCode, d.abcId, d.apaarId, d.name, d.docType, d.uri, d.sha256, d.issuedAt?.toISOString()].map(q).join(','))].join('\n');
      const ref = `NAD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${sha256(content).slice(0, 6).toUpperCase()}`;
      const [ex] = await tx.insert(integrationExports).values({ tenantId: p.tenantId, kind: 'nad_batch', ref, rows: docs.length, content, createdBy: p.userId }).returning();
      await tx.update(dlDocuments).set({ nadExportId: ex.id }).where(inArray(dlDocuments.id, docs.map((d) => d.id)));
      await auditUser(tx, p, 'nad.batch_built', 'integration_export', ex.id, { rows: docs.length });
      return { id: ex.id, ref, rows: docs.length, status: ex.status, missingAbc: docs.filter((d) => !d.abcId).length };
    });
  }

  @Get('nad/batches/:id/file')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  file(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [ex] = await tx.select().from(integrationExports).where(eq(integrationExports.id, id));
      if (!ex) throw new NotFoundException('Batch not found');
      return ex.content;
    });
  }

  @Post('nad/batches/:id/upload')
  @HttpCode(200)
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  upload(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [ex] = await tx.select().from(integrationExports).where(eq(integrationExports.id, id));
      if (!ex || ex.kind !== 'nad_batch') throw new NotFoundException('Batch not found');
      const nad = await getSetting(tx, p.tenantId, 'nad', NAD_ENV);
      if (!nad.baseUrl) throw new BadRequestException('NAD is not configured yet: add the upload URL');
      const res = await call(`${String(nad.baseUrl).replace(/\/$/, '')}/nad/v1/upload`, { method: 'POST', headers: { 'content-type': 'text/csv', 'x-batch-ref': ex.ref, 'x-institution-code': nad.institutionCode ?? '' }, body: ex.content });
      const [row] = await tx.update(integrationExports).set(res.ok ? { status: 'uploaded', sentAt: new Date(), error: null } : { status: 'failed', error: (res.error ?? 'Upload failed').slice(0, 300) }).where(eq(integrationExports.id, id)).returning({ id: integrationExports.id, ref: integrationExports.ref, status: integrationExports.status, error: integrationExports.error });
      await auditUser(tx, p, res.ok ? 'nad.batch_uploaded' : 'nad.batch_failed', 'integration_export', id);
      return row;
    });
  }

  // ---- APAAR / ABC identifiers --------------------------------------------------------------

  @Get('academic-ids')
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller', 'admissions_officer'])
  ids(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select({ studentId: students.id, name: students.fullName, rollNo: students.rollNo, apaarId: studentAcademicIds.apaarId, abcId: studentAcademicIds.abcId, source: studentAcademicIds.source }).from(students).leftJoin(studentAcademicIds, eq(studentAcademicIds.studentId, students.id)).orderBy(asc(students.rollNo)).limit(1000),
    );
  }

  @Put('students/:id/academic-ids')
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller', 'admissions_officer'])
  setIds(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string, @Body(new ZodBody(IdsBody)) b: z.infer<typeof IdsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
      if (!s) throw new NotFoundException('Student not found');
      const [cur] = await tx.select().from(studentAcademicIds).where(eq(studentAcademicIds.studentId, studentId));
      const vals = { apaarId: b.apaarId === undefined ? (cur?.apaarId ?? null) : b.apaarId, abcId: b.abcId === undefined ? (cur?.abcId ?? null) : b.abcId, source: b.source, capturedBy: p.userId, capturedAt: new Date() };
      const [row] = cur ? await tx.update(studentAcademicIds).set(vals).where(eq(studentAcademicIds.id, cur.id)).returning() : await tx.insert(studentAcademicIds).values({ tenantId: p.tenantId, studentId, ...vals }).returning();
      await auditUser(tx, p, 'academic_ids.saved', 'student', studentId);
      return row;
    });
  }

  /** The ABC credit push file: one row per student and subject with credits earned, for upload to the Academic Bank of Credits. */
  @Post('abc/credit-files')
  @Auth('user', [...INTEGRATION_ADMIN, 'exam_controller'])
  creditFile(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ sessionId: z.uuid() }))) b: { sessionId: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ name: students.fullName, abcId: studentAcademicIds.abcId, code: subjects.code, subject: subjects.name, credits: examResultLines.credits, grade: examResultLines.grade, passed: examResultLines.passed, session: examSessions.name })
        .from(examResults).innerJoin(examSessions, eq(examSessions.id, examResults.sessionId)).innerJoin(examResultLines, eq(examResultLines.resultId, examResults.id)).innerJoin(subjects, eq(subjects.id, examResultLines.subjectId)).innerJoin(students, eq(students.id, examResults.studentId)).leftJoin(studentAcademicIds, eq(studentAcademicIds.studentId, examResults.studentId))
        .where(and(eq(examResults.sessionId, b.sessionId), inArray(examSessions.status, ['published', 'locked'])));
      if (!rows.length) throw new BadRequestException('There are no published results for that exam session');
      const withId = rows.filter((r) => r.abcId && r.passed);
      const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const content = [['abc_id', 'student_name', 'course_code', 'course_name', 'credits', 'grade', 'term'].join(','), ...withId.map((r) => [r.abcId, r.name, r.code, r.subject, r.credits, r.grade, r.session].map(q).join(','))].join('\n');
      const [ex] = await tx.insert(integrationExports).values({ tenantId: p.tenantId, kind: 'abc_credits', ref: `ABC-${sha256(content).slice(0, 8).toUpperCase()}`, rows: withId.length, content, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'abc.credit_file_built', 'integration_export', ex.id, { rows: withId.length });
      return { id: ex.id, ref: ex.ref, rows: withId.length, skippedNoAbcId: rows.filter((r) => !r.abcId).length };
    });
  }
}
