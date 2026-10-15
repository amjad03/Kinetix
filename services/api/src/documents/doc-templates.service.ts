import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DOC_TYPE_INFO, DOC_TYPES, type DocLayout, DocLayoutSchema, type DocTemplate, type DocTemplateSummary, type DocTemplateVersion, type DocType, type PresetStyle } from '@zynetix/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { docTemplateDefaults, docTemplates, docTemplateVersions, users } from '../db/schema.js';
import { FALLBACK_STYLE, parsePresetId, PRESET_NAMES, preset, presetId, presetsFor } from './presets/index.js';

type Row = typeof docTemplates.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One problem with a layout: where (`sides.0.elements.3.style.sizePt`) and what. */
export interface LayoutIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Parses a layout from the API or the database, with the schema's defaults applied. An invalid
 * layout is a 400 with code `LAYOUT_INVALID` and the issues (up to 50), so the editor can mark
 * the elements and properties at fault.
 */
export function parseLayout(raw: unknown): DocLayout {
  const r = DocLayoutSchema.safeParse(raw);
  if (!r.success) {
    const issues: LayoutIssue[] = r.error.issues.slice(0, 50).map((i) => ({ path: i.path.map((k) => (typeof k === 'number' ? k : String(k))), message: i.message }));
    throw new BadRequestException({ message: `The layout is not valid: ${issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, code: 'LAYOUT_INVALID', issues });
  }
  return r.data;
}

/**
 * Document templates: the system presets (read-only, `preset:<type>:<style>`) and the
 * institution's own templates (copies of a preset or of another template, versioned on every
 * save), plus which one each document type uses by default.
 */
@Injectable()
export class DocTemplatesService {
  private async defaults(tx: Tx): Promise<Map<string, string>> {
    return new Map((await tx.select().from(docTemplateDefaults)).map((d) => [d.docType, d.templateRef]));
  }

  private summary(r: Row, defaults: Map<string, string>): DocTemplateSummary {
    const st = (r.style as PresetStyle | null) ?? null;
    return { id: r.id, docType: r.docType as DocType, name: r.name, system: false, style: st, basedOn: r.basedOn, version: r.version, isDefault: defaults.get(r.docType) === r.id, updatedAt: r.updatedAt.toISOString() };
  }

  private presetSummary(t: DocType, st: PresetStyle, defaults: Map<string, string>): DocTemplateSummary {
    const id = presetId(t, st);
    const def = defaults.get(t) ?? presetId(t, FALLBACK_STYLE);
    return { id, docType: t, name: PRESET_NAMES[st], system: true, style: st, basedOn: null, version: 1, isDefault: def === id, updatedAt: null };
  }

  /** Presets and templates of one type (or of every type), the institution's own first. */
  async list(tx: Tx, docType?: DocType): Promise<DocTemplateSummary[]> {
    const defaults = await this.defaults(tx);
    const rows = await tx.select().from(docTemplates).where(and(isNull(docTemplates.archivedAt), docType ? eq(docTemplates.docType, docType) : undefined)).orderBy(asc(docTemplates.docType), desc(docTemplates.updatedAt));
    const types = docType ? [docType] : [...DOC_TYPES];
    return [...rows.map((r) => this.summary(r, defaults)), ...types.flatMap((t) => presetsFor(t).map((p) => this.presetSummary(t, p.style, defaults)))];
  }

  private async row(tx: Tx, id: string): Promise<Row> {
    if (!UUID.test(id)) throw new NotFoundException('Template not found');
    const [r] = await tx.select().from(docTemplates).where(and(eq(docTemplates.id, id), isNull(docTemplates.archivedAt)));
    if (!r) throw new NotFoundException('Template not found');
    return r;
  }

  async get(tx: Tx, id: string): Promise<DocTemplate> {
    const defaults = await this.defaults(tx);
    const p = parsePresetId(id);
    if (p) return { ...this.presetSummary(p.docType, p.style, defaults), layout: preset(id)! };
    const r = await this.row(tx, id);
    return { ...this.summary(r, defaults), layout: parseLayout(r.layout) };
  }

  /** A copy of a preset or template to edit. */
  async duplicate(tx: Tx, p: UserPrincipal, from: string, name?: string): Promise<DocTemplate> {
    const src = await this.get(tx, from);
    const [row] = await tx
      .insert(docTemplates)
      .values({ tenantId: p.tenantId, docType: src.docType, name: name?.trim() || `${src.name} copy`, basedOn: src.id, style: src.style, layout: src.layout, version: 1, createdBy: p.userId })
      .returning();
    await tx.insert(docTemplateVersions).values({ tenantId: p.tenantId, templateId: row.id, version: 1, name: row.name, layout: src.layout, note: `Copied from ${src.system ? `the ${src.name} preset` : src.name}`, createdBy: p.userId });
    await auditUser(tx, p, 'doc_template.created', 'doc_template', row.id, { docType: src.docType, from });
    return this.get(tx, row.id);
  }

  /** Saves a new version (layout and/or name). Presets cannot be edited. */
  async update(tx: Tx, p: UserPrincipal, id: string, b: { name?: string; layout?: unknown; note?: string }): Promise<DocTemplate> {
    if (parsePresetId(id)) throw new ConflictException('System presets cannot be changed; duplicate one first');
    const cur = await this.row(tx, id);
    const layout = b.layout === undefined ? parseLayout(cur.layout) : parseLayout(b.layout);
    if (layout.docType !== cur.docType) throw new BadRequestException(`This template is for ${DOC_TYPE_INFO[cur.docType as DocType].label}`);
    const name = b.name?.trim() || cur.name;
    const version = cur.version + 1;
    await tx.update(docTemplates).set({ name, layout, version, style: layout.meta?.style ?? cur.style, updatedAt: new Date() }).where(eq(docTemplates.id, id));
    await tx.insert(docTemplateVersions).values({ tenantId: p.tenantId, templateId: id, version, name, layout, note: b.note?.trim() || (b.layout === undefined ? 'Renamed' : null), createdBy: p.userId });
    await auditUser(tx, p, 'doc_template.updated', 'doc_template', id, { version, renamed: name !== cur.name, layout: b.layout !== undefined });
    return this.get(tx, id);
  }

  async remove(tx: Tx, p: UserPrincipal, id: string): Promise<void> {
    if (parsePresetId(id)) throw new ConflictException('System presets cannot be deleted');
    const cur = await this.row(tx, id);
    await tx.update(docTemplates).set({ archivedAt: new Date() }).where(eq(docTemplates.id, id));
    await tx.delete(docTemplateDefaults).where(and(eq(docTemplateDefaults.docType, cur.docType), eq(docTemplateDefaults.templateRef, id)));
    await auditUser(tx, p, 'doc_template.deleted', 'doc_template', id, { docType: cur.docType, name: cur.name });
  }

  async versions(tx: Tx, id: string): Promise<DocTemplateVersion[]> {
    await this.row(tx, id);
    const rows = await tx
      .select({ version: docTemplateVersions.version, name: docTemplateVersions.name, note: docTemplateVersions.note, by: users.fullName, at: docTemplateVersions.createdAt })
      .from(docTemplateVersions)
      .leftJoin(users, eq(users.id, docTemplateVersions.createdBy))
      .where(eq(docTemplateVersions.templateId, id))
      .orderBy(desc(docTemplateVersions.version));
    return rows.map((r) => ({ version: r.version, name: r.name, note: r.note, createdBy: r.by, createdAt: r.at.toISOString() }));
  }

  /** Makes an old version current again (as a new version). */
  async restore(tx: Tx, p: UserPrincipal, id: string, version: number): Promise<DocTemplate> {
    const [v] = await tx.select().from(docTemplateVersions).where(and(eq(docTemplateVersions.templateId, id), eq(docTemplateVersions.version, version)));
    if (!v) throw new NotFoundException('Version not found');
    return this.update(tx, p, id, { layout: v.layout, name: v.name, note: `Restored version ${version}` });
  }

  async setDefault(tx: Tx, p: UserPrincipal, docType: DocType, ref: string): Promise<DocTemplateSummary[]> {
    const t = await this.get(tx, ref);
    if (t.docType !== docType) throw new BadRequestException('That template is for another document type');
    await tx.insert(docTemplateDefaults).values({ tenantId: p.tenantId, docType, templateRef: ref, updatedBy: p.userId }).onConflictDoUpdate({ target: [docTemplateDefaults.tenantId, docTemplateDefaults.docType], set: { templateRef: ref, updatedBy: p.userId, updatedAt: new Date() } });
    await auditUser(tx, p, 'doc_template.default_set', 'doc_template', UUID.test(ref) ? ref : undefined, { docType, ref });
    return this.list(tx, docType);
  }

  /** The layout a document type is rendered with: the default template, else the Classic preset. */
  async resolve(tx: Tx, docType: DocType): Promise<{ ref: string; version: number; layout: DocLayout }> {
    const ref = (await this.defaults(tx)).get(docType);
    if (ref && UUID.test(ref)) {
      const [r] = await tx.select().from(docTemplates).where(and(eq(docTemplates.id, ref), isNull(docTemplates.archivedAt)));
      if (r) return { ref, version: r.version, layout: parseLayout(r.layout) };
    }
    const id = ref && parsePresetId(ref) ? ref : presetId(docType, FALLBACK_STYLE);
    return { ref: id, version: 1, layout: preset(id)! };
  }
}
