import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AuditController } from './audit.controller.js';
import { DashboardController } from './dashboard.controller.js';
import { TimetableAdminController } from './timetable-admin.controller.js';

@Module({ controllers: [AdminController, AuditController, DashboardController, TimetableAdminController] })
export class AdminModule {}
