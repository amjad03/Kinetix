import { Module } from '@nestjs/common';
import { AnalyticsCardsController } from './analytics.controller.js';
import { AdminController } from './admin.controller.js';
import { AuditController } from './audit.controller.js';
import { DashboardController } from './dashboard.controller.js';
import { TeachersAdminController } from './teachers.controller.js';
import { TimetableAdminController } from './timetable-admin.controller.js';

@Module({ controllers: [AdminController, AuditController, DashboardController, AnalyticsCardsController, TimetableAdminController, TeachersAdminController] })
export class AdminModule {}
