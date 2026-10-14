import { Module } from '@nestjs/common';
import { DataMigrationModule } from '../data-migration/data-migration.module.js';
import { AffiliationController } from './affiliation.controller.js';
import { AffiliationService } from './affiliation.service.js';

/** Affiliating university / board profiles: registry, selection, overrides, marks-card data and result formats. */
@Module({ imports: [DataMigrationModule], controllers: [AffiliationController], providers: [AffiliationService], exports: [AffiliationService] })
export class AffiliationModule {}
