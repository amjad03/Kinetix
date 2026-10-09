import { Module } from '@nestjs/common';
import { CampusLifeService } from '../campus-life/campus-life.service.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { AttendanceGovernanceController, StudentQrController } from './governance.controller.js';

/** Attendance corrections, shortage and condonation, and QR attendance. */
@Module({ imports: [TeacherModule], controllers: [AttendanceGovernanceController, StudentQrController], providers: [CampusLifeService] })
export class AttendanceGovernanceModule {}
