import { Module } from '@nestjs/common';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

@Module({ controllers: [ImportController], providers: [ImportService], exports: [ImportService] })
export class ImportModule {}
