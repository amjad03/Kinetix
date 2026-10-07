import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module.js';
import { ConceptVideosController } from './concept-videos.controller.js';
import { ConceptVideosService } from './concept-videos.service.js';
import { ContentController, SubjectCourseController } from './content.controller.js';
import { ContentService } from './content.service.js';
import { PhetController } from './phet.controller.js';

@Module({ imports: [PlatformModule], providers: [ContentService, ConceptVideosService], controllers: [ContentController, SubjectCourseController, ConceptVideosController, PhetController], exports: [ContentService, ConceptVideosService] })
export class ContentModule {}
