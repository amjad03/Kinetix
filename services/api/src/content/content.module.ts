import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module.js';
import { ConceptVideosController } from './concept-videos.controller.js';
import { ConceptVideosService } from './concept-videos.service.js';
import { ContentController, SubjectCourseController } from './content.controller.js';
import { ContentService } from './content.service.js';
import { PhetController } from './phet.controller.js';
import { PlatformAdminGuard } from '../platform/platform-admin.guard.js';
import { PlatformMaterialsController } from './platform-materials.controller.js';
import { TopicMaterialsService } from './topic-materials.service.js';
import { TopicResourcesController } from './topic-resources.controller.js';
import { InstitutionYoutubeController, PlatformYoutubeController } from './youtube-import.controller.js';

@Module({
  imports: [PlatformModule],
  providers: [ContentService, ConceptVideosService, TopicMaterialsService, PlatformAdminGuard],
  controllers: [ContentController, SubjectCourseController, ConceptVideosController, PhetController, TopicResourcesController, PlatformMaterialsController, PlatformYoutubeController, InstitutionYoutubeController],
  exports: [ContentService, ConceptVideosService, TopicMaterialsService],
})
export class ContentModule {}
