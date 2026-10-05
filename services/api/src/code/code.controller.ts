import { Body, Controller, HttpCode, Inject, Logger, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { CodeRunnerClient, RUN_LANGUAGES, type RunOutcome } from './code-runner.client.js';

const RunBody = z.object({
  language: z.enum(RUN_LANGUAGES),
  source: z.string().min(1).max(64 * 1024),
  stdin: z.string().max(16 * 1024).default(''),
});

/**
 * The code lab's compiled languages (C, C++, Java), for the board and the Teacher and Student
 * apps. Python, JavaScript and SQL run on the device and never come here. Programs run on the
 * institution's code runner, in India, in a locked-down container (services/code-runner).
 * Limited per institution and per person (or board) per minute; the code is not stored.
 */
@Controller('v1/code')
export class CodeController {
  private readonly log = new Logger(CodeController.name);

  constructor(
    private readonly runner: CodeRunnerClient,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('run')
  @HttpCode(200)
  @Auth(['user', 'board'], [...TEACHING_ROLES, 'student'])
  async run(@CurrentPrincipal() p: Principal, @Body(new ZodBody(RunBody)) body: z.infer<typeof RunBody>): Promise<RunOutcome> {
    const who = p.kind === 'user' ? `u:${p.userId}` : p.kind === 'board' ? `b:${p.deviceId}` : `d:${p.deviceId}`;
    await this.limiter.hit(`code:p:${who}`, this.env.CODE_RUN_USER_PER_MINUTE, 60_000);
    await this.limiter.hit(`code:t:${p.tenantId}`, this.env.CODE_RUN_TENANT_PER_MINUTE, 60_000);
    const result = await this.runner.run(body);
    this.log.log(`code run tenant=${p.tenantId} ${body.language} ${result.status} ${result.timeMs}ms`);
    return result;
  }
}
