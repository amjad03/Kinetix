import { Module } from '@nestjs/common';
import { CourseFilesController } from './course-files.controller.js';
import { CourseFilesService } from './course-files.service.js';

/** Course files: a downloadable PDF per class and subject, assembled from the records the system already holds. */
@Module({ controllers: [CourseFilesController], providers: [CourseFilesService] })
export class CourseFilesModule {}
