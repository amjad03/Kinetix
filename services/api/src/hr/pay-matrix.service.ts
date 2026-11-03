import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { salaryComponents, staffProfiles, users } from '../db/schema.js';
import { salaryComponentRates } from '../db/schema-hr2.js';
import { serviceBookEntries } from '../db/schema-hrpay.js';
import { payMatrixLevels, payMatrixMoves } from '../db/schema-hr3.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { HrService } from './hr.service.js';
import { fixOnPromotion, hraPercent, incrementDue, matrixCells, UGC_7CPC_LEVELS } from './pay-matrix.logic.js';
import { roundRupee } from './payroll-math.js';
import { PayrollService, rateIn } from './payroll.service.js';

type Level = typeof payMatrixLevels.$inferSelect;

export interface PlaceInput {
  levelId: string;
  /** The cell; for a promotion leave it out and pay is fixed by the 7th CPC rule. */
  cell?: number;
  effectiveFrom: string;
  kind: 'placement' | 'promotion';
  hraClass?: 'X' | 'Y' | 'Z';
  orderNo: string;
  note: string;
}

/**
 * Staff on the 7th CPC pay matrix: placement, annual increments and pay fixation on promotion. Each move writes the
 * salary structure (basic from the cell, DA at the rate in force, HRA by city class, other lines kept), a move record,
 * a service book entry and an audit entry, and tells the staff member.
 */
@Injectable()
export class PayMatrixService {
  constructor(
    private readonly hr: HrService,
    private readonly payroll: PayrollService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The levels, seeded with the UGC 7th CPC academic levels the first time. */
  async levels(tx: Tx, tenantId: string): Promise<Level[]> {
    const [any] = await tx.select({ id: payMatrixLevels.id }).from(payMatrixLevels).limit(1);
    if (!any) await tx.insert(payMatrixLevels).values(UGC_7CPC_LEVELS.map((l, i) => ({ tenantId, scheme: 'ugc_7cpc', level: l.level, name: l.name, cadre: l.cadre, cells: matrixCells(l.entryPaise, l.cells), sortOrder: (i + 1) * 10 }))).onConflictDoNothing();
    return tx.select().from(payMatrixLevels).orderBy(asc(payMatrixLevels.scheme), asc(payMatrixLevels.sortOrder), asc(payMatrixLevels.level));
  }

  async addLevel(tx: Tx, p: UserPrincipal, b: { scheme: string; level: string; name: string; cadre: string | null; entryPaise?: number; count?: number; cells?: number[] }) {
    const cells = b.cells?.length ? b.cells : b.entryPaise && b.count ? matrixCells(b.entryPaise, b.count) : null;
    if (!cells) throw new BadRequestException('Give the cells, or the entry pay and how many cells');
    if (cells.some((c, k) => k > 0 && c <= cells[k - 1])) throw new BadRequestException('Each cell must be more than the one before');
    const [dup] = await tx.select({ id: payMatrixLevels.id }).from(payMatrixLevels).where(and(eq(payMatrixLevels.scheme, b.scheme), eq(payMatrixLevels.level, b.level)));
    if (dup) throw new ConflictException('That level is already in the matrix');
    const [row] = await tx.insert(payMatrixLevels).values({ tenantId: p.tenantId, scheme: b.scheme, level: b.level, name: b.name, cadre: b.cadre, cells, sortOrder: 1000 }).returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'pay_matrix.level_added', subjectType: 'pay_matrix_level', subjectId: row.id, after: { scheme: b.scheme, level: b.level, cells: cells.length } });
    return row;
  }

  private async level(tx: Tx, id: string): Promise<Level> {
    const [l] = await tx.select().from(payMatrixLevels).where(eq(payMatrixLevels.id, id));
    if (!l) throw new NotFoundException('Pay level not found');
    return l;
  }

  /** The DA component (a percentage of basic), made the first time a matrix structure needs it. */
  private async daComponent(tx: Tx, tenantId: string) {
    await this.payroll.components(tx, tenantId);
    const [da] = await tx.select().from(salaryComponents).where(eq(salaryComponents.code, 'DA'));
    if (da) return da;
    const [row] = await tx.insert(salaryComponents).values({ tenantId, code: 'DA', name: 'Dearness allowance', kind: 'earning', pfWage: true, taxable: true, sortOrder: 2, calc: 'percent', percent: 0, baseCode: 'BASIC' }).returning();
    return row;
  }

  /** Writes the structure for a basic pay from `effectiveFrom`: basic, DA, HRA by city class, and every other line kept. */
  private async writeStructure(tx: Tx, p: UserPrincipal, userId: string, effectiveFrom: string, basicPaise: number, hraClass: string) {
    const comps = await this.payroll.components(tx, p.tenantId);
    const da = await this.daComponent(tx, p.tenantId);
    const basic = comps.find((c) => c.code === 'BASIC');
    const hra = comps.find((c) => c.code === 'HRA');
    if (!basic || !hra) throw new ConflictException('The BASIC and HRA salary components are needed');
    const rates = await tx.select().from(salaryComponentRates).where(eq(salaryComponentRates.componentId, da.id));
    const daPercent = rateIn(rates, da.id, effectiveFrom.slice(0, 7)) ?? da.percent ?? 0;
    const [current] = await this.payroll.structures(tx, userId);
    const keep = (current?.lines ?? []).filter((l) => !['BASIC', 'DA', 'HRA'].includes(l.code)).map((l) => ({ componentId: l.componentId, monthlyPaise: l.monthlyPaise }));
    const hraPaise = roundRupee((basicPaise * hraPercent(hraClass, daPercent)) / 100);
    const lines = [{ componentId: basic.id, monthlyPaise: basicPaise }, { componentId: da.id, monthlyPaise: 1 }, { componentId: hra.id, monthlyPaise: hraPaise }, ...keep];
    return { structure: await this.payroll.saveStructure(tx, p, userId, effectiveFrom, lines), daPercent, hraPaise };
  }

  private async record(tx: Tx, p: UserPrincipal, m: { userId: string; kind: 'placement' | 'increment' | 'promotion'; effectiveFrom: string; from: { levelId: string | null; cell: number | null; basic: number | null }; to: { level: Level; cell: number; basic: number }; orderNo: string; note: string }) {
    const [dup] = await tx.select({ id: payMatrixMoves.id }).from(payMatrixMoves).where(and(eq(payMatrixMoves.userId, m.userId), eq(payMatrixMoves.kind, m.kind), eq(payMatrixMoves.effectiveFrom, m.effectiveFrom)));
    if (dup) throw new ConflictException(`There is already a ${m.kind} for this staff member from ${m.effectiveFrom}`);
    const [move] = await tx.insert(payMatrixMoves).values({ tenantId: p.tenantId, userId: m.userId, kind: m.kind, effectiveFrom: m.effectiveFrom, fromLevelId: m.from.levelId, fromCell: m.from.cell, fromBasicPaise: m.from.basic, toLevelId: m.to.level.id, toCell: m.to.cell, toBasicPaise: m.to.basic, orderNo: m.orderNo, note: m.note, createdBy: p.userId }).returning();
    const rupee = (x: number) => `₹${(x / 100).toLocaleString('en-IN')}`;
    const title = m.kind === 'increment' ? 'Annual increment' : m.kind === 'promotion' ? `Promoted: pay fixed at ${m.to.level.name}` : `Placed at ${m.to.level.name}`;
    await tx.insert(serviceBookEntries).values({ tenantId: p.tenantId, userId: m.userId, kind: m.kind === 'placement' ? 'pay_fixation' : m.kind, onDate: m.effectiveFrom, title, details: `Level ${m.to.level.level}, cell ${m.to.cell}: basic ${rupee(m.to.basic)}${m.from.basic ? ` (was ${rupee(m.from.basic)})` : ''}${m.note ? `. ${m.note}` : ''}`, orderNo: m.orderNo, createdBy: p.userId });
    await tx.update(staffProfiles).set({ payBasis: 'matrix', payLevelId: m.to.level.id, payCell: m.to.cell, updatedAt: new Date() }).where(eq(staffProfiles.userId, m.userId));
    await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `pay_matrix.${m.kind}`, subjectType: 'user', subjectId: m.userId, before: { level: m.from.levelId, cell: m.from.cell, basicPaise: m.from.basic }, after: { level: m.to.level.id, cell: m.to.cell, basicPaise: m.to.basic }, data: { moveId: move.id, effectiveFrom: m.effectiveFrom, orderNo: m.orderNo } });
    await this.notifications.notifyUsers(tx, [m.userId], { kind: 'payslip', text: texts.payRevised({ kind: m.kind, basicPaise: m.to.basic, from: m.effectiveFrom }), data: { moveId: move.id }, dedupeKey: `pay-move:${move.id}` });
    return move;
  }

  /** Places a staff member on a level and cell, or fixes their pay on promotion to a higher level. */
  async place(tx: Tx, p: UserPrincipal, userId: string, b: PlaceInput) {
    const [prof] = await tx.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).for('update');
    if (!prof) throw new NotFoundException('Staff member not found');
    if (b.effectiveFrom.slice(8) !== '01') throw new BadRequestException('A pay change takes effect from the first of a month');
    const level = await this.level(tx, b.levelId);
    const fromLevel = prof.payLevelId ? await this.level(tx, prof.payLevelId).catch(() => null) : null;
    const currentBasic = fromLevel && prof.payCell ? fromLevel.cells[prof.payCell - 1] : null;
    let cell: number;
    if (b.kind === 'promotion') {
      if (!currentBasic) throw new ConflictException('Place the staff member on the matrix before promoting them');
      if (fromLevel?.id === level.id) throw new BadRequestException('A promotion moves to another level');
      cell = b.cell ?? fixOnPromotion(currentBasic, level.cells).cell;
    } else {
      if (!b.cell) throw new BadRequestException('Choose the cell');
      cell = b.cell;
    }
    if (cell < 1 || cell > level.cells.length) throw new BadRequestException(`This level has cells 1 to ${level.cells.length}`);
    const basic = level.cells[cell - 1];
    const hraClass = b.hraClass ?? prof.hraClass;
    if (b.hraClass && b.hraClass !== prof.hraClass) await tx.update(staffProfiles).set({ hraClass: b.hraClass }).where(eq(staffProfiles.userId, userId));
    const out = await this.writeStructure(tx, p, userId, b.effectiveFrom, basic, hraClass);
    const move = await this.record(tx, p, { userId, kind: b.kind, effectiveFrom: b.effectiveFrom, from: { levelId: fromLevel?.id ?? null, cell: prof.payCell, basic: currentBasic }, to: { level, cell, basic }, orderNo: b.orderNo, note: b.note });
    return { move, basicPaise: basic, cell, daPercent: out.daPercent, hraPaise: out.hraPaise, structure: out.structure };
  }

  /** Staff on the matrix with their level, cell, basic and when they last moved. */
  async staff(tx: Tx) {
    const rows = await tx
      .select({ userId: staffProfiles.userId, fullName: users.fullName, code: staffProfiles.employeeCode, joined: staffProfiles.dateOfJoining, levelId: staffProfiles.payLevelId, cell: staffProfiles.payCell, hraClass: staffProfiles.hraClass, level: payMatrixLevels.level, levelName: payMatrixLevels.name, cells: payMatrixLevels.cells, lastMove: sql<string | null>`(select max(m.effective_from)::text from pay_matrix_moves m where m.user_id = ${staffProfiles.userId})` })
      .from(staffProfiles)
      .innerJoin(users, eq(users.id, staffProfiles.userId))
      .innerJoin(payMatrixLevels, eq(payMatrixLevels.id, staffProfiles.payLevelId))
      .where(and(eq(staffProfiles.payBasis, 'matrix'), sql`${staffProfiles.status} <> 'exited'`))
      .orderBy(asc(payMatrixLevels.sortOrder), desc(staffProfiles.payCell), asc(users.fullName));
    return rows.map((r) => ({ userId: r.userId, fullName: r.fullName, employeeCode: r.code, levelId: r.levelId, level: r.level, levelName: r.levelName, cell: r.cell, basicPaise: r.cell ? r.cells[r.cell - 1] : null, nextBasicPaise: r.cell && r.cell < r.cells.length ? r.cells[r.cell] : null, cellCount: r.cells.length, hraClass: r.hraClass, lastMove: r.lastMove, joined: r.joined }));
  }

  /**
   * The annual increment on `on` (1 July, or 1 January): each staff member on the matrix with six months on their
   * present pay moves one cell up. `apply: false` only lists who would. Already-given increments are skipped, so the
   * job can be run again safely.
   */
  async increments(tx: Tx, p: UserPrincipal, on: string, apply: boolean, only?: string[]) {
    if (!/-(01|07)-01$/.test(on)) throw new BadRequestException('The annual increment falls on 1 July (or 1 January)');
    const staff = (await this.staff(tx)).filter((s) => !only?.length || only.includes(s.userId));
    const given = new Set((await tx.select({ userId: payMatrixMoves.userId }).from(payMatrixMoves).where(and(eq(payMatrixMoves.kind, 'increment'), eq(payMatrixMoves.effectiveFrom, on), staff.length ? inArray(payMatrixMoves.userId, staff.map((s) => s.userId)) : sql`false`))).map((r) => r.userId));
    const out: { userId: string; fullName: string; level: string; fromCell: number | null; toCell: number | null; fromBasicPaise: number | null; toBasicPaise: number | null; due: boolean; reason: string }[] = [];
    for (const s of staff) {
      if (given.has(s.userId)) {
        out.push({ userId: s.userId, fullName: s.fullName, level: s.level, fromCell: s.cell, toCell: s.cell, fromBasicPaise: s.basicPaise, toBasicPaise: s.basicPaise, due: false, reason: 'Already given' });
        continue;
      }
      const since = s.lastMove && s.lastMove < on ? s.lastMove : s.joined;
      const d = incrementDue({ on, since, cell: s.cell ?? 0, cellCount: s.cellCount });
      out.push({ userId: s.userId, fullName: s.fullName, level: s.level, fromCell: s.cell, toCell: d.due ? (s.cell ?? 0) + 1 : s.cell, fromBasicPaise: s.basicPaise, toBasicPaise: d.due ? s.nextBasicPaise : s.basicPaise, due: d.due, reason: d.reason });
    }
    if (apply) {
      for (const x of out.filter((o) => o.due)) {
        const s = staff.find((y) => y.userId === x.userId)!;
        const level = await this.level(tx, s.levelId!);
        await this.writeStructure(tx, p, s.userId, on, x.toBasicPaise!, s.hraClass);
        await this.record(tx, p, { userId: s.userId, kind: 'increment', effectiveFrom: on, from: { levelId: level.id, cell: x.fromCell, basic: x.fromBasicPaise }, to: { level, cell: x.toCell!, basic: x.toBasicPaise! }, orderNo: '', note: '' });
      }
    }
    return { on, applied: apply, due: out.filter((o) => o.due).length, staff: out };
  }

  async moves(tx: Tx, userId: string) {
    return tx
      .select({ id: payMatrixMoves.id, kind: payMatrixMoves.kind, effectiveFrom: payMatrixMoves.effectiveFrom, level: payMatrixLevels.level, levelName: payMatrixLevels.name, fromCell: payMatrixMoves.fromCell, toCell: payMatrixMoves.toCell, fromBasicPaise: payMatrixMoves.fromBasicPaise, toBasicPaise: payMatrixMoves.toBasicPaise, orderNo: payMatrixMoves.orderNo, note: payMatrixMoves.note })
      .from(payMatrixMoves)
      .innerJoin(payMatrixLevels, eq(payMatrixLevels.id, payMatrixMoves.toLevelId))
      .where(eq(payMatrixMoves.userId, userId))
      .orderBy(desc(payMatrixMoves.effectiveFrom));
  }
}
