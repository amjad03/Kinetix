import { Module } from '@nestjs/common';
import { AttendanceRecords } from './attendance.records.js';
import { AttendanceDeskController } from './desk.controller.js';
import { AttendanceDeskService } from './desk.service.js';
import { DetentionController } from './detention.controller.js';
import { QrReviewController } from './qr-review.controller.js';
import { AttendanceReportsController } from './reports.controller.js';

/**
 * The attendance desk: mark sheets, unmarked hours, leave and on duty, eligibility, alerts, registers, QR review,
 * published detention lists and reports (ERP Attendance).
 */
@Module({ controllers: [AttendanceDeskController, QrReviewController, DetentionController, AttendanceReportsController], providers: [AttendanceDeskService, AttendanceRecords], exports: [AttendanceDeskService] })
export class AttendanceDeskModule {}
