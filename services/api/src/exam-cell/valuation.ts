import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examAttendance, examPapers, examSessions, sections, students, subjects, supplementaryRegistrations, userRoles, users, valuationBundles, valuationCamps, valuationDailyCounts } from '../db/schema.js';
import { parseDate } from '../teacher/teacher.service.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { Int, OptionalRef, Ref, Text, uuidEq } from '../records/helpers.js';
import { auditCell, CELL, CELL_READ, CELL_STAFF, loadSession, rowsOf, sessionOptions } from './common.js';

const PackBody = z.object({ paperId: z.uuid(), size: z.number().int().min(1).max(200) });
const IssueBody = z.object({ examinerId: z.uuid() });
const CountBody = z.object({ day: z.string(), scripts: z.number().int().min(0).max(1000) });

/** Teaching staff and examiners who may value scripts. */
export async function examinerOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, 'active'), sql`${userRoles.role} in ('teacher', 'hod', 'principal', 'examiner', 'exam_controller')`))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

async function paperOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .select({ id: examPapers.id, subject: subjects.name, code: subjects.code, section: sections.displayName, session: examSessions.name })
    .from(examPapers)
    .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
    .innerJoin(sections, eq(sections.id, examPapers.sectionId))
    .innerJoin(examSessions, eq(examSessions.id, examPapers.sessionId))
    .orderBy(sql`${examSessions.startsOn} desc`, asc(subjects.code));
  return rows.map((r) => ({ value: r.id, label: `${r.code} ${r.subject} (${r.section})`, group: r.session }));
}

async function campOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: valuationCamps.id, name: valuationCamps.name, session: examSessions.name }).from(valuationCamps).innerJoin(examSessions, eq(examSessions.id, valuationCamps.sessionId)).orderBy(sql`${valuationCamps.startsOn} desc`);
  return rows.map((r) => ({ value: r.id, label: r.name, group: r.session }));
}

/**
 * The central valuation camp: scripts are packed into bundles per paper, issued to an examiner, counted day by day
 * under the chief examiner, and returned. The day-wise count and the examiners' remuneration come from here.
 */
@Controller('v1')
export class ValuationController {
  constructor(private readonly db: DbService) {}

  /** Packs a paper's scripts into bundles of `size` (the candidates present, else all candidates). */
  @Post('valuation-camps/:id/pack')
  @HttpCode(200)
  @Auth('user', CELL)
  pack(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PackBody)) b: z.infer<typeof PackBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const camp = await this.camp(tx, id);
      if (camp.status !== 'open') throw new ConflictException('The camp is closed');
      const [paper] = await tx.select().from(examPapers).where(and(eq(examPapers.id, b.paperId), eq(examPapers.sessionId, camp.sessionId)));
      if (!paper) throw new BadRequestException('That paper is not in the camp’s session');
      const [have] = await tx.select({ n: sql<number>`count(*)::int` }).from(valuationBundles).where(and(eq(valuationBundles.campId, id), eq(valuationBundles.paperId, b.paperId)));
      if (have.n > 0) throw new ConflictException('This paper is already packed');
      const [present] = await tx.select({ n: sql<number>`count(*)::int` }).from(examAttendance).where(and(eq(examAttendance.paperId, b.paperId), eq(examAttendance.status, 'present')));
      const [regs] = await tx.select({ n: sql<number>`count(*)::int` }).from(supplementaryRegistrations).where(and(eq(supplementaryRegistrations.sessionId, camp.sessionId), eq(supplementaryRegistrations.subjectId, paper.subjectId)));
      const [cls] = await tx.select({ n: sql<number>`count(*)::int` }).from(students).where(and(eq(students.sectionId, paper.sectionId), eq(students.status, 'active')));
      const scripts = present.n || regs.n || cls.n;
      if (scripts === 0) throw new ConflictException('There are no scripts for this paper');
      const [sub] = await tx.select({ code: subjects.code }).from(subjects).where(eq(subjects.id, paper.subjectId));
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${valuationBundles.sortOrder}), 0)::int` }).from(valuationBundles).where(eq(valuationBundles.campId, id));
      const count = Math.ceil(scripts / b.size);
      const rows = Array.from({ length: count }, (_, i) => ({ tenantId: p.tenantId, campId: id, paperId: b.paperId, bundleNo: `${sub?.code ?? 'P'}-${String(i + 1).padStart(2, '0')}`, scripts: i === count - 1 ? scripts - b.size * (count - 1) : b.size, sortOrder: max + (i + 1) * 10 }));
      await tx.insert(valuationBundles).values(rows);
      await auditCell(tx, p, 'valuation.packed', 'valuation_camp', id, { data: { paperId: b.paperId, bundles: count, scripts } });
      return { bundles: count, scripts };
    });
  }

  @Post('valuation-bundles/:id/issue')
  @HttpCode(200)
  @Auth('user', CELL)
  issue(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(IssueBody)) b: z.infer<typeof IssueBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const bundle = await this.bundle(tx, id);
      if (bundle.status !== 'packed') throw new ConflictException('Only a packed bundle can be issued');
      if (!(await examinerOptions({ tx, p })).some((o) => o.value === b.examinerId)) throw new BadRequestException('Choose a member of the teaching staff or an examiner');
      const [row] = await tx.update(valuationBundles).set({ examinerId: b.examinerId, status: 'issued', issuedAt: new Date() }).where(eq(valuationBundles.id, id)).returning();
      await auditCell(tx, p, 'valuation_bundle.issued', 'valuation_bundle', id, { before: { status: 'packed', examinerId: bundle.examinerId }, after: { status: 'issued', examinerId: b.examinerId } });
      return row;
    });
  }

  /** The scripts valued from a bundle on a day of the camp (once per day; a repeat corrects the day's count). */
  @Post('valuation-bundles/:id/count')
  @HttpCode(200)
  @Auth('user', CELL_STAFF)
  count(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CountBody)) b: z.infer<typeof CountBody>) {
    const day = parseDate(b.day, 'day');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const bundle = await this.bundle(tx, id);
      const camp = await this.camp(tx, bundle.campId);
      const isCell = p.roles.some((r) => CELL.includes(r));
      if (!isCell && bundle.examinerId !== p.userId && camp.chiefExaminerId !== p.userId) throw new NotFoundException('Bundle not found');
      if (bundle.status !== 'issued') throw new ConflictException('Only an issued bundle is being valued');
      if (day < camp.startsOn || day > camp.endsOn) throw new BadRequestException('That day is outside the camp');
      const others = await tx.select({ n: sql<number>`coalesce(sum(${valuationDailyCounts.scripts}), 0)::int` }).from(valuationDailyCounts).where(and(eq(valuationDailyCounts.bundleId, id), sql`${valuationDailyCounts.day} <> ${day}`));
      const total = others[0].n + b.scripts;
      if (total > bundle.scripts) throw new BadRequestException(`The bundle has only ${bundle.scripts} scripts`);
      await tx.insert(valuationDailyCounts).values({ tenantId: p.tenantId, bundleId: id, day, scripts: b.scripts, recordedBy: p.userId }).onConflictDoUpdate({ target: [valuationDailyCounts.bundleId, valuationDailyCounts.day], set: { scripts: b.scripts, recordedBy: p.userId } });
      const [row] = await tx.update(valuationBundles).set({ valued: total, status: total === bundle.scripts ? 'valued' : 'issued' }).where(eq(valuationBundles.id, id)).returning();
      await auditCell(tx, p, 'valuation_bundle.counted', 'valuation_bundle', id, { data: { day, scripts: b.scripts, total } });
      return row;
    });
  }

  @Post('valuation-bundles/:id/return')
  @HttpCode(200)
  @Auth('user', CELL)
  giveBack(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const bundle = await this.bundle(tx, id);
      if (bundle.status !== 'valued') throw new ConflictException('Value every script of the bundle before it is returned');
      const [row] = await tx.update(valuationBundles).set({ status: 'returned', returnedAt: new Date() }).where(eq(valuationBundles.id, id)).returning();
      await auditCell(tx, p, 'valuation_bundle.returned', 'valuation_bundle', id, { before: { status: 'valued' }, after: { status: 'returned' } });
      return row;
    });
  }

  @Post('valuation-camps/:id/close')
  @HttpCode(200)
  @Auth('user', CELL)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const camp = await this.camp(tx, id);
      if (camp.status !== 'open') throw new ConflictException('The camp is already closed');
      const [out] = await tx.select({ n: sql<number>`count(*)::int` }).from(valuationBundles).where(and(eq(valuationBundles.campId, id), sql`${valuationBundles.status} <> 'returned'`));
      if (out.n > 0) throw new ConflictException(`${out.n} bundles are not returned yet`);
      await tx.update(valuationCamps).set({ status: 'closed' }).where(eq(valuationCamps.id, id));
      await auditCell(tx, p, 'valuation_camp.closed', 'valuation_camp', id, { before: { status: 'open' }, after: { status: 'closed' } });
      return { status: 'closed' };
    });
  }

  /** The day-wise count: scripts valued by each examiner on each day of the camp. */
  @Get('valuation-camps/:id/daily')
  @Auth('user', CELL_READ)
  daily(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.camp(tx, id);
      return rowsOf(
        tx,
        sql`select d.day, u.full_name as examiner, sum(d.scripts)::int as scripts, count(distinct d.bundle_id)::int as bundles
          from valuation_daily_counts d join valuation_bundles b on b.id = d.bundle_id left join users u on u.id = b.examiner_id
          where b.camp_id = ${id}::uuid group by d.day, u.full_name order by d.day, u.full_name`,
      );
    });
  }

  /** The bundles issued to the caller (an examiner at the camp). */
  @Get('valuation-bundles/mine')
  @Auth('user', CELL_STAFF)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      rowsOf(
        tx,
        sql`select b.id, b.bundle_no as "bundleNo", b.scripts, b.valued, b.status, c.name as camp, sub.code, sub.name as subject
          from valuation_bundles b join valuation_camps c on c.id = b.camp_id join exam_papers p on p.id = b.paper_id join subjects sub on sub.id = p.subject_id
          where b.examiner_id = ${p.userId}::uuid order by c.starts_on desc, b.sort_order`,
      ),
    );
  }

  private async camp(tx: Tx, id: string) {
    const [c] = await tx.select().from(valuationCamps).where(eq(valuationCamps.id, id));
    if (!c) throw new NotFoundException('Camp not found');
    return c;
  }

  private async bundle(tx: Tx, id: string) {
    const [b] = await tx.select().from(valuationBundles).where(eq(valuationBundles.id, id));
    if (!b) throw new NotFoundException('Bundle not found');
    return b;
  }
}

const bundleCount = sql<number>`(select count(*)::int from valuation_bundles vb where vb.camp_id = ${valuationCamps.id})`;
const scriptCount = sql<number>`(select coalesce(sum(vb.scripts), 0)::int from valuation_bundles vb where vb.camp_id = ${valuationCamps.id})`;
const valuedCount = sql<number>`(select coalesce(sum(vb.valued), 0)::int from valuation_bundles vb where vb.camp_id = ${valuationCamps.id})`;

export function campsEntity(): RecordEntity {
  return {
    key: 'valuation-camps',
    module: 'exams',
    table: valuationCamps,
    subjectType: 'valuation_camp',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => String(r.name),
    list: {
      select: { id: valuationCamps.id, name: valuationCamps.name, venue: valuationCamps.venue, sessionId: valuationCamps.sessionId, sessionName: examSessions.name, startsOn: valuationCamps.startsOn, endsOn: valuationCamps.endsOn, chiefExaminerId: valuationCamps.chiefExaminerId, chiefName: users.fullName, status: valuationCamps.status, bundles: bundleCount, scripts: scriptCount, valued: valuedCount },
      joins: (q) => q.innerJoin(examSessions, eq(examSessions.id, valuationCamps.sessionId)).leftJoin(users, eq(users.id, valuationCamps.chiefExaminerId)),
      search: [valuationCamps.name, valuationCamps.venue, users.fullName],
      filters: {
        session: { label: 'Exam session', options: (ctx) => sessionOptions(ctx.tx), where: (v) => uuidEq(valuationCamps.sessionId, v) },
        status: { label: 'Status', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }], where: (v) => (v === 'open' || v === 'closed' ? eq(valuationCamps.status, v) : undefined) },
      },
      sorts: { name: valuationCamps.name, starts: valuationCamps.startsOn, session: examSessions.name, scripts: scriptCount },
      defaultSort: { id: 'starts', dir: 'desc' },
    },
    fields: {
      name: { label: 'Camp', type: 'text', schema: Text(120), column: valuationCamps.name, required: true },
      sessionId: { label: 'Exam session', type: 'select', schema: Ref, column: valuationCamps.sessionId, required: true, edit: false, options: (ctx) => sessionOptions(ctx.tx) },
      venue: { label: 'Venue', type: 'text', schema: z.string().trim().max(200), column: valuationCamps.venue },
      startsOn: { label: 'From', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), column: valuationCamps.startsOn, required: true },
      endsOn: { label: 'To', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), column: valuationCamps.endsOn, required: true },
      chiefExaminerId: { label: 'Chief examiner', type: 'select', schema: OptionalRef, column: valuationCamps.chiefExaminerId, options: examinerOptions, bulk: true },
    },
    create: async (ctx, v) => {
      if (String(v.endsOn) < String(v.startsOn)) throw new BadRequestException('The camp cannot end before it starts');
      await loadSession(ctx.tx, String(v.sessionId));
      const [row] = await ctx.tx.insert(valuationCamps).values({ tenantId: ctx.p.tenantId, name: String(v.name), sessionId: String(v.sessionId), venue: String(v.venue ?? ''), startsOn: String(v.startsOn), endsOn: String(v.endsOn), chiefExaminerId: (v.chiefExaminerId as string | null) ?? null, createdBy: ctx.p.userId }).returning({ id: valuationCamps.id });
      return row.id;
    },
    duplicate: async (_ctx, row) => ({ name: `${String(row.name)} (copy)`, status: 'open' }),
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(valuationDailyCounts).innerJoin(valuationBundles, eq(valuationBundles.id, valuationDailyCounts.bundleId)).where(eq(valuationBundles.campId, id)))[0].n > 0 ? 'Scripts have been valued at this camp; close it instead' : null) },
    columns: [
      { key: 'name', header: 'Camp' },
      { key: 'sessionName', header: 'Exam session' },
      { key: 'venue', header: 'Venue' },
      { key: 'startsOn', header: 'From' },
      { key: 'endsOn', header: 'To' },
      { key: 'chiefName', header: 'Chief examiner' },
      { key: 'bundles', header: 'Bundles' },
      { key: 'scripts', header: 'Scripts' },
      { key: 'valued', header: 'Valued' },
      { key: 'status', header: 'Status' },
    ],
  };
}

export function bundlesEntity(): RecordEntity {
  return {
    key: 'valuation-bundles',
    module: 'exams',
    table: valuationBundles,
    subjectType: 'valuation_bundle',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${String(r.bundleNo)} (${String(r.subjectName ?? '')})`,
    list: {
      select: { id: valuationBundles.id, campId: valuationBundles.campId, campName: valuationCamps.name, paperId: valuationBundles.paperId, subjectName: subjects.name, code: subjects.code, bundleNo: valuationBundles.bundleNo, scripts: valuationBundles.scripts, valued: valuationBundles.valued, examinerId: valuationBundles.examinerId, examinerName: users.fullName, status: valuationBundles.status, issuedAt: valuationBundles.issuedAt, returnedAt: valuationBundles.returnedAt, sortOrder: valuationBundles.sortOrder },
      joins: (q) => q.innerJoin(valuationCamps, eq(valuationCamps.id, valuationBundles.campId)).innerJoin(examPapers, eq(examPapers.id, valuationBundles.paperId)).innerJoin(subjects, eq(subjects.id, examPapers.subjectId)).leftJoin(users, eq(users.id, valuationBundles.examinerId)),
      search: [valuationBundles.bundleNo, subjects.name, subjects.code, users.fullName],
      filters: {
        camp: { label: 'Camp', options: campOptions, where: (v) => uuidEq(valuationBundles.campId, v) },
        status: { label: 'Status', options: ['packed', 'issued', 'valued', 'returned'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), where: (v) => (['packed', 'issued', 'valued', 'returned'].includes(v) ? eq(valuationBundles.status, v) : undefined) },
        examiner: { label: 'Examiner', options: examinerOptions, where: (v) => uuidEq(valuationBundles.examinerId, v) },
      },
      sorts: { bundle: valuationBundles.bundleNo, subject: subjects.code, examiner: users.fullName, status: valuationBundles.status, scripts: valuationBundles.scripts },
      defaultSort: { id: 'bundle', dir: 'asc' },
    },
    fields: {
      campId: { label: 'Camp', type: 'select', schema: Ref, column: valuationBundles.campId, required: true, edit: false, options: campOptions },
      paperId: { label: 'Paper', type: 'select', schema: Ref, column: valuationBundles.paperId, required: true, edit: false, options: paperOptions },
      bundleNo: { label: 'Bundle no', type: 'text', schema: Text(30), column: valuationBundles.bundleNo, required: true },
      scripts: { label: 'Scripts', type: 'number', schema: Int(1, 500), column: valuationBundles.scripts, required: true },
    },
    move: {
      label: 'Give to another examiner',
      options: examinerOptions,
      reason: true,
      apply: async (ctx, id, to, reason) => {
        const [b] = await ctx.tx.select().from(valuationBundles).where(eq(valuationBundles.id, id));
        if (!b) throw new NotFoundException('Bundle not found');
        if (b.status === 'returned') throw new ConflictException('A returned bundle stays with its examiner');
        await ctx.tx.update(valuationBundles).set({ examinerId: to, status: b.status === 'packed' ? 'issued' : b.status, issuedAt: b.issuedAt ?? new Date() }).where(eq(valuationBundles.id, id));
        await auditCell(ctx.tx, ctx.p, 'valuation_bundle.moved', 'valuation_bundle', id, { before: { examinerId: b.examinerId }, after: { examinerId: to }, data: { reason } });
      },
    },
    order: { column: valuationBundles.sortOrder, scope: [valuationBundles.campId] },
    duplicate: async (ctx, row) => ({ bundle_no: `${String(row.bundle_no)}-B`, examiner_id: null, status: 'packed', valued: 0, issued_at: null, returned_at: null }),
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: valuationBundles.status }).from(valuationBundles).where(eq(valuationBundles.id, id)))[0]?.s === 'packed' ? null : 'Only a bundle not yet issued can be deleted') },
    columns: [
      { key: 'bundleNo', header: 'Bundle' },
      { key: 'campName', header: 'Camp' },
      { key: 'code', header: 'Paper code' },
      { key: 'subjectName', header: 'Subject' },
      { key: 'scripts', header: 'Scripts' },
      { key: 'valued', header: 'Valued' },
      { key: 'examinerName', header: 'Examiner' },
      { key: 'status', header: 'Status' },
    ],
  };
}

@Injectable()
export class ValuationRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}
  onModuleInit(): void {
    this.registry.register(campsEntity());
    this.registry.register(bundlesEntity());
  }
}

