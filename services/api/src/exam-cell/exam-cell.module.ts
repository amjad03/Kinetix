import { Module } from '@nestjs/common';
import { AcademicDocsModule } from '../academic-docs/academic-docs.module.js';
import { ExamsModule } from '../exams/exams.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DocumentDeskRecords, DocumentsDeskController, VerificationPublicController } from './documents-desk.js';
import { DoubleEntryController } from './double-entry.js';
import { ExamRecords } from './exam-records.js';
import { GraceApplicationsController, GraceRecords } from './grace-applications.js';
import { HallRecords, HallsController } from './halls.js';
import { InternalMarksController } from './internal-marks.js';
import { CellReportsController } from './reports.js';
import { ResultsDeskController } from './results-desk.js';
import { ValuationController, ValuationRecords } from './valuation.js';
import { ApplicationsController, ApplicationsService } from './applications.js';
import { ExamFeeSync } from './exam-fees.js';
import { MarksUnlockController } from './marks-unlock.js';
import { QpSettingController } from './qp-setting.js';
import { RegistersController } from './registers.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { WithholdRecords, WithholdsController } from './withholds.js';

/**
 * The exam cell (checklist sections 5 and 6): withheld results, grace applications, double-entry marks, valuation
 * camps, answer-book accounts, postponements, the invigilation roster and swaps, result runs (dry run, freeze,
 * rollback, unpublish) and versioned corrections, internal-marks tools, document duplicates, corrections and
 * verification, the registers and analyses, and the record kit lists of the exam domain.
 */
@Module({
  imports: [ExamsModule, NotificationsModule, AcademicDocsModule, TasksModule],
  controllers: [WithholdsController, GraceApplicationsController, DoubleEntryController, ValuationController, HallsController, ResultsDeskController, InternalMarksController, DocumentsDeskController, VerificationPublicController, CellReportsController, ApplicationsController, QpSettingController, MarksUnlockController, RegistersController],
  providers: [WithholdRecords, GraceRecords, ValuationRecords, HallRecords, DocumentDeskRecords, ExamRecords, ApplicationsService, ExamFeeSync],
})
export class ExamCellModule {}
