import { Module } from '@nestjs/common';
import { ImportModule } from '../import/import.module.js';
import { MigrationController } from './migration.controller.js';
import { MigrationService } from './migration.service.js';

/** Linways/Excel data migration with saved mappings, dry run, reconciliation and rollback. */
@Module({ imports: [ImportModule], controllers: [MigrationController], providers: [MigrationService], exports: [MigrationService] })
export class DataMigrationModule {}
