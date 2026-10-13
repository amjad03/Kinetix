import { Module } from '@nestjs/common';
import { TeacherModule } from '../teacher/teacher.module.js';
import { QuizGamesClassController, QuizGamesController } from './quiz-games.controller.js';
import { QuizGamesService } from './quiz-games.service.js';

/** Live Quiz: the game-show quiz on the board, scored on the server and kept per class. */
@Module({ imports: [TeacherModule], controllers: [QuizGamesController, QuizGamesClassController], providers: [QuizGamesService] })
export class QuizGamesModule {}
