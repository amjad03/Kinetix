import { Module } from '@nestjs/common';
import { TeacherModule } from '../teacher/teacher.module.js';
import { ObeController } from './obe.controller.js';
import { QualityController } from './quality.controller.js';
import { ObeService } from './obe.service.js';

/** Outcome-based education: outcomes, COs and mappings, attainment and accreditation exports. */
@Module({ imports: [TeacherModule], controllers: [ObeController, QualityController], providers: [ObeService], exports: [ObeService] })
export class ObeModule {}
