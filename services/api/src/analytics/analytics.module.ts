import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller.js';
import { CustomReportsController } from './custom-reports.controller.js';
import { LogMailer, Mailer, WebhookMailer } from './mailer.js';
import { ReportsService } from './reports.service.js';
import { StudioController } from './studio.controller.js';
import { StudioService } from './studio.service.js';
import { ENV, type Env } from '../config/env.js';

/** Reports and analytics (docs/architecture/analytics-reporting.md), with the report studio (semantic catalogue, builder, library, dashboards). */
@Module({
  controllers: [AnalyticsController, CustomReportsController, StudioController],
  providers: [
    ReportsService,
    StudioService,
    { provide: Mailer, inject: [ENV], useFactory: (env: Env) => (env.MAIL_WEBHOOK_URL ? new WebhookMailer(env.MAIL_WEBHOOK_URL, env.MAIL_FROM) : new LogMailer()) },
  ],
  exports: [ReportsService, StudioService],
})
export class AnalyticsModule {}
