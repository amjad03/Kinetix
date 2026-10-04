import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { TimetableAdminController } from './timetable-admin.controller.js';

@Module({ controllers: [AdminController, TimetableAdminController] })
export class AdminModule {}
