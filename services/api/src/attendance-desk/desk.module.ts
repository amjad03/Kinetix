import { Module } from '@nestjs/common';
import { AttendanceRecords } from './attendance.records.js';
import { AttendanceDeskController } from './desk.controller.js';
import { AttendanceDeskService } from './desk.service.js';

/** The attendance desk: mark sheets, unmarked hours, leave and on duty, eligibility, alerts, registers (ERP Attendance). */
@Module({ controllers: [AttendanceDeskController], providers: [AttendanceDeskService, AttendanceRecords], exports: [AttendanceDeskService] })
export class AttendanceDeskModule {}
