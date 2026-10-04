import { Module } from '@nestjs/common';
import { ContentController, SubjectCourseController } from './content.controller.js';
import { ContentService } from './content.service.js';

@Module({ providers: [ContentService], controllers: [ContentController, SubjectCourseController], exports: [ContentService] })
export class ContentModule {}
