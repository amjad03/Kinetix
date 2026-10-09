import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CurriculumController } from './curriculum.controller.js';
import { HousesController } from './houses.controller.js';
import { SchoolAcademicsController } from './school-academics.controller.js';
import { DegreeVerifyController, UniversityController } from './university.controller.js';

/** Curriculum versions and the AI syllabus importer; school report cards, PUC, mastery and houses; affiliated institutions and convocation. */
@Module({ imports: [AiModule], controllers: [CurriculumController, SchoolAcademicsController, HousesController, UniversityController, DegreeVerifyController] })
export class CurriculumModule {}
