import { Module } from '@nestjs/common';
import { TermsAdminController, TermsController } from './terms.controller.js';

/** Academic terms (semesters). */
@Module({ controllers: [TermsController, TermsAdminController] })
export class TermsModule {}
