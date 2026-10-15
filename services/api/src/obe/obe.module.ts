import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { ObeInsightsController, ObeReminders } from './insights.controller.js';
import { ObeDepthController } from './obe-depth.controller.js';
import { ObeLinksController } from './links.controller.js';
import { ObeController } from './obe.controller.js';
import { ObeRecords } from './obe.records.js';
import { ObeQuestionsController } from './questions.controller.js';
import { QualityController } from './quality.controller.js';
import { ObeReportsController } from './reports.controller.js';
import { ObeService } from './obe.service.js';
import { ObeWorkflowController } from './workflow.js';

/**
 * Outcome-based education: outcomes, COs and their approval, mappings, question-wise assessment, attainment policies and
 * calculation, dashboards, exit surveys, and the course file, attainment, NBA SAR and NAAC reports.
 */
@Module({ imports: [TeacherModule, NotificationsModule], controllers: [ObeController, ObeDepthController, QualityController, ObeWorkflowController, ObeQuestionsController, ObeInsightsController, ObeReportsController, ObeLinksController], providers: [ObeService, ObeRecords, ObeReminders], exports: [ObeService] })
export class ObeModule {}
