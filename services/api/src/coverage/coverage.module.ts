import { Module } from '@nestjs/common';
import { TeacherModule } from '../teacher/teacher.module.js';
import { CoverageController } from './coverage.controller.js';

/** Syllabus coverage per class. */
@Module({ imports: [TeacherModule], controllers: [CoverageController] })
export class CoverageModule {}
