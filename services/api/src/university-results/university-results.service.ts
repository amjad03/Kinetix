import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { PdfWriter } from '../common/pdf.js';
import { writeXlsx } from '../common/xlsx.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examResultLines, examResults, examSessions, legacyMarks, students, subjects, tabulationRegisters, universityTemplates } from '../db/schema.js';
import { governedParams, overlayPassRules } from '../governance/rule-params.js';
import { computeRegister, gridToCsv, registerGrid, SAMPLE_TEMPLATES, type Register, type StudentInput, type SubjectMark, type TemplateConfig } from './tabulation.logic.js';

export type RegisterSource = { kind: 'legacy'; academicYear: string; term: number } | { kind: 'session'; sessionId: string; sectionId?: string };

export interface StoredRegister {
  templateCode: string;
  config: TemplateConfig;
  rulesApplied: string[];
  register: Register;
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

@Injectable()
export class UniversityResultsService {
  constructor(private readonly db: DbService) {}

  listTemplates(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(universityTemplates).orderBy(asc(universityTemplates.name)));
  }

  async saveTemplate(p: UserPrincipal, b: { code: string; name: string; university: string; config: TemplateConfig; active: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(universityTemplates)
        .values({ tenantId: p.tenantId, code: b.code, name: b.name, university: b.university, config: b.config as unknown as Record<string, unknown>, active: b.active, createdBy: p.userId })
        .onConflictDoUpdate({ target: [universityTemplates.tenantId, universityTemplates.code], set: { name: b.name, university: b.university, config: b.config as unknown as Record<string, unknown>, active: b.active } })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'university_template.saved', subjectType: 'university_template', subjectId: row!.id, data: { code: b.code } });
      return row!;
    });
  }

  /** Installs the two sample templates (Kerala-style, VTU/Karnataka-style); existing ones are left as they are. */
  installSamples(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      let added = 0;
      for (const s of SAMPLE_TEMPLATES) {
        const rows = await tx.insert(universityTemplates).values({ tenantId: p.tenantId, code: s.code, name: s.name, university: s.university, config: s.config as unknown as Record<string, unknown>, createdBy: p.userId }).onConflictDoNothing().returning({ id: universityTemplates.id });
        added += rows.length;
      }
      if (added) await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'university_template.samples_installed', subjectType: 'university_template', data: { added } });
      return { added };
    });
  }

  /** Marks of imported history for a year and term, one student per register number. */
  private async fromLegacy(tx: Tx, academicYear: string, term: number): Promise<StudentInput[]> {
    const rows = await tx
      .select({ m: legacyMarks, name: students.fullName })
      .from(legacyMarks)
      .leftJoin(students, eq(students.id, legacyMarks.studentId))
      .where(and(eq(legacyMarks.academicYear, academicYear), eq(legacyMarks.term, term)));
    const by = new Map<string, StudentInput>();
    for (const { m, name } of rows) {
      const st = by.get(m.rollNo) ?? by.set(m.rollNo, { rollNo: m.rollNo, name: name ?? m.rollNo, subjects: [] }).get(m.rollNo)!;
      const mark: SubjectMark = { code: m.subjectCode, name: m.subjectName || m.subjectCode, credits: m.credits, internal: m.internalMarks, maxInternal: m.maxInternal, external: m.externalMarks, maxExternal: m.maxExternal, absent: m.result === 'absent' };
      st.subjects.push(mark);
    }
    return [...by.values()];
  }

  /** Computed results of an exam session: internal components versus everything else. */
  private async fromSession(tx: Tx, sessionId: string, sectionId?: string): Promise<StudentInput[]> {
    const [s] = await tx.select({ id: examSessions.id }).from(examSessions).where(eq(examSessions.id, sessionId));
    if (!s) throw new NotFoundException('Exam session not found');
    const results = await tx
      .select({ id: examResults.id, rollNo: students.rollNo, name: students.fullName })
      .from(examResults)
      .innerJoin(students, eq(students.id, examResults.studentId))
      .where(and(eq(examResults.sessionId, sessionId), sectionId ? eq(students.sectionId, sectionId) : undefined));
    if (!results.length) return [];
    const lines = await tx
      .select({ resultId: examResultLines.resultId, code: subjects.code, name: subjects.name, credits: examResultLines.credits, components: examResultLines.components })
      .from(examResultLines)
      .innerJoin(subjects, eq(subjects.id, examResultLines.subjectId))
      .where(inArray(examResultLines.resultId, results.map((r) => r.id)));
    return results.map((r) => ({
      rollNo: r.rollNo,
      name: r.name,
      subjects: lines
        .filter((l) => l.resultId === r.id)
        .map((l) => {
          const comps = (l.components as { kind: string; weight: number; weighted: number | null; fraction: number | null }[]) ?? [];
          const part = (internal: boolean) => comps.filter((c) => (c.kind === 'internal') === internal);
          const ext = part(false);
          return {
            code: l.code,
            name: l.name,
            credits: l.credits,
            internal: part(true).reduce((a, c) => a + (c.weighted ?? 0), 0),
            maxInternal: part(true).reduce((a, c) => a + c.weight, 0),
            external: ext.reduce((a, c) => a + (c.weighted ?? 0), 0),
            maxExternal: ext.reduce((a, c) => a + c.weight, 0),
          };
        }),
    }));
  }

  /** The template's rules with the approved pass-mark and grace-marks rules of the rule registry laid over them. */
  private async effectiveConfig(tx: Tx, base: TemplateConfig): Promise<{ config: TemplateConfig; applied: string[] }> {
    const applied: string[] = [];
    const config: TemplateConfig = structuredClone(base);
    const passRule = await governedParams(tx, 'grading', 'pass-mark');
    if (passRule) {
      config.pass = overlayPassRules(config.pass, passRule);
      applied.push('grading/pass-mark');
    }
    const graceRule = await governedParams(tx, 'grading', 'grace-marks');
    if (graceRule) {
      config.grace = { ...config.grace, enabled: graceRule.enabled === false ? false : config.grace.enabled, maxPerSubject: num(graceRule.maxPerSubject, config.grace.maxPerSubject), maxTotal: num(graceRule.maxTotal, config.grace.maxTotal) };
      applied.push('grading/grace-marks');
    }
    return { config, applied };
  }

  generate(p: UserPrincipal, b: { templateId: string; label: string; source: RegisterSource }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [tpl] = await tx.select().from(universityTemplates).where(eq(universityTemplates.id, b.templateId));
      if (!tpl) throw new NotFoundException('Template not found');
      if (!tpl.active) throw new ConflictException('This template is switched off');
      const input = b.source.kind === 'legacy' ? await this.fromLegacy(tx, b.source.academicYear, b.source.term) : await this.fromSession(tx, b.source.sessionId, b.source.sectionId);
      if (!input.length) throw new BadRequestException('There are no marks for that selection');
      const { config, applied } = await this.effectiveConfig(tx, tpl.config as unknown as TemplateConfig);
      const register = computeRegister(config, input);
      const payload: StoredRegister = { templateCode: tpl.code, config, rulesApplied: applied, register };
      const [row] = await tx.insert(tabulationRegisters).values({ tenantId: p.tenantId, templateId: tpl.id, label: b.label, source: b.source.kind, payload, createdBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tabulation.generated', subjectType: 'tabulation_register', subjectId: row!.id, data: { template: tpl.code, students: register.summary.students, rules: applied } });
      return { id: row!.id, label: b.label, template: tpl.code, rulesApplied: applied, summary: register.summary };
    });
  }

  listRegisters(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(tabulationRegisters).orderBy(asc(tabulationRegisters.createdAt));
      return rows.reverse().map((r) => ({ id: r.id, label: r.label, source: r.source, createdAt: r.createdAt, template: (r.payload as StoredRegister).templateCode, summary: (r.payload as StoredRegister).register.summary }));
    });
  }

  async register(p: UserPrincipal, id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(tabulationRegisters).where(eq(tabulationRegisters.id, id));
      if (!r) throw new NotFoundException('Register not found');
      return { id: r.id, label: r.label, ...(r.payload as StoredRegister) };
    });
  }

  /** The register in the university's layout as CSV, XLSX or PDF. */
  async export(p: UserPrincipal, id: string, format: 'csv' | 'xlsx' | 'pdf'): Promise<{ body: Buffer | string; type: string; name: string }> {
    const r = await this.register(p, id);
    const grid = registerGrid(r.config, r.label, r.register);
    const base = `register-${r.templateCode}`;
    if (format === 'csv') return { body: gridToCsv(grid), type: 'text/csv; charset=utf-8', name: `${base}.csv` };
    if (format === 'xlsx') return { body: writeXlsx('Register', grid.map((row) => row.map((c) => (c === '' ? null : c)))), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `${base}.xlsx` };
    await this.db.withTenant(p.tenantId, (tx) => audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tabulation.exported', subjectType: 'tabulation_register', subjectId: id, data: { format } }));
    return { body: gridPdf(grid, r.config), type: 'application/pdf', name: `${base}.pdf` };
  }
}

/** The grid on A4: the first rows are headings, then two header rows and the student rows; wide registers continue in column blocks. */
export function gridPdf(grid: (string | number)[][], config: TemplateConfig): Buffer {
  const pdf = new PdfWriter();
  const idN = config.layout.identity.length;
  const headerAt = 4;
  const end = grid.findIndex((r, i) => i > headerAt + 1 && r.length === 0);
  const body = grid.slice(headerAt, end < 0 ? grid.length : end);
  const tail = grid.slice(end < 0 ? grid.length : end + 1);
  const width = Math.max(...body.map((r) => r.length), idN);
  const perBlock = 14 - idN;
  const text = (v: string | number | undefined) => (v === undefined ? '' : String(v));
  pdf.text(text(grid[0]?.[0]), { size: 13, bold: true, align: 'center' });
  pdf.text(text(grid[1]?.[0]), { size: 8, align: 'center' });
  pdf.text(text(grid[2]?.[0]), { size: 9, bold: true, align: 'center' });
  for (let from = idN; from < width || from === idN; from += perBlock) {
    const cols = [...Array(idN).keys(), ...Array.from({ length: Math.min(perBlock, Math.max(0, width - from)) }, (_, i) => from + i)];
    const xs = cols.map((_, i) => (i < idN ? [0, 24, 84][i] ?? i * 40 : 190 + (i - idN) * 23));
    pdf.rule();
    body.forEach((r, ri) => pdf.row(cols.map((c) => text(r[c])), xs, { size: 6.5, bold: ri < 2 }));
    pdf.gap(10);
    if (width <= from + perBlock) break;
  }
  for (const r of tail) if (r.length) pdf.text(text(r[0]), { size: 8 });
  return pdf.build();
}
