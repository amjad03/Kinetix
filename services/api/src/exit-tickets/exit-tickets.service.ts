import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PollResults } from '@kinetix/shared';
import { and, desc, eq, inArray, isNull, gt } from 'drizzle-orm';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import type { Tx } from '../db/db.service.js';
import { boardSessions, exitTickets, polls } from '../db/schema.js';
import { PollsService } from '../polls/polls.service.js';
import { isSchoolAdmin, TeacherService } from '../teacher/teacher.service.js';

type Ticket = typeof exitTickets.$inferSelect;

export interface ExitTicketSummary {
  id: string;
  topic: string;
  createdAt: Date;
  questions: number;
  /** Students who answered at least one question. */
  respondents: number;
  /** Share of right answers among the answers to questions that have a right answer (0 to 1), or null when none does. */
  correctRate: number | null;
}

export interface ExitTicketView extends ExitTicketSummary {
  sectionId: string;
  results: PollResults[];
  /** Per student: answers given and right answers (questions with a right answer only). */
  students: { studentId: string; rollNo: string; fullName: string; answered: number; correct: number }[];
}

/** Exit tickets: the questions asked at the end of a lesson, kept as one record the ERP can show. */
@Injectable()
export class ExitTicketsService {
  constructor(
    private readonly polls: PollsService,
    private readonly teacher: TeacherService,
    private readonly clock: Clock,
  ) {}

  /** Saves the ticket of the board's class (idempotent by id): the polls it asked, in order. */
  async save(tx: Tx, p: BoardPrincipal, id: string, input: { topic: string; pollIds: string[] }): Promise<ExitTicketView> {
    const [session] = await tx
      .select()
      .from(boardSessions)
      .where(and(eq(boardSessions.id, p.sessionId), isNull(boardSessions.endedAt), gt(boardSessions.expiresAt, this.clock.now())));
    if (!session) throw new ForbiddenException('This class has ended');
    if (!session.sectionId) throw new BadRequestException('Open a timetabled class to save an exit ticket');
    if (input.pollIds.length === 0) throw new BadRequestException('An exit ticket needs at least one question');
    const rows = await tx.select({ id: polls.id, boardSessionId: polls.boardSessionId }).from(polls).where(inArray(polls.id, input.pollIds));
    if (rows.length !== new Set(input.pollIds).size || rows.some((r) => r.boardSessionId !== session.id)) throw new NotFoundException('Question not found');
    const [had] = await tx.select().from(exitTickets).where(eq(exitTickets.id, id));
    if (had && had.boardSessionId !== session.id) throw new NotFoundException('Exit ticket not found');
    const values = { topic: input.topic.trim(), pollIds: input.pollIds, closedAt: this.clock.now() };
    const [ticket] = had
      ? await tx.update(exitTickets).set(values).where(eq(exitTickets.id, id)).returning()
      : await tx
          .insert(exitTickets)
          .values({ id, tenantId: p.tenantId, boardSessionId: session.id, sectionId: session.sectionId, subjectId: session.subjectId, teacherId: session.teacherId, ...values })
          .returning();
    await audit(tx, { tenantId: p.tenantId, actorType: 'device', actorId: p.deviceId, action: 'exitTicket.save', subjectType: 'exit_ticket', subjectId: ticket.id });
    return this.view(tx, ticket);
  }

  /** One ticket with every question's results. */
  async get(tx: Tx, p: UserPrincipal, id: string): Promise<ExitTicketView> {
    const [ticket] = await tx.select().from(exitTickets).where(eq(exitTickets.id, id));
    if (!ticket) throw new NotFoundException('Exit ticket not found');
    await this.assertSees(tx, p, ticket.sectionId);
    return this.view(tx, ticket);
  }

  /** A class's exit tickets, newest first. */
  async forSection(tx: Tx, p: UserPrincipal, sectionId: string, limit = 30): Promise<ExitTicketSummary[]> {
    await this.assertSees(tx, p, sectionId);
    const rows = await tx.select().from(exitTickets).where(eq(exitTickets.sectionId, sectionId)).orderBy(desc(exitTickets.createdAt)).limit(limit);
    return Promise.all(rows.map(async (r) => this.summary(await this.view(tx, r))));
  }

  private summary({ results: _results, students: _students, sectionId: _sectionId, ...s }: ExitTicketView): ExitTicketSummary {
    return s;
  }

  private async assertSees(tx: Tx, p: UserPrincipal, sectionId: string) {
    if (isSchoolAdmin(p) || p.roles.includes('hod')) return;
    if (!(await this.teacher.teachesSection(tx, p.userId, sectionId))) throw new ForbiddenException('You do not teach this class');
  }

  private async view(tx: Tx, t: Ticket): Promise<ExitTicketView> {
    const rows = await tx.select().from(polls).where(inArray(polls.id, t.pollIds.length ? t.pollIds : ['00000000-0000-0000-0000-000000000000']));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const results: PollResults[] = [];
    for (const pid of t.pollIds) {
      const poll = byId.get(pid);
      if (poll) results.push(await this.polls.results(tx, poll));
    }
    const students = new Map<string, ExitTicketView['students'][number]>();
    let right = 0;
    let marked = 0;
    for (const r of results) {
      for (const a of r.responses) {
        const s = students.get(a.studentId) ?? { studentId: a.studentId, rollNo: a.rollNo, fullName: a.fullName, answered: 0, correct: 0 };
        s.answered++;
        if (a.correct != null) {
          marked++;
          if (a.correct) {
            s.correct++;
            right++;
          }
        }
        students.set(a.studentId, s);
      }
    }
    return {
      id: t.id,
      topic: t.topic,
      createdAt: t.createdAt,
      sectionId: t.sectionId,
      questions: results.length,
      respondents: students.size,
      correctRate: marked ? right / marked : null,
      results,
      students: [...students.values()].sort((a, b) => a.rollNo.localeCompare(b.rollNo)),
    };
  }
}
