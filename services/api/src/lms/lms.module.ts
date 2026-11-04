import { Module } from '@nestjs/common';
import { LmsController } from './lms.controller.js';
import { LmsExtController } from './lms-ext.controller.js';
import { LmsService } from './lms.service.js';
import { LmsDepthController } from './lms-depth.controller.js';
import { LmsRecords } from './lms.records.js';
import { QuizzesController } from './quizzes.controller.js';
import { LmsPassController } from './lms-pass.controller.js';
import { LmsLiveController } from './lms-live.controller.js';
import { LmsForumController } from './lms-forum.controller.js';
import { LmsCertificatesController } from './lms-certificates.controller.js';
import { LmsInsightsController } from './lms-insights.controller.js';
import { ENV, type Env } from '../config/env.js';
import { CodeRunnerClient, HttpCodeRunner, NoCodeRunner } from '../code/code-runner.client.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

/** LMS course shells, content and gradebook (docs/product/lms.md). */
@Module({
  imports: [NotificationsModule],
  controllers: [LmsController, LmsExtController, QuizzesController, LmsDepthController, LmsPassController, LmsLiveController, LmsForumController, LmsCertificatesController, LmsInsightsController],
  providers: [
    LmsService,
    LmsRecords,
    // Coding questions run on the same code runner as the code lab.
    { provide: CodeRunnerClient, inject: [ENV], useFactory: (env: Env) => (env.CODE_RUNNER_URL ? new HttpCodeRunner(env.CODE_RUNNER_URL, env.CODE_RUNNER_TOKEN,env.CODE_RUNNER_TIMEOUT_MS) : new NoCodeRunner()) },
  ],
  exports: [LmsService],
})
export class LmsModule {}
