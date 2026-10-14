import { Module } from '@nestjs/common';
import { ImportModule } from '../import/import.module.js';
import { LifecycleService } from './lifecycle.service.js';
import { StudentLeaveController } from './student-leave.controller.js';
import { StudentsController } from './students.controller.js';
import { StudentRecords } from './students.records.js';

/** The student lifecycle (statuses, promotion, guardians) and the student profile. */
@Module({ imports: [ImportModule], controllers: [StudentsController, StudentLeaveController], providers: [LifecycleService, StudentRecords], exports: [LifecycleService] })
export class StudentsModule {}
