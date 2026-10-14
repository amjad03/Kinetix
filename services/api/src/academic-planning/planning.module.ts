import { Module } from '@nestjs/common';
import { AcademicPlanningController } from './planning.controller.js';
import { PlanningRecords } from './planning.records.js';

/** Academic planning: elective baskets, requisites, credit transfers, faculty allocation, bell schedules, special classes, working days, regulations, batches and teaching load. */
@Module({ controllers: [AcademicPlanningController], providers: [PlanningRecords] })
export class AcademicPlanningModule {}
