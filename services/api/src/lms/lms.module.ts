import { Module } from '@nestjs/common';
import { LmsController } from './lms.controller.js';
import { LmsService } from './lms.service.js';

/** LMS course shells, content and gradebook (docs/product/lms-courses.md). */
@Module({ controllers: [LmsController], providers: [LmsService] })
export class LmsModule {}
