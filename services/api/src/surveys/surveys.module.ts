import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SurveysController } from './surveys.controller.js';
import { SurveysService } from './surveys.service.js';

/** Feedback and evaluation surveys: builder, answering, results and CSV export. */
@Module({ imports: [NotificationsModule], controllers: [SurveysController], providers: [SurveysService], exports: [SurveysService] })
export class SurveysModule {}
