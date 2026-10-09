import { Injectable } from '@nestjs/common';
import type { UserPrincipal } from '../auth/principal.js';
import type { Tx } from '../db/db.service.js';
import { certificateTemplates, certificates } from '../db/schema.js';
import { CertificatesService } from './certificates.service.js';

export interface AutoCertificate {
  /** Template name; the template is created the first time it is needed. */
  name: string;
  title: string;
  /** Template text with {{name}}, {{rollNo}}, {{className}}, {{institution}}, {{issuedOn}} and {{fields.<key>}}. */
  body: string;
  serialPrefix: string;
  fieldKeys: string[];
}

/**
 * Certificates the system issues by itself when something is completed (an internship, an event attended).
 * They use the ordinary certificate pipeline (numbered, verifiable, audited), without the request and approval step.
 */
@Injectable()
export class AutoCertificatesService {
  constructor(private readonly certs: CertificatesService) {}

  /** Issues the certificate for a student; returns the certificate id. */
  async issueForStudent(tx: Tx, p: UserPrincipal, studentId: string, kind: AutoCertificate, fields: Record<string, string>, purpose: string): Promise<string> {
    // Listing seeds the standard templates on first use, so adding ours never leaves an institution without them.
    let tmpl = (await this.certs.templates(tx, p.tenantId)).find((t) => t.kind === 'custom' && t.name === kind.name);
    if (!tmpl) {
      [tmpl] = await tx
        .insert(certificateTemplates)
        .values({ tenantId: p.tenantId, kind: 'custom', name: kind.name, subjectType: 'student', title: kind.title, body: kind.body, fields: kind.fieldKeys.map((k) => ({ key: k, label: k, required: false })), serialPrefix: kind.serialPrefix })
        .returning();
    }
    const [row] = await tx
      .insert(certificates)
      .values({ tenantId: p.tenantId, templateId: tmpl.id, subjectType: 'student', studentId, purpose, fields, status: 'approved', requestedBy: p.userId, decidedBy: p.userId, decidedAt: new Date(), decisionNote: 'Issued automatically' })
      .returning({ id: certificates.id });
    await this.certs.issue(tx, p, row.id);
    return row.id;
  }
}
