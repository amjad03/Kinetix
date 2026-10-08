import { Module } from '@nestjs/common';
import { LifecycleService } from './lifecycle.service.js';
import { StudentLeaveController } from './student-leave.controller.js';
import { StudentsController } from './students.controller.js';

/** The student lifecycle (statuses, promotion, guardians) and the student profile. */
@Module({ controllers: [StudentsController, StudentLeaveController], providers: [LifecycleService], exports: [LifecycleService] })
export class StudentsModule {}
