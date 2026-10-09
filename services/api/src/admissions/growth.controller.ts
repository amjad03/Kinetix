import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { Day } from '../common/zod-fields.js';
import { DbService } from '../db/db.service.js';
import { users } from '../db/schema.js';
import { ADMISSIONS_ROLES } from './admissions.controller.js';
import { AgentsService } from './agents.service.js';
import { InterviewsService } from './interviews.service.js';
import { OnlineTestService } from './online-test.service.js';

/** People who may sit on an interview panel and fill in a score sheet. */
const PANEL_ROLES: RoleName[] = [...ADMISSIONS_ROLES, 'hod', 'teacher'];

const Rupees = z.number().int().min(0).max(100_000_000);
const AgentBody = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['agent', 'partner']).default('agent'),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.email().max(200).nullable().optional(),
  commissionPaise: Rupees.default(0),
  referralCode: z.string().trim().max(20).optional(),
});
const AgentPatch = z.object({ name: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().max(20).nullable().optional(), email: z.email().max(200).nullable().optional(), commissionPaise: Rupees.optional(), active: z.boolean().optional() });
const PaidBody = z.object({ ids: z.array(z.uuid()).min(1).max(200), paidOn: Day, note: z.string().trim().max(300).nullable().optional() });
const AppAgentBody = z.object({ agentId: z.uuid().nullable() });

const Panel = z.array(z.object({ userId: z.uuid().nullable().default(null), name: z.string().trim().min(2).max(120) })).min(1).max(10);
const InterviewBody = z.object({ applicationId: z.uuid(), slotAt: z.iso.datetime(), venue: z.string().trim().max(200).nullable().optional(), panel: Panel });
const InterviewPatch = z.object({ slotAt: z.iso.datetime().optional(), venue: z.string().trim().max(200).nullable().optional(), panel: Panel.optional(), cancel: z.boolean().optional() });
const SheetBody = z.object({
  criteria: z.array(z.object({ criterion: z.string().trim().min(1).max(80), score: z.number().min(0).max(1000), max: z.number().positive().max(1000) })).min(1).max(15),
  remarks: z.string().trim().max(1000).nullable().optional(),
});
const CompleteBody = z.object({ outcome: z.enum(['selected', 'waitlisted', 'rejected']), remarks: z.string().trim().max(1000).nullable().optional() });

const QuestionBody = z.object({
  programId: z.uuid().nullable().optional(),
  topic: z.string().trim().min(1).max(60).default('General'),
  question: z.string().trim().min(5).max(1000),
  options: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
  correctIndex: z.number().int().min(0).max(5),
  marks: z.number().positive().max(20).default(1),
});
const OnlineBody = z.object({ questionCount: z.number().int().min(1).max(200), negativeMarks: z.number().min(0).max(5).default(0), topic: z.string().trim().max(60).nullable().optional(), open: z.boolean().default(false) });

/** Admissions growth: lead-to-enrolment partners, interviews and the online entrance test (staff side). */
@Controller('v1/admissions')
export class GrowthController {
  constructor(
    private readonly db: DbService,
    private readonly agents: AgentsService,
    private readonly interviews: InterviewsService,
    private readonly online: OnlineTestService,
  ) {}

  private actor = (p: UserPrincipal) => ({ tenantId: p.tenantId, userId: p.userId });

  // ---- agents and referral partners -----------------------------------------------------------------

  @Get('agents')
  @Auth('user', ADMISSIONS_ROLES)
  listAgents(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.agents.list(tx));
  }

  @Post('agents')
  @Auth('user', ADMISSIONS_ROLES)
  createAgent(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AgentBody)) body: z.infer<typeof AgentBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.agents.create(tx, this.actor(p), body));
  }

  @Patch('agents/:id')
  @Auth('user', ADMISSIONS_ROLES)
  patchAgent(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AgentPatch)) body: z.infer<typeof AgentPatch>) {
    return this.db.withTenant(p.tenantId, (tx) => this.agents.update(tx, this.actor(p), id, body));
  }

  @Get('commissions')
  @Auth('user', ADMISSIONS_ROLES)
  commissions(@CurrentPrincipal() p: UserPrincipal, @Query('agentId') agentId?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.agents.commissions(tx, agentId && z.uuid().safeParse(agentId).success ? agentId : undefined));
  }

  @Post('commissions/pay')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  payCommissions(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PaidBody)) body: z.infer<typeof PaidBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.agents.markPaid(tx, this.actor(p), body.ids, body.paidOn, body.note));
  }

  @Put('applications/:id/agent')
  @Auth('user', ADMISSIONS_ROLES)
  applicationAgent(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AppAgentBody)) body: z.infer<typeof AppAgentBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.agents.setApplicationAgent(tx, this.actor(p), id, body.agentId));
  }

  // ---- interviews --------------------------------------------------------------------------------------

  @Get('interviews')
  @Auth('user', PANEL_ROLES)
  listInterviews(@CurrentPrincipal() p: UserPrincipal, @Query('cycleId') cycleId?: string, @Query('applicationId') applicationId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const uuid = (v?: string) => (v && z.uuid().safeParse(v).success ? v : undefined);
    const day = (v?: string) => (v && Day.safeParse(v).success ? v : undefined);
    return this.db.withTenant(p.tenantId, (tx) => this.interviews.list(tx, { cycleId: uuid(cycleId), applicationId: uuid(applicationId), from: day(from), to: day(to) }));
  }

  @Post('interviews')
  @Auth('user', ADMISSIONS_ROLES)
  schedule(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(InterviewBody)) body: z.infer<typeof InterviewBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.interviews.schedule(tx, this.actor(p), body));
  }

  @Get('interviews/:id')
  @Auth('user', PANEL_ROLES)
  interview(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.interviews.detail(tx, id));
  }

  @Patch('interviews/:id')
  @Auth('user', ADMISSIONS_ROLES)
  reschedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(InterviewPatch)) body: z.infer<typeof InterviewPatch>) {
    return this.db.withTenant(p.tenantId, (tx) => this.interviews.reschedule(tx, this.actor(p), id, body));
  }

  /** The signed-in panelist's own score sheet. A teacher or HoD can only score an interview they sit on. */
  @Put('interviews/:id/sheet')
  @Auth('user', PANEL_ROLES)
  sheet(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SheetBody)) body: z.infer<typeof SheetBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [me] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, p.userId));
      const i = await this.interviews.get(tx, id);
      const onPanel = i.panel.some((x) => x.userId === p.userId || x.name.toLowerCase() === me.name.toLowerCase());
      const isAdmissions = p.roles.some((r) => ADMISSIONS_ROLES.includes(r));
      if (!onPanel && !isAdmissions) throw new ForbiddenException('You are not on this interview panel');
      return this.interviews.submitSheet(tx, { tenantId: p.tenantId, userId: p.userId }, id, me.name, body);
    });
  }

  @Post('interviews/:id/complete')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  complete(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CompleteBody)) body: z.infer<typeof CompleteBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.interviews.complete(tx, this.actor(p), id, body.outcome, body.remarks));
  }

  @Post('interviews/:id/no-show')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  noShow(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.interviews.markNoShow(tx, this.actor(p), id));
  }

  // ---- online entrance test -------------------------------------------------------------------------

  @Get('entrance-questions')
  @Auth('user', ADMISSIONS_ROLES)
  questions(@CurrentPrincipal() p: UserPrincipal, @Query('topic') topic?: string, @Query('programId') programId?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.online.questions(tx, { topic: topic?.slice(0, 60), programId: programId && z.uuid().safeParse(programId).success ? programId : undefined }));
  }

  @Post('entrance-questions')
  @Auth('user', ADMISSIONS_ROLES)
  addQuestion(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(QuestionBody)) body: z.infer<typeof QuestionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.online.addQuestion(tx, this.actor(p), body));
  }

  @Delete('entrance-questions/:id')
  @Auth('user', ADMISSIONS_ROLES)
  retireQuestion(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.online.retireQuestion(tx, this.actor(p), id));
  }

  /** Turns the online test on for an entrance test: how many questions, negative marking, and open or closed to applicants. */
  @Put('entrance-tests/:id/online')
  @Auth('user', ADMISSIONS_ROLES)
  configure(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OnlineBody)) body: z.infer<typeof OnlineBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.online.configure(tx, this.actor(p), id, body));
  }

  /** The online-test settings of every entrance test that has them. */
  @Get('online-configs')
  @Auth('user', ADMISSIONS_ROLES)
  configs(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.online.configs(tx));
  }

  @Get('entrance-tests/:id/attempts')
  @Auth('user', ADMISSIONS_ROLES)
  attempts(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.online.attempts(tx, id));
  }
}
