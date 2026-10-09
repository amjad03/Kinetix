import { Module } from '@nestjs/common';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { SchoolLifeModule } from '../school-life/school-life.module.js';
import { WhiteboardsModule } from '../whiteboards/whiteboards.module.js';
import { ParentExtrasController } from './parent-extras.controller.js';
import { ParentVisibilityModule } from './parent-visibility.js';
import { ParentController, StudentController } from './parent.controller.js';

@Module({ imports: [WhiteboardsModule, RecordingsModule, SchoolLifeModule, ParentVisibilityModule], controllers: [ParentController, StudentController, ParentExtrasController] })
export class ParentModule {}
