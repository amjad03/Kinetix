import { ExamOpsController } from './exam-ops.controller.js';
import { ExamBoardController } from './exam-room-board-view.controller.js';
import { WorkflowsModule } from '../workflows/workflows.module.js';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { ExamControllerDepthController, ResultsDepthController } from './exam-depth.controller.js';
import { ExamRegistrationController } from './exam-registration.controller.js';
import { ExamSessionsController } from './exams.controller.js';
import { ExamsService } from './exams.service.js';
import { ResultsController } from './results.controller.js';
import { SchemesController } from './schemes.controller.js';

/** Assessment schemes, exam sessions (schedule, seating, hall tickets), results, transcripts and revaluation. */
@Module({ imports: [NotificationsModule, WorkflowsModule, TasksModule], controllers: [SchemesController, ExamSessionsController, ExamRegistrationController, ResultsController, ExamControllerDepthController, ResultsDepthController, ExamOpsController, ExamBoardController], providers: [ExamsService], exports: [ExamsService] })
export class ExamsModule {}
