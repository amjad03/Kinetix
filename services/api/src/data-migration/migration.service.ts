import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { looksLikeXlsx, readXlsx } from '../common/xlsx.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departmentStaff, departments, guardians, legacyAttendance, legacyFeeEntries, legacyMarks, migrationBatchRecords, migrationBatches, migrationMappings, programs, sections, students, subjects, userRoles, users } from '../db/schema.js';
import { decodeUtf8, parseCsv } from '../import/csv.js';
import { ImportService, type RowResult } from '../import/import.service.js';
import { fail, RowError, type Row } from '../import/row-helpers.js';
import {
  applyMapping,
  CORE_KIND,
  ENTITY_FIELDS,
  fingerprint,
  MIGRATION_ENTITIES,
  missingRequired,
  suggestMapping,
  tally,
  toIsoDate,
  toNumber,
  toPaise,
  type MigrationEntity,
  type MigrationRowResult,
  type SourceTable,
} from './migration.logic.js';

const ROLLBACK = Symbol('rollback');
export const MAX_MIGRATION_ROWS = 20_000;
/** How many row results the API returns (errors first); the totals always cover every row. */
const ROW_REPORT_LIMIT = 500;

export interface ReconciliationLine {
  label: string;
  file: number;
  stored: number;
  match: boolean;
}

export interface MigrationReport {
  entity: MigrationEntity;
  dryRun: boolean;
  committed: boolean;
  batchId: string | null;
  totals: ReturnType<typeof tally>;
  rows: MigrationRowResult[];
  reconciliation: ReconciliationLine[];
}

const line = (label: string, file: number, stored: number): ReconciliationLine => ({ label, file, stored, match: file === stored });
const sum = (xs: (number | null | undefined)[]) => Math.round(xs.reduce<number>((a, b) => a + (b ?? 0), 0) * 100) / 100;

/** Tables whose new rows a core import is tracked in, for rollback. */
const TRACKED = [
  ['guardians', guardians],
  ['students', students],
  ['user_roles', userRoles],
  ['users', users],
  ['subjects', subjects],
  ['sections', sections],
  ['programs', programs],
  ['departments', departments],
] as const;

@Injectable()
export class MigrationService {
  constructor(
    private readonly db: DbService,
    private readonly imports: ImportService,
  ) {}

  /** Reads a CSV (UTF-8) or Excel file into a header row and data rows. */
  parse(bytes: Buffer): SourceTable {
    let cells: { line: number; cells: string[] }[];
    if (looksLikeXlsx(bytes)) {
      try {
        cells = readXlsx(bytes).map((c, i) => ({ line: i + 1, cells: c }));
      } catch {
        throw new BadRequestException('The Excel file could not be read. Save it again as .xlsx or as "CSV UTF-8".');
      }
    } else {
      const text = decodeUtf8(bytes);
      if (text === null) throw new BadRequestException('The file is not UTF-8 text. Save it as "CSV UTF-8" or upload the .xlsx file.');
      cells = parseCsv(text).map((r) => ({ line: r.line, cells: r.cells }));
    }
    cells = cells.filter((r) => r.cells.some((c) => c.trim()));
    if (cells.length < 2) throw new BadRequestException('The file has no rows to import');
    if (cells.length - 1 > MAX_MIGRATION_ROWS) throw new BadRequestException(`The file has too many rows. Split it into files of at most ${MAX_MIGRATION_ROWS}.`);
    return { headers: cells[0]!.cells.map((h) => h.trim()), rows: cells.slice(1) };
  }

  entity(name: string): MigrationEntity {
    if (!(MIGRATION_ENTITIES as readonly string[]).includes(name)) throw new NotFoundException('Not found');
    return name as MigrationEntity;
  }

  preview(entity: MigrationEntity, bytes: Buffer) {
    const t = this.parse(bytes);
    return { headers: t.headers, rowCount: t.rows.length, sample: t.rows.slice(0, 5).map((r) => t.headers.map((_, i) => r.cells[i] ?? '')), suggested: suggestMapping(entity, t.headers), fields: ENTITY_FIELDS[entity] };
  }

  // ---- saved mappings ---------------------------------------------------------------------

  listMappings(p: UserPrincipal, entity?: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(migrationMappings).where(entity ? eq(migrationMappings.entity, entity) : undefined).orderBy(migrationMappings.entity, migrationMappings.name));
  }

  saveMapping(p: UserPrincipal, entity: MigrationEntity, name: string, mapping: Record<string, string>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(migrationMappings)
        .values({ tenantId: p.tenantId, entity, name, mapping, createdBy: p.userId })
        .onConflictDoUpdate({ target: [migrationMappings.tenantId, migrationMappings.entity, migrationMappings.name], set: { mapping } })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'migration.mapping_saved', subjectType: 'migration_mapping', subjectId: row!.id, data: { entity, name } });
      return row!;
    });
  }

  deleteMapping(p: UserPrincipal, id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(migrationMappings).where(eq(migrationMappings.id, id)).returning({ id: migrationMappings.id });
      if (!gone.length) throw new NotFoundException('Mapping not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'migration.mapping_deleted', subjectType: 'migration_mapping', subjectId: id });
      return { deleted: true };
    });
  }

  // ---- run ---------------------------------------------------------------------------------

  async run(p: UserPrincipal, input: { entity: MigrationEntity; bytes: Buffer; fileName: string; mapping: Record<string, string>; dryRun: boolean; partial: boolean }): Promise<MigrationReport> {
    const { entity, mapping } = input;
    const missing = missingRequired(entity, mapping);
    if (missing.length) throw new BadRequestException({ statusCode: 400, message: 'Some required fields are not mapped', error: 'Bad Request', code: 'MIGRATION_UNMAPPED', missing });
    const table = this.parse(input.bytes);
    const rows = applyMapping(entity, table, mapping);
    const fp = fingerprint(input.bytes, mapping);
    let report: MigrationReport | undefined;

    try {
      await this.db.withTenant(p.tenantId, async (tx) => {
        if (!input.dryRun) {
          const [same] = await tx.select({ id: migrationBatches.id }).from(migrationBatches).where(and(eq(migrationBatches.entity, entity), eq(migrationBatches.fingerprint, fp), eq(migrationBatches.status, 'committed')));
          if (same) throw new ConflictException({ statusCode: 409, message: 'This file has already been imported with this mapping', error: 'Conflict', code: 'MIGRATION_ALREADY_IMPORTED', batchId: same.id });
        }
        const [batch] = await tx.insert(migrationBatches).values({ tenantId: p.tenantId, entity, fileName: input.fileName.slice(0, 200), fingerprint: fp, rowCount: rows.length, createdBy: p.userId }).returning();
        const kind = CORE_KIND[entity];
        let results: MigrationRowResult[];
        let createdIds: [string, string][] = [];
        if (kind) {
          const before = await this.snapshot(tx);
          results = await this.imports.applyRows(tx, p, kind, rows as Row[]) as RowResult[];
          createdIds = await this.diff(tx, before);
        } else {
          results = await this.legacyRows(tx, p, entity, batch!.id, rows as Row[]);
          await this.relink(tx, entity);
        }
        const totals = tally(results);
        const committed = !input.dryRun && (totals.error === 0 || input.partial);
        const reconciliation = await this.reconcile(tx, entity, rows as Row[], results);
        report = { entity, dryRun: input.dryRun, committed, batchId: committed ? batch!.id : null, totals, rows: this.trim(results), reconciliation };
        if (!committed) throw ROLLBACK;
        if (createdIds.length) await tx.insert(migrationBatchRecords).values(createdIds.map(([tableName, recordId]) => ({ tenantId: p.tenantId, batchId: batch!.id, tableName, recordId })));
        await tx.update(migrationBatches).set({ createdCount: totals.created, updatedCount: totals.updated, skippedCount: totals.skipped, reconciliation: { totals, lines: reconciliation, errors: totals.error } }).where(eq(migrationBatches.id, batch!.id));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'migration.committed', subjectType: 'migration_batch', subjectId: batch!.id, data: { entity, totals } });
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
    return report!;
  }

  private trim(rows: MigrationRowResult[]): MigrationRowResult[] {
    const errors = rows.filter((r) => r.status === 'error');
    return [...errors, ...rows.filter((r) => r.status !== 'error')].slice(0, ROW_REPORT_LIMIT);
  }

  // ---- batches and rollback ----------------------------------------------------------------

  listBatches(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(migrationBatches).orderBy(desc(migrationBatches.createdAt)).limit(100));
  }

  async batch(p: UserPrincipal, id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [b] = await tx.select().from(migrationBatches).where(eq(migrationBatches.id, id));
      if (!b) throw new NotFoundException('Batch not found');
      return b;
    });
  }

  /** Removes the rows the batch created. Rows that other records already depend on are kept and counted. */
  rollback(p: UserPrincipal, id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [b] = await tx.select().from(migrationBatches).where(eq(migrationBatches.id, id));
      if (!b) throw new NotFoundException('Batch not found');
      if (b.status !== 'committed') throw new ConflictException('This batch is not committed, so there is nothing to roll back');
      let removed = 0;
      let kept = 0;
      const recs = await tx.select().from(migrationBatchRecords).where(eq(migrationBatchRecords.batchId, id));
      const idsOf = (name: string) => recs.filter((r) => r.tableName === name).map((r) => r.recordId);
      for (const [name, table] of TRACKED) {
        for (const rid of idsOf(name)) {
          try {
            if (name === 'users') {
              await tx.transaction(async (sp) => {
                await sp.delete(departmentStaff).where(eq(departmentStaff.userId, rid));
                await sp.delete(users).where(eq(users.id, rid));
              });
            } else {
              await tx.transaction((sp) => sp.delete(table).where(eq((table as typeof students).id, rid)));
            }
            removed++;
          } catch {
            kept++;
          }
        }
      }
      for (const t of [legacyMarks, legacyAttendance, legacyFeeEntries]) {
        const gone = await tx.delete(t).where(eq(t.batchId, id)).returning({ id: t.id });
        removed += gone.length;
      }
      await tx.delete(migrationBatchRecords).where(eq(migrationBatchRecords.batchId, id));
      await tx.update(migrationBatches).set({ status: 'rolled_back', rolledBackAt: new Date(), rolledBackBy: p.userId }).where(eq(migrationBatches.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'migration.rolled_back', subjectType: 'migration_batch', subjectId: id, data: { removed, kept } });
      return { batchId: id, removed, kept, note: 'Rows the batch only updated are not reverted.' };
    });
  }

  private async snapshot(tx: Tx) {
    const out = new Map<string, Set<string>>();
    for (const [name, table] of TRACKED) out.set(name, new Set((await tx.select({ id: (table as typeof students).id }).from(table)).map((r) => r.id)));
    return out;
  }

  private async diff(tx: Tx, before: Map<string, Set<string>>): Promise<[string, string][]> {
    const added: [string, string][] = [];
    for (const [name, table] of TRACKED) {
      const had = before.get(name)!;
      for (const r of await tx.select({ id: (table as typeof students).id }).from(table)) if (!had.has(r.id)) added.push([name, r.id]);
    }
    return added;
  }

  // ---- history rows ------------------------------------------------------------------------

  private async legacyRows(tx: Tx, p: UserPrincipal, entity: MigrationEntity, batchId: string, rows: Row[]): Promise<MigrationRowResult[]> {
    const rolls = [...new Set(rows.map((r) => r.get('roll_no')).filter(Boolean))];
    const found = rolls.length ? await tx.select({ id: students.id, rollNo: students.rollNo }).from(students).where(inArray(students.rollNo, rolls)) : [];
    const studentOf = new Map(found.map((s) => [s.rollNo, s.id]));
    const seen = new Set<string>();
    const out: MigrationRowResult[] = [];
    for (const r of rows) {
      try {
        const res = await tx.transaction((sp) => (entity === 'marks' ? this.markRow(sp, p, batchId, r, studentOf, seen) : entity === 'attendance' ? this.attendanceRow(sp, p, batchId, r, studentOf, seen) : this.feeRow(sp, p, batchId, r, studentOf, seen)));
        out.push({ row: r.line, ...res });
      } catch (e) {
        out.push(e instanceof RowError ? { row: r.line, status: 'error', message: e.message, code: 'IMPORT_INVALID_VALUE', ...(e.detail !== undefined && { detail: e.detail }) } : { row: r.line, status: 'error', message: 'This row could not be saved', code: 'IMPORT_ROW_FAILED', detail: e instanceof Error ? e.message : undefined });
      }
    }
    return out;
  }

  /** Links history rows to students that exist now (they may have been imported after the marks). */
  private async relink(tx: Tx, entity: MigrationEntity) {
    const t = entity === 'marks' ? 'legacy_marks' : entity === 'attendance' ? 'legacy_attendance' : 'legacy_fee_entries';
    await tx.execute(sql.raw(`update ${t} x set student_id = s.id from students s where x.student_id is null and s.roll_no = x.roll_no and s.tenant_id = x.tenant_id`));
  }

  private num(r: Row, key: string, what = key): number | null {
    const v = toNumber(r.get(key));
    if (v === undefined) fail('This value is not valid', `${what}: ${r.get(key)}`);
    return v ?? null;
  }

  private need(r: Row, key: string): string {
    return r.get(key) || fail('This value is required', key);
  }

  private async markRow(tx: Tx, p: UserPrincipal, batchId: string, r: Row, studentOf: Map<string, string>, seen: Set<string>) {
    const rollNo = this.need(r, 'roll_no');
    const academicYear = this.need(r, 'academic_year');
    const term = Number(this.need(r, 'term'));
    if (!Number.isInteger(term) || term < 1 || term > 20) fail('This value is not valid', `term: ${r.get('term')}`);
    const subjectCode = this.need(r, 'subject_code');
    const key = `${rollNo}|${academicYear}|${term}|${subjectCode}`.toLowerCase();
    if (seen.has(key)) fail('This row repeats an earlier row', `${rollNo} ${subjectCode}`);
    seen.add(key);
    const internal = this.num(r, 'internal_marks');
    const external = this.num(r, 'external_marks');
    const maxI = this.num(r, 'max_internal') ?? 0;
    const maxE = this.num(r, 'max_external') ?? 0;
    if (internal !== null && maxI > 0 && internal > maxI) fail('The marks are more than the maximum', `${subjectCode} internal ${internal}/${maxI}`);
    if (external !== null && maxE > 0 && external > maxE) fail('The marks are more than the maximum', `${subjectCode} external ${external}/${maxE}`);
    const resultText = r.get('result').toLowerCase();
    const result = ['f', 'fail', 'failed', 'rc', 'absent'].includes(resultText) ? 'fail' : 'pass';
    const values = { subjectName: r.get('subject_name'), credits: this.num(r, 'credits') ?? 0, internalMarks: internal, externalMarks: external, maxInternal: maxI, maxExternal: maxE, grade: r.get('grade') || null, gradePoint: this.num(r, 'grade_point'), result, studentId: studentOf.get(rollNo) ?? null };
    const [have] = await tx.select().from(legacyMarks).where(and(eq(legacyMarks.rollNo, rollNo), eq(legacyMarks.academicYear, academicYear), eq(legacyMarks.term, term), eq(legacyMarks.subjectCode, subjectCode)));
    const label = `${rollNo} ${subjectCode}`;
    if (!have) {
      await tx.insert(legacyMarks).values({ tenantId: p.tenantId, batchId, rollNo, academicYear, term, subjectCode, ...values });
      return { status: 'created' as const, message: label };
    }
    const same = (Object.keys(values) as (keyof typeof values)[]).every((k) => k === 'studentId' || have[k] === values[k]);
    if (same) return { status: 'skipped' as const, message: label };
    await tx.update(legacyMarks).set(values).where(eq(legacyMarks.id, have.id));
    return { status: 'updated' as const, message: label };
  }

  private async attendanceRow(tx: Tx, p: UserPrincipal, batchId: string, r: Row, studentOf: Map<string, string>, seen: Set<string>) {
    const rollNo = this.need(r, 'roll_no');
    const academicYear = this.need(r, 'academic_year');
    const term = Number(this.need(r, 'term'));
    if (!Number.isInteger(term) || term < 1 || term > 20) fail('This value is not valid', `term: ${r.get('term')}`);
    const held = this.num(r, 'classes_held');
    const attended = this.num(r, 'classes_attended');
    if (held === null || attended === null || !Number.isInteger(held) || !Number.isInteger(attended) || held < 0 || attended < 0) fail('This value is not valid', `${rollNo} held/attended`);
    if (attended! > held!) fail('Attended classes are more than the classes held', `${rollNo}: ${attended}/${held}`);
    const key = `${rollNo}|${academicYear}|${term}`.toLowerCase();
    if (seen.has(key)) fail('This row repeats an earlier row', rollNo);
    seen.add(key);
    const [have] = await tx.select().from(legacyAttendance).where(and(eq(legacyAttendance.rollNo, rollNo), eq(legacyAttendance.academicYear, academicYear), eq(legacyAttendance.term, term)));
    const label = `${rollNo} ${academicYear} sem ${term}`;
    if (!have) {
      await tx.insert(legacyAttendance).values({ tenantId: p.tenantId, batchId, rollNo, academicYear, term, classesHeld: held!, classesAttended: attended!, studentId: studentOf.get(rollNo) ?? null });
      return { status: 'created' as const, message: label };
    }
    if (have.classesHeld === held && have.classesAttended === attended) return { status: 'skipped' as const, message: label };
    await tx.update(legacyAttendance).set({ classesHeld: held!, classesAttended: attended! }).where(eq(legacyAttendance.id, have.id));
    return { status: 'updated' as const, message: label };
  }

  private async feeRow(tx: Tx, p: UserPrincipal, batchId: string, r: Row, studentOf: Map<string, string>, seen: Set<string>) {
    const rollNo = this.need(r, 'roll_no');
    const academicYear = this.need(r, 'academic_year');
    const typeText = this.need(r, 'entry_type').toLowerCase();
    const entryType = ['charge', 'debit', 'due', 'demand', 'invoice'].includes(typeText) ? 'charge' : ['receipt', 'credit', 'payment', 'paid'].includes(typeText) ? 'receipt' : fail('The entry type must be charge or receipt', typeText);
    const reference = this.need(r, 'reference');
    const head = r.get('head');
    const amountPaise = toPaise(this.need(r, 'amount'));
    if (amountPaise === null || amountPaise < 0) fail('This value is not valid', `amount: ${r.get('amount')}`);
    const dateText = r.get('entry_date');
    const entryDate = dateText ? (toIsoDate(dateText) ?? fail('This value is not valid', `date: ${dateText}`)) : null;
    const key = `${rollNo}|${entryType}|${reference}|${head}`.toLowerCase();
    if (seen.has(key)) fail('This row repeats an earlier row', `${rollNo} ${reference}`);
    seen.add(key);
    const [have] = await tx.select().from(legacyFeeEntries).where(and(eq(legacyFeeEntries.rollNo, rollNo), eq(legacyFeeEntries.entryType, entryType), eq(legacyFeeEntries.reference, reference), eq(legacyFeeEntries.head, head)));
    const label = `${rollNo} ${entryType} ${reference}`;
    if (!have) {
      await tx.insert(legacyFeeEntries).values({ tenantId: p.tenantId, batchId, rollNo, academicYear, entryType, head, reference, entryDate, amountPaise: amountPaise!, studentId: studentOf.get(rollNo) ?? null });
      return { status: 'created' as const, message: label };
    }
    if (have.amountPaise === amountPaise && have.academicYear === academicYear && (have.entryDate ?? null) === entryDate) return { status: 'skipped' as const, message: label };
    await tx.update(legacyFeeEntries).set({ amountPaise: amountPaise!, academicYear, entryDate }).where(eq(legacyFeeEntries.id, have.id));
    return { status: 'updated' as const, message: label };
  }

  // ---- reconciliation ----------------------------------------------------------------------

  /** File totals against what is stored for the rows that were accepted. */
  private async reconcile(tx: Tx, entity: MigrationEntity, rows: Row[], results: MigrationRowResult[]): Promise<ReconciliationLine[]> {
    const bad = new Set(results.filter((r) => r.status === 'error').map((r) => r.row));
    const ok = rows.filter((r) => !bad.has(r.line));
    const lines: ReconciliationLine[] = [line('Rows in the file', rows.length, rows.length), line('Rows accepted', ok.length, results.filter((r) => r.status !== 'error').length)];
    const distinct = (key: string) => [...new Set(ok.map((r) => r.get(key).toLowerCase()).filter(Boolean))];
    if (entity === 'students') {
      const rolls = [...new Set(ok.map((r) => r.get('roll_no')))];
      const stored = rolls.length ? await tx.select({ id: students.id }).from(students).where(inArray(students.rollNo, rolls)) : [];
      lines.push(line('Students', rolls.length, stored.length));
      const phones = new Set(ok.flatMap((r) => [r.get('guardian1_phone'), r.get('guardian2_phone')].filter(Boolean)).map((x) => x.replace(/\D/g, '').slice(-10)));
      const links = stored.length ? await tx.select({ phone: users.phone }).from(guardians).innerJoin(users, eq(users.id, guardians.userId)).where(inArray(guardians.studentId, stored.map((s) => s.id))) : [];
      lines.push(line('Guardian phone numbers', phones.size, new Set(links.map((l) => (l.phone ?? '').replace(/\D/g, '').slice(-10))).size));
    } else if (entity === 'programmes') {
      const names = distinct('program');
      const stored = names.length ? await tx.select({ name: programs.name }).from(programs).where(inArray(sql`lower(${programs.name})`, names)) : [];
      lines.push(line('Programmes', names.length, stored.length));
      const pairs = new Set(ok.filter((r) => r.get('subject_code')).map((r) => `${r.get('program').toLowerCase()}|${r.get('subject_code').toLowerCase()}`));
      const subs = await tx.select({ code: subjects.code, program: programs.name }).from(subjects).innerJoin(programs, eq(programs.id, subjects.programId));
      lines.push(line('Subjects', pairs.size, subs.filter((s) => pairs.has(`${s.program.toLowerCase()}|${s.code.toLowerCase()}`)).length));
    } else if (entity === 'faculty') {
      const ids = [...new Set(ok.map((r) => (r.get('email') || r.get('phone')).toLowerCase()).filter(Boolean))];
      const have = ids.length ? await tx.select({ email: users.email, phone: users.phone }).from(users) : [];
      const keys = new Set(have.flatMap((u) => [u.email?.toLowerCase(), u.phone?.toLowerCase()].filter(Boolean) as string[]));
      lines.push(line('Staff', ids.length, ids.filter((i) => keys.has(i) || keys.has(i.replace(/\s/g, ''))).length));
    } else if (entity === 'marks') {
      const rolls = [...new Set(ok.map((r) => r.get('roll_no')))];
      const keys = new Set(ok.map((r) => `${r.get('roll_no')}|${r.get('academic_year')}|${Number(r.get('term'))}|${r.get('subject_code')}`.toLowerCase()));
      const stored = rolls.length ? (await tx.select().from(legacyMarks).where(inArray(legacyMarks.rollNo, rolls))).filter((m) => keys.has(`${m.rollNo}|${m.academicYear}|${m.term}|${m.subjectCode}`.toLowerCase())) : [];
      lines.push(line('Subject results', keys.size, stored.length));
      lines.push(line('Internal marks total', sum(ok.map((r) => toNumber(r.get('internal_marks')) ?? 0)), sum(stored.map((m) => m.internalMarks))));
      lines.push(line('External marks total', sum(ok.map((r) => toNumber(r.get('external_marks')) ?? 0)), sum(stored.map((m) => m.externalMarks))));
    } else if (entity === 'attendance') {
      const rolls = [...new Set(ok.map((r) => r.get('roll_no')))];
      const keys = new Set(ok.map((r) => `${r.get('roll_no')}|${r.get('academic_year')}|${Number(r.get('term'))}`.toLowerCase()));
      const stored = rolls.length ? (await tx.select().from(legacyAttendance).where(inArray(legacyAttendance.rollNo, rolls))).filter((a) => keys.has(`${a.rollNo}|${a.academicYear}|${a.term}`.toLowerCase())) : [];
      lines.push(line('Student terms', keys.size, stored.length));
      lines.push(line('Classes held', sum(ok.map((r) => toNumber(r.get('classes_held')) ?? 0)), sum(stored.map((a) => a.classesHeld))));
      lines.push(line('Classes attended', sum(ok.map((r) => toNumber(r.get('classes_attended')) ?? 0)), sum(stored.map((a) => a.classesAttended))));
    } else {
      const rolls = [...new Set(ok.map((r) => r.get('roll_no')))];
      const typeOf = (t: string) => (['charge', 'debit', 'due', 'demand', 'invoice'].includes(t.toLowerCase()) ? 'charge' : 'receipt');
      const keys = new Set(ok.map((r) => `${r.get('roll_no')}|${typeOf(r.get('entry_type'))}|${r.get('reference')}|${r.get('head')}`.toLowerCase()));
      const stored = rolls.length ? (await tx.select().from(legacyFeeEntries).where(inArray(legacyFeeEntries.rollNo, rolls))).filter((e) => keys.has(`${e.rollNo}|${e.entryType}|${e.reference}|${e.head}`.toLowerCase())) : [];
      lines.push(line('Ledger lines', keys.size, stored.length));
      const fileOf = (type: string) => ok.filter((r) => typeOf(r.get('entry_type')) === type).reduce((a, r) => a + (toPaise(r.get('amount')) ?? 0), 0);
      const storedOf = (type: string) => stored.filter((e) => e.entryType === type).reduce((a, e) => a + e.amountPaise, 0);
      lines.push(line('Charges total (paise)', fileOf('charge'), storedOf('charge')));
      lines.push(line('Receipts total (paise)', fileOf('receipt'), storedOf('receipt')));
    }
    return lines;
  }
}
