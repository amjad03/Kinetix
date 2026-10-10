import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { ADMIN } from '../exams/schemes.controller.js';
import type { TemplateConfig } from './tabulation.logic.js';
import { UniversityResultsService } from './university-results.service.js';

const pct = z.number().min(0).max(100);
const ConfigSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).default(''),
  footnote: z.string().trim().max(300).default(''),
  internal: z.object({
    normaliseTo: z.number().positive().max(1000).nullable(),
    moderation: z.object({ mode: z.enum(['none', 'cap', 'bring_to_mean']), capPercent: pct.optional(), targetMeanPercent: pct.optional() }),
  }),
  grace: z.object({ enabled: z.boolean(), maxPerSubject: z.number().min(0).max(50), maxTotal: z.number().min(0).max(200), allOrNothing: z.boolean() }),
  pass: z.object({ minInternalPercent: pct.nullable(), minExternalPercent: pct.nullable(), minTotalPercent: pct }),
  classes: z.array(z.object({ label: z.string().trim().min(1).max(60), minPercent: pct })).max(10),
  labels: z.object({ pass: z.string().trim().min(1).max(20), fail: z.string().trim().min(1).max(20), absent: z.string().trim().min(1).max(20) }),
  layout: z.object({
    identity: z.array(z.enum(['slNo', 'regNo', 'name'])).min(1),
    subjectCells: z.array(z.enum(['internal', 'external', 'total', 'result'])).min(1),
    summary: z.array(z.enum(['total', 'percent', 'result', 'class', 'grace'])),
  }),
});
const TemplateBody = z.object({ code: z.string().trim().regex(/^[a-z0-9-]{2,60}$/), name: z.string().trim().min(1).max(120), university: z.string().trim().min(1).max(160), config: ConfigSchema, active: z.boolean().default(true) });
const RegisterBody = z.object({
  templateId: z.uuid(),
  label: z.string().trim().min(1).max(160),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('legacy'), academicYear: z.string().trim().min(1).max(20), term: z.number().int().min(1).max(20) }),
    z.object({ kind: z.literal('session'), sessionId: z.uuid(), sectionId: z.uuid().optional() }),
  ]),
});

/**
 * Affiliating-university result formats (exam controller, principal, admin): configurable mark-list and
 * tabulation register templates with internal-mark normalisation and moderation, grace marks and pass rules
 * (laid over by the rule registry), exported as PDF, XLSX or CSV in the university's column layout.
 */
@Controller('v1/university-results')
export class UniversityResultsController {
  constructor(private readonly svc: UniversityResultsService) {}

  @Get('templates')
  @Auth('user', ADMIN)
  templates(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.listTemplates(p);
  }

  @Post('templates')
  @HttpCode(200)
  @Auth('user', ADMIN)
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TemplateBody)) b: z.infer<typeof TemplateBody>) {
    return this.svc.saveTemplate(p, { ...b, config: b.config as TemplateConfig });
  }

  @Post('templates/samples')
  @HttpCode(200)
  @Auth('user', ADMIN)
  samples(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.installSamples(p);
  }

  @Get('registers')
  @Auth('user', ADMIN)
  registers(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.listRegisters(p);
  }

  @Post('registers')
  @HttpCode(200)
  @Auth('user', ADMIN)
  generate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RegisterBody)) b: z.infer<typeof RegisterBody>) {
    return this.svc.generate(p, b);
  }

  @Get('registers/:id')
  @Auth('user', ADMIN)
  register(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.register(p, id);
  }

  @Get('registers/:id/export')
  @Auth('user', ADMIN)
  async export(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('format') format: string | undefined, @Res() res: Response) {
    const f = format === 'xlsx' || format === 'pdf' ? format : 'csv';
    const out = await this.svc.export(p, id, f);
    res.setHeader('content-type', out.type);
    res.setHeader('content-disposition', `attachment; filename="${out.name}"`);
    res.end(out.body);
  }
}
