import { Module } from '@nestjs/common';
import { PaperReleaseController } from './paper-release.controller.js';
import { QuestionBankController } from './question-bank.controller.js';

/** Question bank and question paper engine (PRD section 22). */
@Module({ controllers: [QuestionBankController, PaperReleaseController] })
export class QuestionBankModule {}
