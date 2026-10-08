import { Module } from '@nestjs/common';
import { QuestionBankController } from './question-bank.controller.js';

/** Question bank and question paper engine (PRD section 22). */
@Module({ controllers: [QuestionBankController] })
export class QuestionBankModule {}
