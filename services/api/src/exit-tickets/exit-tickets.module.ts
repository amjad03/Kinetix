import { Module } from '@nestjs/common';
import { PollsModule } from '../polls/polls.module.js';
import { TeacherModule } from '../teacher/teacher.module.js';
import { ExitTicketsController } from './exit-tickets.controller.js';
import { ExitTicketsService } from './exit-tickets.service.js';

/** Exit tickets: end-of-lesson questions kept as one record per lesson. */
@Module({ imports: [PollsModule, TeacherModule], controllers: [ExitTicketsController], providers: [ExitTicketsService] })
export class ExitTicketsModule {}
