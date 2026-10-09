import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { admissionCycles, applications, entranceAttempts, entranceHalls, entranceOnlineConfigs, entranceQuestions, entranceSeats, entranceTests } from '../db/schema.js';
import { type Actor, auditActor } from './enquiries.service.js';

type Question = typeof entranceQuestions.$inferSelect;
type Attempt = typeof entranceAttempts.$inferSelect;

/** Raw marks for the answers given: full marks for right, the negative mark for wrong, nothing for blank. */
export function gradeAttempt(questions: Pick<Question, 'id' | 'correctIndex' | 'marks'>[], answers: Record<string, number>, negative: number) {
  let raw = 0;
  let total = 0;
  for (const q of questions) {
    total += q.marks;
    const a = answers[q.id];
    if (a === undefined || a === null) continue;
    raw += a === q.correctIndex ? q.marks : -negative;
  }
  return { raw: Math.max(0, raw), total };
}

const ONLINE_HALL = 'Online';
const OPEN_FEE = ['none', 'paid', 'waived'];

/** The online entrance test: a question bank, a timed attempt per applicant, and auto-scoring into the entrance seat list. */
@Injectable()
export class OnlineTestService {
  // ---- question bank -------------------------------------------------------------------------------

  async addQuestion(tx: Tx, actor: Actor, q: { programId?: string | null; topic: string; question: string; options: string[]; correctIndex: number; marks: number }) {
    if (q.correctIndex >= q.options.length) throw new BadRequestException('The correct answer must be one of the options');
    const [row] = await tx.insert(entranceQuestions).values({ tenantId: actor.tenantId, programId: q.programId ?? null, topic: q.topic, question: q.question, options: q.options, correctIndex: q.correctIndex, marks: q.marks }).returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.entrance_question_added.v1', subjectType: 'entrance_question', subjectId: row.id, data: { topic: q.topic } });
    return row;
  }

  async questions(tx: Tx, f: { topic?: string; programId?: string }) {
    return tx
      .select()
      .from(entranceQuestions)
      .where(and(eq(entranceQuestions.active, true), f.topic ? eq(entranceQuestions.topic, f.topic) : undefined, f.programId ? eq(entranceQuestions.programId, f.programId) : undefined))
      .orderBy(asc(entranceQuestions.topic), asc(entranceQuestions.createdAt))
      .limit(1000);
  }

  async retireQuestion(tx: Tx, actor: Actor, id: string) {
    const [row] = await tx.update(entranceQuestions).set({ active: false }).where(eq(entranceQuestions.id, id)).returning({ id: entranceQuestions.id });
    if (!row) throw new NotFoundException('Question not found');
    await audit(tx, { ...auditActor(actor), action: 'admissions.entrance_question_retired.v1', subjectType: 'entrance_question', subjectId: id, data: {} });
    return { id };
  }

  // ---- test set-up ---------------------------------------------------------------------------------

  async configure(tx: Tx, actor: Actor, testId: string, c: { questionCount: number; negativeMarks: number; topic?: string | null; open: boolean }) {
    const [t] = await tx.select({ id: entranceTests.id, cycleId: entranceTests.cycleId }).from(entranceTests).where(eq(entranceTests.id, testId));
    if (!t) throw new NotFoundException('Entrance test not found');
    const pool = await this.pool(tx, t.cycleId, c.topic ?? null);
    if (c.open && pool.length < c.questionCount) throw new BadRequestException(`The question bank has only ${pool.length} matching questions but the test needs ${c.questionCount}`);
    const [row] = await tx
      .insert(entranceOnlineConfigs)
      .values({ tenantId: actor.tenantId, testId, questionCount: c.questionCount, negativeMarks: c.negativeMarks, topic: c.topic ?? null, open: c.open })
      .onConflictDoUpdate({ target: entranceOnlineConfigs.testId, set: { questionCount: c.questionCount, negativeMarks: c.negativeMarks, topic: c.topic ?? null, open: c.open } })
      .returning();
    await audit(tx, { ...auditActor(actor), action: 'admissions.online_test_configured.v1', subjectType: 'entrance_test', subjectId: testId, data: { ...c } });
    return row;
  }

  async configs(tx: Tx) {
    return tx.select().from(entranceOnlineConfigs).orderBy(asc(entranceOnlineConfigs.createdAt));
  }

  private async pool(tx: Tx, cycleId: string, topic: string | null) {
    const [cy] = await tx.select({ programId: admissionCycles.programId }).from(admissionCycles).where(eq(admissionCycles.id, cycleId));
    return tx
      .select()
      .from(entranceQuestions)
      .where(and(eq(entranceQuestions.active, true), topic ? eq(entranceQuestions.topic, topic) : undefined, or(isNull(entranceQuestions.programId), eq(entranceQuestions.programId, cy?.programId ?? sql`null`))));
  }

  /** Results for the staff view: every attempt with its score. Attempts whose time ran out are closed first. */
  async attempts(tx: Tx, testId: string) {
    await this.closeExpired(tx, testId);
    const rows = await tx
      .select({ a: entranceAttempts, applicantName: applications.applicantName, applicationNo: applications.applicationNo })
      .from(entranceAttempts)
      .innerJoin(applications, eq(applications.id, entranceAttempts.applicationId))
      .where(eq(entranceAttempts.testId, testId))
      .orderBy(asc(applications.applicationNo));
    return rows.map((r) => ({ id: r.a.id, applicationId: r.a.applicationId, applicantName: r.applicantName, applicationNo: r.applicationNo, startedAt: r.a.startedAt, submittedAt: r.a.submittedAt, answered: Object.keys(r.a.answers).length, score: r.a.score }));
  }

  // ---- the applicant's side ------------------------------------------------------------------------

  /** Online tests open to this applicant, with where their attempt stands. */
  async forApplicant(tx: Tx, app: typeof applications.$inferSelect) {
    const tests = await tx
      .select({ t: entranceTests, c: entranceOnlineConfigs })
      .from(entranceTests)
      .innerJoin(entranceOnlineConfigs, eq(entranceOnlineConfigs.testId, entranceTests.id))
      .where(and(eq(entranceTests.cycleId, app.cycleId), eq(entranceOnlineConfigs.open, true)));
    const attempts = tests.length ? await tx.select().from(entranceAttempts).where(and(eq(entranceAttempts.applicationId, app.id), inArray(entranceAttempts.testId, tests.map((x) => x.t.id)))) : [];
    return tests.map(({ t, c }) => {
      const at = attempts.find((a) => a.testId === t.id);
      return { testId: t.id, name: t.name, testDate: t.testDate, durationMinutes: t.durationMinutes, questionCount: c.questionCount, status: !at ? 'not_started' : at.submittedAt ? 'submitted' : at.deadlineAt.getTime() < Date.now() ? 'expired' : 'in_progress' };
    });
  }

  private async setup(tx: Tx, app: typeof applications.$inferSelect, testId: string) {
    if (['rejected', 'withdrawn', 'declined', 'enrolled'].includes(app.status)) throw new BadRequestException(`This application is ${app.status}`);
    if (!OPEN_FEE.includes(app.feeStatus)) throw new BadRequestException('Pay the application fee before taking the test');
    const [row] = await tx
      .select({ t: entranceTests, c: entranceOnlineConfigs })
      .from(entranceTests)
      .innerJoin(entranceOnlineConfigs, eq(entranceOnlineConfigs.testId, entranceTests.id))
      .where(and(eq(entranceTests.id, testId), eq(entranceTests.cycleId, app.cycleId)));
    if (!row) throw new NotFoundException('Test not found');
    if (!row.c.open) throw new ConflictException('This test is not open yet');
    return row;
  }

  private async view(tx: Tx, at: Attempt) {
    const qs = await tx.select().from(entranceQuestions).where(inArray(entranceQuestions.id, at.questionIds));
    const byId = new Map(qs.map((q) => [q.id, q]));
    return {
      attemptId: at.id,
      startedAt: at.startedAt,
      deadlineAt: at.deadlineAt,
      submittedAt: at.submittedAt,
      answers: at.answers,
      score: at.submittedAt ? at.score : null,
      questions: at.questionIds.flatMap((id) => {
        const q = byId.get(id);
        return q ? [{ id: q.id, question: q.question, options: q.options, marks: q.marks }] : [];
      }),
    };
  }

  /** Starts the attempt (a random draw from the bank, fixed for this applicant) or resumes the one in progress. */
  async start(tx: Tx, app: typeof applications.$inferSelect, testId: string) {
    const { t, c } = await this.setup(tx, app, testId);
    await tx.execute(sql`select 1 from ${applications} where ${applications.id} = ${app.id} for update`);
    const [have] = await tx.select().from(entranceAttempts).where(and(eq(entranceAttempts.testId, testId), eq(entranceAttempts.applicationId, app.id)));
    if (have) {
      const closed = await this.closeIfExpired(tx, have, c.negativeMarks, t.maxScore);
      if (closed.submittedAt) throw new ConflictException('You have already taken this test');
      return this.view(tx, closed);
    }
    const pool = await this.pool(tx, t.cycleId, c.topic);
    if (pool.length < c.questionCount) throw new ConflictException('The test is not ready: too few questions');
    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, c.questionCount);
    const [at] = await tx
      .insert(entranceAttempts)
      .values({ tenantId: app.tenantId, testId, applicationId: app.id, questionIds: picked.map((q) => q.id), deadlineAt: new Date(Date.now() + t.durationMinutes * 60_000) })
      .returning();
    await audit(tx, { tenantId: app.tenantId, actorType: 'system', action: 'admissions.online_test_started.v1', subjectType: 'application', subjectId: app.id, data: { testId } });
    return this.view(tx, at);
  }

  /** Saves answers while time remains; answers sent after the deadline are ignored. */
  async save(tx: Tx, app: typeof applications.$inferSelect, testId: string, answers: Record<string, number>) {
    const { t, c } = await this.setup(tx, app, testId);
    const at = await this.mine(tx, app.id, testId);
    if (at.submittedAt) throw new ConflictException('You have already submitted this test');
    if (at.deadlineAt.getTime() < Date.now()) return this.view(tx, await this.closeIfExpired(tx, at, c.negativeMarks, t.maxScore));
    const clean = this.clean(at, answers);
    const [row] = await tx.update(entranceAttempts).set({ answers: { ...at.answers, ...clean } }).where(eq(entranceAttempts.id, at.id)).returning();
    return this.view(tx, row);
  }

  /** Final submit: grades, stores the score and writes it into the entrance score list. Late answers are not counted. */
  async submit(tx: Tx, app: typeof applications.$inferSelect, testId: string, answers: Record<string, number> | undefined) {
    const { t, c } = await this.setup(tx, app, testId);
    const at = await this.mine(tx, app.id, testId);
    if (at.submittedAt) throw new ConflictException('You have already submitted this test');
    const late = at.deadlineAt.getTime() < Date.now();
    const merged = late || !answers ? at.answers : { ...at.answers, ...this.clean(at, answers) };
    const done = await this.finalise(tx, { ...at, answers: merged }, c.negativeMarks, t.maxScore, late ? at.deadlineAt : new Date());
    return this.view(tx, done);
  }

  private async mine(tx: Tx, applicationId: string, testId: string) {
    const [at] = await tx.select().from(entranceAttempts).where(and(eq(entranceAttempts.testId, testId), eq(entranceAttempts.applicationId, applicationId))).for('update');
    if (!at) throw new NotFoundException('Start the test first');
    return at;
  }

  private clean(at: Attempt, answers: Record<string, number>) {
    const ids = new Set(at.questionIds);
    return Object.fromEntries(Object.entries(answers).filter(([id, v]) => ids.has(id) && Number.isInteger(v) && v >= 0 && v < 10));
  }

  private async closeIfExpired(tx: Tx, at: Attempt, negative: number, maxScore: number): Promise<Attempt> {
    if (at.submittedAt || at.deadlineAt.getTime() >= Date.now()) return at;
    return this.finalise(tx, at, negative, maxScore, at.deadlineAt);
  }

  /** Closes every attempt of a test whose time has run out, scoring what was saved. */
  async closeExpired(tx: Tx, testId: string) {
    const [cfg] = await tx.select({ c: entranceOnlineConfigs, t: entranceTests }).from(entranceOnlineConfigs).innerJoin(entranceTests, eq(entranceTests.id, entranceOnlineConfigs.testId)).where(eq(entranceOnlineConfigs.testId, testId));
    if (!cfg) return;
    const late = await tx.select().from(entranceAttempts).where(and(eq(entranceAttempts.testId, testId), isNull(entranceAttempts.submittedAt), lt(entranceAttempts.deadlineAt, new Date())));
    for (const at of late) await this.finalise(tx, at, cfg.c.negativeMarks, cfg.t.maxScore, at.deadlineAt);
  }

  private async finalise(tx: Tx, at: Attempt, negative: number, maxScore: number, at_: Date): Promise<Attempt> {
    const qs = await tx.select().from(entranceQuestions).where(inArray(entranceQuestions.id, at.questionIds));
    const { raw, total } = gradeAttempt(qs, at.answers, negative);
    const score = total > 0 ? Math.round((raw / total) * maxScore * 100) / 100 : 0;
    const [row] = await tx.update(entranceAttempts).set({ answers: at.answers, submittedAt: at_, score }).where(eq(entranceAttempts.id, at.id)).returning();
    await this.recordScore(tx, at.tenantId, at.testId, at.applicationId, score);
    await audit(tx, { tenantId: at.tenantId, actorType: 'system', action: 'admissions.online_test_scored.v1', subjectType: 'application', subjectId: at.applicationId, data: { testId: at.testId, score } });
    return row;
  }

  /** Puts the score on the applicant's entrance seat (in the "Online" hall if they have no physical seat), which the merit list reads. */
  private async recordScore(tx: Tx, tenantId: string, testId: string, applicationId: string, score: number) {
    const [seat] = await tx.select().from(entranceSeats).where(and(eq(entranceSeats.testId, testId), eq(entranceSeats.applicationId, applicationId)));
    if (seat) {
      await tx.update(entranceSeats).set({ score, absent: false, scoredAt: new Date() }).where(eq(entranceSeats.id, seat.id));
      return;
    }
    let [hall] = await tx.select().from(entranceHalls).where(and(eq(entranceHalls.testId, testId), eq(entranceHalls.name, ONLINE_HALL)));
    if (!hall) [hall] = await tx.insert(entranceHalls).values({ tenantId, testId, name: ONLINE_HALL, capacity: 0 }).returning();
    const [m] = await tx.select({ n: sql<number>`coalesce(max(${entranceSeats.seatNo}), 0)::int` }).from(entranceSeats).where(eq(entranceSeats.hallId, hall.id));
    await tx.insert(entranceSeats).values({ tenantId, testId, hallId: hall.id, applicationId, seatNo: m.n + 1, score, scoredAt: new Date() });
  }
}
