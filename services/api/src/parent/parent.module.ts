import { Module } from '@nestjs/common';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { WhiteboardsModule } from '../whiteboards/whiteboards.module.js';
import { ParentController } from './parent.controller.js';

@Module({ imports: [WhiteboardsModule, RecordingsModule], controllers: [ParentController] })
export class ParentModule {}
