import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { QUIZ_SECONDS } from '@kinetix/shared';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { MAX_CARDS } from '../polls/polls.service.js';
import { MAX_QUESTIONS, QuizGamesService } from './quiz-games.service.js';

const Question = z.object({
  kind: z.enum(['mcq', 'tf']),
  question: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(4),
  correct: z.number().int().min(0).max(3),
  seconds: z.union([z.literal(QUIZ_SECONDS[0]), z.literal(QUIZ_SECONDS[1]), z.literal(QUIZ_SECONDS[2])]).default(20),
});

const NewGameBody = z.object({
  title: z.string().max(120).default(''),
  questions: z.array(Question).min(1).max(MAX_QUESTIONS),
  cards: z.boolean().default(false),
});

const AdvanceBody = z.object({ phase: z.enum(['question', 'reveal']), index: z.number().int().min(0).max(MAX_QUESTIONS - 1) });

const CardsBody = z.object({
  index: z.number().int().min(0).max(MAX_QUESTIONS - 1),
  answers: z.array(z.object({ cardNo: z.number().int().min(1).max(MAX_CARDS), choice: z.number().int().min(0).max(3) })).max(MAX_CARDS),
});

const AnswerBody = z.object({ index: z.number().int().min(0).max(MAX_QUESTIONS - 1), choice: z.number().int().min(0).max(3) });

const CLASS_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];

/** Live Quiz: the board runs the game, students answer from the Student App (contract in quiz-games.service.ts). */
@Controller('v1/quiz-games')
export class QuizGamesController {
  constructor(
    private readonly db: DbService,
    private readonly games: QuizGamesService,
  ) {}

  /** Questions for a game in the board's class: the subject's question bank and questions asked in this class before. */
  @Get('questions')
  @Auth('board')
  questions(@CurrentPrincipal() p: BoardPrincipal, @Query('topic') topic?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.suggestions(tx, p, topic));
  }

  /** Creates a game in the board's class. The board chooses the id, so a retry starts one game. */
  @Put(':id')
  @Auth('board')
  create(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(NewGameBody)) body: z.infer<typeof NewGameBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.create(tx, p, id, body));
  }

  @Get(':id')
  @Auth('board')
  get(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.get(tx, p, id));
  }

  /** Opens question `index` or reveals it. */
  @Post(':id/advance')
  @HttpCode(200)
  @Auth('board')
  advance(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AdvanceBody)) body: z.infer<typeof AdvanceBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.advance(tx, p, id, body.phase, body.index));
  }

  /** Answer cards read from a photo of the class for the open question (0 = A). */
  @Post(':id/cards')
  @HttpCode(200)
  @Auth('board')
  cards(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CardsBody)) body: z.infer<typeof CardsBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.cardAnswers(tx, p, id, body.index, body.answers));
  }

  @Post(':id/finish')
  @HttpCode(200)
  @Auth('board')
  finish(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.finish(tx, p, id));
  }

  /** A student answers the open question from the Student App. */
  @Post(':id/answer')
  @HttpCode(200)
  @Auth('user', ['student'])
  answer(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AnswerBody)) body: z.infer<typeof AnswerBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.answer(tx, p, id, body.index, body.choice));
  }

  /** A finished (or running) game with every answer: the class's teachers, HODs for the subject and leaders. */
  @Get(':id/results')
  @Auth('user', [...CLASS_ROLES, 'hod'])
  results(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.results(tx, p, id));
  }
}

/** The game running in the student's class (the Student App rejoins it) and a class's past games. */
@Controller()
export class QuizGamesClassController {
  constructor(
    private readonly db: DbService,
    private readonly games: QuizGamesService,
  ) {}

  @Get('v1/student/quiz-game')
  @Auth('user', ['student'])
  current(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.currentForStudent(tx, p));
  }

  @Get('v1/sections/:id/quiz-games')
  @Auth('user', [...CLASS_ROLES, 'hod'])
  history(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.games.forSection(tx, p, id));
  }
}
