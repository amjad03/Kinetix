import { Module } from '@nestjs/common';
import { LmsController } from './lms.controller.js';
import { LmsExtController } from './lms-ext.controller.js';
import { LmsService } from './lms.service.js';
import { LmsDepthController } from './lms-depth.controller.js';
import { LmsRecords } from './lms.records.js';
import { QuizzesController } from './quizzes.controller.js';
import { ENV, type Env } from '../config/env.js';
import { CodeRunnerClient, HttpCodeRunner, NoCodeRunner } from '../code/code-runner.client.js';

/** LMS course shells, content and gradebook (docs/product/lms-courses.md). */
@Module({
  controllers: [LmsController, LmsExtController, QuizzesController, LmsDepthController],
  providers: [
    LmsService,
    LmsRecords,
    // Coding questions run on the same code runner as the code lab.
    { provide: CodeRunnerClient, inject: [ENV], useFactory: (env: Env) => (env.CODE_RUNNER_URL ? new HttpCodeRunner(env.CODE_RUNNER_URL, env.CODE_RUNNER_TOKEN, env.CODE_RUNNER_TIMEOUT_MS) : new NoCodeRunner()) },
  ],
})
export class LmsModule {}
