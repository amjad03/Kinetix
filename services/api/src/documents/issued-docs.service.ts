import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DOC_TYPE_INFO, type DocData, type DocType, type DocumentVerification, type IssuedDocStatus, type IssuedDocument } from '@kinetix/shared';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import type { Tx } from '../db/db.service.js';
import { certificateCounters, issuedDocuments, tenants, users } from '../db/schema.js';
import { financialYear } from '../fees/fees.service.js';
import { SigningKeys } from '../pairing/offline-pairing.controller.js';
import { longDate } from './render.js';

type Row = typeof issuedDocuments.$inferSelect;

export interface IssueInput {
  docType: DocType;
  title: string;
  subject: { type: 'student' | 'staff' | 'candidate' | 'none'; id?: string | null; name?: string | null };
  /** What the document is made from; one valid record per source and type at a time. */
  source: { type: string; id: string };
  /** The document's data (without doc.serial and the verify link, which the record adds). */
  data: DocData;
  /** What the public verification page shows. */
  keyFields: { label: string; value: string }[];
  template?: { ref: string; version: number };
  /** Reuse an existing token (a certificate's), so its QR keeps working. */
  token?: string;
  /** The document's own number (certificate serial, receipt number); otherwise one is given. */
  serial?: string;
}

export interface IssuedRecord {
  id: string;
  serial: string;
  token: string;
  fingerprint: string;
  verifyUrl: string;
  issuedAt: Date;
}

/** Keys in a stable order, so the same data always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

/** The printed short form of a payload hash: 7F3A-91C2-04BE. */
export const fingerprintOf = (hash: string) => hash.slice(0, 12).toUpperCase().match(/.{4}/g)!.join('-');

const signedMessage = (tenantId: string, r: { serial: string; docType: string; payloadHash: string; issuedAt: Date }) => `KXD1|${tenantId}|${r.serial}|${r.docType}|${r.payloadHash}|${r.issuedAt.toISOString()}`;

/**
 * The register of issued documents. Issuing records the document's type, subject and data, the
 * SHA-256 of the data and an Ed25519 signature by the institution's key (the one offline board
 * pairing uses), and gives it a serial and a QR token. The same source issued again with the same
 * data returns the same record; with changed data the old record is superseded.
 */
@Injectable()
export class IssuedDocsService {
  private readonly verifyBase: string;

  constructor(
    @Inject(ENV) env: Env,
    private readonly keys: SigningKeys,
    private readonly clock: Clock,
  ) {
    this.verifyBase = env.VERIFY_BASE_URL.replace(/\/$/, '');
  }

  verifyUrl(slug: string, token: string): string {
    return `${this.verifyBase}/${slug}/${token}`;
  }

  private hash(i: Pick<IssueInput, 'docType' | 'title' | 'subject' | 'keyFields' | 'data'>): string {
    return createHash('sha256').update(canonical({ docType: i.docType, title: i.title, subject: i.subject, keyFields: i.keyFields, data: i.data })).digest('hex');
  }

  private async slug(tx: Tx): Promise<string> {
    return (await tx.select({ slug: tenants.slug }).from(tenants))[0]?.slug ?? '';
  }

  private record(r: Row, slug: string): IssuedRecord {
    return { id: r.id, serial: r.serial, token: r.verifyToken, fingerprint: fingerprintOf(r.payloadHash), verifyUrl: this.verifyUrl(slug, r.verifyToken), issuedAt: r.issuedAt };
  }

  /** Issues (or returns the already-issued) record for a document. */
  async issue(tx: Tx, actor: { tenantId: string; userId: string | null }, i: IssueInput): Promise<IssuedRecord> {
    const payloadHash = this.hash(i);
    const slug = await this.slug(tx);
    const [cur] = await tx
      .select()
      .from(issuedDocuments)
      .where(and(eq(issuedDocuments.docType, i.docType), eq(issuedDocuments.sourceType, i.source.type), eq(issuedDocuments.sourceId, i.source.id), eq(issuedDocuments.status, 'valid')))
      .orderBy(desc(issuedDocuments.issuedAt))
      .limit(1)
      .for('update');
    if (cur && cur.payloadHash === payloadHash) return this.record(cur, slug);
    const row = await this.insert(tx, actor, i, payloadHash, cur && i.token === cur.verifyToken ? undefined : i.token);
    if (cur) {
      await tx.update(issuedDocuments).set({ status: 'superseded', supersededBy: row.id }).where(eq(issuedDocuments.id, cur.id));
      await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId ?? undefined, action: 'document.superseded', subjectType: 'issued_document', subjectId: cur.id, data: { serial: cur.serial, by: row.serial } });
    }
    return this.record(row, slug);
  }

  private async insert(tx: Tx, actor: { tenantId: string; userId: string | null }, i: IssueInput, payloadHash: string, token?: string): Promise<Row> {
    const [tz] = await tx.select({ tz: tenants.timezone }).from(tenants);
    const now = this.clock.now();
    const fy = financialYear(localParts(now, tz?.tz ?? 'Asia/Kolkata').date);
    const prefix = DOC_TYPE_INFO[i.docType].serialPrefix;
    const [counter] = await tx
      .insert(certificateCounters)
      .values({ tenantId: actor.tenantId, prefix: `DOC-${prefix}`, financialYear: fy, lastNo: 1 })
      .onConflictDoUpdate({ target: [certificateCounters.tenantId, certificateCounters.prefix, certificateCounters.financialYear], set: { lastNo: sql`${certificateCounters.lastNo} + 1` } })
      .returning();
    let serial = `${prefix}/${fy}/${String(counter.lastNo).padStart(5, '0')}`;
    if (i.serial) {
      // A document with its own number keeps it; a later revision of it gets -R2, -R3…
      const taken = await tx.select({ serial: issuedDocuments.serial }).from(issuedDocuments).where(or(eq(issuedDocuments.serial, i.serial), ilike(issuedDocuments.serial, `${i.serial.replace(/[%_]/g, '\\$&')}-R%`)));
      serial = taken.length ? `${i.serial}-R${taken.length + 1}` : i.serial;
    }
    const key = await this.keys.get(tx, actor.tenantId);
    const signature = sign(null, Buffer.from(signedMessage(actor.tenantId, { serial, docType: i.docType, payloadHash, issuedAt: now })), createPrivateKey(key.privateKeyPem)).toString('base64url');
    const [row] = await tx
      .insert(issuedDocuments)
      .values({
        tenantId: actor.tenantId,
        docType: i.docType,
        serial,
        title: i.title,
        subjectType: i.subject.type,
        subjectId: i.subject.id ?? null,
        subjectName: i.subject.name ?? null,
        sourceType: i.source.type,
        sourceId: i.source.id,
        keyFields: i.keyFields,
        payload: i.data,
        payloadHash,
        signature,
        keyId: key.keyId,
        publicKeyPem: key.publicKeyPem,
        templateRef: i.template?.ref ?? null,
        templateVersion: i.template?.version ?? null,
        verifyToken: token ?? randomBytes(16).toString('hex'),
        issuedBy: actor.userId,
        issuedAt: now,
      })
      .returning();
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId ?? undefined, action: 'document.issued', subjectType: 'issued_document', subjectId: row.id, data: { serial, docType: i.docType, source: i.source } });
    return row;
  }

  async row(tx: Tx, id: string): Promise<Row> {
    const [r] = await tx.select().from(issuedDocuments).where(eq(issuedDocuments.id, id));
    if (!r) throw new NotFoundException('Document not found');
    return r;
  }

  async view(tx: Tx, rows: Row[]): Promise<IssuedDocument[]> {
    const slug = await this.slug(tx);
    const ids = [...new Set(rows.map((r) => r.issuedBy).filter((x): x is string => !!x))];
    const names = new Map(ids.length ? (await tx.select({ id: users.id, n: users.fullName }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.n]) : []);
    return rows.map((r) => ({
      id: r.id,
      docType: r.docType as DocType,
      serial: r.serial,
      title: r.title,
      subjectName: r.subjectName,
      status: r.status as IssuedDocStatus,
      issuedAt: r.issuedAt.toISOString(),
      issuedBy: r.issuedBy ? (names.get(r.issuedBy) ?? null) : null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokedReason: r.revokedReason,
      supersededBy: r.supersededBy,
      fingerprint: fingerprintOf(r.payloadHash),
      verifyUrl: this.verifyUrl(slug, r.verifyToken),
    }));
  }

  async list(tx: Tx, f: { docType?: DocType; status?: IssuedDocStatus; q?: string; sourceType?: string; sourceId?: string }): Promise<IssuedDocument[]> {
    const q = f.q?.trim();
    const rows = await tx
      .select()
      .from(issuedDocuments)
      .where(
        and(
          f.docType ? eq(issuedDocuments.docType, f.docType) : undefined,
          f.status ? eq(issuedDocuments.status, f.status) : undefined,
          f.sourceType ? eq(issuedDocuments.sourceType, f.sourceType) : undefined,
          f.sourceId ? eq(issuedDocuments.sourceId, f.sourceId) : undefined,
          q ? or(ilike(issuedDocuments.serial, `%${q}%`), ilike(issuedDocuments.subjectName, `%${q}%`), ilike(issuedDocuments.title, `%${q}%`)) : undefined,
        ),
      )
      .orderBy(desc(issuedDocuments.issuedAt))
      .limit(300);
    return this.view(tx, rows);
  }

  async revoke(tx: Tx, actor: { tenantId: string; userId: string }, id: string, reason: string): Promise<IssuedDocument> {
    const r = await this.row(tx, id);
    if (r.status !== 'valid') throw new ConflictException(`This document is already ${r.status}`);
    await tx.update(issuedDocuments).set({ status: 'revoked', revokedAt: this.clock.now(), revokedBy: actor.userId, revokedReason: reason }).where(eq(issuedDocuments.id, id));
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: 'document.revoked', subjectType: 'issued_document', subjectId: id, data: { serial: r.serial, reason } });
    return (await this.view(tx, [await this.row(tx, id)]))[0];
  }

  /** Revokes the valid record of a source (a revoked certificate, a refunded payment). */
  async revokeSource(tx: Tx, actor: { tenantId: string; userId: string }, sourceType: string, sourceId: string, reason: string): Promise<void> {
    const rows = await tx.select({ id: issuedDocuments.id }).from(issuedDocuments).where(and(eq(issuedDocuments.sourceType, sourceType), eq(issuedDocuments.sourceId, sourceId), eq(issuedDocuments.status, 'valid')));
    for (const r of rows) await this.revoke(tx, actor, r.id, reason);
  }

  /** A fresh serial and QR for the same data (a lost or damaged copy); the old record is superseded. */
  async reissue(tx: Tx, actor: { tenantId: string; userId: string }, id: string): Promise<IssuedDocument> {
    const r = await this.row(tx, id);
    if (r.status !== 'valid') throw new ConflictException('Only a valid document can be reissued');
    const fresh = await this.insert(tx, actor, { serial: r.serial.replace(/-R\d+$/, ''), docType: r.docType as DocType, title: r.title, subject: { type: r.subjectType as IssueInput['subject']['type'], id: r.subjectId, name: r.subjectName }, source: { type: r.sourceType, id: r.sourceId }, data: r.payload as DocData, keyFields: r.keyFields, template: r.templateRef ? { ref: r.templateRef, version: r.templateVersion ?? 1 } : undefined }, r.payloadHash);
    await tx.update(issuedDocuments).set({ status: 'superseded', supersededBy: fresh.id }).where(eq(issuedDocuments.id, id));
    await audit(tx, { tenantId: actor.tenantId, actorType: 'user', actorId: actor.userId, action: 'document.reissued', subjectType: 'issued_document', subjectId: id, data: { serial: r.serial, newSerial: fresh.serial } });
    return (await this.view(tx, [fresh]))[0];
  }

  /** Public check of a QR token: status, the recorded fields, and whether data and signature still match. */
  async verifyToken(tx: Tx, token: string, tz: string): Promise<(DocumentVerification & { serialNo?: string }) | null> {
    const [r] = await tx.select().from(issuedDocuments).where(eq(issuedDocuments.verifyToken, token));
    if (!r) return null;
    const [t] = await tx.select({ name: tenants.name }).from(tenants);
    const intact = this.hash({ docType: r.docType as DocType, title: r.title, subject: { type: r.subjectType as IssueInput['subject']['type'], id: r.subjectId, name: r.subjectName }, keyFields: r.keyFields, data: r.payload as DocData }) === r.payloadHash;
    let signatureValid = false;
    try {
      signatureValid = intact && verify(null, Buffer.from(signedMessage(r.tenantId, r)), createPublicKey(r.publicKeyPem), Buffer.from(r.signature, 'base64url'));
    } catch {
      signatureValid = false;
    }
    return {
      status: r.status as IssuedDocStatus,
      institution: t?.name,
      docType: r.docType as DocType,
      title: r.title,
      serial: r.serial,
      serialNo: r.serial,
      subjectName: r.subjectName,
      fields: r.keyFields,
      issuedOn: longDate(localParts(r.issuedAt, tz).date),
      ...(r.revokedAt ? { revokedOn: longDate(localParts(r.revokedAt, tz).date), revokedReason: r.revokedReason } : {}),
      signatureValid,
      keyId: r.keyId,
      fingerprint: fingerprintOf(r.payloadHash),
    };
  }
}
