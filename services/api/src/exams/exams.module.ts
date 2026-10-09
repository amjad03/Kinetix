import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ExamControllerDepthController, ResultsDepthController } from './exam-depth.controller.js';
import { ExamRegistrationController } from './exam-registration.controller.js';
import { ExamSessionsController } from './exams.controller.js';
import { ExamsService } from './exams.service.js';
import { ResultsController } from './results.controller.js';
import { SchemesController } from './schemes.controller.js';

/** Assessment schemes, exam sessions (schedule, seating, hall tickets), results, transcripts and revaluation. */
@Module({ imports: [NotificationsModule], controllers: [SchemesController, ExamSessionsController, ExamRegistrationController, ResultsController, ExamControllerDepthController, ResultsDepthController], providers: [ExamsService], exports: [ExamsService] })
export class ExamsModule {}
