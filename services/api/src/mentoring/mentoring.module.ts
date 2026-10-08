import { Module } from '@nestjs/common';
import { MentoringController } from './mentoring.controller.js';
import { MentoringService } from './mentoring.service.js';

/** Student mentoring and early intervention. */
@Module({ controllers: [MentoringController], providers: [MentoringService] })
export class MentoringModule {}
