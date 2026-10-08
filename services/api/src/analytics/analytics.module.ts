import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller.js';
import { LogMailer, Mailer, WebhookMailer } from './mailer.js';
import { ReportsService } from './reports.service.js';
import { ENV, type Env } from '../config/env.js';

/** Reports and analytics (docs/architecture/analytics-reporting.md). */
@Module({
  controllers: [AnalyticsController],
  providers: [
    ReportsService,
    { provide: Mailer, inject: [ENV], useFactory: (env: Env) => (env.MAIL_WEBHOOK_URL ? new WebhookMailer(env.MAIL_WEBHOOK_URL, env.MAIL_FROM) : new LogMailer()) },
  ],
  exports: [ReportsService],
})
export class AnalyticsModule {}
