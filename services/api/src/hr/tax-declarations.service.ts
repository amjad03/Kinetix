import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { seal, unseal } from '../common/sensitive.js';
import type { Tx } from '../db/db.service.js';
import { staffProfiles, users } from '../db/schema.js';
import { taxDeclarationItems, taxDeclarations, type AppliedDeclaration } from '../db/schema-hr3.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { hasAnyRole, PAYROLL_ROLES, requireVersion } from './hr.access.js';
import { HrService } from './hr.service.js';
import { annualTax, SECTION_80C_LIMIT } from './payroll-math.js';
import { PayrollService } from './payroll.service.js';
import { declarationFigures, LANDLORD_PAN_ABOVE_PAISE, SECTION_LABELS, type DeclarationFigures, type DeclarationSection } from './tax-declaration.logic.js';

type Decl = typeof taxDeclarations.$inferSelect;
type Item = typeof taxDeclarationItems.$inferSelect;

export const fyLabel = (fy: number) => `${fy}-${String(fy + 1).slice(2)}`;
/** The financial year (its first calendar year) a date falls in. */
export const fyOfDate = (d: string) => (Number(d.slice(5, 7)) >= 4 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1);
export const landlordAad = (tenantId: string, id: string) => `${tenantId}:tax_declaration.${id}.landlord_pan`;
/** Karnataka professional tax for a full year (₹200 × 11 + ₹300 in February), used only for the regime comparison. */
const PT_YEAR_PAISE = 2_500_00;
/** Who reviews declarations and proofs. */
const sqlHr = sql`select distinct user_id as id from user_roles where role in ('hr_manager', 'accountant', 'principal')`;

export interface DeclarationInput {
  fy: number;
  regime: 'old' | 'new';
  rentMonthlyPaise: number;
  rentMonths: number;
  metro: boolean;
  landlordName: string;
  landlordPan: string | null;
  items: { section: DeclarationSection; label: string; declaredPaise: number }[];
  expectedVersion?: number;
}

/**
 * Investment declarations (Form 12BB) and proofs. Approving a declaration sets the staff record's regime and the 80C and
 * other deductions TDS uses (payroll.service.ts reads them every run); verifying the proofs replaces them with the
 * accepted amounts. The last values applied are kept on the declaration for the audit trail and Form 16.
 */
@Injectable()
export class TaxDeclarationsService {
  constructor(
    private readonly hr: HrService,
    private readonly payroll: PayrollService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Yearly basic + DA, HRA and taxable gross from the staff member's latest salary structure. */
  private async salary(tx: Tx, userId: string) {
    const [s] = await this.payroll.structures(tx, userId);
    const m = (codes: string[]) => (s?.lines ?? []).filter((l) => codes.includes(l.code)).reduce((n, l) => n + l.monthlyPaise, 0);
    const [prof] = await tx.select({ pfEnabled: staffProfiles.pfEnabled }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
    const basicDa = m(['BASIC', 'DA']) * 12;
    return { basicDaPaise: basicDa, hraPaise: m(['HRA']) * 12, grossPaise: (s?.monthlyGrossPaise ?? 0) * 12, pfPaise: prof?.pfEnabled ? Math.round(Math.min(m(['BASIC', 'DA']), 15_000_00) * 0.12) * 12 : 0 };
  }

  private figures(d: Decl, items: Item[], sal: { basicDaPaise: number; hraPaise: number }, accepted: boolean): DeclarationFigures {
    const amounts = items.map((i) => ({ section: i.section, amountPaise: accepted ? (i.proofStatus === 'accepted' ? (i.acceptedPaise ?? 0) : 0) : i.declaredPaise }));
    const rent = d.rentMonthlyPaise * d.rentMonths;
    return declarationFigures(d.regime as 'old', amounts, rent > 0 ? { hraPaise: sal.hraPaise, salaryPaise: sal.basicDaPaise, rentPaise: rent, metro: d.metro } : null);
  }

  async view(tx: Tx, d: Decl) {
    const items = await tx.select().from(taxDeclarationItems).where(eq(taxDeclarationItems.declarationId, d.id)).orderBy(asc(taxDeclarationItems.createdAt), asc(taxDeclarationItems.id));
    const [u] = await tx.select({ fullName: users.fullName, code: staffProfiles.employeeCode }).from(users).leftJoin(staffProfiles, eq(staffProfiles.userId, users.id)).where(eq(users.id, d.userId));
    const sal = await this.salary(tx, d.userId);
    const declared = this.figures(d, items, sal, false);
    // What tax each regime would come to on this year's pay, so the staff member can choose.
    const oldFig = d.regime === 'old' ? declared : this.figures({ ...d, regime: 'old' }, items, sal, false);
    const estimate = {
      oldPaise: annualTax('old', { grossPaise: sal.grossPaise, professionalTaxPaise: PT_YEAR_PAISE, section80cPaise: Math.min(oldFig.section80cPaise + sal.pfPaise, SECTION_80C_LIMIT), otherDeductionsPaise: oldFig.otherDeductionsPaise }),
      newPaise: annualTax('new', { grossPaise: sal.grossPaise }),
      grossPaise: sal.grossPaise,
    };
    return {
      id: d.id,
      userId: d.userId,
      fullName: u?.fullName ?? '',
      employeeCode: u?.code ?? null,
      fy: d.fy,
      fyLabel: fyLabel(d.fy),
      regime: d.regime,
      status: d.status,
      rentMonthlyPaise: d.rentMonthlyPaise,
      rentMonths: d.rentMonths,
      metro: d.metro,
      landlordName: d.landlordName,
      landlordPan: d.landlordPanEnc ? unseal(landlordAad(d.tenantId, d.id), d.landlordPanEnc) : null,
      items: items.map((i) => ({ id: i.id, section: i.section, sectionLabel: SECTION_LABELS[i.section as DeclarationSection] ?? i.section, label: i.label, declaredPaise: i.declaredPaise, proofStatus: i.proofStatus, proofName: i.proofName, acceptedPaise: i.acceptedPaise, proofNote: i.proofNote })),
      declared,
      accepted: d.status === 'verified' ? this.figures(d, items, sal, true) : null,
      estimate,
      applied: d.applied,
      decisionNote: d.decisionNote,
      submittedAt: d.submittedAt?.toISOString() ?? null,
      approvedAt: d.approvedAt?.toISOString() ?? null,
      proofsSubmittedAt: d.proofsSubmittedAt?.toISOString() ?? null,
      verifiedAt: d.verifiedAt?.toISOString() ?? null,
      version: d.version,
    };
  }

  async load(tx: Tx, id: string, forUpdate = false): Promise<Decl> {
    const q = tx.select().from(taxDeclarations).where(eq(taxDeclarations.id, id));
    const [d] = forUpdate ? await q.for('update') : await q;
    if (!d) throw new NotFoundException('Declaration not found');
    return d;
  }

  async mine(tx: Tx, userId: string, fy: number) {
    const [d] = await tx.select().from(taxDeclarations).where(and(eq(taxDeclarations.userId, userId), eq(taxDeclarations.fy, fy)));
    return d ? this.view(tx, d) : null;
  }

  async listMine(tx: Tx, userId: string) {
    const rows = await tx.select().from(taxDeclarations).where(eq(taxDeclarations.userId, userId)).orderBy(desc(taxDeclarations.fy));
    return Promise.all(rows.map((r) => this.view(tx, r)));
  }

  /** Saves the staff member's own declaration (a draft, or one sent back); a new one is made on first save. */
  async save(tx: Tx, p: UserPrincipal, b: DeclarationInput) {
    const today = await this.hr.today(tx);
    const fy = fyOfDate(today);
    if (b.fy !== fy && b.fy !== fy + 1) throw new BadRequestException(`Declare for ${fyLabel(fy)} or ${fyLabel(fy + 1)}`);
    if (!(await this.hr.isStaff(tx, p.userId))) throw new ForbiddenException('Only staff declare investments');
    const [existing] = await tx.select().from(taxDeclarations).where(and(eq(taxDeclarations.userId, p.userId), eq(taxDeclarations.fy, b.fy))).for('update');
    if (existing && !['draft', 'rejected'].includes(existing.status)) throw new ConflictException(`This declaration is ${existing.status.replace('_', ' ')}; it cannot be changed now`);
    if (existing) requireVersion(existing.version, b.expectedVersion);
    const values = { regime: b.regime, rentMonthlyPaise: b.rentMonthlyPaise, rentMonths: b.rentMonths, metro: b.metro, landlordName: b.landlordName, status: 'draft', updatedAt: new Date() };
    const d = existing
      ? (await tx.update(taxDeclarations).set({ ...values, version: existing.version + 1 }).where(eq(taxDeclarations.id, existing.id)).returning())[0]
      : (await tx.insert(taxDeclarations).values({ tenantId: p.tenantId, userId: p.userId, fy: b.fy, ...values }).returning())[0];
    await tx.update(taxDeclarations).set({ landlordPanEnc: b.landlordPan ? seal(landlordAad(p.tenantId, d.id), b.landlordPan) : null }).where(eq(taxDeclarations.id, d.id));
    await tx.delete(taxDeclarationItems).where(eq(taxDeclarationItems.declarationId, d.id));
    if (b.items.length) await tx.insert(taxDeclarationItems).values(b.items.map((i) => ({ tenantId: p.tenantId, declarationId: d.id, section: i.section, label: i.label, declaredPaise: i.declaredPaise })));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: existing ? 'tax_declaration.updated' : 'tax_declaration.created', subjectType: 'tax_declaration', subjectId: d.id, data: { fy: b.fy, regime: b.regime, items: b.items.length, totalPaise: b.items.reduce((n, i) => n + i.declaredPaise, 0) } });
    return this.view(tx, await this.load(tx, d.id));
  }

  private async hrIds(tx: Tx): Promise<string[]> {
    const rows = await tx.execute<{ id: string }>(sqlHr);
    return rows.rows.map((r) => r.id);
  }

  async submit(tx: Tx, p: UserPrincipal, fy: number, proofs: boolean) {
    const [d] = await tx.select().from(taxDeclarations).where(and(eq(taxDeclarations.userId, p.userId), eq(taxDeclarations.fy, fy))).for('update');
    if (!d) throw new NotFoundException('Save your declaration first');
    const items = await tx.select().from(taxDeclarationItems).where(eq(taxDeclarationItems.declarationId, d.id));
    if (!proofs) {
      if (!['draft', 'rejected'].includes(d.status)) throw new ConflictException(`This declaration is already ${d.status.replace('_', ' ')}`);
      if (d.regime === 'old' && d.rentMonthlyPaise * d.rentMonths > LANDLORD_PAN_ABOVE_PAISE && !d.landlordPanEnc) throw new BadRequestException("Rent above ₹1 lakh a year needs the landlord's PAN");
      await tx.update(taxDeclarations).set({ status: 'submitted', submittedAt: new Date(), decisionNote: '', version: d.version + 1, updatedAt: new Date() }).where(eq(taxDeclarations.id, d.id));
    } else {
      if (d.status !== 'approved') throw new ConflictException(d.status === 'proofs_submitted' ? 'Your proofs are already with HR' : 'Proofs follow an approved declaration');
      if (d.regime === 'old' && items.length && !items.some((i) => i.proofStatus === 'submitted')) throw new BadRequestException('Attach at least one proof');
      await tx.update(taxDeclarations).set({ status: 'proofs_submitted', proofsSubmittedAt: new Date(), version: d.version + 1, updatedAt: new Date() }).where(eq(taxDeclarations.id, d.id));
    }
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: proofs ? 'tax_declaration.proofs_submitted' : 'tax_declaration.submitted', subjectType: 'tax_declaration', subjectId: d.id, data: { fy } });
    const [me] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, p.userId));
    await this.notifications.notifyUsers(tx, (await this.hrIds(tx)).filter((x) => x !== p.userId), { kind: 'task', text: texts.taxDeclarationSubmitted({ name: me.fullName, fy: fyLabel(fy), proofs }), data: { declarationId: d.id }, dedupeKey: `tax-decl:${d.id}:${proofs ? 'proofs' : 'decl'}:${d.version + 1}` });
    return this.view(tx, await this.load(tx, d.id));
  }

  /** Writes the figures onto the staff record (TDS reads them) and keeps what was applied. */
  private async apply(tx: Tx, p: UserPrincipal, d: Decl, basis: 'declared' | 'verified') {
    const items = await tx.select().from(taxDeclarationItems).where(eq(taxDeclarationItems.declarationId, d.id));
    const f = this.figures(d, items, await this.salary(tx, d.userId), basis === 'verified');
    const [before] = await tx.select({ taxRegime: staffProfiles.taxRegime, tax80cPaise: staffProfiles.tax80cPaise, taxOtherDeductionsPaise: staffProfiles.taxOtherDeductionsPaise }).from(staffProfiles).where(eq(staffProfiles.userId, d.userId));
    if (!before) throw new ConflictException('This staff member has no HR record');
    const after = { taxRegime: d.regime, tax80cPaise: f.section80cPaise, taxOtherDeductionsPaise: f.otherDeductionsPaise };
    // A declaration for next year waits: the staff record carries the current year's figures until April.
    if (d.fy === fyOfDate(await this.hr.today(tx))) {
      await tx.update(staffProfiles).set({ ...after, updatedAt: new Date() }).where(eq(staffProfiles.userId, d.userId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.tax_figures_applied', subjectType: 'user', subjectId: d.userId, before, after, data: { declarationId: d.id, basis } });
    }
    const applied: AppliedDeclaration = { basis, regime: d.regime as 'old', section80cPaise: f.section80cPaise, otherDeductionsPaise: f.otherDeductionsPaise, hraExemptPaise: f.hraExemptPaise, at: new Date().toISOString() };
    return applied;
  }

  async approve(tx: Tx, p: UserPrincipal, id: string, expected: number | undefined, note: string) {
    const d = await this.load(tx, id, true);
    if (d.userId === p.userId) throw new ForbiddenException('Someone else approves your own declaration');
    if (d.status !== 'submitted') throw new ConflictException(`A ${d.status.replace('_', ' ')} declaration cannot be approved`);
    requireVersion(d.version, expected);
    const applied = await this.apply(tx, p, d, 'declared');
    await tx.update(taxDeclarations).set({ status: 'approved', approvedBy: p.userId, approvedAt: new Date(), decisionNote: note, applied, version: d.version + 1, updatedAt: new Date() }).where(eq(taxDeclarations.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tax_declaration.approved', subjectType: 'tax_declaration', subjectId: id, data: { fy: d.fy, ...applied } });
    await this.notifications.notifyUsers(tx, [d.userId], { kind: 'task', text: texts.taxDeclarationDecided({ status: 'approved', fy: fyLabel(d.fy), note }), data: { declarationId: id }, dedupeKey: `tax-decl-dec:${id}:${d.version + 1}` });
    return this.view(tx, await this.load(tx, id));
  }

  /** Sends a declaration back (submitted → rejected) or its proofs back (proofs_submitted → approved). */
  async reject(tx: Tx, p: UserPrincipal, id: string, expected: number | undefined, note: string) {
    const d = await this.load(tx, id, true);
    if (d.userId === p.userId) throw new ForbiddenException('Someone else decides your own declaration');
    if (d.status !== 'submitted' && d.status !== 'proofs_submitted') throw new ConflictException(`A ${d.status.replace('_', ' ')} declaration cannot be sent back`);
    requireVersion(d.version, expected);
    const to = d.status === 'submitted' ? 'rejected' : 'approved';
    await tx.update(taxDeclarations).set({ status: to, decisionNote: note, version: d.version + 1, updatedAt: new Date() }).where(eq(taxDeclarations.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tax_declaration.sent_back', subjectType: 'tax_declaration', subjectId: id, changes: { status: { before: d.status, after: to } }, data: { note } });
    await this.notifications.notifyUsers(tx, [d.userId], { kind: 'task', text: texts.taxDeclarationDecided({ status: 'rejected', fy: fyLabel(d.fy), note }), data: { declarationId: id }, dedupeKey: `tax-decl-dec:${id}:${d.version + 1}` });
    return this.view(tx, await this.load(tx, id));
  }

  /** Accepts each proof for an amount up to what was declared (or rejects it); TDS then uses the accepted figures. */
  async verify(tx: Tx, p: UserPrincipal, id: string, expected: number | undefined, decisions: { id: string; accepted: boolean; acceptedPaise?: number; note?: string }[], note: string) {
    const d = await this.load(tx, id, true);
    if (d.userId === p.userId) throw new ForbiddenException('Someone else verifies your own proofs');
    if (d.status !== 'proofs_submitted') throw new ConflictException('Verify after the proofs are submitted');
    requireVersion(d.version, expected);
    const items = await tx.select().from(taxDeclarationItems).where(eq(taxDeclarationItems.declarationId, id));
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const x of decisions) {
      const it = byId.get(x.id);
      if (!it) throw new NotFoundException('Declaration item not found');
      const amount = x.accepted ? (x.acceptedPaise ?? it.declaredPaise) : 0;
      if (amount > it.declaredPaise) throw new BadRequestException(`More than was declared for ${it.label || it.section}`);
      await tx.update(taxDeclarationItems).set({ proofStatus: x.accepted ? 'accepted' : 'rejected', acceptedPaise: amount, proofNote: x.note ?? '' }).where(eq(taxDeclarationItems.id, it.id));
    }
    // Items without a decision and without a proof count for nothing.
    const decided = new Set(decisions.map((x) => x.id));
    const left = items.filter((i) => !decided.has(i.id)).map((i) => i.id);
    if (left.length) await tx.update(taxDeclarationItems).set({ proofStatus: 'rejected', acceptedPaise: 0, proofNote: 'No proof' }).where(inArray(taxDeclarationItems.id, left));
    const fresh = await this.load(tx, id);
    const applied = await this.apply(tx, p, fresh, 'verified');
    await tx.update(taxDeclarations).set({ status: 'verified', verifiedBy: p.userId, verifiedAt: new Date(), decisionNote: note, applied, version: d.version + 1, updatedAt: new Date() }).where(eq(taxDeclarations.id, id));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'tax_declaration.verified', subjectType: 'tax_declaration', subjectId: id, data: { fy: d.fy, ...applied } });
    await this.notifications.notifyUsers(tx, [d.userId], { kind: 'task', text: texts.taxDeclarationDecided({ status: 'verified', fy: fyLabel(d.fy), note }), data: { declarationId: id }, dedupeKey: `tax-decl-dec:${id}:${d.version + 1}` });
    return this.view(tx, await this.load(tx, id));
  }

  /** The item a proof is attached to, for its owner while the declaration is approved. */
  async itemForProof(tx: Tx, p: UserPrincipal, itemId: string) {
    const [x] = await tx.select({ item: taxDeclarationItems, d: taxDeclarations }).from(taxDeclarationItems).innerJoin(taxDeclarations, eq(taxDeclarations.id, taxDeclarationItems.declarationId)).where(eq(taxDeclarationItems.id, itemId));
    if (!x || x.d.userId !== p.userId) throw new NotFoundException('Declaration item not found');
    if (x.d.status !== 'approved') throw new ConflictException('Attach proofs once the declaration is approved and before they are submitted');
    return x;
  }

  async itemForDownload(tx: Tx, p: UserPrincipal, itemId: string) {
    const [x] = await tx.select({ item: taxDeclarationItems, d: taxDeclarations }).from(taxDeclarationItems).innerJoin(taxDeclarations, eq(taxDeclarations.id, taxDeclarationItems.declarationId)).where(eq(taxDeclarationItems.id, itemId));
    if (!x?.item.proofKey || (x.d.userId !== p.userId && !hasAnyRole(p, PAYROLL_ROLES))) throw new NotFoundException('No proof attached');
    return x.item;
  }
}
