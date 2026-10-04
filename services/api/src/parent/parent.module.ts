import { Module } from '@nestjs/common';
import { WhiteboardsModule } from '../whiteboards/whiteboards.module.js';
import { ParentController } from './parent.controller.js';

@Module({ imports: [WhiteboardsModule], controllers: [ParentController] })
export class ParentModule {}
