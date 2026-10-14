import { Module } from '@nestjs/common';
import { ImportModule } from '../import/import.module.js';
import { LifecycleService } from './lifecycle.service.js';
import { StudentInfoController } from './student-info.controller.js';
import { StudentInfoRecords } from './student-info.records.js';
import { StudentInfoService } from './student-info.service.js';
import { StudentLeaveController } from './student-leave.controller.js';
import { StudentsController } from './students.controller.js';
import { StudentRecords } from './students.records.js';

/** The student lifecycle (statuses, promotion, guardians), the student profile and the student information desk. */
@Module({
  imports: [ImportModule],
  controllers: [StudentsController, StudentLeaveController, StudentInfoController],
  providers: [LifecycleService, StudentInfoService, StudentRecords, StudentInfoRecords],
  exports: [LifecycleService, StudentInfoService],
})
export class StudentsModule {}
