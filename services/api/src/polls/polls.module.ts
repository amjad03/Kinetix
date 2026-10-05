import { Module } from '@nestjs/common';
import { TeacherModule } from '../teacher/teacher.module.js';
import { AnswerCardsController, PollsController, StudentPollController } from './polls.controller.js';
import { PollsService } from './polls.service.js';

/** Class questions ("Ask the class") and printed answer cards. */
@Module({ imports: [TeacherModule], controllers: [PollsController, StudentPollController, AnswerCardsController], providers: [PollsService] })
export class PollsModule {}
