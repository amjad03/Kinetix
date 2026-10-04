import { Module } from '@nestjs/common';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { WhiteboardsModule } from '../whiteboards/whiteboards.module.js';
import { ParentController, StudentController } from './parent.controller.js';

@Module({ imports: [WhiteboardsModule, RecordingsModule], controllers: [ParentController, StudentController] })
export class ParentModule {}
