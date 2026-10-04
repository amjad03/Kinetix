import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { PlansController } from './plans.controller.js';

/** Year plans and lesson plans. */
@Module({ imports: [AiModule, TeacherModule], controllers: [PlansController] })
export class PlansModule {}
