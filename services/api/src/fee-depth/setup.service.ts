import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { feeStructures } from '../db/schema-g1.js';
import { feeInstalmentPlans, feeInstalments } from '../db/schema-depth.js';
import { feeAssignments, feeInvoiceLines, feeStudentProfiles } from '../db/schema-fee-depth.js';
import { academicTerms, academicYears, applications, courseOfferings, courseRegistrations, feeInvoices, hostelAllotments, programs, sections, students, tenants, transportAssignments } from '../db/schema.js';
import { fyOf } from '../fee-accounts/fee-accounts.logic.js';
import { prorataPercent, structureApplies, type StudentFeeFacts } from '../fees/fee-depth.logic.js';
import { splitInstalments } from '../fees/fees-depth.logic.js';
import { chargeHead, findHead, headsOf, raiseInvoice, reduceCharge, type FeeHeadRow, type NewLine } from '../fees/fee-lines.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type Structure = typeof feeStructures.$inferSelect;

/** What decides a student's fees: class, programme, campus, semester, batch, quota, category, modules and optional heads. */
export interface StudentFacts extends StudentFeeFacts {
  id: string;
  fullName: string;
  rollNo: string;
  sectionId: string;
  section: string;
  enrolledOn: string | null;
  optedHeads: string[];
  transport: boolean;
  hostel: boolean;
  credits: number;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Fee structures turned into invoices: who a structure applies to, each student's lines (optional heads only for
 * those in the linked module or who opted in, a credit-hour fee from registered credits, pro-rata for a late joiner),
 * bulk assignment, and re-assignment after the structure changes (only the difference is charged or taken off).
 */
@Injectable()
export class FeeSetupService {
  constructor(
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  async structure(tx: Tx, id: string): Promise<Structure> {
    const [fs] = await tx.select().from(feeStructures).where(eq(feeStructures.id, id));
    if (!fs) throw new NotFoundException('Fee structure not found');
    return fs;
  }

  /** Active students with the facts their fees depend on (all of them, or these). */
  async facts(tx: Tx, studentIds?: string[]): Promise<StudentFacts[]> {
    const today = await this.today(tx);
    const rows = await tx
      .select({
        id: students.id,
        fullName: students.fullName,
        rollNo: students.rollNo,
        sectionId: students.sectionId,
        section: sections.displayName,
        term: sections.term,
        programId: sections.programId,
        campusId: programs.campusId,
        enrolledOn: students.enrolledOn,
        yearLabel: academicYears.label,
        quota: feeStudentProfiles.quota,
        category: feeStudentProfiles.category,
        batch: feeStudentProfiles.batch,
        optedHeads: feeStudentProfiles.optedHeads,
        appCategory: applications.category,
      })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(programs, eq(programs.id, sections.programId))
      .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
      .leftJoin(feeStudentProfiles, eq(feeStudentProfiles.studentId, students.id))
      .leftJoin(applications, eq(applications.id, students.applicationId))
      .where(and(inArray(students.status, ['active', 'enrolled']), studentIds?.length ? inArray(students.id, studentIds) : undefined))
      .orderBy(asc(sections.displayName), asc(students.rollNo));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const onBus = new Set((await tx.select({ id: transportAssignments.studentId }).from(transportAssignments).where(and(inArray(transportAssignments.studentId, ids), sql`${transportAssignments.endedOn} is null`))).map((r) => r.id));
    const inHostel = new Set((await tx.select({ id: hostelAllotments.studentId }).from(hostelAllotments).where(and(inArray(hostelAllotments.studentId, ids), sql`${hostelAllotments.vacatedOn} is null`))).map((r) => r.id));
    const credits = new Map(
      (
        await tx
          .select({ id: courseRegistrations.studentId, credits: sql<number>`coalesce(sum(${courseOfferings.credits}), 0)`.mapWith(Number) })
          .from(courseRegistrations)
          .innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId))
          .innerJoin(academicTerms, eq(academicTerms.id, courseRegistrations.termId))
          .where(and(inArray(courseRegistrations.studentId, ids), eq(courseRegistrations.status, 'registered'), sql`${academicTerms.startsOn} <= ${today}::date and ${academicTerms.endsOn} >= ${today}::date`))
          .groupBy(courseRegistrations.studentId)
      ).map((r) => [r.id, r.credits]),
    );
    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      rollNo: r.rollNo,
      sectionId: r.sectionId,
      section: r.section,
      enrolledOn: r.enrolledOn,
      programId: r.programId,
      campusId: r.campusId,
      term: r.term,
      // The batch is the year they joined: the profile's, or the start of their enrolment year.
      batch: r.batch ?? (r.enrolledOn ? r.enrolledOn.slice(0, 4) : null),
      quota: r.quota,
      category: r.category ?? r.appCategory,
      optedHeads: r.optedHeads ?? [],
      transport: onBus.has(r.id),
      hostel: inHostel.has(r.id),
      credits: credits.get(r.id) ?? 0,
    }));
  }

  /** The structure's items as fee heads (an item naming an unknown head is charged under its own name). */
  itemHeads(fs: Structure, heads: FeeHeadRow[]) {
    return fs.items.map((i) => {
      const h = (i.code && heads.find((x) => x.code === i.code)) || findHead(heads, i.head);
      return { item: i, head: h ?? null, code: h?.code ?? i.code ?? 'GEN', name: h?.name ?? i.head, priority: h?.sortOrder ?? 500, gstRate: h?.gstRate ?? 0 };
    });
  }

  /** One student's lines under the structure, before any pro-rata. */
  linesFor(fs: Structure, heads: FeeHeadRow[], st: StudentFacts): NewLine[] {
    const lines: NewLine[] = [];
    for (const x of this.itemHeads(fs, heads)) {
      const h = x.head;
      if (h?.optional) {
        const takes = h.linkedModule === 'transport' ? st.transport : h.linkedModule === 'hostel' ? st.hostel : st.optedHeads.includes(h.code);
        if (!takes) continue;
      }
      lines.push({ code: x.code, name: x.name, priority: x.priority, amountPaise: x.item.amountPaise, gstRate: x.gstRate });
    }
    if (fs.perCreditPaise > 0 && st.credits > 0) {
      const h = (fs.creditHead && heads.find((x) => x.code === fs.creditHead)) || heads.find((x) => x.kind === 'tuition');
      lines.push({ code: h?.code ?? 'CRD', name: h ? `${h.name} (credit hours)` : 'Credit-hour fee', priority: h?.sortOrder ?? 10, amountPaise: Math.round(fs.perCreditPaise * st.credits), gstRate: h?.gstRate ?? 0 });
    }
    return lines;
  }

  /** The year (or term) a structure's pro-rata counts over. */
  async termRange(tx: Tx, fs: Structure, given?: { termStart?: string; termEnd?: string }): Promise<{ start: string; end: string } | null> {
    if (given?.termStart && given.termEnd) return { start: given.termStart, end: given.termEnd };
    if (!fs.academicYear) return null;
    const [y] = await tx.select().from(academicYears).where(eq(academicYears.label, fs.academicYear));
    return y ? { start: y.startsOn, end: y.endsOn } : { start: `${fs.academicYear.slice(0, 4)}-06-01`, end: `${Number(fs.academicYear.slice(0, 4)) + 1}-03-31` };
  }

  /** Who the structure applies to, what each would be charged, and who already has it. */
  async preview(tx: Tx, tenantId: string, id: string, o: { prorata?: boolean; termStart?: string; termEnd?: string; studentIds?: string[] } = {}) {
    const fs = await this.structure(tx, id);
    const heads = await headsOf(tx, tenantId);
    const range = o.prorata ? await this.termRange(tx, fs, o) : null;
    const today = await this.today(tx);
    const all = (await this.facts(tx, o.studentIds)).filter((st) => structureApplies(fs, st));
    const assigned = new Set((await tx.select({ id: feeAssignments.studentId }).from(feeAssignments).where(and(eq(feeAssignments.structureId, id), eq(feeAssignments.status, 'active')))).map((r) => r.id));
    return all.map((st) => {
      const pct = range ? prorataPercent(range.start, range.end, st.enrolledOn ?? today) : 100;
      const lines = this.linesFor(fs, heads, st).map((l) => ({ ...l, amountPaise: Math.round((l.amountPaise * pct) / 100) }));
      return { studentId: st.id, fullName: st.fullName, rollNo: st.rollNo, section: st.section, quota: st.quota, category: st.category, batch: st.batch, prorataPercent: pct, amountPaise: lines.reduce((s, l) => s + l.amountPaise, 0), lines, assigned: assigned.has(st.id) };
    });
  }

  /** Raises the structure's invoice for every matching student who does not have it yet. */
  async assign(tx: Tx, p: UserPrincipal, id: string, o: { studentIds?: string[]; dueOn?: string; prorata?: boolean; termStart?: string; termEnd?: string }) {
    const fs = await this.structure(tx, id);
    if (fs.status !== 'published' || !fs.active) throw new ConflictException('Only a published structure can be assigned');
    const rows = (await this.preview(tx, p.tenantId, id, o)).filter((r) => !r.assigned && r.amountPaise > 0);
    if (o.studentIds?.length && !rows.length) throw new BadRequestException('None of these students can be given this structure (they have it, or it does not apply to them)');
    const today = await this.today(tx);
    const dueOn = o.dueOn ?? addDays(today, fs.dueInDays);
    const facts = new Map((await this.facts(tx, rows.map((r) => r.studentId))).map((f) => [f.id, f]));
    const [plan] = fs.instalmentPlanId ? await tx.select().from(feeInstalmentPlans).where(and(eq(feeInstalmentPlans.id, fs.instalmentPlanId), eq(feeInstalmentPlans.active, true))) : [];
    const batchId = crypto.randomUUID();
    for (const r of rows) {
      const st = facts.get(r.studentId)!;
      const inv = await raiseInvoice(tx, { tenantId: p.tenantId, studentId: r.studentId, sectionId: st.sectionId, title: fs.name, dueOn, createdBy: p.userId, lines: r.lines, batchId, structureId: fs.id, academicYear: fs.academicYear ?? fyOf(today), kind: 'fee' });
      await tx.insert(feeAssignments).values({ tenantId: p.tenantId, structureId: fs.id, studentId: r.studentId, invoiceId: inv.id, amountPaise: r.amountPaise, prorataPercent: r.prorataPercent, assignedBy: p.userId });
      if (plan) await tx.insert(feeInstalments).values(splitInstalments(inv.amountPaise, inv.dueOn, plan.parts).map((x) => ({ tenantId: p.tenantId, invoiceId: inv.id, planId: plan.id, ...x })));
    }
    if (rows.length) {
      // One notice per amount, so families see their own figure.
      const byAmount = new Map<number, string[]>();
      for (const r of rows) byAmount.set(r.amountPaise, [...(byAmount.get(r.amountPaise) ?? []), r.studentId]);
      for (const [amountPaise, ids] of byAmount) await this.notifications.feeIssued(tx, { batchId: `${batchId}:${amountPaise}`, title: fs.name, amountPaise, dueOn, studentIds: ids });
    }
    await auditUser(tx, p, 'fee_structure.assigned', 'fee_structure', id, { students: rows.length, prorata: !!o.prorata, dueOn });
    return { assigned: rows.length, amountPaise: rows.reduce((s, r) => s + r.amountPaise, 0), dueOn, students: rows.map((r) => ({ studentId: r.studentId, fullName: r.fullName, amountPaise: r.amountPaise, prorataPercent: r.prorataPercent })) };
  }

  /**
   * After a published structure changes (a new head, a revised amount), brings every student who has it in line:
   * each head's difference is added to, or taken off, the student's invoice; what was paid is never touched.
   */
  async reassign(tx: Tx, p: UserPrincipal, id: string) {
    const fs = await this.structure(tx, id);
    const heads = await headsOf(tx, p.tenantId);
    const active = await tx.select().from(feeAssignments).where(and(eq(feeAssignments.structureId, id), eq(feeAssignments.status, 'active')));
    const facts = new Map((await this.facts(tx, active.map((a) => a.studentId))).map((f) => [f.id, f]));
    const report: { studentId: string; fullName: string; beforePaise: number; afterPaise: number; deltaPaise: number; note?: string }[] = [];
    for (const a of active) {
      const st = facts.get(a.studentId);
      if (!a.invoiceId || !st) continue;
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, a.invoiceId));
      if (!inv || inv.status === 'cancelled' || inv.carriedTo) {
        report.push({ studentId: a.studentId, fullName: st.fullName, beforePaise: a.amountPaise, afterPaise: a.amountPaise, deltaPaise: 0, note: 'Invoice closed; left as it is' });
        continue;
      }
      const want = new Map<string, NewLine>();
      for (const l of this.linesFor(fs, heads, st)) want.set(l.code, { ...l, amountPaise: Math.round((l.amountPaise * a.prorataPercent) / 100) });
      const have = await tx.select().from(feeInvoiceLines).where(eq(feeInvoiceLines.invoiceId, inv.id));
      let after = 0;
      let delta = 0;
      const codes = new Set([...want.keys(), ...have.map((h) => h.headCode)]);
      for (const code of codes) {
        // Fines and charges added later are not part of the structure.
        const line = have.find((h) => h.headCode === code);
        const target = want.get(code);
        if (!target && (line?.headCode === 'FIN' || heads.find((h) => h.code === code)?.kind === 'fine')) continue;
        const now = line?.amountPaise ?? 0;
        const goal = target?.amountPaise ?? 0;
        after += goal;
        if (goal > now) {
          await chargeHead(tx, inv.id, { code, name: target?.name ?? line?.headName ?? code, priority: target?.priority ?? line?.priority ?? 500, gstRate: target?.gstRate ?? 0 }, goal - now);
          delta += goal - now;
        } else if (goal < now) {
          const off = await reduceCharge(tx, inv.id, now - goal, [code]);
          delta -= off;
          if (off < now - goal) after += now - goal - off;
        }
      }
      if (delta !== 0) await tx.update(feeAssignments).set({ amountPaise: after }).where(eq(feeAssignments.id, a.id));
      report.push({ studentId: a.studentId, fullName: st.fullName, beforePaise: a.amountPaise, afterPaise: delta !== 0 ? after : a.amountPaise, deltaPaise: delta, ...(delta !== 0 && after !== a.amountPaise + delta ? { note: 'Part was already paid, so less came off' } : {}) });
    }
    await auditUser(tx, p, 'fee_structure.reassigned', 'fee_structure', id, { students: report.length, changed: report.filter((r) => r.deltaPaise !== 0).length });
    return { students: report.length, changed: report.filter((r) => r.deltaPaise !== 0).length, rows: report };
  }
}
