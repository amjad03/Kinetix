import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ExaminerAdminController, ExaminerInviteController, ExaminerPortalController } from './examiner.controller.js';
import { ExaminerService } from './examiner.service.js';

/** External examiner portal: scoped invite and OTP login, anonymised script valuation, question paper states and remuneration claims. */
@Module({ imports: [AuthModule], controllers: [ExaminerAdminController, ExaminerPortalController, ExaminerInviteController], providers: [ExaminerService], exports: [ExaminerService] })
export class ExaminerModule {}
