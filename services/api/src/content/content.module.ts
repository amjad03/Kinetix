import { Module } from '@nestjs/common';
import { ConceptVideosController } from './concept-videos.controller.js';
import { ConceptVideosService } from './concept-videos.service.js';
import { ContentController, SubjectCourseController } from './content.controller.js';
import { ContentService } from './content.service.js';

@Module({ providers: [ContentService, ConceptVideosService], controllers: [ContentController, SubjectCourseController, ConceptVideosController], exports: [ContentService, ConceptVideosService] })
export class ContentModule {}
