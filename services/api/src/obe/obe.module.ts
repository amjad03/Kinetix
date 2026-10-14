import { Module } from '@nestjs/common';
import { TeacherModule } from '../teacher/teacher.module.js';
import { ObeDepthController } from './obe-depth.controller.js';
import { ObeController } from './obe.controller.js';
import { ObeRecords } from './obe.records.js';
import { QualityController } from './quality.controller.js';
import { ObeService } from './obe.service.js';

/** Outcome-based education: outcomes, COs and mappings, attainment and accreditation exports. */
@Module({ imports: [TeacherModule], controllers: [ObeController, ObeDepthController, QualityController], providers: [ObeService, ObeRecords], exports: [ObeService] })
export class ObeModule {}
