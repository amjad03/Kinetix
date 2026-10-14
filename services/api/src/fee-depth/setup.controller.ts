import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeStructures } from '../db/schema-g1.js';
import { feeInstalmentPlans, feeInstalments, feeLateFees } from '../db/schema-depth.js';
import { feeCustomPlans, feeWaiverRequests } from '../db/schema-fee-depth.js';
import { campuses, feeInvoices, programs, students, tenants } from '../db/schema.js';
import { chainOf, decideOnChain } from '../fee-accounts/chains.js';
import { approverIds, deskTexts, nextNumber } from '../fee-accounts/fee-accounts.service.js';
import { fineHead, headsOf, lineState, reduceCharge } from '../fees/fee-lines.js';
import { FEE_ROLES } from '../fees/fees.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { FeeSetupService } from './setup.service.js';

const Item = z.object({ code: z.string().trim().min(1).max(12), amountPaise: z.number().int().min(0).max(100_000_000_00) });
const ItemsBody = z.object({ items: z.array(Item).min(1).max(40) });
const AssignBody = z.object({ studentIds: z.array(z.uuid()).max(5000).optional(), dueOn: Day.optional(), prorata: z.boolean().default(false), termStart: Day.optional(), termEnd: Day.optional() });
const Decide = z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().trim().max(500).default('') }).refine((b) => b.decision === 'approve' || b.comment.length >= 3, { message: 'Say why it is rejected', path: ['comment'] });
const PlanBody = z.object({ invoiceId: z.uuid(), parts: z.array(z.object({ dueOn: Day, amountPaise: z.number().int().min(100) })).min(2).max(12), reason: z.string().trim().min(3).max(300) });
const WaiverBody = z.object({ lateFeeId: z.uuid(), amountPaise: z.number().int().min(1).optional(), reason: z.string().trim().min(3).max(300) });

/**
 * Fee setup beyond the record lists: a structure's items by head, who it applies to and what each pays, bulk
 * assignment (pro-rata for late joiners), re-assignment after a change, its printable sheet; one-student instalment
 * plans and late-fee waivers that go up their approval chains.
 */
@Controller('v1/fee-setup')
export class FeeSetupController {
  constructor(
    private readonly db: DbService,
    private readonly setup: FeeSetupService,
    private readonly notifications: NotificationsService,
  ) {}

  private async ask(tx: Tx, role: string, what: string, number: string, id: string, except: string) {
    const ids = (await approverIds(tx, [role])).filter((u) => u !== except);
    await this.notifications.notifyUsers(tx, ids, { kind: 'task', text: deskTexts.approvalNeeded(what, number), data: { id, kind: what }, dedupeKey: `fee-desk:${id}:${role}` });
  }

  /** The fee heads in allocation order (seeded on first use). */
  @Get('heads')
  @Auth('user', FEE_ROLES)
  heads(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => headsOf(tx, p.tenantId));
  }

  /** A structure with its items resolved to heads, the totals and how many students it covers. */
  @Get('structures/:id')
  @Auth('user', FEE_ROLES)
  structure(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fs = await this.setup.structure(tx, id);
      const heads = await headsOf(tx, p.tenantId);
      const items = this.setup.itemHeads(fs, heads).map((x) => ({ code: x.code, head: x.name, amountPaise: x.item.amountPaise, optional: !!x.head?.optional, linkedModule: x.head?.linkedModule ?? 'none', refundable: x.head?.refundable ?? true, gstRate: x.gstRate, known: !!x.head }));
      const preview = await this.setup.preview(tx, p.tenantId, id);
      const [plan] = fs.instalmentPlanId ? await tx.select().from(feeInstalmentPlans).where(eq(feeInstalmentPlans.id, fs.instalmentPlanId)) : [];
      return { structure: fs, items, totalPaise: items.reduce((s, i) => s + i.amountPaise, 0), plan: plan ?? null, students: preview.length, assigned: preview.filter((r) => r.assigned).length };
    });
  }

  /** Sets the structure's items from fee heads (a draft or rejected structure, or a published one before re-assigning). */
  @Put('structures/:id/items')
  @Auth('user', FEE_ROLES)
  items(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ItemsBody)) b: z.infer<typeof ItemsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fs = await this.setup.structure(tx, id);
      if (fs.status === 'pending' || fs.status === 'approved') throw new ConflictException('This structure is waiting for approval or publishing; change it after that');
      const heads = await headsOf(tx, p.tenantId);
      if (new Set(b.items.map((i) => i.code)).size !== b.items.length) throw new BadRequestException('Each head can appear once');
      const items = b.items.map((i) => {
        const h = heads.find((x) => x.code === i.code);
        if (!h) throw new BadRequestException(`There is no fee head ${i.code}`);
        return { head: h.name, code: h.code, amountPaise: i.amountPaise };
      });
      // A published structure changed this way must be approved again before it is re-assigned.
      const status = fs.status === 'published' ? 'draft' : fs.status === 'rejected' ? 'draft' : fs.status;
      const [row] = await tx.update(feeStructures).set({ items, status, active: status === 'published' ? fs.active : false }).where(eq(feeStructures.id, id)).returning();
      await auditUser(tx, p, 'fee_structure.items_set', 'fee_structure', id, { before: fs.items, after: items });
      return row;
    });
  }

  /** Who the structure applies to and what each would pay (pro-rata when asked). */
  @Get('structures/:id/preview')
  @Auth('user', FEE_ROLES)
  preview(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('prorata') prorata?: string, @Query('termStart') termStart?: string, @Query('termEnd') termEnd?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.setup.preview(tx, p.tenantId, id, { prorata: prorata === '1' || prorata === 'true', termStart: termStart ? Day.parse(termStart) : undefined, termEnd: termEnd ? Day.parse(termEnd) : undefined }));
  }

  @Post('structures/:id/assign')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AssignBody)) b: z.infer<typeof AssignBody>) {
    if ((b.termStart && !b.termEnd) || (!b.termStart && b.termEnd) || (b.termStart && b.termEnd && b.termStart > b.termEnd)) throw new BadRequestException('Give the term’s start and end, the start first');
    return this.db.withTenant(p.tenantId, (tx) => this.setup.assign(tx, p, id, b));
  }

  @Post('structures/:id/reassign')
  @HttpCode(200)
  @Auth('user', FEE_ROLES)
  reassign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fs = await this.setup.structure(tx, id);
      if (fs.status !== 'published') throw new ConflictException('Publish the changed structure first');
      return this.setup.reassign(tx, p, id);
    });
  }

  /** The fee-structure sheet to print or hand out: heads, amounts, instalments and the institution. */
  @Get('structures/:id/print')
  @Auth('user', FEE_ROLES)
  print(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const fs = await this.setup.structure(tx, id);
      const heads = await headsOf(tx, p.tenantId);
      const items = this.setup.itemHeads(fs, heads).map((x) => ({ code: x.code, head: x.name, amountPaise: x.item.amountPaise, optional: !!x.head?.optional, linkedModule: x.head?.linkedModule ?? 'none', refundable: x.head?.refundable ?? true, gstRate: x.gstRate }));
      const [plan] = fs.instalmentPlanId ? await tx.select().from(feeInstalmentPlans).where(eq(feeInstalmentPlans.id, fs.instalmentPlanId)) : [];
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      const [prog] = fs.programId ? await tx.select({ name: programs.name }).from(programs).where(eq(programs.id, fs.programId)) : [];
      const [camp] = fs.campusId ? await tx.select({ name: campuses.name }).from(campuses).where(eq(campuses.id, fs.campusId)) : [];
      const total = items.filter((i) => !i.optional).reduce((s, i) => s + i.amountPaise, 0);
      return { institution: t?.name ?? '', structure: { id: fs.id, name: fs.name, academicYear: fs.academicYear, status: fs.status, batch: fs.batch, quota: fs.quota, category: fs.category, term: fs.term, dueInDays: fs.dueInDays, perCreditPaise: fs.perCreditPaise, program: prog?.name ?? null, campus: camp?.name ?? null }, items, compulsoryPaise: total, optionalPaise: items.filter((i) => i.optional).reduce((s, i) => s + i.amountPaise, 0), plan: plan ? { name: plan.name, parts: plan.parts.map((x) => ({ ...x, amountPaise: Math.round((total * x.percent) / 100) })) } : null };
    });
  }

  // ---- One-student instalment plans ---------------------------------------------------------------

  /** Asks for an instalment schedule of the student's own (dates and amounts); it applies once approved. */
  @Post('custom-plans')
  @Auth('user', FEE_ROLES)
  requestPlan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PlanBody)) b: z.infer<typeof PlanBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, b.invoiceId));
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.status !== 'due') throw new ConflictException('Only an unpaid invoice can be put on instalments');
      const total = b.parts.reduce((s, x) => s + x.amountPaise, 0);
      if (total !== inv.amountPaise) throw new BadRequestException(`The instalments add up to ₹${(total / 100).toLocaleString('en-IN')}, not the invoice’s ₹${(inv.amountPaise / 100).toLocaleString('en-IN')}`);
      for (let i = 1; i < b.parts.length; i++) if (b.parts[i].dueOn <= b.parts[i - 1].dueOn) throw new BadRequestException('Each instalment must fall due after the one before');
      const [have] = await tx.select({ n: sql<number>`count(*)::int` }).from(feeInstalments).where(eq(feeInstalments.invoiceId, inv.id));
      if (have.n > 0) throw new ConflictException('This invoice already has an instalment schedule');
      const [open] = await tx.select({ id: feeCustomPlans.id }).from(feeCustomPlans).where(and(eq(feeCustomPlans.invoiceId, inv.id), eq(feeCustomPlans.status, 'pending')));
      if (open) throw new ConflictException('A schedule for this invoice is already waiting for approval');
      const number = await nextNumber(tx, p.tenantId, 'plan', await this.setup.today(tx));
      const [row] = await tx.insert(feeCustomPlans).values({ tenantId: p.tenantId, number, invoiceId: inv.id, studentId: inv.studentId, parts: b.parts, reason: b.reason, requestedBy: p.userId }).returning();
      await auditUser(tx, p, 'custom_plan.requested', 'fee_custom_plan', row.id, { number, parts: b.parts.length });
      const chain = await chainOf(tx, p.tenantId, 'customPlan');
      await this.ask(tx, chain[0].role, 'Instalment plan', number, row.id, p.userId);
      return row;
    });
  }

  @Post('custom-plans/:id/decide')
  @Auth('user', FEE_ROLES.concat('hod' as RoleName))
  decidePlan(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Decide)) b: z.infer<typeof Decide>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(feeCustomPlans).where(eq(feeCustomPlans.id, id)).for('update');
      if (!r) throw new NotFoundException('Request not found');
      if (r.status !== 'pending') throw new ConflictException('This request has been decided');
      const amount = r.parts.reduce((s, x) => s + x.amountPaise, 0);
      const out = await decideOnChain(tx, p, { ...r, amountPaise: amount }, await chainOf(tx, p.tenantId, 'customPlan'), b.decision, b.comment);
      if (out.status === 'pending') {
        const [row] = await tx.update(feeCustomPlans).set({ level: out.level, trail: out.trail }).where(eq(feeCustomPlans.id, id)).returning();
        await auditUser(tx, p, 'custom_plan.forwarded', 'fee_custom_plan', id, { to: out.nextRole });
        await this.ask(tx, out.nextRole!, 'Instalment plan', r.number, id, r.requestedBy ?? p.userId);
        return row;
      }
      if (out.status === 'approved') {
        const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, r.invoiceId)).for('update');
        if (!inv || inv.status !== 'due' || inv.amountPaise !== amount) throw new ConflictException('The invoice has changed since; ask again with the new amount');
        const [have] = await tx.select({ n: sql<number>`count(*)::int` }).from(feeInstalments).where(eq(feeInstalments.invoiceId, inv.id));
        if (have.n > 0) throw new ConflictException('This invoice already has an instalment schedule');
        await tx.insert(feeInstalments).values(r.parts.map((x, i) => ({ tenantId: p.tenantId, invoiceId: inv.id, planId: null, seq: i + 1, dueOn: x.dueOn, amountPaise: x.amountPaise })));
        // The invoice falls due with its first instalment.
        await tx.update(feeInvoices).set({ dueOn: r.parts[0].dueOn, updatedAt: new Date() }).where(eq(feeInvoices.id, inv.id));
      }
      const [row] = await tx.update(feeCustomPlans).set({ status: out.status, level: out.level, trail: out.trail, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.comment || null }).where(eq(feeCustomPlans.id, id)).returning();
      await auditUser(tx, p, `custom_plan.${out.status}`, 'fee_custom_plan', id, { comment: b.comment });
      if (r.requestedBy) await this.notifications.notifyUsers(tx, [r.requestedBy], { kind: 'task', text: deskTexts.decided('Instalment plan', r.number, out.status === 'approved'), data: { id, status: out.status }, dedupeKey: `fee-desk:${id}:${out.status}` });
      return row;
    });
  }

  // ---- Late-fee waivers ----------------------------------------------------------------------------

  @Post('waivers')
  @Auth('user', FEE_ROLES)
  requestWaiver(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(WaiverBody)) b: z.infer<typeof WaiverBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [f] = await tx.select().from(feeLateFees).where(eq(feeLateFees.id, b.lateFeeId));
      if (!f) throw new NotFoundException('Late fee not found');
      const [inv] = await tx.select().from(feeInvoices).where(eq(feeInvoices.id, f.invoiceId));
      const open = Math.min(f.appliedPaise - f.waivedPaise, inv.amountPaise - inv.paidPaise);
      const amount = Math.min(b.amountPaise ?? open, open);
      if (amount <= 0) throw new ConflictException('There is nothing left to waive');
      const [pending] = await tx.select({ id: feeWaiverRequests.id }).from(feeWaiverRequests).where(and(eq(feeWaiverRequests.lateFeeId, f.id), eq(feeWaiverRequests.status, 'pending')));
      if (pending) throw new ConflictException('A waiver of this fine is already waiting for approval');
      const number = await nextNumber(tx, p.tenantId, 'waiver', await this.setup.today(tx));
      const [row] = await tx.insert(feeWaiverRequests).values({ tenantId: p.tenantId, number, lateFeeId: f.id, invoiceId: inv.id, studentId: inv.studentId, amountPaise: amount, reason: b.reason, requestedBy: p.userId }).returning();
      await auditUser(tx, p, 'fee_waiver.requested', 'fee_waiver_request', row.id, { number, amountPaise: amount });
      const chain = await chainOf(tx, p.tenantId, 'waiver');
      await this.ask(tx, chain[0].role, 'Fine waiver', number, row.id, p.userId);
      return row;
    });
  }

  @Post('waivers/:id/decide')
  @Auth('user', FEE_ROLES.concat('hod' as RoleName))
  decideWaiver(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Decide)) b: z.infer<typeof Decide>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(feeWaiverRequests).where(eq(feeWaiverRequests.id, id)).for('update');
      if (!r) throw new NotFoundException('Request not found');
      if (r.status !== 'pending') throw new ConflictException('This request has been decided');
      const out = await decideOnChain(tx, p, r, await chainOf(tx, p.tenantId, 'waiver'), b.decision, b.comment);
      if (out.status === 'pending') {
        const [row] = await tx.update(feeWaiverRequests).set({ level: out.level, trail: out.trail }).where(eq(feeWaiverRequests.id, id)).returning();
        await auditUser(tx, p, 'fee_waiver.forwarded', 'fee_waiver_request', id, { to: out.nextRole });
        await this.ask(tx, out.nextRole!, 'Fine waiver', r.number, id, r.requestedBy ?? p.userId);
        return row;
      }
      let applied = 0;
      if (out.status === 'approved') {
        const [f] = await tx.select().from(feeLateFees).where(eq(feeLateFees.id, r.lateFeeId)).for('update');
        const fin = await fineHead(tx, p.tenantId);
        const want = Math.min(r.amountPaise, f.appliedPaise - f.waivedPaise);
        applied = await reduceCharge(tx, r.invoiceId, want, [fin.code]);
        if (applied < want) applied += await reduceCharge(tx, r.invoiceId, want - applied);
        await tx.update(feeLateFees).set({ waivedPaise: f.waivedPaise + applied, waiveReason: `${r.number}: ${r.reason}` }).where(eq(feeLateFees.id, f.id));
      }
      const [row] = await tx.update(feeWaiverRequests).set({ status: out.status, level: out.level, trail: out.trail, decidedBy: p.userId, decidedAt: new Date(), decisionNote: b.comment || null }).where(eq(feeWaiverRequests.id, id)).returning();
      await auditUser(tx, p, `fee_waiver.${out.status}`, 'fee_waiver_request', id, { appliedPaise: applied, comment: b.comment });
      if (r.requestedBy) await this.notifications.notifyUsers(tx, [r.requestedBy], { kind: 'task', text: deskTexts.decided('Fine waiver', r.number, out.status === 'approved'), data: { id, status: out.status }, dedupeKey: `fee-desk:${id}:${out.status}` });
      return row;
    });
  }

  /** Waiver and instalment requests with their approval trail, for the desk's lists and record pages. */
  @Get('requests/:kind')
  @Auth('user', FEE_ROLES.concat('hod' as RoleName))
  requests(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Query('status') status?: string) {
    if (!['waivers', 'custom-plans'].includes(kind)) throw new NotFoundException('No such list');
    const st = status && /^[a-z]{3,12}$/.test(status) ? status : null;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = kind === 'waivers' ? feeWaiverRequests : feeCustomPlans;
      const rows = await tx
        .select({ r: t, student: students.fullName, rollNo: students.rollNo, invoice: feeInvoices.title, invoiceNo: feeInvoices.invoiceNo })
        .from(t)
        .innerJoin(students, eq(students.id, t.studentId))
        .innerJoin(feeInvoices, eq(feeInvoices.id, t.invoiceId))
        .where(st ? eq(t.status, st) : undefined)
        .orderBy(desc(t.createdAt))
        .limit(1000);
      return rows.map((x) => ({ ...x.r, student: x.student, rollNo: x.rollNo, invoice: x.invoice, invoiceNo: x.invoiceNo, amountPaise: 'amountPaise' in x.r ? x.r.amountPaise : (x.r as typeof feeCustomPlans.$inferSelect).parts.reduce((s, y) => s + y.amountPaise, 0) }));
    });
  }

  /** One invoice's lines by head with what is paid and due on each (the counter and the record page use it). */
  @Get('invoices/:id/lines')
  @Auth('user', FEE_ROLES)
  lines(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [inv] = await tx.select({ id: feeInvoices.id }).from(feeInvoices).where(eq(feeInvoices.id, id));
      if (!inv) throw new NotFoundException('Invoice not found');
      return (await lineState(tx, [id])).sort((a, b) => a.priority - b.priority);
    });
  }

  /** The instalment plans to choose from (active), for the structure form. */
  @Get('instalment-plans')
  @Auth('user', FEE_ROLES)
  plans(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(feeInstalmentPlans).where(eq(feeInstalmentPlans.active, true)).orderBy(asc(feeInstalmentPlans.name)));
  }
}
