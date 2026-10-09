import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { MentoringController } from './mentoring.controller.js';
import { MentoringDepthController } from './mentoring-depth.controller.js';
import { MentoringService } from './mentoring.service.js';

/** Student mentoring and early intervention. */
@Module({ imports: [TeacherModule, TasksModule], controllers: [MentoringController, MentoringDepthController], providers: [MentoringService] })
export class MentoringModule {}
