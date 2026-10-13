import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { ExamOfficeService, KINDS, REPORTS, type Kind, type Report } from './exam-office.service.js';
import type { OfficeSettings } from './exam-office.logic.js';

const ADMIN: RoleName[] = ['tenant_admin', 'principal', 'exam_controller'];
const VIEW: RoleName[] = [...ADMIN, 'hod'];

const ActionBody = z.object({ comment: z.string().trim().max(1000).optional(), value: z.unknown().optional() });
const series = z.object({ prefix: z.string().trim().max(40), next: z.number().int().min(1).max(10_000_000), pad: z.number().int().min(1).max(10), suffix: z.string().trim().max(20).default('') });
const paise = z.number().int().min(0).max(100_000_000);
const SettingsBody = z.object({
  hallTicketSeries: series,
  certificateSeries: series,
  qpSeries: series,
  defaultGradeScaleId: z.uuid().nullable(),
  grace: z.object({ maxPerSubject: z.number().min(0).max(100), maxTotal: z.number().min(0).max(500), onlyToPass: z.boolean() }),
  moderation: z.object({ maxAddMarks: z.number().min(0).max(100), maxScalePercent: z.number().min(0).max(100), doubleValuationGapPercent: z.number().min(0).max(100) }),
  revaluation: z.object({ windowDays: z.number().int().min(1).max(90), revaluationFeePaise: paise, retotallingFeePaise: paise, photocopyFeePaise: paise }),
  examFees: z.object({ perPaperPaise: paise, supplementaryPerPaperPaise: paise, minimumPaise: paise, lateFeePaise: paise }),
  qpReleaseMinutes: z.number().int().min(0).max(1440),
});

const kindOf = (k: string): Kind => {
  if (!(KINDS as readonly string[]).includes(k)) throw new BadRequestException('Unknown record kind');
  return k as Kind;
};

/** The exam office desk: records of every exam entity, the session workflow, reports and the module settings. */
@Controller('v1/exam-office')
export class ExamOfficeController {
  constructor(private readonly svc: ExamOfficeService) {}

  @Get('overview')
  @Auth('user', VIEW)
  overview(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.overview(p);
  }

  @Get('records/:kind')
  @Auth('user', VIEW)
  list(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Query('sessionId') sessionId?: string) {
    return this.svc.list(p, kindOf(kind), sessionId);
  }

  @Get('records/:kind/:id')
  @Auth('user', VIEW)
  record(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Param('id') id: string) {
    return this.svc.record(p, kindOf(kind), id);
  }

  @Post('records/:kind/:id/actions/:action')
  @HttpCode(200)
  @Auth('user', ADMIN)
  act(@CurrentPrincipal() p: UserPrincipal, @Param('kind') kind: string, @Param('id') id: string, @Param('action') action: string, @Body(new ZodBody(ActionBody)) b: z.infer<typeof ActionBody>) {
    return this.svc.act(p, kindOf(kind), id, action, b);
  }

  @Get('reports/:report')
  @Auth('user', VIEW)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('report') report: string, @Query('sessionId') sessionId?: string, @Query('by') by?: string) {
    if (!(REPORTS as readonly string[]).includes(report)) throw new BadRequestException('Unknown report');
    return this.svc.report(p, report as Report, { sessionId, by });
  }

  @Get('settings')
  @Auth('user', VIEW)
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.getSettings(p);
  }

  @Put('settings')
  @Auth('user', ADMIN)
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    return this.svc.saveSettings(p, b as OfficeSettings);
  }
}
