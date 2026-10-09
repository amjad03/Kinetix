import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { TeacherService } from '../teacher/teacher.service.js';
import { MAX_CARDS, PollsService } from './polls.service.js';

const NewPollBody = z.object({
  kind: z.enum(['mcq', 'numeric', 'word']),
  question: z.string().max(500).default(''),
  options: z.array(z.string().trim().min(1).max(60)).max(6).default([]),
  correct: z.string().max(32).nullish(),
  topicCode: z.string().max(64).nullish(),
});

const CardsBody = z.object({
  answers: z.array(z.object({ cardNo: z.number().int().min(1).max(MAX_CARDS), choice: z.number().int().min(0).max(3) })).max(MAX_CARDS),
});

const AnswerBody = z.object({ answer: z.string().max(32) });

const CLASS_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];

/** "Ask the class" on the board: open a question, add answer cards read by the camera, close it. */
@Controller('v1/polls')
export class PollsController {
  constructor(
    private readonly db: DbService,
    private readonly polls: PollsService,
  ) {}

  /** Opens a question in the board's class. The board chooses the id, so a retry does not ask twice. */
  @Put(':id')
  @Auth('board')
  open(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(NewPollBody)) body: z.infer<typeof NewPollBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.polls.open(tx, p, id, body));
  }

  @Get(':id')
  @Auth('board')
  results(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.polls.boardResults(tx, p, id));
  }

  /** Answer cards read from a photo of the class: card number and the answer held on top (0 = A). */
  @Post(':id/cards')
  @HttpCode(200)
  @Auth('board')
  cards(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CardsBody)) body: z.infer<typeof CardsBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.polls.cardAnswers(tx, p, id, body.answers));
  }

  @Post(':id/close')
  @HttpCode(200)
  @Auth('board')
  close(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.polls.close(tx, p, id));
  }

  /** A student answers from the Student App. */
  @Post(':id/answer')
  @HttpCode(200)
  @Auth('user', ['student'])
  answer(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AnswerBody)) body: z.infer<typeof AnswerBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.polls.answer(tx, p, id, body.answer));
  }
}

/** The question open in the student's class now (the Student App's "Live question" banner). */
@Controller('v1/student')
export class StudentPollController {
  constructor(
    private readonly db: DbService,
    private readonly polls: PollsService,
  ) {}

  @Get('poll')
  @Auth('user', ['student'])
  current(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ poll: await this.polls.currentForStudent(tx, p) }));
  }
}

/** Answer cards for printing (Teacher App, ERP) and the board's class; past questions of a class. */
@Controller()
export class AnswerCardsController {
  constructor(
    private readonly db: DbService,
    private readonly polls: PollsService,
    private readonly teacher: TeacherService,
  ) {}

  /** The class's cards (card number → student, by roll number), to print. */
  @Get('v1/sections/:id/answer-cards')
  @Auth('user', CLASS_ROLES)
  sheet(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.teacher.assertCanSeeSection(tx, p, id);
      return this.polls.cardSheet(tx, p.tenantId, id);
    });
  }

  /** The cards of the class open on the board, so it can put names to the cards it reads. */
  @Get('v1/answer-cards/current')
  @Auth('board')
  current(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.polls.boardCardSheet(tx, p));
  }

  /** Questions asked in a class and how it answered (teachers, HODs for their subjects, leaders). */
  @Get('v1/sections/:id/polls')
  @Auth('user', [...CLASS_ROLES, 'hod'])
  history(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.polls.forSection(tx, p, id));
  }
}
