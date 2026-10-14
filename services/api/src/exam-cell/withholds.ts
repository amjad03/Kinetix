import { Body, ConflictException, Controller, HttpCode, Injectable, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examSessions, resultWithholds, students, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecordRegistry, type KitCtx, type RecordEntity } from '../records/entity.js';
import { OptionalText, Ref, uuidEq } from '../records/helpers.js';
import { assertInSession, auditCell, CELL, CELL_READ, loadSession, sessionOptions } from './common.js';
import { notifyReleased } from './notify.js';

export const WITHHOLD_REASONS = ['malpractice', 'fees', 'documents', 'attendance', 'inquiry', 'other'] as const;

/** The sessions whose result is withheld for a student, with the reason. */
export async function withheldSessions(tx: Tx, studentId: string): Promise<Map<string, string>> {
  const rows = await tx.select({ sessionId: resultWithholds.sessionId, reason: resultWithholds.reason }).from(resultWithholds).where(and(eq(resultWithholds.studentId, studentId), eq(resultWithholds.status, 'held')));
  return new Map(rows.map((r) => [r.sessionId, r.reason]));
}

/** Holds a candidate's result (once per session while held). Used by the kit's add and by malpractice decisions. */
export async function holdResult(tx: Tx, p: UserPrincipal, sessionId: string, studentId: string, reason: string, note: string | null): Promise<string> {
  await loadSession(tx, sessionId);
  await assertInSession(tx, sessionId, studentId);
  const [open] = await tx.select({ id: resultWithholds.id }).from(resultWithholds).where(and(eq(resultWithholds.sessionId, sessionId), eq(resultWithholds.studentId, studentId), eq(resultWithholds.status, 'held')));
  if (open) throw new ConflictException('This result is already withheld');
  const [row] = await tx.insert(resultWithholds).values({ tenantId: p.tenantId, sessionId, studentId, reason, note, heldBy: p.userId }).returning({ id: resultWithholds.id });
  return row.id;
}

const ReleaseBody = z.object({ note: z.string().trim().min(3).max(500) });

/** Releasing a withheld result: the office records why, and the candidate and family are told. */
@Controller('v1/result-withholds')
export class WithholdsController {
  constructor(
    private readonly db: DbService,
    private readonly notes: NotificationsService,
  ) {}

  @Post(':id/release')
  @HttpCode(200)
  @Auth('user', CELL)
  release(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReleaseBody)) b: z.infer<typeof ReleaseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [w] = await tx.select().from(resultWithholds).where(eq(resultWithholds.id, id));
      if (!w) throw new NotFoundException('Not found');
      if (w.status !== 'held') throw new ConflictException('This result is already released');
      const [row] = await tx.update(resultWithholds).set({ status: 'released', releasedBy: p.userId, releasedAt: new Date(), releaseNote: b.note }).where(eq(resultWithholds.id, id)).returning();
      await auditCell(tx, p, 'result_withhold.released', 'result_withhold', id, { before: { status: 'held' }, after: { status: 'released' }, data: { note: b.note } });
      const s = await loadSession(tx, w.sessionId);
      if (s.status === 'published' || s.status === 'locked') await notifyReleased(tx, this.notes, s.id, s.name, w.studentId);
      return row;
    });
  }
}

const reasonOptions = WITHHOLD_REASONS.map((r) => ({ value: r, label: { malpractice: 'Malpractice', fees: 'Fee dues', documents: 'Documents pending', attendance: 'Attendance shortage', inquiry: 'Under inquiry', other: 'Other' }[r] }));

/** Withheld results as a record kit list: hold (add), edit the note, release, history, export. */
export function withholdsEntity(): RecordEntity {
  return {
    key: 'result-withholds',
    module: 'exams',
    table: resultWithholds,
    subjectType: 'result_withhold',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${String(r.rollNo ?? '')} ${String(r.studentName ?? '')} - ${String(r.sessionName ?? '')}`.trim(),
    list: {
      select: { id: resultWithholds.id, sessionId: resultWithholds.sessionId, sessionName: examSessions.name, studentId: resultWithholds.studentId, studentName: students.fullName, rollNo: students.rollNo, reason: resultWithholds.reason, note: resultWithholds.note, status: resultWithholds.status, heldAt: resultWithholds.heldAt, heldByName: users.fullName, releasedAt: resultWithholds.releasedAt, releaseNote: resultWithholds.releaseNote },
      joins: (q) => q.innerJoin(examSessions, eq(examSessions.id, resultWithholds.sessionId)).innerJoin(students, eq(students.id, resultWithholds.studentId)).leftJoin(users, eq(users.id, resultWithholds.heldBy)),
      search: [students.fullName, students.rollNo, resultWithholds.note],
      filters: {
        session: { label: 'Exam session', options: (ctx) => sessionOptions(ctx.tx), where: (v) => uuidEq(resultWithholds.sessionId, v) },
        status: { label: 'Status', options: [{ value: 'held', label: 'Held' }, { value: 'released', label: 'Released' }], where: (v) => (v === 'held' || v === 'released' ? eq(resultWithholds.status, v) : undefined) },
        reason: { label: 'Reason', options: reasonOptions, where: (v) => ((WITHHOLD_REASONS as readonly string[]).includes(v) ? eq(resultWithholds.reason, v) : undefined) },
      },
      sorts: { student: students.fullName, roll: students.rollNo, session: examSessions.name, held: resultWithholds.heldAt, status: resultWithholds.status },
      defaultSort: { id: 'held', dir: 'desc' },
    },
    fields: {
      sessionId: { label: 'Exam session', type: 'select', schema: Ref, column: resultWithholds.sessionId, required: true, edit: false, options: (ctx) => sessionOptions(ctx.tx) },
      studentId: { label: 'Student', type: 'select', schema: Ref, column: resultWithholds.studentId, required: true, edit: false, options: studentOptions },
      reason: { label: 'Reason', type: 'select', schema: z.enum(WITHHOLD_REASONS), column: resultWithholds.reason, required: true, options: reasonOptions, bulk: true },
      note: { label: 'Note', type: 'textarea', schema: OptionalText(500), column: resultWithholds.note },
    },
    create: async (ctx, v) => holdResult(ctx.tx, ctx.p, String(v.sessionId), String(v.studentId), String(v.reason), (v.note as string | null) ?? null),
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: resultWithholds.status }).from(resultWithholds).where(eq(resultWithholds.id, id)))[0]?.s === 'released' ? 'A released result stays on record; it cannot be deleted' : null) },
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'sessionName', header: 'Exam session' },
      { key: 'reason', header: 'Reason' },
      { key: 'note', header: 'Note' },
      { key: 'status', header: 'Status' },
      { key: 'heldAt', header: 'Held on', value: (r) => (r.heldAt instanceof Date ? r.heldAt.toISOString().slice(0, 10) : String(r.heldAt ?? '').slice(0, 10)) },
      { key: 'releaseNote', header: 'Release note' },
    ],
  };
}

/** Active students, grouped by class, for pickers. */
export async function studentOptions(ctx: KitCtx) {
  const rows = (await ctx.tx.execute(sql`select s.id, s.roll_no, s.full_name, sec.display_name from students s join sections sec on sec.id = s.section_id where s.status in ('active', 'enrolled') order by sec.display_name, s.roll_no limit 3000`)).rows as { id: string; roll_no: string; full_name: string; display_name: string }[];
  return rows.map((r) => ({ value: r.id, label: `${r.roll_no} ${r.full_name}`, group: r.display_name }));
}

@Injectable()
export class WithholdRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}
  onModuleInit(): void {
    this.registry.register(withholdsEntity());
  }
}
