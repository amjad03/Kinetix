import { Module } from '@nestjs/common';
import { EvaluationAdminController, EvaluationExaminerController } from './evaluation.controller.js';
import { EvaluationService } from './evaluation.service.js';

/** On-screen evaluation of scanned answer scripts: anonymous valuation, second and third valuation, final marks. */
@Module({ controllers: [EvaluationAdminController, EvaluationExaminerController], providers: [EvaluationService] })
export class EvaluationModule {}
