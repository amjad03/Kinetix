import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CounsellingController } from './counselling.controller.js';
import { DisciplineController } from './discipline.controller.js';
import { GrievancesController } from './grievances.controller.js';
import { RetentionController } from './retention.controller.js';
import { WelfareRequestsController } from './welfare-requests.controller.js';
import { WelfareService } from './welfare.service.js';

/** Grievances and the confidential committee workflow, discipline, counselling and welfare requests. */
@Module({ imports: [NotificationsModule], controllers: [GrievancesController, DisciplineController, CounsellingController, WelfareRequestsController, RetentionController], providers: [WelfareService] })
export class WelfareModule {}
