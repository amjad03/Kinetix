import { Module } from '@nestjs/common';
import { UniversityResultsController } from './university-results.controller.js';
import { UniversityResultsService } from './university-results.service.js';

/** Affiliating-university mark-list and tabulation register formats. */
@Module({ controllers: [UniversityResultsController], providers: [UniversityResultsService], exports: [UniversityResultsService] })
export class UniversityResultsModule {}
