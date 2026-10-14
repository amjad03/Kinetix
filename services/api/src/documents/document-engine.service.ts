import { Injectable, NotFoundException } from '@nestjs/common';
import { DOC_SAMPLES, type DocData, type DocLayout, type DocType, pageSizeMm } from '@kinetix/shared';
import { eq } from 'drizzle-orm';
import { localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { institutionProfiles, issuedDocuments, students, tenants, users } from '../db/schema.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { BrandingService, readAll } from './branding.service.js';
import { staffBlock, studentBlock } from './doc-data.js';
import { DocTemplatesService } from './doc-templates.service.js';
import { renderCardSheets, renderPdf, renderSvg, svgToPng } from './engine/index.js';
import { mergePdfs } from './engine/merge.js';
import { type IssueInput, type IssuedRecord, IssuedDocsService } from './issued-docs.service.js';
import { longDate } from './render.js';

export interface ProduceInput extends Omit<IssueInput, 'template'> {
  /** The subject's photo (JPEG or PNG) for ID cards, hall tickets and marks cards; loaded from the subject when omitted. */
  photo?: Buffer | null;
  /**
   * A word stamped diagonally across every side, e.g. DUPLICATE for a copy issued in place of a lost original or
   * CANCELLED for a cancelled receipt. Kept in the record's data (doc.watermark), so reprints carry it too.
   */
  watermark?: string;
}

/** The watermark a document was issued with, from its stored data. */
const watermarkOf = (data: DocData): string | null => {
  const w = (data.doc as DocData | undefined)?.watermark;
  return typeof w === 'string' && w ? w : null;
};

export interface Produced {
  pdf: Buffer;
  record: IssuedRecord;
}

type Actor = { tenantId: string; userId: string | null };

/** A real person to preview a template with: a student (students.id) or a staff member (users.id). */
export interface PreviewSubject {
  type: 'student' | 'staff';
  id: string;
}

/**
 * What every document generator calls: renders the document with the institution's default
 * template for its type and branding, after recording it in the register (serial, signed hash,
 * QR token). Also previews templates as SVG, PNG or PDF with sample data.
 */
@Injectable()
export class DocumentEngine {
  constructor(
    private readonly branding: BrandingService,
    private readonly templates: DocTemplatesService,
    private readonly issued: IssuedDocsService,
    private readonly storage: ObjectStorage,
  ) {}

  /** Institution details and signatory names every document can bind to. */
  async common(tx: Tx): Promise<DocData> {
    const [t] = await tx.select({ name: tenants.name, slug: tenants.slug }).from(tenants);
    const [pr] = await tx.select().from(institutionProfiles);
    const b = await this.branding.row(tx);
    const sig = Object.fromEntries(Object.entries(b?.signatories ?? {}).map(([role, s]) => [role, { name: s.name, designation: s.designation }]));
    return {
      institution: {
        name: t?.name ?? '',
        legalName: pr?.legalName ?? t?.name ?? '',
        tagline: b?.tagline ?? ([pr?.affiliationBody && `Affiliated to ${pr.affiliationBody}`, pr?.naacGrade && `NAAC ${pr.naacGrade}`].filter(Boolean).join('  |  ') || null),
        address: pr?.addressLine ?? '',
        city: pr?.city ?? '',
        state: pr?.state ?? '',
        pincode: pr?.pincode ?? '',
        phone: pr?.phone ?? '',
        email: pr?.email ?? '',
        website: (pr?.website ?? '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
        affiliation: [pr?.affiliationBody, pr?.affiliationNo].filter(Boolean).join(' ') || '',
        code: pr?.aisheCode ?? '',
        board: pr?.boardOrUniversity ?? '',
        established: pr?.establishedYear ? String(pr.establishedYear) : '',
        gstin: b?.gstin ?? '',
      },
      signatory: sig,
    };
  }

  /** The student's or staff member's photo, when they have one. */
  async photoFor(tx: Tx, subject: IssueInput['subject']): Promise<Buffer | null> {
    if (!subject.id || (subject.type !== 'student' && subject.type !== 'staff')) return null;
    const [r] = subject.type === 'student' ? await tx.select({ key: users.photoKey }).from(students).innerJoin(users, eq(users.id, students.userId)).where(eq(students.id, subject.id)) : await tx.select({ key: users.photoKey }).from(users).where(eq(users.id, subject.id));
    if (!r?.key) return null;
    try {
      return await readAll((await this.storage.get(r.key)).stream);
    } catch {
      return null;
    }
  }

  private async tz(tx: Tx): Promise<string> {
    return (await tx.select({ tz: tenants.timezone }).from(tenants))[0]?.tz ?? 'Asia/Kolkata';
  }

  /** The full data a template binds to: common blocks, the document's data, and its record. */
  private async fullData(tx: Tx, data: DocData, title: string, record: IssuedRecord | null, tz: string): Promise<DocData> {
    const common = await this.common(tx);
    const doc = (data.doc && typeof data.doc === 'object' && !Array.isArray(data.doc) ? data.doc : {}) as DocData;
    return {
      ...common,
      ...data,
      doc: { title, ...doc, serial: record?.serial ?? 'SPECIMEN', issuedOn: (doc.issuedOn as string | undefined) ?? longDate(localParts(record?.issuedAt ?? new Date(), tz).date), fingerprint: record?.fingerprint ?? '0000-0000-0000' },
      verify: { url: record?.verifyUrl ?? '' },
    };
  }

  /** Records and renders one document. */
  async produce(tx: Tx, actor: Actor, input: ProduceInput): Promise<Produced> {
    const tpl = await this.templates.resolve(tx, input.docType);
    const { watermark, photo: given, ...rest } = input;
    const body: DocData = watermark ? { ...rest.data, doc: { ...((rest.data.doc as DocData | undefined) ?? {}), watermark } } : rest.data;
    const record = await this.issued.issue(tx, actor, { ...rest, data: body, template: { ref: tpl.ref, version: tpl.version } });
    const tz = await this.tz(tx);
    const photo = given === undefined ? await this.photoFor(tx, input.subject) : given;
    const ctx = await this.branding.renderContext(tx, photo);
    const data = await this.fullData(tx, body, input.title, record, tz);
    const layout = watermark ? stamped(tpl.layout, watermark) : tpl.layout;
    return { pdf: renderPdf(layout, [{ data, ctx }], { title: `${input.title} ${record.serial}`, author: String((data.institution as DocData).name ?? ''), subject: input.subject.name ?? undefined }), record };
  }

  /** ID cards (or any card type) for many people, imposed ten to an A4 sheet; each card is recorded. */
  async produceCards(tx: Tx, actor: Actor, docType: DocType, inputs: ProduceInput[], label: string): Promise<Buffer> {
    const tpl = await this.templates.resolve(tx, docType);
    const tz = await this.tz(tx);
    const items = [];
    for (const input of inputs) {
      const record = await this.issued.issue(tx, actor, { ...input, template: { ref: tpl.ref, version: tpl.version } });
      const photo = input.photo === undefined ? await this.photoFor(tx, input.subject) : input.photo;
      items.push({ data: await this.fullData(tx, input.data, input.title, record, tz), ctx: await this.branding.renderContext(tx, photo) });
    }
    if (inputs.length === 1) return renderPdf(tpl.layout, items, { title: label });
    return renderCardSheets(tpl.layout, items, { title: label, label });
  }

  /** A copy of an issued document from its stored data, with the current template for its type. */
  async reprint(tx: Tx, id: string): Promise<{ pdf: Buffer; serial: string }> {
    const [r] = await tx.select().from(issuedDocuments).where(eq(issuedDocuments.id, id));
    if (!r) throw new NotFoundException('Document not found');
    const docType = r.docType as DocType;
    const tpl = await this.templates.resolve(tx, docType);
    const tz = await this.tz(tx);
    const [t] = await tx.select({ slug: tenants.slug }).from(tenants);
    const record: IssuedRecord = { id: r.id, serial: r.serial, token: r.verifyToken, fingerprint: r.payloadHash.slice(0, 12).toUpperCase().match(/.{4}/g)!.join('-'), verifyUrl: this.issued.verifyUrl(t.slug, r.verifyToken), issuedAt: r.issuedAt };
    const photo = await this.photoFor(tx, { type: r.subjectType as IssueInput['subject']['type'], id: r.subjectId });
    const ctx = await this.branding.renderContext(tx, photo);
    const data = await this.fullData(tx, r.payload as DocData, r.title, record, tz);
    const wm = watermarkOf(r.payload as DocData);
    const base = wm ? stamped(tpl.layout, wm) : tpl.layout;
    return { pdf: renderPdf(r.status === 'valid' ? base : stamped(base, r.status.toUpperCase()),[{ data, ctx }], { title: `${r.title} ${r.serial}` }), serial: r.serial };
  }

  /** A report's PDF with a cover page in front (the institution's report cover template). */
  async withCover(tx: Tx, actor: Actor, body: Buffer, report: { title: string; subtitle?: string; period?: string; preparedBy?: string; preparedFor?: string; criterion?: string; filters?: string; source: { type: string; id: string } }): Promise<Buffer> {
    const tz = await this.tz(tx);
    const date = longDate(localParts(new Date(), tz).date);
    const cover = await this.produce(tx, actor, {
      docType: 'report_cover',
      title: report.title,
      subject: { type: 'none' },
      source: report.source,
      data: { report: { title: report.title, subtitle: report.subtitle ?? '', period: report.period ?? '', preparedBy: report.preparedBy ?? '', preparedFor: report.preparedFor ?? '', date, confidentiality: 'For official use', criterion: report.criterion ?? '', filters: report.filters ?? '' } },
      keyFields: [{ label: 'Report', value: report.title }, ...(report.period ? [{ label: 'Period', value: report.period }] : [])],
      photo: null,
    });
    try {
      return mergePdfs([cover.pdf, body]);
    } catch {
      return body;
    }
  }

  /**
   * Renders a template with sample data (or given data), unrecorded, marked as a specimen. With a
   * `subject`, the student's or staff member's real details and photo replace the sample person's.
   */
  async preview(tx: Tx, layout: DocLayout, o: { format: 'pdf' | 'svg' | 'png'; side?: string; page?: number; width?: number; animate?: boolean; data?: DocData; subject?: PreviewSubject }): Promise<Buffer | string> {
    const tz = await this.tz(tx);
    let sample = o.data ?? DOC_SAMPLES[layout.docType];
    let photo: Buffer | null = null;
    if (o.subject) {
      const block = o.subject.type === 'student' ? await studentBlock(tx, o.subject.id) : await staffBlock(tx, o.subject.id);
      if (!Object.keys(block[o.subject.type] as DocData).length) throw new NotFoundException(o.subject.type === 'student' ? 'Student not found' : 'Staff member not found');
      sample = { ...sample, ...block };
      photo = await this.photoFor(tx, o.subject);
    }
    const common = await this.common(tx);
    const inst = common.institution as DocData;
    // The institution's own name and contacts replace the sample's; sample people stay.
    const data = await this.fullData(tx, { ...sample, institution: { ...(sample.institution as DocData), ...Object.fromEntries(Object.entries(inst).filter(([, v]) => v)) } }, String((sample.doc as DocData | undefined)?.title ?? 'Specimen'), null, tz);
    (data.doc as DocData).serial = String((sample.doc as DocData | undefined)?.serial ?? 'SPECIMEN');
    (data.doc as DocData).fingerprint = 'SPEC-IMEN-0000';
    (data.verify as DocData).url = String((sample.verify as DocData | undefined)?.url ?? 'https://kinetix.app/verify');
    const ctx = await this.branding.renderContext(tx, photo);
    if (o.format === 'pdf') return renderPdf(layout, [{ data, ctx }], { title: `Specimen ${layout.docType}` });
    const svg = renderSvg(layout, { data, ctx }, { side: o.side, page: o.page, animate: o.animate && o.format === 'svg', pxWidth: o.width });
    return o.format === 'svg' ? svg : svgToPng(svg);
  }
}

/** The layout with a large diagonal stamp across every side (DUPLICATE, REVOKED, SUPERSEDED). */
function stamped(layout: DocLayout, word: string): DocLayout {
  const { w, h } = pageSizeMm(layout.page);
  return {
    ...layout,
    sides: layout.sides.map((s) => ({
      ...s,
      elements: [...s.elements, { id: `stamp-${word.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, type: 'watermark' as const, x: 0, y: 0, w, h, text: word, angleDeg: -32, repeat: 'none' as const, opacity: 0.5, style: { font: 'body' as const, sizePt: Math.min(w, h) * 0.45, weight: 700 as const, color: 'accent', align: 'center' as const, lineHeight: 1, letterSpacingPt: 4 } }],
    })),
  };
}

