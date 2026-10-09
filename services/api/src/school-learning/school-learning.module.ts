import { Module } from '@nestjs/common';
import { SchoolLearningController } from './school-learning.controller.js';

/** Worksheets, activity scoring, remedial plans, entrance readiness, promotion rules, board pass rules and lesson-plan outcomes. */
@Module({ controllers: [SchoolLearningController] })
export class SchoolLearningModule {}
