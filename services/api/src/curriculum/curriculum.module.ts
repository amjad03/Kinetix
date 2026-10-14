import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CurriculumController } from './curriculum.controller.js';
import { FacultiesController } from './faculties.controller.js';
import { FrameworksController } from './frameworks.controller.js';
import { HousesController } from './houses.controller.js';
import { SchoolAcademicsController } from './school-academics.controller.js';
import { DegreeVerifyController, UniversityController } from './university.controller.js';
import { CurriculumRecords } from './versions.records.js';
import { ReadmissionController } from './readmission.controller.js';

/** Curriculum versions and the AI syllabus importer; school report cards, PUC, mastery and houses; affiliated institutions and convocation. */
@Module({ imports: [AiModule], controllers: [CurriculumController, FacultiesController, FrameworksController, SchoolAcademicsController, HousesController, UniversityController, DegreeVerifyController, ReadmissionController], providers: [CurriculumRecords] })
export class CurriculumModule {}
