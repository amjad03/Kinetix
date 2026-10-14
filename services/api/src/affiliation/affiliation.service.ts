import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, like, ne } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { naturalAsc } from '../common/natural-order.js';
import { MigrationService } from '../data-migration/migration.service.js';
import { DbService, type Tx } from '../db/db.service.js';
import { affiliationSettings, programmeAffiliations } from '../db/schema-affiliation.js';
import { auditLog, examResultLines, examResults, examSessions, guardians, institutionProfiles, programs, sections, students, subjects, tenants, universityTemplates, users } from '../db/schema.js';
import { describeRules } from './describe.js';
import { buildMarksCard, type MarksCardData } from './marks-card.js';
import { catalogue, schemeOf } from './registry/index.js';
import { readResultSheet, toMigrationCsv } from './result-sheet.js';
import { resolveAffiliation, type ResolvedAffiliation } from './resolve.js';
import { applyOverrides, diffRules, minimalOverrides } from './rules.js';
import { templateFromProfile } from './templates.js';

export const AFFILIATION_NOT_SET = 'Choose the university or board the institution is affiliated to first';

/**
 * Settings > Affiliation: the institution's university or board, the scheme per programme, tenant overrides
 * (audited, compared against the preset), the marks-card data contract and the university result formats.
 */
@Injectable()
export class AffiliationService {
  constructor(
    private readonly db: DbService,
    private readonly migration: MigrationService,
  ) {}

  catalogue() {
    return catalogue();
  }

  /** The registry entry with its schemes' rules in full and in plain language. */
  profile(code: string) {
    const found = schemeOf(code, null);
    if (!found) throw new NotFoundException('That university or board is not in the list');
    return { ...found.profile, schemes: found.profile.schemes.map((s) => ({ ...s, description: describeRules(s.rules) })) };
  }

  /** The current selection, every programme's scheme and whether its rules are overridden. */
  overview(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inst] = await tx.select().from(affiliationSettings);
      const progs = await tx.select({ id: programs.id, name: programs.name, level: programs.level }).from(programs).orderBy(...naturalAsc(programs.name));
      const rows = await tx.select().from(programmeAffiliations);
      const instScheme = inst ? schemeOf(inst.profileCode, inst.schemeCode) : null;
      const programmes = [];
      for (const g of progs) {
        const own = rows.find((r) => r.programId === g.id);
        const res = await resolveAffiliation(tx, g.id);
        programmes.push({ programId: g.id, name: g.name, level: g.level, follows: own ? 'own' : 'institution', profileCode: res?.profile.code ?? null, profileName: res?.profile.shortName ?? null, schemeCode: res?.scheme.code ?? null, schemeName: res?.scheme.name ?? null, overridden: res?.overridden ?? false, overrides: own?.overrides ?? {} });
      }
      return {
        selected: inst && instScheme
          ? {
              profileCode: inst.profileCode,
              schemeCode: inst.schemeCode,
              name: instScheme.profile.name,
              shortName: instScheme.profile.shortName,
              kind: instScheme.profile.kind,
              schemeName: instScheme.scheme.name,
              version: instScheme.scheme.version,
              ruleAuthority: instScheme.scheme.ruleAuthority,
              overrides: inst.overrides,
              overridesValid: applyOverrides(instScheme.scheme.rules, inst.overrides).ok,
              updatedAt: inst.updatedAt,
            }
          : null,
        programmes,
        catalogue: catalogue(),
      };
    });
  }

  /** The rules in force (for the institution, or a programme): preset, overrides, differences and plain language. */
  rules(p: UserPrincipal, programId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (programId) await this.programme(tx, programId);
      const res = await resolveAffiliation(tx, programId ?? null);
      if (!res) throw new NotFoundException(AFFILIATION_NOT_SET);
      return this.view(res);
    });
  }

  private view(res: ResolvedAffiliation) {
    return {
      profile: { code: res.profile.code, name: res.profile.name, shortName: res.profile.shortName, kind: res.profile.kind, website: res.profile.website },
      scheme: { code: res.scheme.code, name: res.scheme.name, version: res.scheme.version, revisedOn: res.scheme.revisedOn, effectiveFrom: res.scheme.effectiveFrom, effectiveTo: res.scheme.effectiveTo, appliesTo: res.scheme.appliesTo, ruleAuthority: res.scheme.ruleAuthority, sources: res.scheme.sources, notes: res.scheme.notes },
      source: res.source,
      rules: res.rules,
      preset: res.preset,
      differences: diffRules(res.preset, res.rules),
      description: describeRules(res.rules),
      presetDescription: describeRules(res.preset),
    };
  }

  /** Picks the university or board (and scheme). Changing the profile or scheme clears overrides made for the old one. */
  select(p: UserPrincipal, b: { profileCode: string; schemeCode?: string | null }) {
    const found = schemeOf(b.profileCode, b.schemeCode ?? null);
    if (!found) throw new BadRequestException('That university, board or scheme is not in the list');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [before] = await tx.select().from(affiliationSettings);
      const same = before && before.profileCode === found.profile.code && before.schemeCode === found.scheme.code;
      const values = { profileCode: found.profile.code, schemeCode: found.scheme.code, overrides: same ? before.overrides : {}, updatedBy: p.userId, updatedAt: new Date() };
      await tx.insert(affiliationSettings).values({ tenantId: p.tenantId, ...values }).onConflictDoUpdate({ target: affiliationSettings.tenantId, set: values });
      // The institution profile's board / university name follows the selection (navigation and documents read it).
      await tx
        .insert(institutionProfiles)
        .values({ tenantId: p.tenantId, boardOrUniversity: found.profile.name, affiliationBody: found.profile.name, updatedAt: new Date() })
        .onConflictDoUpdate({ target: institutionProfiles.tenantId, set: { boardOrUniversity: found.profile.name, affiliationBody: found.profile.name, updatedAt: new Date() } });
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: 'user',
        actorId: p.userId,
        action: 'affiliation.selected',
        subjectType: 'tenant',
        subjectId: p.tenantId,
        data: { profile: found.profile.code, scheme: found.scheme.code, version: found.scheme.version, overridesCleared: !!before && !same && Object.keys(before.overrides).length > 0 },
        changes: { profile: { before: before ? `${before.profileCode}/${before.schemeCode}` : null, after: `${found.profile.code}/${found.scheme.code}` } },
      });
      return { profileCode: found.profile.code, schemeCode: found.scheme.code };
    });
  }

  /** A programme follows its own profile or scheme (e.g. MBA on VTU 2021 while BE is on 2022). */
  setProgramme(p: UserPrincipal, programId: string, b: { profileCode: string; schemeCode?: string | null }) {
    const found = schemeOf(b.profileCode, b.schemeCode ?? null);
    if (!found) throw new BadRequestException('That university, board or scheme is not in the list');
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.programme(tx, programId);
      const [before] = await tx.select().from(programmeAffiliations).where(eq(programmeAffiliations.programId, programId));
      const same = before && before.profileCode === found.profile.code && before.schemeCode === found.scheme.code;
      const values = { profileCode: found.profile.code, schemeCode: found.scheme.code, overrides: same ? before.overrides : {}, updatedBy: p.userId, updatedAt: new Date() };
      await tx.insert(programmeAffiliations).values({ tenantId: p.tenantId, programId, ...values }).onConflictDoUpdate({ target: [programmeAffiliations.tenantId, programmeAffiliations.programId], set: values });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'affiliation.programme_set', subjectType: 'program', subjectId: programId, changes: { scheme: { before: before ? `${before.profileCode}/${before.schemeCode}` : null, after: `${found.profile.code}/${found.scheme.code}` } } });
      return { programId, profileCode: found.profile.code, schemeCode: found.scheme.code };
    });
  }

  /** The programme goes back to the institution's profile and scheme. */
  clearProgramme(p: UserPrincipal, programId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(programmeAffiliations).where(eq(programmeAffiliations.programId, programId)).returning();
      if (!gone.length) throw new NotFoundException('The programme already follows the institution');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'affiliation.programme_cleared', subjectType: 'program', subjectId: programId, changes: { scheme: { before: `${gone[0].profileCode}/${gone[0].schemeCode}`, after: null } } });
      return { programId, follows: 'institution' };
    });
  }

  /**
   * Replaces the overrides of the institution (no programme) or of a programme with its own scheme. Values equal
   * to the preset are dropped; every changed value is audited with its before and after.
   */
  saveOverrides(p: UserPrincipal, b: { programId?: string | null; overrides: Record<string, unknown>; reason: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inst] = await tx.select().from(affiliationSettings);
      if (!inst) throw new BadRequestException(AFFILIATION_NOT_SET);
      let target: { profileCode: string; schemeCode: string; overrides: Record<string, unknown> };
      let base;
      if (b.programId) {
        await this.programme(tx, b.programId);
        const [own] = await tx.select().from(programmeAffiliations).where(eq(programmeAffiliations.programId, b.programId));
        if (!own) throw new BadRequestException('Give the programme its own scheme first; otherwise change the institution\'s overrides');
        target = own;
        // A programme on the institution's scheme builds on the institution's overrides.
        const res = await resolveAffiliation(tx, null);
        base = own.profileCode === inst.profileCode && own.schemeCode === inst.schemeCode && res ? res.rules : schemeOf(own.profileCode, own.schemeCode)!.scheme.rules;
      } else {
        target = inst;
        base = schemeOf(inst.profileCode, inst.schemeCode)!.scheme.rules;
      }
      const applied = applyOverrides(base, b.overrides);
      if (!applied.ok) throw new BadRequestException({ message: 'These values do not make a valid set of rules', problems: applied.problems });
      const overrides = minimalOverrides(base, applied.rules);
      const beforeRules = applyOverrides(base, target.overrides);
      const changes = diffRules(beforeRules.ok ? beforeRules.rules : base, applied.rules);
      if (b.programId) await tx.update(programmeAffiliations).set({ overrides, updatedBy: p.userId, updatedAt: new Date() }).where(eq(programmeAffiliations.programId, b.programId));
      else await tx.update(affiliationSettings).set({ overrides, updatedBy: p.userId, updatedAt: new Date() }).where(eq(affiliationSettings.tenantId, p.tenantId));
      if (changes.length)
        await audit(tx, {
          tenantId: p.tenantId,
          actorType: 'user',
          actorId: p.userId,
          action: 'affiliation.overrides_saved',
          subjectType: b.programId ? 'program' : 'tenant',
          subjectId: b.programId ?? p.tenantId,
          data: { profile: target.profileCode, scheme: target.schemeCode, reason: b.reason },
          changes: Object.fromEntries(changes.map((c) => [c.path, { before: c.before, after: c.after }])),
        });
      return { overrides, changed: changes.map((c) => c.path) };
    });
  }

  /** Who changed the affiliation or its rules, newest first. */
  history(p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: auditLog.id, action: auditLog.action, at: auditLog.at, actor: users.fullName, subjectType: auditLog.subjectType, subjectId: auditLog.subjectId, data: auditLog.data })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(like(auditLog.action, 'affiliation.%'))
        .orderBy(desc(auditLog.at), desc(auditLog.id))
        .limit(100),
    );
  }

  // ---- marks card data contract ----------------------------------------------------------------

  /** Everything the profile's marks card shows for a student's published result in one examination. */
  async marksCard(tx: Tx, tenantId: string, studentId: string, sessionId: string): Promise<MarksCardData> {
    const [s] = await tx
      .select({ name: students.fullName, rollNo: students.rollNo, className: sections.displayName, programId: programs.id, programme: programs.name, campusId: programs.campusId })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(programs, eq(programs.id, sections.programId))
      .where(eq(students.id, studentId));
    if (!s) throw new NotFoundException('Student not found');
    const [session] = await tx.select().from(examSessions).where(eq(examSessions.id, sessionId));
    if (!session || !['published', 'locked'].includes(session.status)) throw new NotFoundException('No published result for that session');
    const [result] = await tx.select().from(examResults).where(and(eq(examResults.sessionId, sessionId), eq(examResults.studentId, studentId)));
    if (!result) throw new NotFoundException('No published result for that session');
    const res = await resolveAffiliation(tx, session.programId);
    if (!res) throw new NotFoundException(AFFILIATION_NOT_SET);
    const lines = await tx
      .select({ code: subjects.code, title: subjects.name, credits: examResultLines.credits, percent: examResultLines.percent, grade: examResultLines.grade, gradePoint: examResultLines.gradePoint, passed: examResultLines.passed, grace: examResultLines.grace, reasons: examResultLines.reasons, components: examResultLines.components })
      .from(examResultLines)
      .innerJoin(subjects, eq(subjects.id, examResultLines.subjectId))
      .where(eq(examResultLines.resultId, result.id));
    // Earlier failures in the programme mean this is not a first-attempt record (distinction needs one).
    const earlier = await tx
      .select({ passed: examResultLines.passed })
      .from(examResultLines)
      .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
      .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
      .where(and(eq(examResults.studentId, studentId), eq(examSessions.programId, session.programId), ne(examSessions.id, sessionId), inArray(examSessions.status, ['published', 'locked'])));
    const [tenant] = await tx.select({ name: tenants.name }).from(tenants);
    const [inst] = await tx.select().from(institutionProfiles);
    const [parent] = await tx.select({ name: users.fullName }).from(guardians).innerJoin(users, eq(users.id, guardians.userId)).where(eq(guardians.studentId, studentId)).orderBy(desc(guardians.isPrimary), asc(guardians.createdAt)).limit(1);
    return buildMarksCard({
      profile: { code: res.profile.code, name: res.profile.name, shortName: res.profile.shortName, scheme: res.scheme.code, schemeName: res.scheme.name, version: res.scheme.version },
      rules: res.rules,
      institution: { name: inst?.legalName ?? tenant?.name ?? '', code: inst?.affiliationNo ?? null, affiliationNo: inst?.affiliationNo ?? null },
      student: { name: s.name, registerNo: s.rollNo, programme: s.programme, branch: null, className: s.className, parentName: parent?.name ?? null, medium: null },
      exam: { name: session.name, term: session.term, endsOn: session.endsOn, kind: session.kind },
      lines: lines
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((l) => {
          const comps = (l.components as { kind: string; weight: number; weighted: number; fraction: number | null }[]) ?? [];
          return { code: l.code, title: l.title, credits: l.credits, percent: l.percent, grade: l.grade, gradePoint: l.gradePoint, passed: l.passed, grace: l.grace, absent: !l.passed && comps.some((c) => c.kind === 'external') && (l.reasons as string[]).includes('absent'), components: comps };
        }),
      sgpa: result.sgpa,
      cgpa: result.cgpa,
      creditsRegistered: result.creditsAttempted,
      creditsEarned: result.creditsEarned,
      creditPoints: result.creditPoints,
      firstAttempt: session.kind === 'regular' && earlier.every((e) => e.passed),
      serialNo: null,
      issuedOn: new Date().toISOString().slice(0, 10),
    });
  }

  // ---- university result formats ---------------------------------------------------------------

  /** Reads a university result sheet in the profile's layout; with `dryRun` false the rows go into the marks history. */
  async resultSheet(p: UserPrincipal, b: { csv: string; academicYear: string; term: number; programId?: string | null; fileName: string; dryRun: boolean }) {
    const res = await this.db.withTenant(p.tenantId, async (tx) => {
      if (b.programId) await this.programme(tx, b.programId);
      return resolveAffiliation(tx, b.programId ?? null);
    });
    if (!res) throw new BadRequestException(AFFILIATION_NOT_SET);
    const sheet = readResultSheet(res.rules, b.csv, { academicYear: b.academicYear, term: b.term });
    if (sheet.missing.length) throw new BadRequestException({ message: `The sheet is missing columns this profile needs: ${sheet.missing.join(', ')}`, missing: sheet.missing, expected: res.rules.resultSheet.columns });
    if (sheet.rows.length === 0) throw new BadRequestException({ message: 'No rows could be read', problems: sheet.problems });
    const identity = Object.fromEntries(['roll_no', 'academic_year', 'term', 'subject_code', 'subject_name', 'credits', 'internal_marks', 'external_marks', 'max_internal', 'max_external', 'grade', 'grade_point', 'result'].map((k) => [k, k]));
    const report = await this.migration.run(p, { entity: 'marks', bytes: Buffer.from(toMigrationCsv(sheet.rows), 'utf8'), fileName: b.fileName, mapping: identity, dryRun: b.dryRun, partial: true });
    return { profile: res.profile.code, scheme: res.scheme.code, columns: sheet.columns, unmatched: sheet.unmatched, skipped: sheet.problems, outcomes: sheet.rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.outcome]: (a[r.outcome] ?? 0) + 1 }), {}), report };
  }

  /** Saves the profile's tabulation register layout as a university-results template (the download format). */
  installTemplate(p: UserPrincipal, programId?: string | null) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (programId) await this.programme(tx, programId);
      const res = await resolveAffiliation(tx, programId ?? null);
      if (!res) throw new BadRequestException(AFFILIATION_NOT_SET);
      const t = templateFromProfile(res.profile, res.scheme, res.rules);
      const values = { name: t.name, university: t.university, config: t.config as unknown as Record<string, unknown>, active: true };
      const [row] = await tx.insert(universityTemplates).values({ tenantId: p.tenantId, code: t.code, ...values, createdBy: p.userId }).onConflictDoUpdate({ target: [universityTemplates.tenantId, universityTemplates.code], set: values }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'affiliation.template_installed', subjectType: 'university_template', subjectId: row.id, data: { code: t.code } });
      return row;
    });
  }

  private async programme(tx: Tx, programId: string) {
    const [g] = await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, programId));
    if (!g) throw new NotFoundException('Programme not found');
    return g;
  }
}
