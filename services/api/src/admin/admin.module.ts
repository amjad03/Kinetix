import { Module } from '@nestjs/common';
import { AnalyticsCardsController } from './analytics.controller.js';
import { AdminController } from './admin.controller.js';
import { AuditController } from './audit.controller.js';
import { DashboardController } from './dashboard.controller.js';
import { StructureRecords } from './structure.records.js';
import { TimetableAdminController } from './timetable-admin.controller.js';

@Module({ controllers: [AdminController, AuditController, DashboardController, AnalyticsCardsController, TimetableAdminController], providers: [StructureRecords] })
export class AdminModule {}
